// src/adapters/max/handlers/StartHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { ensureNewUserPlanProfile } from '../../../services/ai/ProfileService';

export class StartHandler implements IMessageHandler {
  public readonly name = 'StartHandler';
  public readonly priority = 10;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return text === '/start' || text === 'start' || text === 'старт' || text.startsWith('/start ');
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      // Ensure profile with Victory Plan is initialized for new user
      ensureNewUserPlanProfile(ctx.chatId);

      const welcomeText =
        '👋 **Здравствуйте! Я Селин** — ваш персональный ИИ-ассистент.\n\n' +
        '🔹 **Планирование**: Цели, задачи, SMART-брифинг.\n' +
        '🔹 **Документы**: Поиск по вашим файлам PDF, DOCX, TXT.\n' +
        '🔹 **Библия и духовный трекер**: Синодальный перевод, псалмы, годовой План Победы.\n' +
        '🔹 **Голос**: Поддерживаю аудиосообщения и голосовые ответы.\n\n' +
        'Напишите команду или задайте любой вопрос!';

      const extra = {
        attachments: [
          {
            type: 'inline_keyboard',
            payload: {
              buttons: [
                [
                  { type: 'callback', text: '📖 План Победы', payload: 'plan_today' },
                  { type: 'callback', text: '🕊 Псалом дня', payload: 'get_psalm' }
                ],
                [
                  { type: 'callback', text: '🎯 Мои цели', payload: 'my_goals' },
                  { type: 'callback', text: '📂 Мои документы', payload: 'my_docs' }
                ]
              ]
            }
          }
        ]
      };

      return {
        handled: true,
        replyText: welcomeText,
        voiceText: 'Здравствуйте, я Селин, ваш персональный помощник.',
        extra
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[StartHandler] Error handling start for chat ${ctx.chatId}: ${msg}`);
      return { handled: false };
    }
  }
}
