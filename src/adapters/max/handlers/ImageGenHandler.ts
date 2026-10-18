// src/adapters/max/handlers/ImageGenHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { ImagePipelineEngine } from '../../../engines/ImagePipelineEngine';
import { SelfCorrectionEngine } from '../../../engines/SelfCorrectionEngine';

export class ImageGenHandler implements IMessageHandler {
  public readonly name = 'ImageGenHandler';
  public readonly priority = 50;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return (
      text.startsWith('/image') ||
      text.startsWith('/draw') ||
      text.startsWith('нарисуй') ||
      text.startsWith('создай картинку') ||
      text.startsWith('создай фото') ||
      text.startsWith('сгенерируй фото') ||
      text.startsWith('сгенерируй картинку') ||
      text.startsWith('сделай фото') ||
      text.startsWith('сделай картинку') ||
      text.includes('нарисуй мне') ||
      text.includes('сгенерируй изображение')
    );
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const prompt = ctx.text
        .replace(/^(?:\/image|\/draw|нарисуй мне|нарисуй|создай картинку|создай фото|сгенерируй фото|сгенерируй картинку|сделай фото|сделай картинку|сгенерируй изображение)\s*/i, '')
        .trim();

      if (!prompt) {
        return {
          handled: true,
          replyText: '🎨 Пожалуйста, укажите описание изображения. Например: «нарисуй футуристический город будущего».'
        };
      }

      logger.info(`[ImageGenHandler] Generating image with prompt: "${prompt}" for chat ${ctx.chatId}`);

      const imageUrl = await ImagePipelineEngine.generateImage({
        prompt,
        width: 1024,
        height: 1024
      });

      return {
        handled: true,
        replyText: `🎨 Изображение по вашему запросу «${prompt}» готово:\n\n${imageUrl}`,
        voiceText: ctx.isVoiceInput ? 'Ваше изображение сгенерировано.' : undefined,
        extra: {
          attachments: [
            {
              type: 'image',
              payload: {
                url: imageUrl
              }
            }
          ]
        }
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[ImageGenHandler] Error generating image: ${msg}`);
      return {
        handled: true,
        replyText: '⚠️ Не удалось сгенерировать изображение. Пожалуйста, попробуйте изменить описание запроса.'
      };
    }
  }
}
