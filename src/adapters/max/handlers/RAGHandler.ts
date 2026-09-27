// src/adapters/max/handlers/RAGHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';
import { documentRAGService } from '../../../services/DocumentRAGService';
import { DeepSearchEngine } from '../../../engines/DeepSearchEngine';
import { BatchProcessor } from '../../../engines/BatchProcessor';
import { HITLEngine } from '../../../engines/HITLEngine';

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

      // 1. Query documents with DeepSearch
      if (lower.startsWith('найди:') || lower.startsWith('найди ')) {
        const query = text.replace(/^найди:?\s*/i, '').trim();
        if (!query) {
          return { handled: true, replyText: '🔍 Укажите поисковый запрос по вашим документам.' };
        }

        const deepRes = await DeepSearchEngine.iterativeSearch(query, async (q) => {
          const res = await documentRAGService.queryDocuments(ctx.chatId, q);
          return res.sources.length > 0 ? [res] : [];
        });

        const ragResult =
          deepRes.results.length > 0
            ? deepRes.results[0]
            : await documentRAGService.queryDocuments(ctx.chatId, query);

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

      // 3. Delete document with HITL
      if (lower.startsWith('удали документ ')) {
        const idStr = lower.replace('удали документ ', '').trim();
        const docId = parseInt(idStr, 10);
        if (isNaN(docId)) {
          return { handled: true, replyText: '⚠️ Укажите числовой номер документа.' };
        }

        const hitl = HITLEngine.requestConfirmation(
          ctx.chatId,
          'DOCUMENT_DELETE',
          `Удаление документа #${docId}`,
          { docId }
        );

        return {
          handled: true,
          replyText: `⚠️ Запрос на удаление документа #${docId} сформирован. Подтвердите действие: ID \`${hitl.actionId}\`.`,
          extra: {
            attachments: [
              {
                type: 'inline_keyboard',
                payload: {
                  buttons: [
                    [
                      { type: 'callback', text: '🗑 Подтвердить удаление', payload: `approve_${hitl.actionId}` },
                      { type: 'callback', text: 'Отмена', payload: `reject_${hitl.actionId}` }
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
      logger.error(`[RAGHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
