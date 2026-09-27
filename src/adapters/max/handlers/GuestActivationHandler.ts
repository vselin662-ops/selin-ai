// src/adapters/max/handlers/GuestActivationHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { activateSubscription } from '../../../fintech/subscriptions';

export class GuestActivationHandler implements IMessageHandler {
  public readonly name = 'GuestActivationHandler';
  public readonly priority = 135;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return text === 'гость2026' || text === 'папаволк' || text === '/guest2026';
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      logger.info(`[GuestActivationHandler] VIP guest promo code activated for chat ${ctx.chatId}`);
      activateSubscription(ctx.chatId, 'premium', 30);

      return {
        handled: true,
        replyText:
          '🐺 **Специальный гостевой доступ активирован!**\n\n' +
          'Вам предоставлен полный доступ ко всем функциям Mega Brain на 30 дней.',
        voiceText: 'Специальный гостевой доступ успешно активирован.'
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[GuestActivationHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
