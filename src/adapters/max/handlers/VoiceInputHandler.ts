// src/adapters/max/handlers/VoiceInputHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { VoiceCascadeEngine } from '../../../engines/VoiceCascadeEngine';

export class VoiceInputHandler implements IMessageHandler {
  public readonly name = 'VoiceInputHandler';
  public readonly priority = 30;

  public canHandle(ctx: HandlerContext): boolean {
    return ctx.isVoiceInput;
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      logger.info(`[VoiceInputHandler] Processing voice input for chat ${ctx.chatId}`);
      if (ctx.text && ctx.text.trim().length > 0) {
        return {
          handled: false
        };
      }

      return {
        handled: true,
        replyText: '🎙 Голосовое сообщение получено и передано в каскад распознавания.',
        voiceText: 'Слушаю вас.'
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[VoiceInputHandler] Error handling voice: ${msg}`);
      return { handled: false };
    }
  }
}
