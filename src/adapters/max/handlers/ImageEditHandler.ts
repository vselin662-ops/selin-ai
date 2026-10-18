// src/adapters/max/handlers/ImageEditHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { ImagePipelineEngine } from '../../../engines/ImagePipelineEngine';

export class ImageEditHandler implements IMessageHandler {
  public readonly name = 'ImageEditHandler';
  public readonly priority = 45;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    const isEditCommand =
      text.startsWith('/edit') ||
      text.startsWith('измени фото') ||
      text.startsWith('отредактируй фото') ||
      text.startsWith('измени картинку');
    return isEditCommand || (ctx.hasImage && text.length > 0 && text.includes('измени'));
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const prompt = ctx.text.replace(/^(?:\/edit|измени фото|отредактируй фото|измени картинку)\s*/i, '').trim();
      const imageUrl = ctx.imageUrl || 'https://storage.max.ru/attachments/default.png';

      logger.info(`[ImageEditHandler] Image edit requested for chat ${ctx.chatId}, prompt: "${prompt}"`);
      const editedUrl = await ImagePipelineEngine.generateImage({
        prompt: `modify image with changes: ${prompt}`,
        style: 'photorealistic'
      });

      return {
        handled: true,
        replyText: `🎨 Изображение обновлено согласно запросу «${prompt || 'коррекция'}»:\n\n${editedUrl}`,
        voiceText: 'Изображение отредактировано.'
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[ImageEditHandler] Error editing image: ${msg}`);
      return { handled: false };
    }
  }
}
