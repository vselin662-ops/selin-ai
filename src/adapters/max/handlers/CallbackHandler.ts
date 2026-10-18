// src/adapters/max/handlers/CallbackHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { HITLEngine } from '../../../engines/HITLEngine';
import { activateSubscription } from '../../../fintech/subscriptions';

export class CallbackHandler implements IMessageHandler {
  public readonly name = 'CallbackHandler';
  public readonly priority = 25; // Высокий приоритет для мгновенной обработки кликов кнопок

  public canHandle(ctx: HandlerContext): boolean {
    const data = ctx.callbackData || '';
    return (
      ctx.isCallbackUpdate ||
      data.startsWith('approve_') ||
      data.startsWith('reject_') ||
      data === 'trial_sub' ||
      data.startsWith('plan_') ||
      data.startsWith('bible_') ||
      data.startsWith('crm_') ||
      data.startsWith('quest_')
    );
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

      // === ИНТЕЛЛЕКТУАЛЬНЫЙ ИИ-КВЕСТ ДЛЯ ПОЛУЧЕНИЯ БЕСПЛАТНОГО VIP 30 ДНЕЙ ===
      if (data === 'quest_start') {
        const extra = {
          attachments: [
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [
                  [
                    { type: 'callback', text: '🌐 Локально на сервере РФ', payload: 'quest_q1_correct' },
                    { type: 'callback', text: '☁️ В дата-центре в США', payload: 'quest_q1_wrong' }
                  ]
                ]
              }
            }
          ]
        };

        return {
          handled: true,
          replyText:
            `🎁 **Добро пожаловать в ИИ-Квест «Суверенный Интеллект»!**\n\n` +
            `Ответьте правильно на 2 вопроса по кибербезопасности и получите **30 дней бесплатной VIP-подписки**.\n\n` +
            `❓ **Вопрос №1**:\n` +
            `Где физически обрабатываются голосовые сообщения и база данных в системе Selin AI, гарантируя 100% приватность по 152-ФЗ?`,
          extra
        };
      }

      if (data === 'quest_q1_wrong') {
        const extra = {
          attachments: [
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [[{ type: 'callback', text: '↩️ Попробовать еще раз', payload: 'quest_start' }]]
              }
            }
          ]
        };
        return {
          handled: true,
          replyText: '❌ **Неверно!** Облачные серверы в США подконтрольны зарубежным спецслужбам и нарушают закон 152-ФЗ.',
          extra
        };
      }

      if (data === 'quest_q1_correct') {
        const extra = {
          attachments: [
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [
                  [
                    { type: 'callback', text: '📈 Отравить отчет', payload: 'quest_q2_wrong' },
                    { type: 'callback', text: '🎭 Запустить Ролевую игру', payload: 'quest_q2_correct' }
                  ]
                ]
              }
            }
          ]
        };

        return {
          handled: true,
          replyText:
            `🎉 **Абсолютно верно!** Все данные крутятся в изолированном локальном контуре на вашем сервере в РФ.\n\n` +
            `❓ **Вопрос №2 (Финальный)**:\n` +
            `Какой инструмент Бизнес-Ментора позволяет оттачивать навыки продаж, соревнуясь с ИИ, играющим роль сложного клиента с возражениями?`,
          extra
        };
      }

      if (data === 'quest_q2_wrong') {
        const extra = {
          attachments: [
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [[{ type: 'callback', text: '↩️ Назад к Вопросу №2', payload: 'quest_q1_correct' }]]
              }
            }
          ]
        };
        return {
          handled: true,
          replyText: '❌ **Неверно!** Отчет служит для фиксации дневного результата по SMART. Попробуйте еще раз!',
          extra
        };
      }

      if (data === 'quest_q2_correct') {
        // Награда: Активация подписки на 30 дней в SQLite
        activateSubscription(ctx.chatId, 'plan', 30);

        const extra = {
          attachments: [
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [
                  [
                    { type: 'callback', text: '💼 Начать Бизнес-Менторство', payload: 'biz_menu' },
                    { type: 'callback', text: '🌍 Изучать Языки', payload: 'lang_menu' }
                  ]
                ]
              }
            }
          ]
        };

        return {
          handled: true,
          replyText:
            `🏆 **ПОЗДРАВЛЯЕМ! КВЕСТ ПРОЙДЕН!** 🏆\n\n` +
            `Вы проявили глубокие знания ИИ-архитектуры и кибербезопасности.\n\n` +
            `🎁 Вам успешно начислена **Безлимитная VIP-подписка на 30 дней**!\n` +
            `Все суверенные ИИ-модули и голосовой каскад разблокированы на полную мощность.\n\n` +
            `Выберите ИИ-модуль для старта:`,
          extra
        };
      }

      // === Интерактивные кнопки Плана Победы и Библии ===
      if (data === 'plan_read_morning' || data === 'plan_read_noon' || data === 'plan_read_evening') {
        const slotKey = data === 'plan_read_morning' ? 'morning' : data === 'plan_read_noon' ? 'noon' : 'evening';
        const { buildSlotContent } = await import('../../../services/planning/PlanContentBuilder');
        const content = await buildSlotContent(ctx.chatId, slotKey);
        
        return {
          handled: true,
          replyText: content.text,
          voiceText: content.voiceText
        };
      }

      if (data === 'plan_verse_today') {
        const { getPlanDaySummary } = await import('../../../services/bible/bibleService');
        const summary = getPlanDaySummary(ctx.chatId, false);
        return {
          handled: true,
          replyText: `📖 **Стих и разбор Плана Победы на сегодня**:\n\n${summary}`,
          voiceText: summary
        };
      }

      if (data === 'bible_psalm_today') {
        const { ScriptureService } = await import('../../../services/bible/ScriptureService');
        const psalm = await ScriptureService.randomPsalm(ctx.chatId);
        if (psalm) {
          return {
            handled: true,
            replyText: `🕊 **${psalm.ref}**\n\n${psalm.text}`,
            voiceText: `${psalm.ref}. ${psalm.text}`
          };
        }
      }

      if (data === 'bible_menu') {
        return {
          handled: true,
          replyText:
            '📖 **Священное Писание (Синодальный перевод)**\n\n' +
            'Напишите название книги и главу/стих, например:\n' +
            '• `Бытие 1` — первая глава\n' +
            '• `Иоанна 3:16` — стих\n' +
            '• `Псалом 22` — псалом пастыря\n' +
            '• `Матфея 5` — Нагорная проповедь'
        };
      }

      // === Интерактивные кнопки CRM & Маркетинга ===
      if (data === 'crm_objection_expensive') {
        const { MarketingCRMService } = await import('../../../services/marketing/MarketingCRMService');
        const res = await MarketingCRMService.analyzeChatAndAdvise(ctx.chatId, 'Клиент говорит: У вас слишком дорого, мне предлагают дешевле.');
        
        const extra = {
          attachments: [
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [[{ type: 'callback', text: '↩️ Назад к меню продаж', payload: 'biz_roleplay' }]]
              }
            }
          ]
        };

        return {
          handled: true,
          replyText: `🎯 **Отработка возражения «Дорого»**:\n\n${res.bestReply}`,
          extra
        };
      }

      if (data === 'crm_objection_think') {
        const { MarketingCRMService } = await import('../../../services/marketing/MarketingCRMService');
        const res = await MarketingCRMService.analyzeChatAndAdvise(ctx.chatId, 'Клиент говорит: Спасибо, я подумаю и напишу позже.');
        
        const extra = {
          attachments: [
            {
              type: 'inline_keyboard',
              payload: {
                buttons: [[{ type: 'callback', text: '↩️ Назад к меню продаж', payload: 'biz_roleplay' }]]
              }
            }
          ]
        };

        return {
          handled: true,
          replyText: `⏳ **Отработка возражения «Я подумаю»**:\n\n${res.bestReply}`,
          extra
        };
      }

      if (data === 'crm_plan_request') {
        return {
          handled: true,
          replyText: '🚀 Чтобы составить индивидуальную стратегию, напишите нишу, например: `маркетинг автосервис` или `маркетинг магазин одежды`.'
        };
      }

      if (data === 'crm_list_clients') {
        const { MarketingCRMService } = await import('../../../services/marketing/MarketingCRMService');
        const clients = MarketingCRMService.getClients(ctx.chatId);
        if (clients.length === 0) {
          return {
            handled: true,
            replyText: '📋 У вас пока нет сохраненных клиентов.\nЧтобы добавить клиента, отправьте: `клиент Имя телефон/заметка`.'
          };
        }
        const listText = clients.slice(0, 10).map((c, i) => `${i + 1}. **${c.client_name}** (${c.channel}) — День ${c.day_of_program}`).join('\n');
        return {
          handled: true,
          replyText: `📋 **Ваши клиенты в CRM**:\n\n${listText}`
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
