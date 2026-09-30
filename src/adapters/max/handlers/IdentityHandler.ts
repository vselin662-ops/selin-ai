// src/adapters/max/handlers/IdentityHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';

export class IdentityHandler implements IMessageHandler {
  public readonly name = 'IdentityHandler';
  public readonly priority = 125;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return (
      text === 'кто ты' ||
      text === 'кто твой создатель' ||
      text === 'кто тебя создал' ||
      text === 'чей ты' ||
      text === 'пол модели' ||
      text === 'кто создатель' ||
      text === 'инфо'
    );
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const reply =
        `🤖 **Я — Selin AI 2.0 (Суверенная российская экосистема)**.\n\n` +
        `• **Создатель и Архитектор**: Селин Вадим Юрьевич (Россия).\n` +
        `• **Контур и Безопасность**: Работаю исключительно в суверенном контуре РФ (152-ФЗ), на отечественной инфраструктуре и локальных моделях.\n` +
        `• **Важное уточнение**: Я не имею никакого отношения к зарубежным или американским проектам со схожим названием.\n` +
        `• **Миссия**: Надежный персональный помощник в бизнесе, маркетинге, планировании и духовном росте (План Победы).`;

      return {
        handled: true,
        replyText: reply,
        voiceText: 'Я Селин, суверенный российский искусственный интеллект. Мой создатель — Вадим Селин.'
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[IdentityHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
