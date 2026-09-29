// src/adapters/max/services/maxSender.ts
import https from 'https';
import { logger } from '../../../logger';
import { cleanForMax, splitTextSmart, prepareVoiceText } from '../utils/textNormalizer';
import { synthesizeForChat } from '../../../services/voice/TTSService';

const MAX_API_HOST = process.env.MAX_API_HOST || 'platform-api2.max.ru';

export interface SendPayloadOptions {
  chatId: string;
  text?: string;
  voice?: boolean;
  extra?: Record<string, unknown>;
  token?: string;
}

/**
 * Unified sender for MAX Messenger API with retry, fallback and circuit breaker.
 */
export class MaxSender {
  private static readonly MAX_RETRIES = 2;
  private static readonly RETRY_DELAY_MS = 600;
  private static consecutiveErrors = 0;
  private static circuitBreakerOpenUntil = 0;

  /**
   * Main unified send method.
   */
  public static async send(options: SendPayloadOptions): Promise<boolean> {
    const { chatId, text, voice, extra } = options;
    const token = options.token || process.env.MAX_BOT_TOKEN;

    if (!token) {
      logger.warn('[MaxSender] Cannot send message: MAX_BOT_TOKEN is not configured.');
      return false;
    }

    if (!chatId) {
      logger.warn('[MaxSender] Cannot send message: chatId is empty.');
      return false;
    }

    if (Date.now() < this.circuitBreakerOpenUntil) {
      logger.warn('[MaxSender] Circuit breaker is OPEN. Message rejected.');
      return false;
    }

    // 1. Если запрошен голос — отправляем ИСКЛЮЧИТЕЛЬНО голосовое сообщение без текста
    if (voice && text) {
      return this.sendVoiceMessage(chatId, text, token);
    }

    // 2. Если голос не запрошен — отправляем чисто текстовое сообщение
    if (text) {
      return this.splitAndSend(chatId, text, token, extra);
    }

    // 3. Extra only (e.g. keyboards or actions without text body)
    if (extra) {
      return this.sendTextMessageWithRetry(chatId, ' ', token, extra);
    }

    return true;
  }

  public static async sendText(chatId: string, text: string, token?: string, extra?: Record<string, unknown>): Promise<boolean> {
    return this.send({ chatId, text, token, extra });
  }

  public static async sendAudio(chatId: string, text: string, token?: string): Promise<boolean> {
    return this.send({ chatId, text, voice: true, token });
  }

  public static async sendImage(chatId: string, imageUrl: string, caption?: string, token?: string): Promise<boolean> {
    const extra = {
      attachments: [
        {
          type: 'image',
          payload: { url: imageUrl, caption: caption || '' }
        }
      ]
    };
    return this.send({ chatId, text: caption || '', extra, token });
  }

  public static async splitAndSend(
    chatId: string,
    text: string,
    token: string,
    extra?: Record<string, unknown>
  ): Promise<boolean> {
    const cleaned = cleanForMax(text);
    const chunks = splitTextSmart(cleaned);

    for (let i = 0; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1;
      const currentExtra = isLast ? extra : undefined;
      const success = await this.sendTextMessageWithRetry(chatId, chunks[i], token, currentExtra);
      if (!success) {
        logger.error(`[MaxSender] Failed to send message chunk ${i + 1}/${chunks.length} to chat ${chatId}`);
        return false;
      }
      // БАГ 2: Пауза 800мс между чанками при последовательной отправке
      if (!isLast) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }
    return true;
  }

  /**
   * Helper to execute HTTPS request with retries.
   */
  private static async sendTextMessageWithRetry(
    chatId: string,
    text: string,
    token: string,
    extra?: Record<string, unknown>
  ): Promise<boolean> {
    const numericId = parseInt(chatId, 10);
    const bodyObj: Record<string, unknown> = {
      text,
      chat_id: Number.isFinite(numericId) ? numericId : chatId,
      user_id: Number.isFinite(numericId) ? numericId : undefined,
      recipient: {
        chat_id: Number.isFinite(numericId) ? numericId : chatId
      },
      ...extra
    };

    const payload = JSON.stringify(bodyObj);
    const queryPath = `/messages?chat_id=${encodeURIComponent(chatId)}`;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const status = await this.postJsonRequest(queryPath, payload, token);
        if (status >= 200 && status < 300) {
          this.consecutiveErrors = 0;
          return true;
        }
        logger.warn(`[MaxSender] Attempt ${attempt} failed with status ${status}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`[MaxSender] Network error on attempt ${attempt}: ${msg}`);
      }

      if (attempt < this.MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY_MS));
      }
    }

    this.consecutiveErrors++;
    if (this.consecutiveErrors >= 5) {
      this.circuitBreakerOpenUntil = Date.now() + 30000;
      logger.error('[MaxSender] 5 consecutive failures. Circuit breaker opened for 30s');
    }

    return false;
  }

  /**
   * Synthesize audio and send voice message to MAX.
   */
  public static async sendVoiceMessage(chatId: string, rawText: string, token: string): Promise<boolean> {
    const voiceText = prepareVoiceText(rawText);
    if (!voiceText) return false;

    let audioBuffer: Buffer | null = null;
    try {
      audioBuffer = await synthesizeForChat(chatId, voiceText);
    } catch (ttsErr: unknown) {
      const msg = ttsErr instanceof Error ? ttsErr.message : String(ttsErr);
      logger.warn(`[MaxSender] TTS failed: ${msg}`);
    }

    // Если синтез не удался, отправляем текстом, чтобы сообщение не терялось
    if (!audioBuffer || audioBuffer.length === 0) {
      logger.warn(`[MaxSender] TTS returned empty buffer for chat ${chatId}, falling back to text delivery`);
      return this.splitAndSend(chatId, rawText, token);
    }

    logger.info(`[MaxSender] Voice buffer prepared (${audioBuffer.length} bytes) for chat ${chatId}`);

    const numericId = parseInt(chatId, 10);
    const base64Audio = audioBuffer.toString('base64');
    
    // MAX API voice payload format
    const bodyObj: Record<string, unknown> = {
      chat_id: Number.isFinite(numericId) ? numericId : chatId,
      recipient: {
        chat_id: Number.isFinite(numericId) ? numericId : chatId
      },
      attachments: [
        {
          type: 'audio',
          payload: {
            data: `data:audio/mp3;base64,${base64Audio}`
          }
        }
      ]
    };

    const payload = JSON.stringify(bodyObj);
    const queryPath = `/messages?chat_id=${encodeURIComponent(chatId)}`;
    const status = await this.postJsonRequest(queryPath, payload, token);
    return status >= 200 && status < 300;
  }

  /**
   * Native HTTPS POST utility for MAX API with response body logging.
   */
  private static postJsonRequest(path: string, bodyJson: string, token: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: MAX_API_HOST,
          port: 443,
          path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyJson),
            Authorization: token,
            'User-Agent': 'SelinAI-MaxAdapter/2.0'
          },
          rejectUnauthorized: false,
          timeout: 10000
        },
        (res) => {
          let resData = '';
          res.on('data', (chunk) => { resData += chunk; });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
              logger.warn(`[MaxSender] MAX API returned ${res.statusCode}: ${resData}`);
            }
            resolve(res.statusCode || 500);
          });
        }
      );

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });

      req.write(bodyJson);
      req.end();
    });
  }
}
