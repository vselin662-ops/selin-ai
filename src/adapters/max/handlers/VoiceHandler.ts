// src/adapters/max/handlers/VoiceHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';

export class VoiceHandler implements IMessageHandler {
  public readonly name = 'VoiceHandler';
  public readonly priority = 30;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return (
      text === 'голос вкл' ||
      text === 'голос выкл' ||
      text === '/voice on' ||
      text === '/voice off'
    );
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const text = ctx.lowerText;
      const enable = text.includes('вкл') || text.includes('on');

      return {
        handled: true,
        replyText: enable ? '🔊 Голосовые ответы включены.' : '🔇 Голосовые ответы отключены.',
        voiceText: enable ? 'Голосовые ответы включены.' : undefined
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[VoiceHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
