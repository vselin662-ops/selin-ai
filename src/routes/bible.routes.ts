// src/routes/bible.routes.ts
import { Router, Request, Response } from "express";
import { ScriptureService } from "../services/bible/ScriptureService";
import { 
  getUserPlanDay, 
  getPlanDaySummary, 
  getPlanContentsSummary 
} from "../services/bible/bibleService";
import { sendCurrentPlanSlot } from "../services/bible/bibleCommands";
import { getUserPlanConfig, updateUserPlanConfig } from "../services/ai/ProfileService";
import { logger } from "../logger";

const router = Router();

interface AuthenticatedUser {
  chatId?: string | number;
  userId?: string | number;
}

interface CustomRequest extends Request {
  user?: AuthenticatedUser;
}

function resolveChatId(req: CustomRequest): string {
  const queryChatId = req.query.chatId ? String(req.query.chatId) : "";
  const bodyChatId = req.body?.chatId ? String(req.body.chatId) : "";
  const authId = req.user?.chatId ? String(req.user.chatId) : (req.user?.userId ? String(req.user.userId) : "");
  const fallback = process.env.OWNER_CHAT_ID || "owner";
  return (queryChatId || bodyChatId || authId || fallback).replace(/^[a-z_]+/, "").trim();
}

/**
 * GET /api/bible/read - Получить стих, отрывок или главу
 * Пример: /api/bible/read?query=Иоанна 3:16 или book=Иоанна&chapter=3&verse=16
 */
router.get("/read", async (req: CustomRequest, res: Response) => {
  try {
    const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
    const book = typeof req.query.book === "string" ? req.query.book.trim() : "";
    const chapter = req.query.chapter ? parseInt(String(req.query.chapter), 10) : 0;
    const verse = req.query.verse ? String(req.query.verse).trim() : undefined;

    let result = null;

    if (query) {
      result = await ScriptureService.getPassageByQuery(query);
    } else if (book && chapter > 0) {
      if (verse) {
        result = await ScriptureService.getPassage(book, chapter, verse);
      } else {
        result = await ScriptureService.getChapter(book, chapter);
      }
    }

    if (!result) {
      return res.status(404).json({
        success: false,
        error: "Библейский текст по указанному запросу не найден."
      });
    }

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`❌ [BibleRoutes] Error reading scripture: ${msg}`);
    return res.status(500).json({ success: false, error: "Ошибка при чтении Священного Писания" });
  }
});

/**
 * GET /api/bible/psalm - Получить псалом дня (случайный из разрешённого списка без повторов 3 дня)
 */
router.get("/psalm", async (req: CustomRequest, res: Response) => {
  try {
    const chatId = resolveChatId(req);
    const psalm = await ScriptureService.randomPsalm(chatId);

    if (!psalm) {
      return res.status(404).json({ success: false, error: "Псалом временно недоступен" });
    }

    return res.status(200).json({
      success: true,
      data: psalm
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`❌ [BibleRoutes] Error fetching psalm: ${msg}`);
    return res.status(500).json({ success: false, error: "Ошибка при получении псалма" });
  }
});

/**
 * GET /api/bible/daily - Получить стих/чтение дня
 */
router.get("/daily", async (req: CustomRequest, res: Response) => {
  try {
    const chatId = resolveChatId(req);
    const psalm = await ScriptureService.randomPsalm(chatId);
    const daySummary = getPlanDaySummary(chatId, false);
    return res.status(200).json({
      success: true,
      psalm,
      plan: daySummary
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`❌ [BibleRoutes] Error fetching daily scripture: ${msg}`);
    return res.status(500).json({ success: false, error: "Ошибка при получении чтения дня" });
  }
});

/**
 * GET /api/bible/plan - Получить статус и день Плана Победы
 */
router.get("/plan", (req: CustomRequest, res: Response) => {
  try {
    const chatId = resolveChatId(req);
    const config = getUserPlanConfig(chatId);
    const daySummary = getPlanDaySummary(chatId, false);
    const tomorrowSummary = getPlanDaySummary(chatId, true);

    return res.status(200).json({
      success: true,
      config,
      today: daySummary,
      tomorrow: tomorrowSummary
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`❌ [BibleRoutes] Error fetching plan: ${msg}`);
    return res.status(500).json({ success: false, error: "Ошибка получения данных Плана Победы" });
  }
});

/**
 * POST /api/bible/plan/toggle - Включить / выключить План Победы
 */
router.post("/plan/toggle", (req: CustomRequest, res: Response) => {
  try {
    const chatId = resolveChatId(req);
    const enabled = Boolean(req.body?.enabled);

    updateUserPlanConfig(chatId, {
      plan_enabled: enabled ? 1 : 0,
      plan_status: enabled ? "on_buttons" : "off"
    });

    const updated = getUserPlanConfig(chatId);
    return res.status(200).json({
      success: true,
      plan_enabled: updated.plan_enabled,
      plan_status: updated.plan_status
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`❌ [BibleRoutes] Error toggling plan: ${msg}`);
    return res.status(500).json({ success: false, error: "Ошибка изменения статуса Плана Победы" });
  }
});

/**
 * POST /api/bible/plan/send-slot - Отправить текущий слот Плана Победы пользователю (в чат и/или голосом)
 */
router.post("/plan/send-slot", async (req: CustomRequest, res: Response) => {
  try {
    const chatId = resolveChatId(req);
    const isVoice = Boolean(req.body?.isVoice);

    await sendCurrentPlanSlot(chatId, isVoice);

    return res.status(200).json({
      success: true,
      message: "Слот Плана Победы отправлен"
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`❌ [BibleRoutes] Error sending plan slot: ${msg}`);
    return res.status(500).json({ success: false, error: "Ошибка отправки слота Плана Победы" });
  }
});

export default router;
