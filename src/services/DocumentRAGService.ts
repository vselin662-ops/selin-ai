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
  user_id: string;
  chunk_index: number;
  content: string;
  created_at: string;
}

export interface UploadResult {
  documentId: number;
  chunks: number;
}

interface StatementRunner {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export class DocumentRAGService {
  private readonly maxFileSize = 50 * 1024 * 1024; // 50 MB
  private readonly maxDocsPerUser = 100;
  private readonly chunkSize = 800;
  private readonly chunkOverlap = 100;
  private isInitialized = false;

  private stmtInsertDoc: StatementRunner | null = null;
  private stmtInsertChunk: StatementRunner | null = null;
  private stmtInsertFts: StatementRunner | null = null;
  private stmtCountUserDocs: StatementRunner | null = null;
  private stmtSelectFtsChunks: StatementRunner | null = null;
  private stmtSelectLikeChunks: StatementRunner | null = null;
  private stmtListDocs: StatementRunner | null = null;
  private stmtDeleteDoc: StatementRunner | null = null;
  private stmtDeleteFts: StatementRunner | null = null;

  constructor() {
    this.init();
  }

  public init(): void {
    if (this.isInitialized || !sqliteDb) return;

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
      } catch (ftsErr: unknown) {
        const msg = ftsErr instanceof Error ? ftsErr.message : String(ftsErr);
        logger.warn(`⚠️ [DocumentRAG] FTS5 initialization warning: ${msg}`);
      }

      this.stmtInsertDoc = sqliteDb.prepare(`
        INSERT INTO rag_documents (user_id, filename, mime_type, total_chunks)
        VALUES (?, ?, ?, ?)
      `) as StatementRunner;

      this.stmtInsertChunk = sqliteDb.prepare(`
        INSERT INTO rag_chunks (document_id, user_id, chunk_index, content)
        VALUES (?, ?, ?, ?)
      `) as StatementRunner;

      try {
        this.stmtInsertFts = sqliteDb.prepare(`
          INSERT INTO rag_chunks_fts (content, chunk_id, document_id, user_id)
          VALUES (?, ?, ?, ?)
        `) as StatementRunner;
      } catch {
        this.stmtInsertFts = null;
      }

      this.stmtCountUserDocs = sqliteDb.prepare(`
        SELECT COUNT(*) as count FROM rag_documents WHERE user_id = ?
      `) as StatementRunner;

      this.stmtSelectFtsChunks = sqliteDb.prepare(`
        SELECT content FROM rag_chunks_fts
        WHERE user_id = ? AND rag_chunks_fts MATCH ?
        LIMIT ?
      `) as StatementRunner;

      this.stmtSelectLikeChunks = sqliteDb.prepare(`
        SELECT content FROM rag_chunks
        WHERE user_id = ? AND content LIKE ?
        ORDER BY id DESC
        LIMIT ?
      `) as StatementRunner;

      this.stmtListDocs = sqliteDb.prepare(`
        SELECT id, user_id, filename, mime_type, total_chunks, created_at
        FROM rag_documents
        WHERE user_id = ?
        ORDER BY id DESC
      `) as StatementRunner;

      this.stmtDeleteDoc = sqliteDb.prepare(`
        DELETE FROM rag_documents WHERE id = ? AND user_id = ?
      `) as StatementRunner;

      try {
        this.stmtDeleteFts = sqliteDb.prepare(`
          DELETE FROM rag_chunks_fts WHERE document_id = ? AND user_id = ?
        `) as StatementRunner;
      } catch {
        this.stmtDeleteFts = null;
      }

      this.isInitialized = true;
      logger.info("📁 [DocumentRAG] Database tables and statements initialized successfully.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`❌ [DocumentRAG] init failed: ${msg}`);
    }
  }

  public validateUserId(userId: string): string {
    const trimmed = String(userId || "").trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      throw new Error(`Недопустимый формат userId: ${trimmed}`);
    }
    return trimmed;
  }

  public async extractTextFromBuffer(fileBuffer: Buffer, filename: string, mimeType: string): Promise<string> {
    const ext = filename.toLowerCase().split('.').pop() || '';
    const mime = (mimeType || '').toLowerCase();

    if (ext === 'pdf' || mime.includes('pdf')) {
      try {
        const data = await pdfParse(fileBuffer);
        return data.text || '';
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Ошибка парсинга PDF (${filename}): ${msg}`);
      }
    }

    if (ext === 'docx' || mime.includes('wordprocessingml') || mime.includes('docx')) {
      try {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        return result.value || '';
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Ошибка парсинга DOCX (${filename}): ${msg}`);
      }
    }

    return fileBuffer.toString('utf-8');
  }

  public splitIntoChunks(text: string): string[] {
    const clean = text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
    if (!clean) return [];

    if (clean.length <= this.chunkSize) {
      return [clean];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < clean.length) {
      let end = start + this.chunkSize;
      if (end >= clean.length) {
        chunks.push(clean.substring(start).trim());
        break;
      }

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

      start = end - this.chunkOverlap;
      if (start >= clean.length || start < 0) break;
    }

    return chunks;
  }

  public async uploadDocument(
    userId: string,
    fileBuffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<UploadResult> {
    this.init();
    const validUserId = this.validateUserId(userId);

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error("Файл пуст или поврежден");
    }

    if (fileBuffer.length > this.maxFileSize) {
      throw new Error("Размер файла превышает лимит 50 МБ");
    }

    if (this.stmtCountUserDocs) {
      const docCountRow = this.stmtCountUserDocs.get(validUserId) as { count: number } | undefined;
      if (docCountRow && docCountRow.count >= this.maxDocsPerUser) {
        throw new Error(`Превышен лимит документов (${this.maxDocsPerUser})`);
      }
    }

    const extractedText = await this.extractTextFromBuffer(fileBuffer, filename, mimeType);
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error("Не удалось извлечь текст из документа");
    }

    const chunks = this.splitIntoChunks(extractedText);
    if (chunks.length === 0) {
      throw new Error("Документ не содержит значимого текста");
    }

    if (!this.stmtInsertDoc || !this.stmtInsertChunk) {
      throw new Error("База данных RAG не инициализирована");
    }

    const docResult = this.stmtInsertDoc.run(validUserId, filename, mimeType, chunks.length);
    const documentId = Number(docResult.lastInsertRowid);

    for (let i = 0; i < chunks.length; i++) {
      const chunkContent = chunks[i];
      const chunkResult = this.stmtInsertChunk.run(documentId, validUserId, i, chunkContent);
      if (this.stmtInsertFts) {
        try {
          this.stmtInsertFts.run(chunkContent, Number(chunkResult.lastInsertRowid), documentId, validUserId);
        } catch {
          // ignore duplicate in FTS
        }
      }
    }

    logger.info(`📚 [DocumentRAG] Document #${documentId} ("${filename}") indexed for user ${validUserId}: ${chunks.length} chunks`);
    return {
      documentId,
      chunks: chunks.length
    };
  }

  public searchChunks(userId: string, query: string, topK: number = 5): string[] {
    this.init();
    const validUserId = this.validateUserId(userId);
    const cleanQuery = query.replace(/[^\wа-яёА-ЯЁ0-9\s]/gi, ' ').trim();
    const terms = cleanQuery.split(/\s+/).map(t => t.trim()).filter(t => t.length >= 3);
    const results: string[] = [];

    if (this.stmtSelectFtsChunks && terms.length > 0) {
      try {
        const ftsQuery = terms.map(t => `"${t}"*`).join(' OR ');
        const rows = this.stmtSelectFtsChunks.all(validUserId, ftsQuery, topK) as Array<{ content: string }>;
        for (const row of rows) {
          if (row.content && !results.includes(row.content)) {
            results.push(row.content);
          }
        }
      } catch {
        // Fallback to LIKE query below
      }
    }

    if (results.length < topK && terms.length > 0 && this.stmtSelectLikeChunks) {
      try {
        const likeTerm = `%${terms[0]}%`;
        const fallbackRows = this.stmtSelectLikeChunks.all(validUserId, likeTerm, topK - results.length) as Array<{ content: string }>;
        for (const row of fallbackRows) {
          if (row.content && !results.includes(row.content)) {
            results.push(row.content);
          }
        }
      } catch {
        // ignore
      }
    }

    return results.slice(0, topK);
  }

  public async queryDocuments(userId: string, question: string, topK: number = 5): Promise<string> {
    const validUserId = this.validateUserId(userId);
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      return "Пожалуйста, укажите вопрос для поиска по базе документов.";
    }

    const relevantChunks = this.searchChunks(validUserId, trimmedQuestion, topK);
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
      const response = await llmService.smartCall(validUserId, trimmedQuestion, systemPrompt);
      return response.trim();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`❌ [DocumentRAG] LLM generation error: ${msg}`);
      return "Произошла ошибка при анализе документов. Пожалуйста, повторите запрос.";
    }
  }

  public listDocuments(userId: string): RAGDocument[] {
    this.init();
    const validUserId = this.validateUserId(userId);
    if (!this.stmtListDocs) return [];

    try {
      const rows = this.stmtListDocs.all(validUserId) as RAGDocument[];
      return rows;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`❌ [DocumentRAG] listDocuments error: ${msg}`);
      return [];
    }
  }

  public deleteDocument(userId: string, documentId: number): boolean {
    this.init();
    const validUserId = this.validateUserId(userId);
    if (!this.stmtDeleteDoc) return false;

    try {
      const info = this.stmtDeleteDoc.run(documentId, validUserId);
      if (info.changes > 0) {
        if (this.stmtDeleteFts) {
          try {
            this.stmtDeleteFts.run(documentId, validUserId);
          } catch {
            // ignore
          }
        }
        logger.info(`🗑️ [DocumentRAG] Document #${documentId} deleted for user ${validUserId}`);
        return true;
      }
      return false;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`❌ [DocumentRAG] deleteDocument error: ${msg}`);
      return false;
    }
  }
}

export const documentRAGService = new DocumentRAGService();
