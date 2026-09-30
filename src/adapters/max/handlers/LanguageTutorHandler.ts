// src/adapters/max/handlers/LanguageTutorHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { LanguageTutorService } from '../../../services/education/LanguageTutorService';

export class LanguageTutorHandler implements IMessageHandler {
  public readonly name = 'LanguageTutorHandler';
  public readonly priority = 45; // Высокий приоритет перед общей болталкой

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText.trim();
    const data = ctx.callbackData || '';
    const profile = LanguageTutorService.getProfile(ctx.chatId);

    // Если у пользователя стадия практики (ждём ответ на задание)
    const isPracticeResponse = profile.stage === 'practice' && text.length > 2 && !text.startsWith('/') && !ctx.isCallbackUpdate;

    return (
      text.startsWith('/язык') ||
      text.startsWith('язык ') ||
      text === 'язык' ||
      text === 'новый урок' ||
      text === 'урок' ||
      text === '/lesson' ||
      text === 'тест' ||
      text === 'экзамен' ||
      text === '/test' ||
      text === 'повторение' ||
      text === 'повторить' ||
      text === '/review' ||
      text === 'прогресс' ||
      text === 'мой прогресс' ||
      text === '/progress' ||
      data === 'lang_menu' ||
      data === 'lang_english' ||
      data === 'lang_chinese' ||
      data === 'lang_lesson' ||
      data === 'lang_test' ||
      data === 'lang_review' ||
      data === 'lang_progress' ||
      isPracticeResponse
    );
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const text = (ctx.callbackData || ctx.lowerText).trim();
      const profile = LanguageTutorService.getProfile(ctx.chatId);

      // Специфический перехват выбора языка кнопками
      if (text === 'lang_english' || text === 'lang_chinese') {
        const lang = text === 'lang_english' ? 'английский' : 'китайский';
        const res = await LanguageTutorService.setLanguage(ctx.chatId, lang);
        
        const extra = {
          attachments: [
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [
                  [
                    { type: 'callback', text: '📚 Получить первый урок', payload: 'lang_lesson' },
                    { type: 'callback', text: '📊 Мой прогресс', payload: 'lang_progress' }
                  ]
                ]
              }
            }
          ]
        };

        return {
          handled: true,
          replyText: res.text,
          voiceText: `Курс по языку ${lang} успешно активирован. Желаю успехов!`,
          extra
        };
      }

      // 1. Смена языка / выбор курса с инлайн кнопками
      if (text.startsWith('/язык') || text.startsWith('язык ') || text === 'язык' || text === 'lang_menu') {
        const langPart = ctx.text.replace(/^\/?язык:?\s*/i, '').trim() || 'английский';
        
        // Показываем кнопки выбора языка
        const extra = {
          attachments: [
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [
                  [
                    { type: 'callback', text: '🇬🇧 Английский курс', payload: 'lang_english' },
                    { type: 'callback', text: '🇨🇳 Китайский курс', payload: 'lang_chinese' }
                  ],
                  [
                    { type: 'callback', text: '📚 Взять урок', payload: 'lang_lesson' },
                    { type: 'callback', text: '🧠 Повторение', payload: 'lang_review' }
                  ]
                ]
              }
            }
          ]
        };

        return {
          handled: true,
          replyText: 
            `🌍 **Языковой Наставник Selin AI**\n\n` +
            `Выберите изучаемый язык для автоматической настройки суверенной ИИ-траектории обучения:`,
          voiceText: `Пожалуйста, выберите язык обучения на экране.`,
          extra
        };
      }

      // 2. Генерация адаптивного интерактивного урока
      if (text === 'новый урок' || text === 'урок' || text === '/lesson' || text === 'lang_lesson') {
        const res = await LanguageTutorService.getNewLesson(ctx.chatId);
        
        const extra = {
          attachments: [
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [
                  [
                    { type: 'callback', text: '📊 Мой прогресс', payload: 'lang_progress' },
                    { type: 'callback', text: '🇬🇧 Сменить язык', payload: 'lang_menu' }
                  ]
                ]
              }
            }
          ]
        };

        return {
          handled: true,
          replyText: res.text,
          voiceText: 'Ваш новый урок готов. Жду ваш ответ на проверочное задание.',
          extra
        };
      }

      // 3. Тест на стадию / определение уровня
      if (text === 'тест' || text === 'экзамен' || text === '/test' || text === 'lang_test') {
        const res = await LanguageTutorService.runLevelTest(ctx.chatId);
        return {
          handled: true,
          replyText: res.text,
          voiceText: 'Тестирование уровня запущено.'
        };
      }

      // 4. Интервальные повторения Anki (SM-2)
      if (text === 'повторение' || text === 'повторить' || text === '/review' || text === 'lang_review') {
        const res = LanguageTutorService.getReviewsToday(ctx.chatId);
        
        const extra = {
          attachments: [
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [
                  [
                    { type: 'callback', text: '📚 Новый урок', payload: 'lang_lesson' },
                    { type: 'callback', text: '↩️ Меню', payload: 'lang_menu' }
                  ]
                ]
              }
            }
          ]
        };

        return {
          handled: true,
          replyText: res.text,
          voiceText: 'Слова для повторения подготовлены.',
          extra
        };
      }

      // 5. Прогресс, уровень и стадия
      if (text === 'прогресс' || text === 'мой прогресс' || text === '/progress' || text === 'lang_progress') {
        const res = LanguageTutorService.getProgress(ctx.chatId);
        
        const extra = {
          attachments: [
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [
                  [
                    { type: 'callback', text: '📚 Начать урок', payload: 'lang_lesson' },
                    { type: 'callback', text: '🎯 Пройти тест', payload: 'lang_test' }
                  ],
                  [
                    { type: 'callback', text: '↩️ Меню выбора', payload: 'lang_menu' }
                  ]
                ]
              }
            }
          ]
        };

        return {
          handled: true,
          replyText: res.text,
          voiceText: 'Ваша статистика обучения обновлена.',
          extra
        };
      }

      // 6. Проверка домашнего задания (если ученик отвечает на проверочный вопрос урока)
      if (profile.stage === 'practice') {
        const evalRes = await LanguageTutorService.evaluateSubmission(ctx.chatId, ctx.text);
        
        const extra = {
          attachments: [
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [
                  [
                    { type: 'callback', text: '📚 Следующий урок', payload: 'lang_lesson' },
                    { type: 'callback', text: '🧠 Повторить карточки', payload: 'lang_review' }
                  ]
                ]
              }
            }
          ]
        };

        return {
          handled: true,
          replyText: evalRes.replyText,
          voiceText: 'Ответ проверен.',
          extra
        };
      }

      return { handled: false };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[LanguageTutorHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
