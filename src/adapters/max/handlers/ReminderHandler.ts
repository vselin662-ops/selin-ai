// src/adapters/max/handlers/ReminderHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';

export class ReminderHandler implements IMessageHandler {
  public readonly name = 'ReminderHandler';
  public readonly priority = 115;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return text.startsWith('напомни:') || text.startsWith('напомни ');
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const reminderText = ctx.text.replace(/^напомни:?\s*/i, '').trim();
      if (!reminderText) {
        return {
          handled: true,
          replyText: '⏰ Укажите, о чём напомнить. Например: «напомни: позвонить партнёру в 15:00».'
        };
      }

      logger.info(`[ReminderHandler] Reminder registered for chat ${ctx.chatId}: "${reminderText}"`);
      return {
        handled: true,
        replyText: `⏰ Напоминание зафиксировано: «${reminderText}». Я обязательно напомню вам!`,
        voiceText: 'Напоминание установлено.'
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[ReminderHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
