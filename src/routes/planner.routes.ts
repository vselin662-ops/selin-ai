// src/routes/planner.routes.ts
import { Router, Request, Response } from "express";
import { smartPlannerService } from "../services/SmartPlanner";
import { trackingService } from "../services/planning/TrackingService";
import { motivationService } from "../services/planning/MotivationService";
import { goalAnalysisService } from "../core/GoalAnalysisService";
import { goalStrategyService } from "../core/GoalStrategyService";
import { Goal, Step } from "../core/types";
import { sqliteDb } from "../../db";
import { logger } from "../logger";

const router = Router();

// Инициализация таблицы автономных целей
if (sqliteDb) {
  try {
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS autonomous_goals (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        raw_input TEXT NOT NULL,
        goal_data TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  } catch (err) {
    logger.warn('⚠️ [PlannerRoutes] Error initializing autonomous_goals table:', err);
  }
}

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

/**
 * Helper: Получить или создать активную цель пользователя
 */
function getOrCreateActiveGoal(chatId: string): Goal {
  if (sqliteDb) {
    try {
      const row = sqliteDb.prepare("SELECT goal_data FROM autonomous_goals WHERE chat_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1").get(chatId) as any;
      if (row && row.goal_data) {
        return JSON.parse(row.goal_data);
      }
    } catch (e) {
      logger.warn("Error reading active goal from DB:", e);
    }
  }

  const defaultGoal: Goal = {
    id: `goal_${Date.now()}`,
    rawInput: "Запустить суверенного ассистента Selin AI и выполнить все ключевые задачи на сегодня",
    parsedContext: {
      goalDefinition: "Освоить и внедрить суверенную систему Selin AI в повседневную работу",
      domain: "Продуктивность и цифровое управление",
      complexity: "medium"
    },
    successCriteria: [
      "Утренний план прочитан и подтверждён",
      "Выполнено ключевое фокусное действие дня",
      "Получена духовная мотивация и сформирован вечерний отчёт"
    ],
    constraints: ["Использовать только суверенные решения РФ", "Работать локально"],
    resources: ["Внутренняя база знаний", "Оффлайн Библия", "План Победы"],
    currentState: {
      stepIndex: 0,
      completionPercentage: 25,
      currentFocus: "Выполнение фокусного действия на сегодня"
    },
    strategy: "Поэтапное выполнение ежедневных шагов с утренним брифингом, духовным напутствием и вечерней адаптацией",
    status: "active",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  saveGoalToDb(chatId, defaultGoal);
  return defaultGoal;
}

function saveGoalToDb(chatId: string, goal: Goal) {
  if (sqliteDb) {
    try {
      sqliteDb.prepare(`
        INSERT INTO autonomous_goals (id, chat_id, raw_input, goal_data, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          goal_data = excluded.goal_data,
          status = excluded.status,
          updated_at = excluded.updated_at
      `).run(
        goal.id,
        chatId,
        goal.rawInput,
        JSON.stringify(goal),
        goal.status,
        goal.createdAt,
        goal.updatedAt
      );
    } catch (e) {
      logger.error("Error saving goal to DB:", e);
    }
  }
}

/**
 * GET /api/planner/victory-plan - Получить План Победы на сегодня
 * Вызывает TrackingService (задача дня) и MotivationService (духовная поддержка + стих)
 */
router.get("/victory-plan", async (req: Request, res: Response) => {
  try {
    const chatId = String(req.query.chatId || (req as any).user?.chatId || process.env.OWNER_CHAT_ID || "preview");
    const goal = getOrCreateActiveGoal(chatId);

    // 1. Утренний план задачи
    const dailyPlan = await trackingService.generateDailyPlan(goal);

    // 2. Текущий шаг
    const currentStep: Step = {
      id: dailyPlan.stepId || 'step_1',
      goalId: goal.id,
      description: dailyPlan.taskDescription,
      type: dailyPlan.interactionType || 'instruction',
      dependencies: [],
      verification: 'Подтверждение выполнения пользователем',
      status: 'in_progress'
    };

    // 3. Духовная мотивация к задаче
    const motivation = await motivationService.generateDailyMotivation(goal, currentStep);

    return res.status(200).json({
      success: true,
      goal,
      plan: dailyPlan,
      currentStep,
      motivation
    });
  } catch (err: any) {
    logger.error("❌ [PlannerRoutes] Error generating Victory Plan:", err);
    return res.status(500).json({ success: false, error: "Не удалось сформировать План Победы" });
  }
});

/**
 * POST /api/planner/victory-feedback - Вечерний отчёт и обратная связь
 */
router.post("/victory-feedback", async (req: Request, res: Response) => {
  try {
    const { chatId, feedback, completed } = req.body || {};
    const cleanId = String(chatId || (req as any).user?.chatId || process.env.OWNER_CHAT_ID || "preview");
    const goal = getOrCreateActiveGoal(cleanId);

    if (completed) {
      goal.currentState = {
        ...goal.currentState,
        completionPercentage: Math.min(100, (goal.currentState?.completionPercentage || 0) + 25)
      };
    }

    const updatedGoal = await trackingService.processFeedback(goal, String(feedback || "Шаг выполнен успешно"));

    // Если есть жалоба на сложность или сбой — адаптируем стратегию
    const textLower = String(feedback || "").toLowerCase();
    let newStrategy = null;
    if (textLower.includes("не работа") || textLower.includes("сложн") || textLower.includes("застрял")) {
      newStrategy = await trackingService.adaptStrategy(updatedGoal);
      updatedGoal.strategy = newStrategy.overallStrategy;
    }

    saveGoalToDb(cleanId, updatedGoal);

    return res.status(200).json({
      success: true,
      goal: updatedGoal,
      newStrategy,
      message: "Отчёт принят! План Победы актуализирован."
    });
  } catch (err: any) {
    logger.error("❌ [PlannerRoutes] Error in victory feedback:", err);
    return res.status(500).json({ success: false, error: "Ошибка обработки отчёта" });
  }
});

/**
 * POST /api/planner/goal/create-autonomous - Создание автономной цели с глубоким ИИ-анализом
 */
router.post("/goal/create-autonomous", async (req: Request, res: Response) => {
  try {
    const { chatId, rawInput } = req.body || {};
    if (!rawInput || typeof rawInput !== "string") {
      return res.status(400).json({ error: "rawInput is required" });
    }
    const cleanId = String(chatId || (req as any).user?.chatId || process.env.OWNER_CHAT_ID || "preview");

    // 1. Анализ запроса
    const parsed = await goalAnalysisService.analyzeGoal(rawInput);

    // 2. Создание объекта цели
    const newGoal: Goal = {
      id: `goal_${Date.now()}`,
      rawInput,
      parsedContext: {
        goalDefinition: parsed.goalDefinition,
        domain: parsed.domain,
        complexity: (parsed as any).complexity || 'medium',
        ...parsed
      },
      successCriteria: parsed.successCriteria,
      constraints: parsed.risksAndPitfalls,
      resources: parsed.neededResources,
      currentState: {
        stepIndex: 0,
        completionPercentage: 0,
        currentFocus: "Старт выполнения цели"
      },
      strategy: parsed.strategy,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // 3. Синтез стратегии
    const strategy = await goalStrategyService.generateStrategy(newGoal);
    newGoal.strategy = strategy.overallStrategy;

    saveGoalToDb(cleanId, newGoal);

    return res.status(200).json({
      success: true,
      goal: newGoal,
      strategy
    });
  } catch (err: any) {
    logger.error("❌ [PlannerRoutes] Error creating autonomous goal:", err);
    return res.status(500).json({ error: "Ошибка создания цели" });
  }
});

export default router;
