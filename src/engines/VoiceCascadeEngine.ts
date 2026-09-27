// src/engines/VoiceCascadeEngine.ts
import { logger } from '../logger';
import { synthesizeForChat } from '../services/voice/TTSService';

export class VoiceCascadeEngine {
  public static async synthesizeWithFallback(chatId: string, text: string): Promise<Buffer | null> {
    try {
      if (!text || text.trim().length === 0) {
        return null;
      }

      logger.info(`[VoiceCascadeEngine] Initiating voice synthesis for chat ${chatId}`);
      const audioBuffer = await synthesizeForChat(chatId, text);
      if (audioBuffer && audioBuffer.length > 0) {
        logger.info(`[VoiceCascadeEngine] Voice synthesized successfully (${audioBuffer.length} bytes)`);
        return audioBuffer;
      }

      logger.warn(`[VoiceCascadeEngine] Primary synthesis yielded empty buffer for chat ${chatId}`);
      return null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[VoiceCascadeEngine] Voice cascade failed: ${msg}`);
      return null;
    }
  }
}
