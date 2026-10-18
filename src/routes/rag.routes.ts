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

interface AuthenticatedUser {
  chatId?: string | number;
  userId?: string | number;
}

interface CustomRequest extends Request {
  user?: AuthenticatedUser;
}

function resolveUserId(req: CustomRequest): string {
  const queryUserId = req.query.userId ? String(req.query.userId) : "";
  const bodyUserId = req.body?.userId ? String(req.body.userId) : "";
  const authUserId = req.user?.chatId ? String(req.user.chatId) : (req.user?.userId ? String(req.user.userId) : "");
  const fallback = process.env.OWNER_CHAT_ID || "owner";
  return queryUserId || bodyUserId || authUserId || fallback;
}

/**
 * POST /api/rag/upload - Загрузка документа (PDF, DOCX, TXT)
 */
router.post("/upload", upload.single("file"), async (req: CustomRequest, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "Файл не предоставлен" });
    }

    const userId = resolveUserId(req);
    const filename = Buffer.from(file.originalname, "latin1").toString("utf8");
    const mimeType = file.mimetype || "application/octet-stream";

    const result = await documentRAGService.uploadDocument(userId, file.buffer, filename, mimeType);

    return res.status(200).json({
      success: true,
      documentId: result.documentId,
      filename,
      totalChunks: result.chunks,
      message: `Документ «${filename}» успешно проиндексирован (${result.chunks} фрагментов).`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`❌ [RAGRoutes] Upload error: ${msg}`);
    return res.status(400).json({ error: msg || "Ошибка загрузки документа" });
  }
});

/**
 * POST /api/rag/query - Запрос к базе знаний
 */
router.post("/query", async (req: CustomRequest, res: Response) => {
  try {
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    if (!question) {
      return res.status(400).json({ error: "Поле question обязательно" });
    }

    const topK = typeof req.body?.topK === "number" ? req.body.topK : (req.body?.topK ? parseInt(String(req.body.topK), 10) : 5);
    const userId = resolveUserId(req);
    const answer = await documentRAGService.queryDocuments(userId, question, isNaN(topK) ? 5 : topK);

    return res.status(200).json({
      success: true,
      question,
      answer
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`❌ [RAGRoutes] Query error: ${msg}`);
    return res.status(500).json({ error: "Ошибка поиска по документам" });
  }
});

/**
 * GET /api/rag/documents - Список документов пользователя
 */
router.get("/documents", (req: CustomRequest, res: Response) => {
  try {
    const userId = resolveUserId(req);
    const documents = documentRAGService.listDocuments(userId);

    return res.status(200).json({
      success: true,
      documents
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`❌ [RAGRoutes] List documents error: ${msg}`);
    return res.status(500).json({ error: "Ошибка получения списка документов" });
  }
});

/**
 * DELETE /api/rag/documents/:id - Удаление документа
 */
router.delete("/documents/:id", (req: CustomRequest, res: Response) => {
  try {
    const docId = parseInt(req.params.id, 10);
    if (isNaN(docId) || docId <= 0) {
      return res.status(400).json({ error: "Некорректный ID документа" });
    }

    const userId = resolveUserId(req);
    const ok = documentRAGService.deleteDocument(userId, docId);
    if (!ok) {
      return res.status(404).json({ error: "Документ не найден" });
    }

    return res.status(200).json({
      success: true,
      message: `Документ #${docId} успешно удален.`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`❌ [RAGRoutes] Delete document error: ${msg}`);
    return res.status(500).json({ error: "Ошибка удаления документа" });
  }
});

export default router;
