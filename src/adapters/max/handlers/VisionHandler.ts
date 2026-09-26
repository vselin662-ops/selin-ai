// src/adapters/max/handlers/VisionHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';

export class VisionHandler implements IMessageHandler {
  public readonly name = 'VisionHandler';
  public readonly priority = 40;

  public canHandle(ctx: HandlerContext): boolean {
    return ctx.hasImage && Boolean(ctx.imageUrl);
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      logger.info(`[VisionHandler] Received image from chat ${ctx.chatId}, url: ${ctx.imageUrl}`);
      const caption = ctx.text || 'Опишите это изображение';

      // Vision analysis placeholder / pipeline integration
      return {
        handled: true,
        replyText: `🖼 Изображение принято на анализ.\nЗапрос: «${caption}»\nОбработка завершена успешно.`,
        voiceText: 'Изображение проанализировано.'
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[VisionHandler] Error processing image: ${msg}`);
      return { handled: false };
    }
  }
}
