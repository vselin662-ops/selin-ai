// src/adapters/max/handlers/BibleHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { ScriptureService } from '../../../services/bible/ScriptureService';
import { getPlanDaySummary } from '../../../services/bible/bibleService';

export class BibleHandler implements IMessageHandler {
  public readonly name = 'BibleHandler';
  public readonly priority = 70;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return (
      text.startsWith('прочитай ') ||
      text.startsWith('/bible ') ||
      text.startsWith('стих ') ||
      text.startsWith('отрывок ') ||
      text === 'псалом' ||
      text === 'псалом дня' ||
      text === '/psalm' ||
      text === 'план победы' ||
      text === 'план на сегодня'
    );
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const text = ctx.lowerText;

      // 1. Reading passage / verse / chapter
      if (
        text.startsWith('прочитай ') ||
        text.startsWith('/bible ') ||
        text.startsWith('стих ') ||
        text.startsWith('отрывок ')
      ) {
        const query = ctx.text.replace(/^(?:прочитай|\/bible|стих|отрывок)\s*/i, '').trim();
        if (!query) {
          return { handled: true, replyText: '📖 Укажите ссылку на стих. Например: «прочитай Иоанна 3:16».' };
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
            replyText: `📖 По запросу «${query}» текст не найден. Проверьте правильность ссылки.`
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

      // 3. Victory Plan for today
      if (text === 'план победы' || text === 'план на сегодня') {
        const summary = getPlanDaySummary(ctx.chatId, false);
        return {
          handled: true,
          replyText: `📖 **План Победы на сегодня**:\n\n${summary}`,
          voiceText: summary
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
