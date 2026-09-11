import { logger } from '../logger';

/**
 * Сервис распознавания речи (Speech-to-Text).
 * Отвечает за:
 * - Прием аудиофайлов (OGG, MP3, WAV)
 * - Транскрибацию через Groq Whisper-large-v3 или внешние STT API
 * - Постобработку и нормализацию распознанного текста
 */
export class STTService {
  /**
   * Транскрибация аудиофайла в текст
   */
  public async transcribe(audioBuffer: Buffer, language: string = 'ru'): Promise<string> {
    const key = process.env.GROQ_API_KEY;
    if (!key) {
      logger.warn('[STTService] GROQ_API_KEY is not defined. Checking GEMINI_API_KEY as fallback...');
      const geminiKey = process.env.GEMINI_API_KEY;
      if (geminiKey) {
        try {
          const { GoogleGenAI } = await import('@google/genai');
          const ai = new GoogleGenAI({ apiKey: geminiKey });
          const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: [
              {
                inlineData: {
                  data: audioBuffer.toString('base64'),
                  mimeType: 'audio/mp3'
                }
              },
              'Транскрибируй эту аудиозапись на русском языке дословно, без комментариев и примечаний.'
            ]
          });
          const text = response.text || '';
          return text.trim();
        } catch (geminiErr: any) {
          logger.error(`[STTService] Gemini fallback transcription failed: ${geminiErr?.message || geminiErr}`);
          return '';
        }
      }
      logger.warn('[STTService] Neither GROQ_API_KEY nor GEMINI_API_KEY is defined.');
      return '';
    }

    try {
      const form = new FormData();
      const fileBlob = new Blob([audioBuffer], { type: 'audio/ogg' });
      form.append('file', fileBlob, 'voice.ogg');
      form.append('model', 'whisper-large-v3');
      form.append('language', language);

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`
        },
        body: form,
        signal: AbortSignal.timeout(25000)
      });

      if (!response.ok) {
        throw new Error(`STT failed with status ${response.status}`);
      }

      const data: any = await response.json();
      let text = (data?.text || '').trim();
      const lower = text.toLowerCase();
      if (
        lower.includes('dimatorzok') ||
        lower.includes('дима торжок') ||
        lower.includes('субтитры') ||
        lower.includes('субтитрами') ||
        lower.includes('создал субтитры') ||
        lower.includes('редактор субтитров') ||
        lower.includes('продолжение следует') ||
        lower.includes('спасибо за просмотр')
      ) {
        logger.warn(`[STTService] Filtered Whisper hallucination: "${text}"`);
        text = '';
      }
      return text;
    } catch (err: any) {
      logger.error(`[STTService] Transcription error: ${err?.message || err}`);
      return '';
    }
  }
}

export const sttService = new STTService();
