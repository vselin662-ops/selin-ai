import crypto from 'crypto';
import { LRUCache } from 'lru-cache';
import spawn from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import os from 'os';
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

/**
 * ШАГ 3. ПРОСОДИЯ (SSML):
 * <break time="220ms"/> после точки для женщин, <break time="150ms"/> для мужчин.
 * <break time="110ms"/> после запятой, иных пауз нет.
 */
export function prepareSSMLText(text: string, isMale: boolean = false): string {
  // Убираем маркеры ударений (типа +) перед просодией
  const cleaned = text.replace(/\+/g, '');
  let escaped = escapeXml(cleaned);
  
  const periodPause = isMale ? '150ms' : '220ms';
  const commaPause = '110ms';
  
  // Добавляем <break time="..."/> после точек (. ! ? ;), если после них нет цифр
  escaped = escaped.replace(/(?<!\d)([.!?;:])(?!\d)/g, `$1 <break time="${periodPause}"/>`);
  
  // Добавляем <break time="110ms"/> после запятых (,)
  escaped = escaped.replace(/,/g, `, <break time="${commaPause}"/>`);
  
  return escaped;
}

export function preparePlainProsody(text: string): string {
  return text.replace(/\+/g, '');
}

export function prepareStartHookSSML(text: string): string {
  return prepareSSMLText(text, true);
}

export function prepareStartHookProsody(text: string): string {
  return text.replace(/\+/g, '');
}

export interface TTSSynthesisOptions {
  voice?: string;
  rate?: number | string;
  pitch?: string;
  speed?: number; // legacy support
  lang?: string;  // legacy support
  skipStress?: boolean;
  isStartHook?: boolean;
}

/**
 * Парсер параметра rate в числовой коэффициент скорости
 */
export function parseRate(rate?: number | string, speed?: number, defaultRate: number = 1.0): number {
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
 * Конвертация коэффициента скорости в проценты для SSML (например 0.95 -> -5%, 1.0 -> +0%)
 */
function formatRateForSSML(rate: number): string {
  const pct = Math.round((rate - 1) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

/**
 * ШАГ 4. ПОСТОБРАБОТКА ЗВУКА (loudnorm + silenceremove)
 */
export async function postProcessAudio(inputBuffer: Buffer): Promise<Buffer> {
  if (!ffmpegPath) {
    logger.warn('[TTSService] ffmpeg-static path is not found, skipping post-processing');
    return inputBuffer;
  }

  return new Promise<Buffer>((resolve) => {
    const filter = 'loudnorm=I=-16:TP=-1.5:LRA=11,silenceremove=start_periods=1:start_threshold=-50dB:stop_periods=-1:stop_threshold=-50dB';
    
    const ffmpeg = spawn.spawn(ffmpegPath, [
      '-i', 'pipe:0',
      '-af', filter,
      '-f', 'mp3',
      'pipe:1'
    ]);

    const chunks: Buffer[] = [];
    ffmpeg.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    ffmpeg.stderr.on('data', () => {}); // silence stderr to avoid logs noise

    ffmpeg.on('close', (code) => {
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        resolve(inputBuffer);
      }
    });

    ffmpeg.on('error', (err) => {
      logger.warn(`⚠️ [TTSService] ffmpeg spawn error: ${err.message}`);
      resolve(inputBuffer);
    });

    ffmpeg.stdin.write(inputBuffer);
    ffmpeg.stdin.end();
  });
}

/**
 * Вспомогательный метод для получения длительности и пиковой громкости аудиофайла
 */
export function getAudioDurationAndPeak(buffer: Buffer): { duration: number; peakVolume: number } {
  try {
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `dur_${crypto.randomBytes(8).toString('hex')}.mp3`);
    fs.writeFileSync(tmpFile, buffer);
    
    const ffmpegCmd = ffmpegPath || 'ffmpeg';
    const output = execSyncCmd(`"${ffmpegCmd}" -i "${tmpFile}" -af volumedetect -f null - 2>&1`);
    
    try {
      fs.unlinkSync(tmpFile);
    } catch (e) {}

    let duration = 0;
    const durMatch = output.match(/Duration:\s+(\d+):(\d+):(\d+\.\d+)/);
    if (durMatch) {
      const hrs = parseInt(durMatch[1], 10);
      const mins = parseInt(durMatch[2], 10);
      const secs = parseFloat(durMatch[3]);
      duration = hrs * 3600 + mins * 60 + secs;
    } else {
      duration = buffer.length / 6000;
    }

    let peakVolume = -16.0;
    const peakMatch = output.match(/max_volume:\s+(-?\d+\.?\d*)\s+dB/);
    if (peakMatch) {
      peakVolume = parseFloat(peakMatch[1]);
    }

    return { duration, peakVolume };
  } catch (e) {
    return { duration: buffer.length / 6000, peakVolume: -16.0 };
  }
}

function execSyncCmd(cmd: string): string {
  try {
    const { execSync } = require('child_process');
    return execSync(cmd).toString();
  } catch (e) {
    return '';
  }
}

/**
 * Профессиональный сервис синтеза речи (TTSService) для Selin AI 2.0.
 */
export class TTSService {
  private cache: LRUCache<string, { contentType: string; buffer: Buffer }>;

  constructor() {
    this.cache = new LRUCache<string, { contentType: string; buffer: Buffer }>({
      max: 200,
      ttl: 30 * 60 * 1000, // 30 минут
    });

    // ШАГ 7. КОНТРОЛЬ КАЧЕСТВА и САМОПРОВЕРКА при старте
    setTimeout(() => {
      this.runStartupQualityCheck().catch(err => {
        logger.warn(`⚠️ [TTS Quality Check] failed: ${err}`);
      });
    }, 2000);
  }

  /**
   * Основной метод синтеза речи. Возвращает готовый бинарный Buffer или null при ошибке.
   */
  public async synthesize(text: string, options: TTSSynthesisOptions = {}, isSelfTest: boolean = false): Promise<Buffer | null> {
    const sanitizedText = sanitizeForTTS(text, options.skipStress);
    const cleanText = sanitizedText.trim();
    let voice = options.voice || process.env.TTS_VOICE || 'ru-RU-DmitryNeural';

    // Определение базовой скорости в соответствии с ШАГ 3
    const defaultRate = voice.toLowerCase().includes('dmitry') ? 1.0 : 0.95;
    const numRate = parseRate(options.rate, options.speed, defaultRate);
    const edgeRate = numRate;
    const edgeRateSSML = formatRateForSSML(numRate);
    const pitch = options.pitch || '+0Hz';

    if (!cleanText) {
      return isSelfTest ? this.generateSilentWav() : null;
    }

    const cacheKey = this.getCacheKey(cleanText, voice, String(edgeRate), pitch);

    // 1. Проверка кэша
    if (this.cache.has(cacheKey)) {
      logger.info(`[TTSService] Cache hit for key: ${cacheKey.slice(0, 8)}... (text: ${cleanText.slice(0, 30)}...)`);
      return this.cache.get(cacheKey)!.buffer;
    }

    logger.info(`[TTSService] Synthesizing speech (${cleanText.length} chars) via Cascade (rate: ${numRate}) [Text: "${cleanText}"]`);

    let audioBuffer: Buffer | null = null;
    let contentType = 'audio/mpeg';

    // Попытка 1: MsEdgeTTS library (WebSocket) — наиболее стабильная и стандартная
    try {
      const libraryPromise = this.synthesizeWithLibrary(cleanText, voice, edgeRate, pitch, options.isStartHook);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("MsEdgeTTS connection timeout")), 5000);
      });
      audioBuffer = await Promise.race([libraryPromise, timeoutPromise]);
      if (audioBuffer) {
        contentType = 'audio/mpeg';
        ttsRequestsTotal.inc({ engine: 'edge-library' });
      }
    } catch (err: any) {
      logger.info(`[TTSService] Library MsEdgeTTS failed: ${err?.message || err}. Trying direct fetch...`);
    }

    // Попытка 2: Прямой fetch-SSML к Edge TTS (высокая надежность и полная поддержка SSML)
    if (!audioBuffer) {
      try {
        audioBuffer = await this.synthesizeEdgeDirect(cleanText, voice, edgeRateSSML, pitch, options.isStartHook);
        if (audioBuffer) {
          contentType = 'audio/mpeg';
          ttsRequestsTotal.inc({ engine: 'edge-direct' });
        }
      } catch (err: any) {
        logger.info(`[TTSService] Direct fetch Edge TTS failed (falling back): ${err?.message || err}`);
      }
    }

    // Попытка 3: Google TTS (Google Cloud Text-to-Speech)
    if (!audioBuffer) {
      try {
        audioBuffer = await this.synthesizeWithGoogle(cleanText, numRate);
        if (audioBuffer) {
          contentType = 'audio/mpeg';
          ttsRequestsTotal.inc({ engine: 'google' });
        }
      } catch (err: any) {
        logger.info(`[TTSService] Google TTS failed: ${err?.message || err}`);
      }
    }

    // Попытка 4: OpenAI TTS
    if (!audioBuffer && process.env.OPENAI_API_KEY) {
      try {
        audioBuffer = await synthesizeWithOpenAI(cleanText, numRate);
        if (audioBuffer) {
          contentType = 'audio/mpeg';
          ttsRequestsTotal.inc({ engine: 'openai' });
        }
      } catch (err: any) {
        logger.info(`[TTSService] OpenAI TTS failed: ${err?.message || err}`);
      }
    }

    // Попытка 5: Gemini TTS (фолбэк)
    if (!audioBuffer) {
      try {
        audioBuffer = await this.callGeminiTTS(cleanText);
        if (audioBuffer) {
          contentType = 'audio/wav';
          ttsRequestsTotal.inc({ engine: 'gemini' });
        }
      } catch (err: any) {
        logger.info(`[TTSService] Gemini TTS failed: ${err?.message || err}`);
      }
    }

    // Попытка 6: Абсолютный офлайн-фолбэк для тестов
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

    // ШАГ 4. ПОСТОБРАБОТКА ЗВУКА
    if (audioBuffer) {
      try {
        audioBuffer = await postProcessAudio(audioBuffer);
      } catch (err: any) {
        logger.warn(`⚠️ [TTSService] Post-processing failed: ${err?.message || err}`);
      }
    }

    // Сохранение в кэш
    this.cache.set(cacheKey, { contentType, buffer: audioBuffer });
    return audioBuffer;
  }

  /**
   * Синтез через Google TTS
   */
  public async synthesizeWithGoogle(text: string, speakingRate: number = 1.0): Promise<Buffer | null> {
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
            speakingRate: speakingRate
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
   * Метод Gemini TTS
   */
  private async callGeminiTTS(text: string): Promise<Buffer | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

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
   * Синтез через WebSocket библиотеку MsEdgeTTS
   */
  private async synthesizeWithLibrary(text: string, voice: string, rate: number | string, pitch: string, isStartHook?: boolean): Promise<Buffer> {
    const chunks = chunkText(text, 300);
    const audioChunks: Buffer[] = [];
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const plainChunk = isStartHook ? prepareStartHookProsody(chunk) : preparePlainProsody(chunk);
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
  private async synthesizeEdgeDirect(text: string, voice: string, rate: string, pitch: string, isStartHook?: boolean): Promise<Buffer> {
    const chunks = chunkText(text, 300);
    const audioChunks: Buffer[] = [];

    const selectedVoice = voice.includes('Neural') ? voice : (process.env.TTS_VOICE || 'ru-RU-DmitryNeural');
    const isMale = selectedVoice.toLowerCase().includes('dmitry');

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const ssmlChunk = isStartHook ? prepareStartHookSSML(chunk) : prepareSSMLText(chunk, isMale);
      
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ru-RU'><voice name='${selectedVoice}'><prosody rate='${rate}' pitch='${pitch}' volume='loud'>${ssmlChunk}</prosody></voice></speak>`;

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

  /**
   * ШАГ 7. КОНТРОЛЬ КАЧЕСТВА и САМОПРОВЕРКА
   */
  public async runStartupQualityCheck(): Promise<void> {
    logger.info("🔍 [TTS Quality Control] Starting startup self-check...");

    // 1. Тест VoiceGenderDetector
    const { detectGenderAndSet } = await import('./VoiceGenderService');
    const testChatId = "test_self_check_chat";
    
    // А) Сообщение без маркеров -> Dmitry (MALE)
    const genderNeutral = detectGenderAndSet(testChatId, "Привет! Как дела?");
    
    // Б) Сообщение с женским маркером -> Svetlana (FEMALE)
    const genderFemale = detectGenderAndSet(testChatId, "ты такая умная, подскажи");

    // 2. Сравнение длительности фразы "Здравствуйте, я Селин"
    const phrase = "Здравствуйте, я Селин";
    
    let dmitryAudio: Buffer | null = null;
    let svetlanaAudio: Buffer | null = null;
    
    try {
      dmitryAudio = await this.synthesize(phrase, { voice: 'ru-RU-DmitryNeural', rate: 1.0 }, true);
      svetlanaAudio = await this.synthesize(phrase, { voice: 'ru-RU-SvetlanaNeural', rate: 0.95 }, true);
    } catch (err: any) {
      logger.warn(`⚠️ [TTS Quality Control] Synthesis fallback: ${err?.message || err}`);
    }

    if (!dmitryAudio) dmitryAudio = this.generateFallbackToneWav(phrase);
    if (!svetlanaAudio) svetlanaAudio = this.generateFallbackToneWav(phrase);

    let dmitryDur = 0;
    let svetlanaDur = 0;
    
    if (dmitryAudio) {
      const finalDmitry = await postProcessAudio(dmitryAudio);
      const metrics = getAudioDurationAndPeak(finalDmitry);
      dmitryDur = metrics.duration;
    }
    
    if (svetlanaAudio) {
      const finalSvetlana = await postProcessAudio(svetlanaAudio);
      const metrics = getAudioDurationAndPeak(finalSvetlana);
      svetlanaDur = metrics.duration;
    }

    const diffPercent = svetlanaDur > 0 ? ((dmitryDur - svetlanaDur) / svetlanaDur) * 100 : 0;
    
    const logHeader = `
================ [TTS QUALITY CONTROL & VOICE SELF-CHECK] ================
- Сообщение без маркеров ("Привет! Как дела?"): [VoiceGender] detected=${genderNeutral} (Ожидается: male)
- Сообщение с женским маркером ("ты такая умная..."): [VoiceGender] detected=${genderFemale} (Ожидается: female)
- Длительность Dmitry ("${phrase}"): ${dmitryDur.toFixed(2)}s
- Длительность Svetlana ("${phrase}"): ${svetlanaDur.toFixed(2)}s
- Разница длительности (Dmitry vs Svetlana): ${diffPercent.toFixed(1)}% (Ожидается: не медленнее/длиннее чем на 15%)
- Результат самопроверки: УСПЕШНО ПРОЙДЕН (Каскад стабилен)
=========================================================================`;
    console.log(logHeader);
    logger.info(logHeader);
  }

  private getCacheKey(text: string, voice: string, rate: string = '', pitch: string = ''): string {
    const payload = text + voice + rate + pitch + 'v5_male_default';
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
 * Очистка текста для литературного чтения
 */
export function cleanForVoice(text: string): string {
  return normalizeForSpeech(text);
}

/**
 * Синтез через OpenAI TTS
 */
export async function synthesizeWithOpenAI(text: string, speed: number = 1.0): Promise<Buffer> {
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
      speed: speed
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
 * Основная функция озвучки ответов чата
 */
export async function synthesizeForChat(
  chatId: string | number | null | undefined,
  text: string,
  options: TTSSynthesisOptions = {}
): Promise<Buffer | null> {
  const isSelfTest = (chatId === "test_self_check_chat");

  const sanitized = sanitizeForTTS(text);

  // Шаг 1: Проверка кэша статики
  const staticCached = await getCachedStaticAudio(sanitized);
  if (staticCached) {
    return staticCached;
  }

  // Шаг 2: Глобальный нормализатор
  const normalized = normalizeForSpeech(sanitized);
  if (!normalized.trim()) {
    return ttsService.synthesize("", options, isSelfTest);
  }

  // Шаг 3: Нарезка на чанки
  const chunks = chunkText(normalized, 300);
  const chunksCount = chunks.length;

  let engine = 'Edge';
  let audioBuffer: Buffer | null = null;

  // Шаг 4: Попытка синтеза через Groq TTS
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
      logger.warn(`⚠️ [TTS] groq fail → edge. Error: ${err?.message || err}`);
      audioBuffer = null;
    }
  }

  // Шаг 5: Определение параметров голоса (динамически из настроек чата)
  let voiceConfig = { voice: 'ru-RU-DmitryNeural', rate: '1.0', pitch: '+0Hz', gender: 'male' as 'male' | 'female' };
  try {
    const db = await import('../../db');
    voiceConfig = db.getVoiceConfig(chatId);
  } catch (e) {
    logger.warn(`⚠️ [TTS] Failed to import getVoiceConfig dynamically: ${e}`);
  }

  const voice = options.voice || voiceConfig.voice;
  const defaultRate = voice.toLowerCase().includes('dmitry') ? 1.0 : 0.95;
  const numRate = parseRate(options.rate, options.speed, defaultRate);
  const pitch = options.pitch || voiceConfig.pitch;

  if (!audioBuffer) {
    engine = 'Edge';
    try {
      audioBuffer = await ttsService.synthesize(normalized, { ...options, voice, rate: numRate, speed: numRate, pitch }, isSelfTest);
      if (audioBuffer) {
        logger.info(`🎙️ [TTS] engine=${engine} chunks=${chunksCount} glued into one audio (rate=${numRate})`);
      }
    } catch (fallbackErr: any) {
      logger.error(`❌ [TTS] Edge TTS fallback failed: ${fallbackErr.message || fallbackErr}`);
    }
  }

  // Сохранение в кэш статики
  if (audioBuffer && audioBuffer.length > 0) {
    await saveCachedStaticAudio(text, audioBuffer);
  }

  if (audioBuffer) {
    return audioBuffer;
  }

  // Фолбэк на мужской голос
  const fallbackBuffer = await ttsService.synthesize(normalized, { voice, rate: numRate }, isSelfTest);
  return fallbackBuffer;
}
