// src/adapters/max/handlers/PaymentHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { HITLEngine } from '../../../engines/HITLEngine';
import { PaymentPipelineEngine } from '../../../engines/PaymentPipelineEngine';
import { activateSubscription } from '../../../fintech/subscriptions';

export class PaymentHandler implements IMessageHandler {
  public readonly name = 'PaymentHandler';
  public readonly priority = 70;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return text.startsWith('/pay') || text.startsWith('оплатить') || text.startsWith('заявка на оплату');
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      logger.info(`[PaymentHandler] Payment flow initiated for chat ${ctx.chatId}`);
      const paymentInfo = PaymentPipelineEngine.initSubscriptionPayment(ctx.chatId, 'MONTHLY');

      const reply =
        `💳 **Заявка на оплату сформирована!**\n\n` +
        `• Тариф: ${paymentInfo.tariffName}\n` +
        `• Сумма к оплате: **${paymentInfo.amountRub} ₽**\n` +
        `• Идентификатор проверки: \`${paymentInfo.actionId}\`\n\n` +
        `Операция защищена двухфакторным подтверждением (HITL). Подтвердите платёж кнопкой ниже.`;

      const extra = {
        attachments: [
          {
            type: 'inline_keyboard',
            payload: {
              buttons: [
                [
                  { type: 'callback', text: '✅ Подтвердить оплату', payload: `approve_${paymentInfo.actionId}` },
                  { type: 'callback', text: '❌ Отмена', payload: `reject_${paymentInfo.actionId}` }
                ]
              ]
            }
          }
        ]
      };

      return {
        handled: true,
        replyText: reply,
        voiceText: `Заявка на оплату ${paymentInfo.amountRub} рублей ожидает вашего подтверждения.`,
        extra
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[PaymentHandler] Error processing payment: ${msg}`);
      return { handled: false };
    }
  }
}
