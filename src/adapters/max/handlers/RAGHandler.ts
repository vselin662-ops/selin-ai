// src/adapters/max/handlers/RAGHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { documentRAGService } from '../../../services/DocumentRAGService';

export class RAGHandler implements IMessageHandler {
  public readonly name = 'RAGHandler';
  public readonly priority = 90;

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return (
      text.startsWith('найди:') ||
      text.startsWith('найди ') ||
      text === 'мои документы' ||
      text.startsWith('удали документ ')
    );
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const text = ctx.text.trim();
      const lower = ctx.lowerText;

      // 1. Query documents
      if (lower.startsWith('найди:') || lower.startsWith('найди ')) {
        const query = text.replace(/^найди:?\s*/i, '').trim();
        if (!query) {
          return { handled: true, replyText: '🔍 Укажите поисковый запрос по вашим документам.' };
        }

        const ragResult = await documentRAGService.queryDocuments(ctx.chatId, query);
        let reply = `🔍 **Ответ на основе ваших документов**:\n\n${ragResult.answer}`;

        if (ragResult.sources.length > 0) {
          reply += '\n\n📄 **Источники**: ' + ragResult.sources.join(', ');
        }

        return {
          handled: true,
          replyText: reply,
          voiceText: ragResult.answer
        };
      }

      // 2. List user documents
      if (lower === 'мои документы') {
        const docs = await documentRAGService.getUserDocuments(ctx.chatId);
        if (docs.length === 0) {
          return {
            handled: true,
            replyText: '📂 В вашей базе знаний пока нет документов. Загрузите их через веб-кабинет.'
          };
        }

        let reply = '📂 **Загруженные документы**:\n\n';
        docs.forEach((d) => {
          reply += `• [#${d.id}] **${d.filename}** (${Math.round(d.file_size / 1024)} КБ, чанков: ${d.chunks_count})\n`;
        });
        reply += '\n_Удалить: «удали документ [ID]»_';
        return { handled: true, replyText: reply.trim() };
      }

      // 3. Delete document
      if (lower.startsWith('удали документ ')) {
        const idStr = lower.replace('удали документ ', '').trim();
        const docId = parseInt(idStr, 10);
        if (isNaN(docId)) {
          return { handled: true, replyText: '⚠️ Укажите числовой номер документа.' };
        }

        const success = await documentRAGService.deleteDocument(docId, ctx.chatId);
        if (success) {
          return { handled: true, replyText: `🗑 Документ #${docId} успешно удален из базы знаний.` };
        }
        return { handled: true, replyText: `⚠️ Не удалось удалить документ #${docId}.` };
      }

      return { handled: false };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[RAGHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
