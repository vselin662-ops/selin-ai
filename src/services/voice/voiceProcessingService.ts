import { getVoiceConfig } from "../../../db";
import { normalizeForSpeech } from "../../utils/textUtils";
import { logger } from "../../logger";
import { sttService } from "./stt.service";
import { ttsService } from "./TTSService";

export async function transcribeAudio(audioBuffer: Buffer, filename: string = 'voice.ogg'): Promise<string> {
  try {
    const text = await sttService.transcribe(audioBuffer);
    logger.info(`✅ [Sovereign STT Success] Распознанный текст: "${text}"`);
    return text;
  } catch (err: any) {
    logger.error(`❌ [Sovereign STT Failed] Ошибка при распознавании речи: ${err?.message || err}`);
    return "";
  }
}

export async function transcribeAudioBuffer(buf: Buffer): Promise<string> {
  return transcribeAudio(buf, 'voice.ogg');
}

export async function downloadMaxAudio(fileUrl: string): Promise<Buffer> {
  const url = (fileUrl || '').trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error(`Нужна прямая ссылка payload.url, а не токен (получено: "${url}")`);
  }

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'audio/*, application/octet-stream'
    },
    signal: AbortSignal.timeout(20000)
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'No error body');
    throw new Error(`Failed to download audio (HTTP ${res.status}): ${errorText}`);
  }

  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  if (buffer.length === 0) {
    throw new Error('Downloaded audio is empty');
  }

  return buffer;
}

export async function generateAudioTtsBuffer(text: string, chatId?: string | number): Promise<{ buffer: Buffer; voiceName: string }> {
  const voicePrepared = normalizeForSpeech(text);
  const voiceConfig = getVoiceConfig(chatId);

  // Используем суверенный ttsService (Yandex SpeechKit или локальный офлайн фоллбэк)
  const audioBuffer = await ttsService.synthesize(voicePrepared, {
    voice: voiceConfig.voice,
    rate: voiceConfig.rate,
    pitch: voiceConfig.pitch
  });

  if (!audioBuffer) {
    throw new Error("Sovereign TTS failed to synthesize audio");
  }

  return {
    buffer: audioBuffer,
    voiceName: voiceConfig.gender === 'female' ? 'Kore' : 'Charon'
  };
}
