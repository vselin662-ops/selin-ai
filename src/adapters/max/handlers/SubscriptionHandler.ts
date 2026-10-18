// src/adapters/max/handlers/SubscriptionHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { getSubscription } from '../../../fintech/subscriptions';
import { HITLEngine } from '../../../engines/HITLEngine';
import { SemanticGovernance } from '../../../engines/SemanticGovernance';

export class SubscriptionHandler implements IMessageHandler {
  public readonly name = 'SubscriptionHandler';
  public readonly priority = 65;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return (
      text === '/sub' ||
      text === 'подписка' ||
      text === 'тариф' ||
      text.startsWith('/pay ') ||
      text === 'купить подписку'
    );
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const sub = getSubscription(ctx.chatId);
      const isPaid = sub && sub.paid_until && new Date(sub.paid_until).getTime() > Date.now();

      if (isPaid) {
        return {
          handled: true,
          replyText: `💳 **Ваша подписка активна!**\nСрок действия: до ${new Date(sub.paid_until!).toLocaleDateString('ru-RU')}.`
        };
      }

      const paymentText =
        '💎 **Премиум-подписка Selin AI**\n\n' +
        '• Безлимитные запросы к ИИ и документам\n' +
        '• Голосовой синтез студийного качества\n' +
        '• Полный доступ к Плану Победы и SMART-планированию\n\n' +
        'Стоимость: 490 ₽ / месяц.\n' +
        'Для перехода к оплате выберите вариант ниже:';

      const extra = {
        attachments: [
          {
            type: 'inline_keyboard',
            payload: {
              buttons: [
                [
                  { type: 'callback', text: '💳 Оплатить 490 ₽', payload: 'pay_sub_month' },
                  { type: 'callback', text: '🎁 Тестовый период (3 дня)', payload: 'trial_sub' }
                ]
              ]
            }
          }
        ]
      };

      return {
        handled: true,
        replyText: paymentText,
        extra
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[SubscriptionHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
