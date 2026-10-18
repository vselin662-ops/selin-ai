// src/adapters/max/handlers/BibleHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { ScriptureService } from '../../../services/bible/ScriptureService';
import { getPlanDaySummary } from '../../../services/bible/bibleService';
import { DeepSearchEngine } from '../../../engines/DeepSearchEngine';

export class BibleHandler implements IMessageHandler {
  public readonly name = 'BibleHandler';
  public readonly priority = 80;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return (
      text.startsWith('прочитай ') ||
      text.startsWith('/bible') ||
      text.startsWith('библия') ||
      text.startsWith('читать библию') ||
      text.startsWith('стих ') ||
      text.startsWith('отрывок ') ||
      text.startsWith('глава ') ||
      text === 'псалом' ||
      text === 'псалом дня' ||
      text === '/psalm' ||
      text === 'план победы' ||
      text === 'план на сегодня' ||
      text === '/plan'
    );
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const text = ctx.lowerText;

      // 1. Reading passage / verse / chapter with DeepSearch or direct Bible commands
      if (
        text.startsWith('прочитай ') ||
        text.startsWith('/bible') ||
        text.startsWith('библия') ||
        text.startsWith('читать библию') ||
        text.startsWith('стих ') ||
        text.startsWith('отрывок ') ||
        text.startsWith('глава ')
      ) {
        const query = ctx.text
          .replace(/^(?:прочитай|читать библию|\/bible|библия|стих|отрывок|глава)\s*/i, '')
          .trim();

        if (!query) {
          return {
            handled: true,
            replyText:
              '📖 **Священное Писание (Синодальный перевод)**\n\n' +
              'Вы можете читать любые книги, главы и стихи Библии:\n\n' +
              '• `прочитай Иоанна 3:16` — конкретный стих\n' +
              '• `прочитай Псалом 90` — псалом целиком\n' +
              '• `прочитай Бытие 1` — вся глава целиком\n' +
              '• `прочитай Римлянам 8:28-39` — отрывок\n\n' +
              'Или нажмите кнопку ниже для чтения Плана Победы на сегодня.',
            extra: {
              attachments: [
                {
                  type: 'inline_keyboard',
                  payload: {
                    buttons: [
                      [
                        { type: 'callback', text: '📖 План Победы', payload: 'plan_read_morning' },
                        { type: 'callback', text: '🕊 Псалом дня', payload: 'bible_psalm_today' }
                      ]
                    ]
                  }
                }
              ]
            }
          };
        }

        const scripture = await ScriptureService.getPassageByQuery(query);
        if (scripture) {
          const reply = `📖 **${scripture.ref}**\n\n${scripture.text}`;
          return {
            handled: true,
            replyText: reply,
            voiceText: `${scripture.ref}. ${scripture.text}`
          };
        } else {
          return {
            handled: true,
            replyText: `📖 По запросу «${query}» текст не найден. Проверьте правильность написания книги и главы (например: *Бытие 1* или *Иоанна 3:16*).`
          };
        }
      }

      // 2. Psalm of the day
      if (text === 'псалом' || text === 'псалом дня' || text === '/psalm') {
        const psalm = await ScriptureService.randomPsalm(ctx.chatId);
        if (psalm) {
          const reply = `🕊 **${psalm.ref}**\n\n${psalm.text}`;
          return {
            handled: true,
            replyText: reply,
            voiceText: `${psalm.ref}. ${psalm.text}`
          };
        } else {
          return { handled: true, replyText: '🕊 Псалом временно недоступен.' };
        }
      }

      // 3. Victory Plan for today with Interactive Buttons
      if (text === 'план победы' || text === 'план на сегодня' || text === '/plan') {
        const summary = getPlanDaySummary(ctx.chatId, false);
        const replyText = `📖 **План Победы**:\n\n${summary}\n\n👇 *Выберите слот для мгновенного чтения:*`;
        
        return {
          handled: true,
          replyText,
          voiceText: summary,
          extra: {
            attachments: [
              {
                type: 'inline_keyboard',
                payload: {
                  buttons: [
                    [
                      { type: 'callback', text: '🌅 Утро (ВЗ)', payload: 'plan_read_morning' },
                      { type: 'callback', text: '☀️ День (НЗ)', payload: 'plan_read_noon' },
                      { type: 'callback', text: '🌌 Вечер (Псалтирь)', payload: 'plan_read_evening' }
                    ],
                    [
                      { type: 'callback', text: '🔄 Стих дня', payload: 'plan_verse_today' },
                      { type: 'callback', text: '📖 Читать Библию', payload: 'bible_menu' }
                    ]
                  ]
                }
              }
            ]
          }
        };
      }

      return { handled: false };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[BibleHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
