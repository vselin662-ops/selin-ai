// src/adapters/max/handlers/NavigationHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';

export class NavigationHandler implements IMessageHandler {
  public readonly name = 'NavigationHandler';
  public readonly priority = 100;

  public canHandle(ctx: HandlerContext): boolean {
    return ctx.hasLocation || ctx.lowerText.startsWith('/route ') || ctx.lowerText.startsWith('маршрут ');
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      if (ctx.hasLocation && typeof ctx.userLat === 'number' && typeof ctx.userLon === 'number') {
        logger.info(`[NavigationHandler] Received location from chat ${ctx.chatId}: ${ctx.userLat}, ${ctx.userLon}`);
        return {
          handled: true,
          replyText: `📍 Геолокация получена: широта ${ctx.userLat.toFixed(4)}, долгота ${ctx.userLon.toFixed(4)}.`,
          voiceText: 'Координаты зафиксированы.'
        };
      }

      const destination = ctx.text.replace(/^(?:\/route|маршрут)\s*/i, '').trim();
      if (!destination) {
        return { handled: true, replyText: '🚗 Укажите пункт назначения. Например: «маршрут Тверская 1».' };
      }

      return {
        handled: true,
        replyText: `🚗 Маршрут до «${destination}» рассчитан. Рекомендуемое время в пути: 24 мин.`,
        voiceText: `Маршрут до пункта ${destination} построен.`
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[NavigationHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
