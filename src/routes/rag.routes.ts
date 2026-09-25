// src/routes/rag.routes.ts
import { Router, Request, Response } from "express";
import multer from "multer";
import { documentRAGService } from "../services/DocumentRAGService";
import { logger } from "../logger";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50 MB
  }
});

/**
 * POST /api/rag/upload - Загрузка документа (PDF, DOCX, TXT)
 */
router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "Файл не предоставлен" });
    }

    const userId = String(req.body.userId || (req as any).user?.chatId || process.env.OWNER_CHAT_ID || "owner");
    const filename = Buffer.from(file.originalname, 'latin1').toString('utf8'); // UTF-8 filename fix
    const mimeType = file.mimetype || "application/octet-stream";

    const result = await documentRAGService.uploadDocument(userId, file.buffer, filename, mimeType);

    return res.status(200).json({
      success: true,
      documentId: result.documentId,
      filename,
      totalChunks: result.chunks,
      message: `Документ «${filename}» успешно проиндексирован (${result.chunks} фрагментов).`
    });
  } catch (err: any) {
    logger.error(`❌ [RAGRoutes] Upload error: ${err?.message || err}`);
    return res.status(400).json({ error: err.message || "Ошибка загрузки документа" });
  }
});

/**
 * POST /api/rag/query - Запрос к базе знаний
 */
router.post("/query", async (req: Request, res: Response) => {
  try {
    const { question, topK, userId } = req.body || {};
    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Поле question обязательно" });
    }

    const cleanUserId = String(userId || (req as any).user?.chatId || process.env.OWNER_CHAT_ID || "owner");
    const answer = await documentRAGService.queryDocuments(cleanUserId, question.trim(), topK ? Number(topK) : 5);

    return res.status(200).json({
      success: true,
      question: question.trim(),
      answer
    });
  } catch (err: any) {
    logger.error(`❌ [RAGRoutes] Query error: ${err?.message || err}`);
    return res.status(500).json({ error: "Ошибка поиска по документам" });
  }
});

/**
 * GET /api/rag/documents - Список документов пользователя
 */
router.get("/documents", (req: Request, res: Response) => {
  try {
    const userId = String(req.query.userId || (req as any).user?.chatId || process.env.OWNER_CHAT_ID || "owner");
    const documents = documentRAGService.listDocuments(userId);

    return res.status(200).json({
      success: true,
      documents
    });
  } catch (err: any) {
    logger.error(`❌ [RAGRoutes] List documents error: ${err?.message || err}`);
    return res.status(500).json({ error: "Ошибка получения списка документов" });
  }
});

/**
 * DELETE /api/rag/documents/:id - Удаление документа
 */
router.delete("/documents/:id", (req: Request, res: Response) => {
  try {
    const docId = parseInt(req.params.id, 10);
    const userId = String(req.query.userId || (req as any).user?.chatId || process.env.OWNER_CHAT_ID || "owner");

    if (isNaN(docId)) {
      return res.status(400).json({ error: "Некорректный ID документа" });
    }

    const ok = documentRAGService.deleteDocument(userId, docId);
    if (!ok) {
      return res.status(404).json({ error: "Документ не найден" });
    }

    return res.status(200).json({
      success: true,
      message: `Документ #${docId} успешно удален.`
    });
  } catch (err: any) {
    logger.error(`❌ [RAGRoutes] Delete document error: ${err?.message || err}`);
    return res.status(500).json({ error: "Ошибка удаления документа" });
  }
});

export default router;
