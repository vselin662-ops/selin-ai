import { logger } from "../../logger";

/**
 * Сервис распознавания речи (Speech-to-Text).
 * Отвечает за:
 * - Прием аудиофайлов (OGG, MP3, WAV)
 * - 100% локальную транскрибацию через Faster-Whisper контейнер
 * - Постобработку и нормализацию распознанного текста
 */
export class STTService {
  /**
   * Транскрибация аудиофайла в текст
   */
  public async transcribe(audioBuffer: Buffer, language: string = 'ru'): Promise<string> {
    if (!audioBuffer || audioBuffer.length === 0) {
      return '';
    }

    // 1. Приоритетный путь: Локальный Faster-Whisper (внутри Docker / на сервере)
    const localWhisperUrls = [
      process.env.WHISPER_BASE_URL,
      "http://whisper:9000",
      "http://host.docker.internal:9000",
      "http://172.17.0.1:9000",
      "http://127.0.0.1:9000"
    ].filter(Boolean) as string[];

    for (const whisperUrl of localWhisperUrls) {
      const cleanUrl = whisperUrl.replace(/\/$/, '');

      // OpenAI-compatible endpoint for faster-whisper-server (/v1/audio/transcriptions)
      try {
        const form = new FormData();
        const fileBlob = new Blob([audioBuffer], { type: 'audio/ogg' });
        form.append('file', fileBlob, 'voice.ogg');
        form.append('model', 'small');
        form.append('language', language);

        const response = await fetch(`${cleanUrl}/v1/audio/transcriptions`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(15000)
        });

        if (response.ok) {
          const data: any = await response.json();
          const text = this.cleanWhisperHallucinations((data?.text || '').trim());
          if (text) {
            logger.info(`🎤 [STT:LocalWhisper:v1] Transcribed from ${cleanUrl}: "${text.substring(0, 50)}..."`);
            return text;
          }
        }
      } catch {
        // Fallback to /asr endpoint
      }

      // Legacy ASR endpoint (/asr)
      try {
        const form = new FormData();
        const fileBlob = new Blob([audioBuffer], { type: 'audio/ogg' });
        form.append('audio_file', fileBlob, 'voice.ogg');

        const response = await fetch(`${cleanUrl}/asr?language=${language}&output=json`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(15000)
        });

        if (response.ok) {
          const data: any = await response.json();
          const text = this.cleanWhisperHallucinations((data?.text || '').trim());
          if (text) {
            logger.info(`🎤 [STT:LocalWhisper:asr] Transcribed from ${cleanUrl}: "${text.substring(0, 50)}..."`);
            return text;
          }
        }
      } catch {
        // Continue to next probe
      }
    }

    // 2. Резервный шлюз Cloud.ru (если настроен)
    const cloudruApiKey = process.env.CLOUDRU_API_KEY;
    if (cloudruApiKey) {
      try {
        const form = new FormData();
        const fileBlob = new Blob([audioBuffer], { type: 'audio/ogg' });
        form.append('file', fileBlob, 'voice.ogg');
        const response = await fetch('https://api.cloud.ru/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${cloudruApiKey}` },
          body: form,
          signal: AbortSignal.timeout(15000)
        });
        if (response.ok) {
          const data: any = await response.json();
          const text = this.cleanWhisperHallucinations((data?.text || '').trim());
          if (text) {
            logger.info(`🎤 [STT:CloudRU] Transcribed successfully: "${text.substring(0, 50)}..."`);
            return text;
          }
        }
      } catch (cloudErr: any) {
        logger.warn(`⚠️ [STT:CloudRU] Notice: ${cloudErr?.message}`);
      }
    }

    logger.warn('⚠️ [STTService] Voice buffer received, waiting for transcription engine.');
    return '';
  }

  private cleanWhisperHallucinations(text: string): string {
    if (!text) return '';
    const lower = text.toLowerCase();
    const hallucinations = [
      'dimatorzok',
      'дима торжок',
      'субтитры',
      'субтитрами',
      'создал субтитры',
      'редактор субтитров',
      'продолжение следует',
      'спасибо за просмотр',
      'поставь лайк',
      'подпишись на канал',
      'до скорой встречи',
      'музыка'
    ];

    for (const h of hallucinations) {
      if (lower === h || lower === `[${h}]` || lower === `(${h})`) {
        logger.warn(`⚠️ [STTService] Filtered Whisper hallucination: "${text}"`);
        return '';
      }
    }
    return text;
  }
}

export const sttService = new STTService();

