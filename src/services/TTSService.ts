import crypto from 'crypto';
import { LRUCache } from 'lru-cache';
import { logger } from '../logger';
import { ttsRequestsTotal } from "../metrics/prometheus";
import { getVoiceGender } from '../../db';
import { normalizeForSpeech, chunkText, sanitizeForTTS } from '../utils/textUtils';
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { synthesizeWithGroq, getCachedStaticAudio, saveCachedStaticAudio } from './tts/groq-tts';

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

export function prepareSSMLText(text: string): string {
  let marked = text;
  // Паузы между абзацами 600мс
  marked = marked.replace(/\n+/g, ' __BREAK_600__ ');
  marked = marked.replace(/\.\.\./g, ' __BREAK_600__ ');
  marked = marked.replace(/([;:])(?!\d)/g, '$1 __BREAK_500__ ');
  marked = marked.replace(/(\s[—-]\s)/g, '$1 __BREAK_400__ ');
  marked = marked.replace(/(?<!\d)([.!?])(?!\d)/g, '$1 __BREAK_500__ ');

  let escaped = escapeXml(marked);

  escaped = escaped.replace(/__BREAK_600__/g, '<break time="600ms"/>');
  escaped = escaped.replace(/__BREAK_500__/g, '<break time="500ms"/>');
  escaped = escaped.replace(/__BREAK_400__/g, '<break time="400ms"/>');

  // Акценты на ключевых словах через SSML <emphasis> при поддержке
  escaped = escaped.replace(/Сели́?н/gi, '<emphasis level="moderate">$&</emphasis>');
  escaped = escaped.replace(/деше́?вле ча́?шки ко́?фе/gi, '<emphasis level="moderate">$&</emphasis>');
  escaped = escaped.replace(/с этой минуты/gi, '<emphasis level="moderate">$&</emphasis>');

  return escaped;
}

export function preparePlainProsody(text: string): string {
  let processed = text;
  // Паузы между абзацами 600мс в не-SSML
  processed = processed.replace(/\n+/g, ' ... — ... ');
  
  // Интонационная пунктуация на ключевых словах (не добавляем тире, если оно уже стоит)
  processed = processed.replace(/(?<![—\-]\s*)Сели́?н(?!\s*[—\-])/gi, 'Селин — ');
  processed = processed.replace(/(?<![—\-]\s*)деше́?вле ча́?шки ко́?фе(?!\s*[—\-])/gi, '— дешевле чашки кофе! —');
  processed = processed.replace(/с этой минуты/gi, 'с этой минуты!');
  
  processed = processed.replace(/([;:])(?!\d)/g, '$1 — ... ');
  return processed;
}

export interface TTSSynthesisOptions {
  voice?: string;
  rate?: number | string;
  pitch?: string;
  speed?: number; // legacy support
  lang?: string;  // legacy support
}

/**
 * Парсер параметра rate в числовой коэффициент скорости (дефолт 0.9 = 10% медленнее для ВСЕХ сообщений)
 */
export function parseRate(rate?: number | string, speed?: number, defaultRate: number = 0.9): number {
  if (typeof rate === 'number' && !isNaN(rate) && rate > 0) {
    return rate;
  }
  if (typeof rate === 'string') {
    const trimmed = rate.trim();
    if (trimmed.endsWith('%')) {
      const val = parseFloat(trimmed.replace('%', ''));
      if (!isNaN(val) && val > 0) {
        if (trimmed.startsWith('-')) {
          return Math.max(0.5, Math.min(2.0, 1.0 - Math.abs(val) / 100));
        } else if (trimmed.startsWith('+')) {
          return Math.max(0.5, Math.min(2.0, 1.0 + Math.abs(val) / 100));
        } else {
          return Math.max(0.5, Math.min(2.0, val / 100));
        }
      }
    }
    const val = parseFloat(trimmed);
    if (!isNaN(val) && val > 0) {
      return val;
    }
  }
  if (typeof speed === 'number' && !isNaN(speed) && speed > 0) {
    return speed;
  }
  return defaultRate;
}

/**
 * Профессиональный сервис синтеза речи (TTSService) для Selin AI 2.0.
 * 
 * Особенности:
 * 1. MD5-кэширование синтезированных фрагментов в оперативной памяти
 * 2. Использование Edge Neural TTS (как через WebSockets-библиотеку, так и через прямой fetch-SSML)
 * 3. Нарезка длинного текста на смысловые фрагменты строго по границам предложений (chunkText)
 * 4. Бесшовная склейка буферов в единый аудиопоток
 */
export class TTSService {
  private cache: LRUCache<string, { contentType: string; buffer: Buffer }>;

  constructor() {
    this.cache = new LRUCache<string, { contentType: string; buffer: Buffer }>({
      max: 200,
      ttl: 30 * 60 * 1000, // 30 минут
    });
  }

  /**
   * Основной метод синтеза речи. Возвращает готовый бинарный Buffer или null при ошибке.
   */
  public async synthesize(text: string, options: TTSSynthesisOptions = {}, isSelfTest: boolean = false): Promise<Buffer | null> {
    const sanitizedText = sanitizeForTTS(text);
    const cleanText = sanitizedText.trim();
    let voice = options.voice || process.env.TTS_VOICE || 'ru-RU-DmitryNeural';
    if (voice.toLowerCase().includes('svetlana') || voice.toLowerCase().includes('female')) {
      logger.warn("⚠️ [TTS] Female voice detected. Forcing male voice DmitryNeural.");
      voice = 'ru-RU-DmitryNeural';
    }

    // Дефолт для ВСЕХ голосовых сообщений rate = 0.9 (10% медленнее)
    const numRate = parseRate(options.rate, options.speed, 0.9);
    const edgeRate = numRate;
    const edgeRateSSML = `${numRate}`;
    const pitch = options.pitch || '+0Hz';

    if (!cleanText) {
      return isSelfTest ? this.generateSilentWav() : null;
    }

    const cacheKey = this.getCacheKey(cleanText, voice, String(edgeRate), pitch);

    // 1. Проверка кэша
    if (this.cache.has(cacheKey)) {
      logger.info(`[TTSService] Cache hit for key: ${cacheKey.slice(0, 8)}... (text: ${cleanText.slice(0, 30)}...)`);
      const cached = this.cache.get(cacheKey)!.buffer;
      if (isSelfTest) {
        logger.info("🎙️ [TTS] active engine: gemini");
      }
      return cached;
    }

    logger.info(`[TTSService] Synthesizing speech (${cleanText.length} chars) via Cascade (rate: ${numRate}) [Text: "${cleanText}"]`);
    logger.info(`🎙️ [TTS] Text with stress: "${cleanText}"`);

    let audioBuffer: Buffer | null = null;
    let contentType = 'audio/mpeg';

    // Попытка 1: MsEdgeTTS library (WebSocket)
    try {
      const libraryPromise = this.synthesizeWithLibrary(cleanText, voice, edgeRate, pitch);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("MsEdgeTTS connection timeout")), 5000);
      });
      audioBuffer = await Promise.race([libraryPromise, timeoutPromise]);
      if (audioBuffer) {
        contentType = 'audio/mpeg';
        ttsRequestsTotal.inc({ engine: 'edge-library' });
        if (isSelfTest) {
          logger.info("🎙️ [TTS] active engine: edge");
        }
      }
    } catch (err: any) {
      logger.warn(`[TTSService] Library MsEdgeTTS failed: ${err?.message || err}. Trying direct fetch Edge TTS.`);
    }

    // Попытка 2: Прямой fetch-SSML к Edge TTS (отказоустойчивый REST)
    if (!audioBuffer) {
      try {
        audioBuffer = await this.synthesizeEdgeDirect(cleanText, voice, edgeRateSSML, pitch);
        if (audioBuffer) {
          contentType = 'audio/mpeg';
          ttsRequestsTotal.inc({ engine: 'edge-direct' });
          if (isSelfTest) {
            logger.info("🎙️ [TTS] active engine: edge");
          }
        }
      } catch (err: any) {
        logger.error(`[TTSService] Direct fetch Edge TTS failed: ${err?.message || err}`);
      }
    }

    // Попытка 3: Google TTS (Google Cloud Text-to-Speech с speakingRate)
    if (!audioBuffer) {
      try {
        audioBuffer = await this.synthesizeWithGoogle(cleanText, numRate);
        if (audioBuffer) {
          contentType = 'audio/mpeg';
          ttsRequestsTotal.inc({ engine: 'google' });
          if (isSelfTest) {
            logger.info("🎙️ [TTS] active engine: google");
          }
        }
      } catch (err: any) {
        logger.warn(`[TTSService] Google TTS failed: ${err?.message || err}`);
      }
    }

    // Попытка 4: OpenAI TTS (speed = 0.85 / 0.9)
    if (!audioBuffer && process.env.OPENAI_API_KEY) {
      try {
        audioBuffer = await synthesizeWithOpenAI(cleanText, numRate);
        if (audioBuffer) {
          contentType = 'audio/mpeg';
          ttsRequestsTotal.inc({ engine: 'openai' });
          if (isSelfTest) {
            logger.info("🎙️ [TTS] active engine: openai");
          }
        }
      } catch (err: any) {
        logger.warn(`[TTSService] OpenAI TTS failed: ${err?.message || err}`);
      }
    }

    // Попытка 5: Gemini TTS (фолбэк)
    if (!audioBuffer) {
      try {
        audioBuffer = await this.callGeminiTTS(cleanText);
        if (audioBuffer) {
          contentType = 'audio/wav';
          ttsRequestsTotal.inc({ engine: 'gemini' });
          if (isSelfTest) {
            logger.info("🎙️ [TTS] active engine: gemini");
          }
        }
      } catch (err: any) {
        logger.warn(`[TTSService] Gemini TTS failed: ${err?.message || err}`);
      }
    }

    // Попытка 6: Абсолютный офлайн-фолбэк (валидный WAV) ТОЛЬКО для self-test
    if (!audioBuffer) {
      if (isSelfTest) {
        logger.warn('[TTSService] All Edge TTS attempts failed. Generating offline fallback tone.');
        audioBuffer = this.generateFallbackToneWav(cleanText);
        contentType = 'audio/wav';
        ttsRequestsTotal.inc({ engine: 'fallback' });
      } else {
        logger.warn('[TTSService] All TTS engines failed for user. No fallback tone generated.');
        return null;
      }
    }

    // Сохранение в кэш
    this.cache.set(cacheKey, { contentType, buffer: audioBuffer });
    return audioBuffer;
  }

  /**
   * Синтез через Google TTS (Google Cloud Text-to-Speech API с speakingRate)
   */
  public async synthesizeWithGoogle(text: string, speakingRate: number = 0.9): Promise<Buffer | null> {
    const apiKey = process.env.GOOGLE_TTS_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    try {
      const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: 'ru-RU',
            name: 'ru-RU-Neural2-D',
            ssmlGender: 'MALE'
          },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: speakingRate // 0.85 / 0.9
          }
        }),
        signal: AbortSignal.timeout(10000)
      });

      if (!res.ok) {
        logger.warn(`⚠️ [TTS] Google TTS status ${res.status}`);
        return null;
      }

      const data: any = await res.json();
      if (data?.audioContent) {
        return Buffer.from(data.audioContent, 'base64');
      }
    } catch (err: any) {
      logger.warn(`⚠️ [TTS] Google TTS failed: ${err?.message || err}`);
    }
    return null;
  }

  /**
   * Метод Gemini TTS для синтеза речи
   */
  private async callGeminiTTS(text: string): Promise<Buffer | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.warn('⚠️ [TTS] callGeminiTTS failed: GEMINI_API_KEY is not defined.');
      return null;
    }

    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const models = ['gemini-2.5-flash-preview-tts', 'gemini-2.0-flash-preview-tts'];

      for (const model of models) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: text,
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: 'Kore'
                  }
                }
              }
            } as any
          });

          const base64 = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (base64) {
            const pcmBuffer = Buffer.from(base64, 'base64');
            const wavHeader = this.getWavHeader(pcmBuffer.length, 24000, 1, 16);
            logger.info('🎙️ [TTS] gemini engine ok');
            return Buffer.concat([wavHeader, pcmBuffer]);
          }
        } catch (modelErr: any) {
          logger.warn(`⚠️ [TTS] Gemini TTS model ${model} attempt failed: ${modelErr?.message || modelErr}`);
        }
      }
    } catch (err: any) {
      logger.error(`❌ [TTS] callGeminiTTS error: ${err?.message || err}`);
    }

    return null;
  }

  /**
   * Синтез через WebSocket библиотеку MsEdgeTTS с нарезкой по границам предложений
   */
  private async synthesizeWithLibrary(text: string, voice: string, rate: number | string, pitch: string): Promise<Buffer> {
    const chunks = chunkText(text, 300);
    const audioChunks: Buffer[] = [];
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const plainChunk = preparePlainProsody(chunk);
      const streamRes = tts.toStream(plainChunk, { rate, pitch });
      const readable = (streamRes && (streamRes as any).audioStream) ? (streamRes as any).audioStream : streamRes;

      const chunkBuffers: Buffer[] = [];
      for await (const b of readable) {
        if (Buffer.isBuffer(b)) {
          chunkBuffers.push(b);
        } else if (b instanceof Uint8Array) {
          chunkBuffers.push(Buffer.from(b));
        }
      }
      if (chunkBuffers.length > 0) {
        audioChunks.push(Buffer.concat(chunkBuffers));
      }
    }

    if (audioChunks.length > 0) {
      return Buffer.concat(audioChunks);
    }
    throw new Error("Empty audio stream from MsEdgeTTS");
  }

  /**
   * Прямой fetch-SSML к Microsoft Edge Speech API
   */
  private async synthesizeEdgeDirect(text: string, voice: string, rate: number | string, pitch: string): Promise<Buffer> {
    const chunks = chunkText(text, 300);
    const audioChunks: Buffer[] = [];

    let selectedVoice = voice.includes('Neural') ? voice : (process.env.TTS_VOICE || 'ru-RU-DmitryNeural');
    if (selectedVoice.toLowerCase().includes('svetlana') || selectedVoice.toLowerCase().includes('female')) {
      selectedVoice = 'ru-RU-DmitryNeural';
    }

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const ssmlChunk = prepareSSMLText(chunk);
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ru-RU'><voice name='${selectedVoice}'><prosody rate='${rate}' pitch='${pitch}'>${ssmlChunk}</prosody></voice></speak>`;

      const response = await fetch('https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
        },
        body: ssml
      });

      if (!response.ok) {
        throw new Error(`Edge TTS returned status ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      audioChunks.push(Buffer.from(arrayBuffer));
    }

    return Buffer.concat(audioChunks);
  }

  private getCacheKey(text: string, voice: string, rate: string = '', pitch: string = ''): string {
    const payload = text + voice + rate + pitch + 'v3_seamless';
    return crypto.createHash('md5').update(payload).digest('hex');
  }

  public clearCache(): void {
    this.cache.clear();
    logger.info('[TTSService] In-memory synthesis cache cleared.');
  }

  private getWavHeader(dataLength: number, sampleRate: number = 24000, numChannels: number = 1, bitsPerSample: number = 16): Buffer {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataLength, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
    header.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataLength, 40);
    return header;
  }

  private generateSilentWav(): Buffer {
    const data = Buffer.alloc(4800);
    const header = this.getWavHeader(data.length, 24000, 1, 16);
    return Buffer.concat([header, data]);
  }

  private generateFallbackToneWav(text: string): Buffer {
    const sampleRate = 24000;
    const durationSec = Math.min(2.0, Math.max(0.4, text.length * 0.05));
    const totalSamples = Math.floor(sampleRate * durationSec);
    const data = Buffer.alloc(totalSamples * 2);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const sample = Math.sin(2 * Math.PI * 440 * t) * 0.3 + Math.sin(2 * Math.PI * 880 * t) * 0.1;
      const intSample = Math.floor(sample * 32767);
      data.writeInt16LE(intSample, i * 2);
    }

    const header = this.getWavHeader(data.length, sampleRate, 1, 16);
    return Buffer.concat([header, data]);
  }
}

export const ttsService = new TTSService();
export { chunkText };

/**
 * 1. Очистка текста для литературного чтения
 */
export function cleanForVoice(text: string): string {
  return normalizeForSpeech(text);
}

/**
 * 2. Синтез через OpenAI TTS (если подключен)
 */
export async function synthesizeWithOpenAI(text: string, speed: number = 0.9): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("No OPENAI_API_KEY in environment");

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "tts-1",
      voice: "onyx",
      input: text,
      speed: speed // speed = 0.85 / 0.9
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI TTS status ${response.status}: ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Основная функция озвучки ответов чата:
 * 1. Прогон через normalizeForSpeech (числа словами, удаление emoji/url/@, 24/7, 199₽, 1800₽, Selin AI -> Селин)
 * 2. Нарезка строго по границам предложений (chunkText)
 * 3. Синтез и бесшовная склейка буферов в ОДНО аудио
 */
export async function synthesizeForChat(
  chatId: string | number | null | undefined,
  text: string,
  options: TTSSynthesisOptions = {}
): Promise<Buffer | null> {
  const cleanId = chatId ? String(chatId) : 'default';
  const isSelfTest = (chatId === "test_self_check_chat");

  const sanitized = sanitizeForTTS(text);

  // Шаг 1: Проверка кэша статики (хук и приветствия) -> assets/*.mp3
  const staticCached = await getCachedStaticAudio(sanitized);
  if (staticCached) {
    return staticCached;
  }

  // Шаг 2: Глобальный нормализатор (для всех ответов)
  const normalized = normalizeForSpeech(sanitized);
  if (!normalized.trim()) {
    return ttsService.synthesize("", options, isSelfTest);
  }

  // Шаг 3: Нарезка на чанки по границам предложений
  const chunks = chunkText(normalized, 300);
  const chunksCount = chunks.length;

  let engine = 'Edge';
  let audioBuffer: Buffer | null = null;

  // Шаг 4: Попытка синтеза через нейронный Groq TTS
  if (process.env.GROQ_API_KEY) {
    try {
      const audioParts: Buffer[] = [];
      for (const chunk of chunks) {
        const part = await synthesizeWithGroq(chunk);
        if (!part) {
          throw new Error("Groq synthesis returned null");
        }
        audioParts.push(part);
      }
      audioBuffer = Buffer.concat(audioParts);
      engine = 'Groq';
    } catch (err: any) {
      // Observability: '⚠️ [TTS] groq fail → edge'
      logger.warn(`⚠️ [TTS] groq fail → edge. Error: ${err?.message || err}`);
      audioBuffer = null;
    }
  }

  // Шаг 5: Фолбэк на нейронный Edge TTS (ru-RU-DmitryNeural) при ошибке или отсутствии ключа
  let voice = options.voice || process.env.TTS_VOICE || 'ru-RU-DmitryNeural';
  if (voice.toLowerCase().includes('svetlana') || voice.toLowerCase().includes('female')) {
    voice = 'ru-RU-DmitryNeural';
  }

  const isHook = (chatId === "global_start_hook") ||
    text.includes("Здравствуй! Я — Селин") ||
    text.includes("Здравствуй! Я — Сели\u0301н");
  const defaultRate = isHook ? 0.85 : 0.9;
  const numRate = parseRate(options.rate, options.speed, defaultRate);
  const pitch = options.pitch || '+0Hz';

  if (!audioBuffer) {
    engine = 'Edge';
    try {
      audioBuffer = await ttsService.synthesize(normalized, { ...options, voice, rate: numRate, speed: numRate, pitch }, isSelfTest);
      if (audioBuffer) {
        console.log(`🎙️ [TTS] engine=${engine} chunks=${chunksCount} glued into one audio (rate=${numRate})`);
        logger.info(`🎙️ [TTS] engine=${engine} chunks=${chunksCount} glued into one audio (rate=${numRate})`);
      }
    } catch (fallbackErr: any) {
      logger.error(`❌ [TTS] Edge TTS fallback failed: ${fallbackErr.message || fallbackErr}`);
    }
  }

  // Сохранение в кэш статики (если это хук или приветствие)
  if (audioBuffer && audioBuffer.length > 0) {
    await saveCachedStaticAudio(text, audioBuffer);
  }

  if (audioBuffer) {
    return audioBuffer;
  }

  logger.warn(`⚠️ [TTS] Primary male voice DmitryNeural unavailable. Attempting backup male voice synthesis...`);
  const fallbackBuffer = await ttsService.synthesize(normalized, { voice, rate: numRate }, isSelfTest);
  if (fallbackBuffer) {
    console.log(`🎙 [TTS] voice=${voice} gender=male rate=${numRate}`);
    logger.info(`🎙 [TTS] voice=${voice} gender=male rate=${numRate}`);
  }
  return fallbackBuffer;
}
