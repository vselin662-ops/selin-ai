// src/adapters/max/handlers/CallbackHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { HITLEngine } from '../../../engines/HITLEngine';
import { activateSubscription } from '../../../fintech/subscriptions';

export class CallbackHandler implements IMessageHandler {
  public readonly name = 'CallbackHandler';
  public readonly priority = 130;

  public canHandle(ctx: HandlerContext): boolean {
    return ctx.isCallbackUpdate || Boolean(ctx.callbackData);
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const data = ctx.callbackData || ctx.text;
      logger.info(`[CallbackHandler] Processing callback "${data}" for chat ${ctx.chatId}`);

      if (data.startsWith('approve_')) {
        const actionId = data.replace('approve_', '');
        const action = HITLEngine.approveAction(actionId, ctx.chatId);
        if (action) {
          if (action.actionType === 'PAYMENT' || action.actionType === 'SUBSCRIPTION_CHANGE') {
            activateSubscription(ctx.chatId, 'plan', 30);
          }
          return {
            handled: true,
            replyText: `✅ Действие \`${actionId}\` успешно подтверждено и выполнено!`
          };
        }
        return {
          handled: true,
          replyText: `⚠️ Запрос ${actionId} не найден или истек срок его действия.`
        };
      }

      if (data.startsWith('reject_')) {
        const actionId = data.replace('reject_', '');
        HITLEngine.rejectAction(actionId, ctx.chatId);
        return {
          handled: true,
          replyText: `❌ Действие \`${actionId}\` отклонено.`
        };
      }

      if (data === 'trial_sub') {
        activateSubscription(ctx.chatId, 'trial', 3);
        return {
          handled: true,
          replyText: '🎁 Пробный период на 3 дня успешно активирован!'
        };
      }

      return {
        handled: true,
        replyText: `🔘 Выбрано действие: ${data}`
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[CallbackHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
