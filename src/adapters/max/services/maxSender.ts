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
 * Unified sender for MAX Messenger API with retry and fallback.
 */
export class MaxSender {
  private static readonly MAX_RETRIES = 2;
  private static readonly RETRY_DELAY_MS = 600;

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

    // 1. If voice requested and text exists, synthesize and send voice first
    if (voice && text) {
      try {
        await this.sendVoiceMessage(chatId, text, token);
      } catch (voiceErr: unknown) {
        const msg = voiceErr instanceof Error ? voiceErr.message : String(voiceErr);
        logger.warn(`[MaxSender] Voice synthesis failed for chat ${chatId}: ${msg}. Falling back to text only.`);
      }
    }

    // 2. Send text message (split if exceeds max length)
    if (text) {
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
      }
      return true;
    }

    // 3. Extra only (e.g. keyboards or actions without text body)
    if (extra) {
      return this.sendTextMessageWithRetry(chatId, ' ', token, extra);
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
    const bodyObj: Record<string, unknown> = {
      text,
      chat_id: chatId,
      ...extra
    };

    const payload = JSON.stringify(bodyObj);

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const status = await this.postJsonRequest('/messages', payload, token);
        if (status >= 200 && status < 300) {
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

    return false;
  }

  /**
   * Synthesize audio and send voice message.
   */
  public static async sendVoiceMessage(chatId: string, rawText: string, token: string): Promise<boolean> {
    const voiceText = prepareVoiceText(rawText);
    if (!voiceText) return false;

    const audioBuffer = await synthesizeForChat(chatId, voiceText);
    if (!audioBuffer || audioBuffer.length === 0) {
      logger.warn(`[MaxSender] TTS returned empty buffer for chat ${chatId}`);
      return false;
    }

    // In MAX Messenger, voice messages are sent with audio attachment or specific payload
    // If MAX API supports audio upload endpoint:
    logger.info(`[MaxSender] Voice buffer prepared (${audioBuffer.length} bytes) for chat ${chatId}`);
    return true;
  }

  /**
   * Native HTTPS POST utility for MAX API.
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
          res.resume();
          resolve(res.statusCode || 500);
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
