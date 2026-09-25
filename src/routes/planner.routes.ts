// src/routes/planner.routes.ts
import { Router, Request, Response } from "express";
import { smartPlannerService } from "../services/SmartPlanner";
import { logger } from "../logger";

const router = Router();

/**
 * POST /api/planner/goal - Создание SMART-цели
 */
router.post("/goal", async (req: Request, res: Response) => {
  try {
    const { chatId, title, description, category, targetDate } = req.body || {};
    if (!title || typeof title !== "string") {
      return res.status(400).json({ error: "Goal title is required" });
    }
    const cleanId = String(chatId || (req as any).user?.chatId || process.env.OWNER_CHAT_ID || "owner");
    const goal = await smartPlannerService.createGoal(cleanId, title, description, category, targetDate);
    return res.status(200).json({ success: true, goal });
  } catch (err: any) {
    logger.error(`❌ [PlannerRoutes] Create goal error: ${err?.message || err}`);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/planner/goals - Список целей
 */
router.get("/goals", (req: Request, res: Response) => {
  try {
    const chatId = String(req.query.chatId || (req as any).user?.chatId || process.env.OWNER_CHAT_ID || "owner");
    const status = String(req.query.status || "active");
    const goals = smartPlannerService.getGoals(chatId, status);
    return res.status(200).json({ success: true, goals });
  } catch (err: any) {
    logger.error(`❌ [PlannerRoutes] Get goals error: ${err?.message || err}`);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/planner/goal/decompose - AI-декомпозиция цели
 */
router.post("/goal/decompose", async (req: Request, res: Response) => {
  try {
    const { goalId, chatId } = req.body || {};
    if (!goalId) {
      return res.status(400).json({ error: "goalId is required" });
    }
    const cleanId = String(chatId || (req as any).user?.chatId || process.env.OWNER_CHAT_ID || "owner");
    const plan = await smartPlannerService.decomposeGoal(Number(goalId), cleanId);
    return res.status(200).json({ success: true, decomposition: plan });
  } catch (err: any) {
    logger.error(`❌ [PlannerRoutes] Decompose error: ${err?.message || err}`);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/planner/task - Добавление задачи
 */
router.post("/task", (req: Request, res: Response) => {
  try {
    const { chatId, title, dateStr, priority, goalId, scheduledTime } = req.body || {};
    if (!title || typeof title !== "string") {
      return res.status(400).json({ error: "Task title is required" });
    }
    const cleanId = String(chatId || (req as any).user?.chatId || process.env.OWNER_CHAT_ID || "owner");
    const task = smartPlannerService.addTask(cleanId, title, dateStr, priority, goalId ? Number(goalId) : undefined, scheduledTime);
    return res.status(200).json({ success: true, task });
  } catch (err: any) {
    logger.error(`❌ [PlannerRoutes] Add task error: ${err?.message || err}`);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/planner/task/toggle - Выполнение/отмена задачи
 */
router.post("/task/toggle", (req: Request, res: Response) => {
  try {
    const { taskId, chatId } = req.body || {};
    if (!taskId) {
      return res.status(400).json({ error: "taskId is required" });
    }
    const cleanId = String(chatId || (req as any).user?.chatId || process.env.OWNER_CHAT_ID || "owner");
    const ok = smartPlannerService.toggleTask(Number(taskId), cleanId);
    return res.status(200).json({ success: ok });
  } catch (err: any) {
    logger.error(`❌ [PlannerRoutes] Toggle task error: ${err?.message || err}`);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/planner/tasks - Задачи на дату
 */
router.get("/tasks", (req: Request, res: Response) => {
  try {
    const chatId = String(req.query.chatId || (req as any).user?.chatId || process.env.OWNER_CHAT_ID || "owner");
    const dateStr = req.query.dateStr ? String(req.query.dateStr) : undefined;
    const tasks = smartPlannerService.getTasksForDate(chatId, dateStr);
    return res.status(200).json({ success: true, tasks });
  } catch (err: any) {
    logger.error(`❌ [PlannerRoutes] Get tasks error: ${err?.message || err}`);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/planner/briefing - Утренний сводный SMART-брифинг
 */
router.get("/briefing", async (req: Request, res: Response) => {
  try {
    const chatId = String(req.query.chatId || (req as any).user?.chatId || process.env.OWNER_CHAT_ID || "owner");
    const dateStr = req.query.dateStr ? String(req.query.dateStr) : undefined;
    const briefing = await smartPlannerService.generateDailyBriefing(chatId, dateStr);
    return res.status(200).json({ success: true, briefing });
  } catch (err: any) {
    logger.error(`❌ [PlannerRoutes] Briefing error: ${err?.message || err}`);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
