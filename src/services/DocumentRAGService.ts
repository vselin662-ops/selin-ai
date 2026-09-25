// src/services/DocumentRAGService.ts
import { sqliteDb } from "../../db";
import { logger } from "../logger";
import { llmService } from "../core/LLMService";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

export interface RAGDocument {
  id: number;
  user_id: string;
  filename: string;
  mime_type: string;
  total_chunks: number;
  created_at: string;
}

export interface RAGChunk {
  id: number;
  document_id: number;
  chunk_index: number;
  content: string;
}

// 1. Инициализация таблиц RAG и FTS5 в SQLite
if (sqliteDb) {
  try {
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS rag_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        total_chunks INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rag_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES rag_documents(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_rag_documents_user ON rag_documents(user_id);
      CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc ON rag_chunks(document_id);
      CREATE INDEX IF NOT EXISTS idx_rag_chunks_user ON rag_chunks(user_id);
    `);

    try {
      sqliteDb.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS rag_chunks_fts USING fts5(
          content,
          chunk_id UNINDEXED,
          document_id UNINDEXED,
          user_id UNINDEXED
        );
      `);
    } catch (ftsErr: any) {
      logger.warn(`⚠️ [RAG] FTS5 table creation notice: ${ftsErr?.message || ftsErr}`);
    }

    logger.info("📁 [DocumentRAG] SQLite schema initialized for RAG knowledge base.");
  } catch (err: any) {
    logger.error("❌ [DocumentRAG] Failed to initialize SQLite RAG tables:", err);
  }
}

export class DocumentRAGService {
  private readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
  private readonly MAX_DOCS_PER_USER = 100;
  private readonly CHUNK_SIZE = 800; // 800 chars
  private readonly CHUNK_OVERLAP = 100; // 100 chars

  /**
   * Парсинг бинарного буфера документа в чистый текст
   */
  public async extractTextFromBuffer(fileBuffer: Buffer, filename: string, mimeType: string): Promise<string> {
    const ext = filename.toLowerCase().split('.').pop() || '';
    const mime = (mimeType || '').toLowerCase();

    // 1. PDF
    if (ext === 'pdf' || mime.includes('pdf')) {
      try {
        const data = await pdfParse(fileBuffer);
        return data.text || '';
      } catch (err: any) {
        throw new Error(`Ошибка парсинга PDF (${filename}): ${err.message || err}`);
      }
    }

    // 2. DOCX
    if (ext === 'docx' || mime.includes('wordprocessingml') || mime.includes('docx')) {
      try {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        return result.value || '';
      } catch (err: any) {
        throw new Error(`Ошибка парсинга DOCX (${filename}): ${err.message || err}`);
      }
    }

    // 3. TXT / CSV / Markdown / JSON / Plain Text
    return fileBuffer.toString('utf-8');
  }

  /**
   * Разбиение текста на перекрывающиеся чанки (sliding window)
   */
  public splitIntoChunks(text: string): string[] {
    const clean = text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
    if (!clean) return [];

    if (clean.length <= this.CHUNK_SIZE) {
      return [clean];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < clean.length) {
      let end = start + this.CHUNK_SIZE;
      if (end >= clean.length) {
        chunks.push(clean.substring(start).trim());
        break;
      }

      // Ищем границу предложения или пробела рядом с end
      const window = clean.substring(Math.max(start, end - 150), Math.min(clean.length, end + 50));
      const lastPunct = window.lastIndexOf('. ');
      const lastSpace = window.lastIndexOf(' ');

      if (lastPunct !== -1 && lastPunct + (end - 150) > start) {
        end = Math.max(start, end - 150) + lastPunct + 1;
      } else if (lastSpace !== -1 && lastSpace + (end - 150) > start) {
        end = Math.max(start, end - 150) + lastSpace;
      }

      const chunk = clean.substring(start, end).trim();
      if (chunk.length > 20) {
        chunks.push(chunk);
      }

      start = end - this.CHUNK_OVERLAP;
      if (start >= clean.length || start < 0) break;
    }

    return chunks;
  }

  /**
   * Загрузка и индексация документа пользователя
   */
  public async uploadDocument(
    userId: string,
    fileBuffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<{ documentId: number; chunks: number }> {
    const cleanId = String(userId).replace(/^[a-z_]+/, '').trim();
    if (!cleanId || !fileBuffer || fileBuffer.length === 0 || !sqliteDb) {
      throw new Error("Некорректные параметры загрузки документа");
    }

    if (fileBuffer.length > this.MAX_FILE_SIZE) {
      throw new Error("Размер файла превышает лимит 50 МБ");
    }

    // Проверка лимита документов пользователя
    const docCountRow = sqliteDb.prepare("SELECT COUNT(*) as cnt FROM rag_documents WHERE user_id = ?").get(cleanId) as { cnt: number } | undefined;
    if (docCountRow && docCountRow.cnt >= this.MAX_DOCS_PER_USER) {
      throw new Error(`Превышен лимит количества документов (${this.MAX_DOCS_PER_USER})`);
    }

    // Извлечение текста
    const extractedText = await this.extractTextFromBuffer(fileBuffer, filename, mimeType);
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error("Не удалось извлечь читаемый текст из документа");
    }

    // Нарезка на чанки
    const chunks = this.splitIntoChunks(extractedText);
    if (chunks.length === 0) {
      throw new Error("Документ пуст или не содержит текстовых блоков");
    }

    // Транзакционное сохранение в SQLite
    const insertDoc = sqliteDb.prepare(`
      INSERT INTO rag_documents (user_id, filename, mime_type, total_chunks)
      VALUES (?, ?, ?, ?)
    `);

    const insertChunk = sqliteDb.prepare(`
      INSERT INTO rag_chunks (document_id, user_id, chunk_index, content)
      VALUES (?, ?, ?, ?)
    `);

    let insertFts: any = null;
    try {
      insertFts = sqliteDb.prepare(`
        INSERT INTO rag_chunks_fts (content, chunk_id, document_id, user_id)
        VALUES (?, ?, ?, ?)
      `);
    } catch {}

    const docInfo = insertDoc.run(cleanId, filename, mimeType, chunks.length);
    const documentId = Number(docInfo.lastInsertRowid);

    const transaction = sqliteDb.transaction((allChunks: string[]) => {
      for (let i = 0; i < allChunks.length; i++) {
        const chunkContent = allChunks[i];
        const chunkInfo = insertChunk.run(documentId, cleanId, i, chunkContent);
        if (insertFts) {
          try {
            insertFts.run(chunkContent, Number(chunkInfo.lastInsertRowid), documentId, cleanId);
          } catch {}
        }
      }
    });

    transaction(chunks);
    logger.info(`📚 [DocumentRAG] Document #${documentId} ("${filename}") indexed for user ${cleanId}: ${chunks.length} chunks`);

    return {
      documentId,
      chunks: chunks.length
    };
  }

  /**
   * Поиск релевантных чанков по базе знаний пользователя
   */
  public searchChunks(userId: string, query: string, topK: number = 5): string[] {
    const cleanId = String(userId).replace(/^[a-z_]+/, '').trim();
    if (!cleanId || !query.trim() || !sqliteDb) return [];

    const sanitizedQuery = query
      .replace(/[^\wа-яёА-ЯЁ0-9\s]/gi, ' ')
      .trim();

    const terms = sanitizedQuery
      .split(/\s+/)
      .map(t => t.trim())
      .filter(t => t.length >= 3);

    const results: string[] = [];

    // 1. Полнотекстовый поиск FTS5
    if (terms.length > 0) {
      try {
        const ftsQuery = terms.map(t => `"${t}"*`).join(' OR ');
        const rows = sqliteDb.prepare(`
          SELECT content FROM rag_chunks_fts
          WHERE user_id = ? AND rag_chunks_fts MATCH ?
          LIMIT ?
        `).all(cleanId, ftsQuery, topK) as { content: string }[];

        for (const row of rows) {
          if (row.content && !results.includes(row.content)) {
            results.push(row.content);
          }
        }
      } catch (ftsSearchErr) {
        // Fallback to LIKE if FTS query syntax error
      }
    }

    // 2. Резервный поиск LIKE, если FTS вернул мало результатов
    if (results.length < topK && terms.length > 0) {
      try {
        const likeTerm = `%${terms[0]}%`;
        const fallbackRows = sqliteDb.prepare(`
          SELECT content FROM rag_chunks
          WHERE user_id = ? AND content LIKE ?
          ORDER BY id DESC
          LIMIT ?
        `).all(cleanId, likeTerm, topK - results.length) as { content: string }[];

        for (const row of fallbackRows) {
          if (row.content && !results.includes(row.content)) {
            results.push(row.content);
          }
        }
      } catch {}
    }

    return results.slice(0, topK);
  }

  /**
   * Запрос к базе знаний с генерацией ответа через локальную LLM (Ollama)
   */
  public async queryDocuments(userId: string, question: string, topK: number = 5): Promise<string> {
    const cleanId = String(userId).replace(/^[a-z_]+/, '').trim();
    if (!cleanId || !question.trim()) {
      return "Пожалуйста, укажите вопрос для поиска по базе документов.";
    }

    const relevantChunks = this.searchChunks(cleanId, question, topK);

    if (relevantChunks.length === 0) {
      return "В загруженных документах этой информации нет.";
    }

    const contextText = relevantChunks.map((chunk, idx) => `[Фрагмент ${idx + 1}]:\n${chunk}`).join('\n\n---\n\n');

    const systemPrompt = `Ты — экспертный RAG-аналитик Selin AI.
Ответь на вопрос пользователя, используя ТОЛЬКО предоставленный контекст.
Если ответ не найден в контексте, ответь строго: "В загруженных документах этой информации нет."
Отвечай точно, по существу, на русском языке (1-4 предложения). Запрещены домыслы.

КОНТЕКСТ ИЗ ДОКУМЕНТОВ:
${contextText}`;

    try {
      const response = await llmService.smartCall(cleanId, question, systemPrompt);
      return response.trim();
    } catch (err: any) {
      logger.error(`❌ [DocumentRAG] LLM generation error: ${err?.message || err}`);
      return "Произошла ошибка при анализе документов. Пожалуйста, повторите запрос.";
    }
  }

  /**
   * Список загруженных документов пользователя
   */
  public listDocuments(userId: string): RAGDocument[] {
    const cleanId = String(userId).replace(/^[a-z_]+/, '').trim();
    if (!cleanId || !sqliteDb) return [];
    try {
      return sqliteDb.prepare(`
        SELECT id, user_id, filename, mime_type, total_chunks, created_at
        FROM rag_documents
        WHERE user_id = ?
        ORDER BY id DESC
      `).all(cleanId) as RAGDocument[];
    } catch (err: any) {
      logger.error(`❌ [DocumentRAG] listDocuments error: ${err?.message || err}`);
      return [];
    }
  }

  /**
   * Удаление документа и связанных чанков
   */
  public deleteDocument(userId: string, documentId: number): boolean {
    const cleanId = String(userId).replace(/^[a-z_]+/, '').trim();
    if (!cleanId || !sqliteDb) return false;
    try {
      const info = sqliteDb.prepare("DELETE FROM rag_documents WHERE id = ? AND user_id = ?").run(documentId, cleanId);
      if (info.changes > 0) {
        try {
          sqliteDb.prepare("DELETE FROM rag_chunks_fts WHERE document_id = ? AND user_id = ?").run(documentId, cleanId);
        } catch {}
        logger.info(`🗑️ [DocumentRAG] Document #${documentId} deleted for user ${cleanId}`);
        return true;
      }
      return false;
    } catch (err: any) {
      logger.error(`❌ [DocumentRAG] deleteDocument error: ${err?.message || err}`);
      return false;
    }
  }
}

export const documentRAGService = new DocumentRAGService();
