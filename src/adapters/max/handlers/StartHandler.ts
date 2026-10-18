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
      // Инициализируем профиль по умолчанию
      ensureNewUserPlanProfile(ctx.chatId);

      const welcomeText =
        '👋 **Приветствую вас! Я Selin AI** — ваш суверенный ИИ-напарник нового поколения.\n\n' +
        'Я не просто чат-бот, я — обучаемая ИИ-система, созданная для решения реальных задач.\n\n' +
        '🔥 **Доступные интерактивные модули**:\n' +
        '• 🌍 **Языковой Наставник** (Курсы, слова, диалоги, произношение, проверка ДЗ).\n' +
        '• 💼 **Бизнес-Ментор** (SMART-задачи, CRM, симулятор переговоров).\n' +
        '• 📖 **Духовный трекер** (Синодальный перевод Библии, псалмы, утренний брифинг).\n\n' +
        '🎁 **ИНТЕЛЛЕКТУАЛЬНЫЙ ИИ-КВЕСТ**:\n' +
        'Пройдите наш суверенный квест на логику и эрудицию прямо сейчас и получите **бесплатный безлимитный VIP-доступ на 30 дней**!\n\n' +
        'Пожалуйста, выберите действие на кнопках ниже:';

      const extra = {
        attachments: [
          {
            type: 'inline_keyboard',
            payload: {
              buttons: [
                [
                  { type: 'callback', text: '🌍 Языковой Наставник', payload: 'lang_menu' },
                  { type: 'callback', text: '💼 Бизнес-Ментор', payload: 'biz_menu' }
                ],
                [
                  { type: 'callback', text: '🎁 Пройти ИИ-Квест (VIP 30д)', payload: 'quest_start' },
                  { type: 'callback', text: '🕊 Псалом дня', payload: 'bible_psalm_today' }
                ]
              ]
            }
          }
        ]
      };

      return {
        handled: true,
        replyText: welcomeText,
        voiceText: 'Приветствую вас! Я Селин эй ай, ваш автономный суверенный ассистент. Выберите нужный раздел на кнопках под сообщением.',
        extra
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[StartHandler] Error handling start for chat ${ctx.chatId}: ${msg}`);
      return { handled: false };
    }
  }
}
