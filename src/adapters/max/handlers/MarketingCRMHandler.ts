import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { MarketingCRMService } from '../../../services/marketing/MarketingCRMService';

export class MarketingCRMHandler implements IMessageHandler {
  public readonly name = 'MarketingCRMHandler';
  public readonly priority = 65; // Высокий приоритет перед общим LLM-хендлером

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return (
      text.startsWith('клиент ') ||
      text.startsWith('/crm') ||
      text.startsWith('маркетинг') ||
      text.startsWith('дожим ') ||
      text.startsWith('возражение ') ||
      text.startsWith('диалог ') ||
      text.startsWith('разбор переписки') ||
      text === 'crm' ||
      text === 'маркетинг план'
    );
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const text = ctx.text;
      const lower = ctx.lowerText;
      logger.info(`💼 [MarketingCRMHandler] Handling marketing inquiry for chat ${ctx.chatId}`);

      // 1. Помощь / Меню CRM
      if (lower === 'crm' || lower === '/crm') {
        return {
          handled: true,
          replyText:
            '📈 **Selin AI Marketing & CRM Co-Pilot (Контур РФ)**\n\n' +
            'Я помогаю предпринимателям продвигать продукты, вести клиентов, снимать возражения и закрывать сделки во всех сетях (Telegram, Instagram, VK, YouTube, Avito):\n\n' +
            '• **Разбор переписки и дожим**: отправьте `дожим [текст сообщения клиента]` или `диалог [переписка]` — я проанализирую страхи клиента и напишу идеальный ответ.\n' +
            '• **Снятие возражения**: напишите `возражение дорого` или `возражение я подумаю`.\n' +
            '• **Маркетинговая стратегия**: напишите `маркетинг [ваша ниша и каналы]` (например: `маркетинг продвижение инстаграм` или `маркетинг автосервис Казань`).\n' +
            '• **Добавление в CRM**: `клиент Иван @vanya instagram`.\n\n' +
            '👇 *Выберите нужное действие:*',
          extra: {
            attachments: [
              {
                type: 'inline_keyboard',
                payload: {
                  buttons: [
                    [
                      { type: 'callback', text: '🎯 Отработать «Дорого»', payload: 'crm_objection_expensive' },
                      { type: 'callback', text: '⏳ Отработать «Подумаю»', payload: 'crm_objection_think' }
                    ],
                    [
                      { type: 'callback', text: '🚀 План продвижения', payload: 'crm_plan_request' },
                      { type: 'callback', text: '📋 Мои клиенты', payload: 'crm_list_clients' }
                    ]
                  ]
                }
              }
            ]
          }
        };
      }

      // 2. Разбор возражения или переписки
      if (lower.startsWith('дожим ') || lower.startsWith('диалог ') || lower.startsWith('разбор переписки')) {
        const chatLog = text.replace(/^(?:дожим|диалог|разбор переписки)\s*/i, '').trim();
        if (!chatLog) {
          return {
            handled: true,
            replyText: '💬 Пожалуйста, укажите текст сообщения от клиента. Например: `дожим Клиент пишет: у вас дорого, у других в 2 раза дешевле`.'
          };
        }

        const analysis = await MarketingCRMService.analyzeChatAndAdvise(ctx.chatId, chatLog);
        return {
          handled: true,
          replyText: `💼 **Анализ переписки и рекомендация Selin Co-Pilot**:\n\n${analysis.bestReply}`
        };
      }

      // 3. Быстрая отработка возражений
      if (lower.startsWith('возражение ')) {
        const objection = text.replace(/^возражение\s*/i, '').trim();
        const analysis = await MarketingCRMService.analyzeChatAndAdvise(
          ctx.chatId,
          `Клиент выдвигает возражение: "${objection}"`
        );
        return {
          handled: true,
          replyText: `🎯 **Отработка возражения «${objection}»**:\n\n${analysis.bestReply}`
        };
      }

      // 4. Запрос маркетингового плана
      if (lower.startsWith('маркетинг ') || lower === 'маркетинг план') {
        const niche = text.replace(/^маркетинг(?:\s+план)?\s*/i, '').trim() || 'малый бизнес в РФ';
        const plan = await MarketingCRMService.generateCampaignPlan(
          ctx.chatId,
          niche,
          'Привлечение клиентов и рост выручки'
        );
        return {
          handled: true,
          replyText: `🚀 **Маркетинговая стратегия для «${niche}»**:\n\n${plan}`
        };
      }

      // 5. Запись клиента в CRM
      if (lower.startsWith('клиент ')) {
        const clientData = text.replace(/^клиент\s*/i, '').trim();
        MarketingCRMService.saveClient({
          chat_id: String(ctx.chatId),
          client_name: clientData.split(' ')[0] || 'Новый клиент',
          notes: clientData
        });
        return {
          handled: true,
          replyText: `✅ Клиент «${clientData}» успешно зафиксирован в вашей базе CRM!`
        };
      }

      return { handled: false };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`❌ [MarketingCRMHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
