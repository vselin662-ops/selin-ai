import { logger } from '../../logger';

/**
 * Сервис распознавания речи (Speech-to-Text).
 * Отвечает за:
 * - Прием аудиофайлов (OGG, MP3, WAV)
 * - Транскрибацию через Groq Whisper-large-v3, Gemini Audio, OpenRouter или локальный Whisper
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

    // 1. Попытка через Groq Whisper (самый быстрый и точный)
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey && !groqKey.includes('your_') && !groqKey.includes('placeholder') && groqKey.length > 10) {
      try {
        const form = new FormData();
        const fileBlob = new Blob([audioBuffer], { type: 'audio/ogg' });
        form.append('file', fileBlob, 'voice.ogg');
        form.append('model', 'whisper-large-v3');
        form.append('language', language);

        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqKey}` },
          body: form,
          signal: AbortSignal.timeout(20000)
        });

        if (response.ok) {
          const data: any = await response.json();
          const text = this.cleanWhisperHallucinations((data?.text || '').trim());
          if (text) {
            logger.info(`🎤 [STT:Groq] Transcribed successfully: "${text.substring(0, 50)}..."`);
            return text;
          }
        }
      } catch (groqErr: any) {
        logger.warn(`⚠️ [STT:Groq] Failed: ${groqErr?.message || groqErr}`);
      }
    }

    // 2. Попытка через Gemini Multimodal Audio
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && !geminiKey.includes('your_') && !geminiKey.includes('placeholder') && geminiKey.length > 10) {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const response = await ai.models.generateContent({
          model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
          contents: [
            {
              inlineData: {
                data: audioBuffer.toString('base64'),
                mimeType: 'audio/mp3'
              }
            },
            'Транскрибируй эту аудиозапись на русском языке дословно, без комментариев, пояснений и примечаний. Только текст сказанного.'
          ]
        });
        const text = this.cleanWhisperHallucinations((response.text || '').trim());
        if (text) {
          logger.info(`🎤 [STT:Gemini] Transcribed successfully: "${text.substring(0, 50)}..."`);
          return text;
        }
      } catch (geminiErr: any) {
        logger.warn(`⚠️ [STT:Gemini] Fallback failed: ${geminiErr?.message || geminiErr}`);
      }
    }

    // 3. Попытка через локальный Whisper (на хост-машине или в Docker)
    const localWhisperUrls = [
      process.env.WHISPER_BASE_URL,
      "http://host.docker.internal:9000",
      "http://172.17.0.1:9000",
      "http://127.0.0.1:9000"
    ].filter(Boolean) as string[];

    for (const whisperUrl of localWhisperUrls) {
      try {
        const form = new FormData();
        const fileBlob = new Blob([audioBuffer], { type: 'audio/ogg' });
        form.append('audio_file', fileBlob, 'voice.ogg');

        const response = await fetch(`${whisperUrl.replace(/\/$/, '')}/asr?language=${language}&output=json`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(15000)
        });

        if (response.ok) {
          const data: any = await response.json();
          const text = this.cleanWhisperHallucinations((data?.text || '').trim());
          if (text) {
            logger.info(`🎤 [STT:LocalWhisper] Transcribed from ${whisperUrl}: "${text.substring(0, 50)}..."`);
            return text;
          }
        }
      } catch {
        // Continue to next fallback
      }
    }

    logger.error('❌ [STTService] All STT providers failed or no API keys configured.');
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

