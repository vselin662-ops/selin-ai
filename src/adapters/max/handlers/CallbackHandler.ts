// src/adapters/max/handlers/CallbackHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { HITLEngine } from '../../../engines/HITLEngine';
import { activateSubscription } from '../../../fintech/subscriptions';

export class CallbackHandler implements IMessageHandler {
  public readonly name = 'CallbackHandler';
  public readonly priority = 25; // Высокий приоритет для мгновенной обработки кликов кнопок

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
        return {
          handled: true,
          replyText: `🎯 **Отработка возражения «Дорого»**:\n\n${res.bestReply}`
        };
      }

      if (data === 'crm_objection_think') {
        const { MarketingCRMService } = await import('../../../services/marketing/MarketingCRMService');
        const res = await MarketingCRMService.analyzeChatAndAdvise(ctx.chatId, 'Клиент говорит: Спасибо, я подумаю и напишу позже.');
        return {
          handled: true,
          replyText: `⏳ **Отработка возражения «Я подумаю»**:\n\n${res.bestReply}`
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
