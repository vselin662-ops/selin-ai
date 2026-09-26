// src/adapters/max/handlers/ImageGenHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';

export class ImageGenHandler implements IMessageHandler {
  public readonly name = 'ImageGenHandler';
  public readonly priority = 110;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return (
      text.startsWith('/image ') ||
      text.startsWith('нарисуй ') ||
      text.startsWith('создай картинку ') ||
      text.startsWith('сгенерируй фото ')
    );
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const prompt = ctx.text
        .replace(/^(?:\/image|нарисуй|создай картинку|сгенерируй фото)\s*/i, '')
        .trim();

      if (!prompt) {
        return {
          handled: true,
          replyText: '🎨 Пожалуйста, укажите описание изображения. Например: «нарисуй футуристический город».'
        };
      }

      const encoded = encodeURIComponent(prompt);
      const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true`;

      return {
        handled: true,
        replyText: `🎨 Изображение по запросу «${prompt}» сгенерировано:\n\n${imageUrl}`,
        voiceText: 'Ваше изображение сгенерировано.'
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[ImageGenHandler] Error generating image: ${msg}`);
      return { handled: false };
    }
  }
}
