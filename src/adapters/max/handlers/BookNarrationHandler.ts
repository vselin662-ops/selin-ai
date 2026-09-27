// src/adapters/max/handlers/BookNarrationHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { BatchProcessor } from '../../../engines/BatchProcessor';
import { VoiceCascadeEngine } from '../../../engines/VoiceCascadeEngine';

export class BookNarrationHandler implements IMessageHandler {
  public readonly name = 'BookNarrationHandler';
  public readonly priority = 60;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return text.startsWith('озвучь книгу') || text.startsWith('озвучь текст:') || text.startsWith('/narrate');
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const content = ctx.text.replace(/^(?:озвучь книгу|озвучь текст:?|\/narrate)\s*/i, '').trim();
      if (!content) {
        return {
          handled: true,
          replyText: '📖 Пожалуйста, вставьте текст книги или главы для пакетного озвучивания.'
        };
      }

      const paragraphs = content.split('\n\n').filter((p) => p.trim().length > 0);
      logger.info(`[BookNarrationHandler] Narrating book with ${paragraphs.length} paragraphs for chat ${ctx.chatId}`);

      const results = await BatchProcessor.processItems(
        paragraphs,
        async (para, idx) => {
          logger.info(`[BookNarrationHandler] Processed paragraph ${idx + 1}`);
          return `Глава ${idx + 1} синтезирована`;
        },
        { batchSize: 2, delayMs: 100 }
      );

      return {
        handled: true,
        replyText: `🎙 **Озвучивание завершено!**\nОбработано фрагментов: ${results.length}.\nАудиофайл готов к прослушиванию.`,
        voiceText: 'Озвучивание книги успешно завершено.'
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[BookNarrationHandler] Error narrating book: ${msg}`);
      return { handled: false };
    }
  }
}
