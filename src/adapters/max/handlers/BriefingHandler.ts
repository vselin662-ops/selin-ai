// src/adapters/max/handlers/BriefingHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { smartPlannerService } from '../../../services/SmartPlanner';

export class BriefingHandler implements IMessageHandler {
  public readonly name = 'BriefingHandler';
  public readonly priority = 120;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return text === 'брифинг' || text === 'тест брифинг' || text === 'утренний брифинг' || text === 'смарт брифинг';
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      logger.info(`[BriefingHandler] Generating briefing for chat ${ctx.chatId}`);
      const briefing = await smartPlannerService.generateDailyBriefing(ctx.chatId);

      return {
        handled: true,
        replyText: briefing.formattedText,
        voiceText: briefing.aiMotivation
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[BriefingHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
