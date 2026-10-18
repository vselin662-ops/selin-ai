// src/services/SmartPlanner.ts
import { sqliteDb } from "../../db";
import { logger } from "../logger";
import { llmService } from "../core/LLMService";

export interface SmartGoal {
  id: number;
  chat_id: string;
  title: string;
  description?: string;
  category: string;
  target_date?: string;
  status: 'active' | 'completed' | 'paused' | 'archived';
  decomposition_json?: string;
  created_at: number;
  updated_at: number;
}

export interface PlanTask {
  id: number;
  goal_id?: number;
  chat_id: string;
  date_str: string; // YYYY-MM-DD
  title: string;
  is_completed: number; // 0 or 1
  priority: 'high' | 'medium' | 'low';
  scheduled_time?: string;
  created_at: number;
}

export interface DailyBriefingResult {
  date: string;
  chatId: string;
  activeGoalsCount: number;
  todayTasks: PlanTask[];
  aiMotivation: string;
  formattedText: string;
}

// 1. Инициализация таблиц целеполагания и задач
if (sqliteDb) {
  try {
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS smart_goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'general',
        target_date TEXT,
        status TEXT DEFAULT 'active',
        decomposition_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS planner_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER,
        chat_id TEXT NOT NULL,
        date_str TEXT NOT NULL,
        title TEXT NOT NULL,
        is_completed INTEGER DEFAULT 0,
        priority TEXT DEFAULT 'medium',
        scheduled_time TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (goal_id) REFERENCES smart_goals(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_smart_goals_chat ON smart_goals(chat_id, status);
      CREATE INDEX IF NOT EXISTS idx_planner_tasks_chat_date ON planner_tasks(chat_id, date_str);
    `);
    logger.info("📁 [SmartPlanner] SQLite tables initialized (smart_goals, planner_tasks).");
  } catch (err: any) {
    logger.error("❌ [SmartPlanner] Database schema initialization failed:", err);
  }
}

export class SmartPlannerService {
  /**
   * Создание новой SMART-цели
   */
  public async createGoal(
    chatId: string,
    title: string,
    description?: string,
    category: string = 'general',
    targetDate?: string
  ): Promise<SmartGoal | null> {
    const cleanId = String(chatId).replace(/^[a-z_]+/, '').trim();
    if (!cleanId || !title.trim() || !sqliteDb) return null;

    const now = Date.now();
    try {
      const stmt = sqliteDb.prepare(`
        INSERT INTO smart_goals (chat_id, title, description, category, target_date, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
      `);
      const info = stmt.run(cleanId, title.trim(), description || null, category, targetDate || null, now, now);
      const insertedId = Number(info.lastInsertRowid);

      const created = this.getGoalById(insertedId, cleanId);
      logger.info(`🎯 [SmartPlanner] Created goal #${insertedId} for chat ${cleanId}: "${title}"`);
      return created;
    } catch (err: any) {
      logger.error(`❌ [SmartPlanner] Failed to create goal: ${err?.message || err}`);
      return null;
    }
  }

  /**
   * Получение списка активных целей пользователя
   */
  public getGoals(chatId: string, status: string = 'active'): SmartGoal[] {
    const cleanId = String(chatId).replace(/^[a-z_]+/, '').trim();
    if (!cleanId || !sqliteDb) return [];
    try {
      if (status === 'all') {
        return sqliteDb.prepare("SELECT * FROM smart_goals WHERE chat_id = ? ORDER BY created_at DESC").all(cleanId) as SmartGoal[];
      }
      return sqliteDb.prepare("SELECT * FROM smart_goals WHERE chat_id = ? AND status = ? ORDER BY created_at DESC").all(cleanId, status) as SmartGoal[];
    } catch (err: any) {
      logger.error(`❌ [SmartPlanner] Failed to get goals for ${cleanId}:`, err);
      return [];
    }
  }

  /**
   * Получение цели по ID
   */
  public getGoalById(goalId: number, chatId: string): SmartGoal | null {
    const cleanId = String(chatId).replace(/^[a-z_]+/, '').trim();
    if (!sqliteDb) return null;
    try {
      const row = sqliteDb.prepare("SELECT * FROM smart_goals WHERE id = ? AND chat_id = ?").get(goalId, cleanId) as SmartGoal | undefined;
      return row || null;
    } catch (err) {
      return null;
    }
  }

  /**
   * AI-декомпозиция цели по модели: Цель → Квартал → Неделя → Задачи на день
   */
  public async decomposeGoal(goalId: number, chatId: string): Promise<string | null> {
    const goal = this.getGoalById(goalId, chatId);
    if (!goal) return null;

    const prompt = `Ты — ведущий стратег и SMART-планировщик Selin AI.
Разложи цель пользователя по каскадной модели:
1. Квартальные этапы (Q1-Q4)
2. Фокус ключевой недели
3. Топ-3 практических действия на ближайшие дни.

ЦЕЛЬ: "${goal.title}"
${goal.description ? `ОПИСАНИЕ: ${goal.description}` : ''}
${goal.target_date ? `СРОК: ${goal.target_date}` : ''}

Требования к ответу:
- Четкая, емкая структура на русском языке без воды
- Практические формулировки задач
- В конце выдели 3 задачи с префиксом "[TASK]" для автоматического добавления в ежедневник`;

    try {
      const decomposition = await llmService.smartCall(chatId, prompt);
      if (decomposition && sqliteDb) {
        sqliteDb.prepare("UPDATE smart_goals SET decomposition_json = ?, updated_at = ? WHERE id = ?").run(decomposition, Date.now(), goalId);

        // Авто-экстракция задач из [TASK]
        const todayStr = new Date().toISOString().split('T')[0];
        const lines = decomposition.split('\n');
        for (const line of lines) {
          if (line.includes('[TASK]')) {
            const taskText = line.replace(/.*\[TASK\]\s*/i, '').trim();
            if (taskText) {
              this.addTask(chatId, taskText, todayStr, 'high', goalId);
            }
          }
        }
      }
      return decomposition;
    } catch (err: any) {
      logger.error(`❌ [SmartPlanner] Decompose goal error: ${err?.message || err}`);
      return null;
    }
  }

  /**
   * Добавление ежедневной задачи
   */
  public addTask(
    chatId: string,
    title: string,
    dateStr?: string,
    priority: 'high' | 'medium' | 'low' = 'medium',
    goalId?: number,
    scheduledTime?: string
  ): PlanTask | null {
    const cleanId = String(chatId).replace(/^[a-z_]+/, '').trim();
    if (!cleanId || !title.trim() || !sqliteDb) return null;

    const targetDate = dateStr || new Date().toISOString().split('T')[0];
    const now = Date.now();

    try {
      const stmt = sqliteDb.prepare(`
        INSERT INTO planner_tasks (goal_id, chat_id, date_str, title, is_completed, priority, scheduled_time, created_at)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?)
      `);
      const res = stmt.run(goalId || null, cleanId, targetDate, title.trim(), priority, scheduledTime || null, now);
      const insertedId = Number(res.lastInsertRowid);
      logger.info(`📋 [SmartPlanner] Task #${insertedId} added for ${cleanId} on ${targetDate}: "${title}"`);
      return {
        id: insertedId,
        goal_id: goalId,
        chat_id: cleanId,
        date_str: targetDate,
        title: title.trim(),
        is_completed: 0,
        priority,
        scheduled_time: scheduledTime,
        created_at: now
      };
    } catch (err: any) {
      logger.error(`❌ [SmartPlanner] Failed to add task: ${err?.message || err}`);
      return null;
    }
  }

  /**
   * Переключение статуса выполнения задачи
   */
  public toggleTask(taskId: number, chatId: string): boolean {
    const cleanId = String(chatId).replace(/^[a-z_]+/, '').trim();
    if (!sqliteDb) return false;
    try {
      const current = sqliteDb.prepare("SELECT is_completed FROM planner_tasks WHERE id = ? AND chat_id = ?").get(taskId, cleanId) as { is_completed: number } | undefined;
      if (!current) return false;

      const nextStatus = current.is_completed === 1 ? 0 : 1;
      sqliteDb.prepare("UPDATE planner_tasks SET is_completed = ? WHERE id = ? AND chat_id = ?").run(nextStatus, taskId, cleanId);
      logger.info(`✅ [SmartPlanner] Task #${taskId} toggled to completed=${nextStatus} for ${cleanId}`);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Получение задач на дату (по умолчанию сегодня)
   */
  public getTasksForDate(chatId: string, dateStr?: string): PlanTask[] {
    const cleanId = String(chatId).replace(/^[a-z_]+/, '').trim();
    if (!cleanId || !sqliteDb) return [];
    const targetDate = dateStr || new Date().toISOString().split('T')[0];
    try {
      return sqliteDb.prepare(`
        SELECT * FROM planner_tasks 
        WHERE chat_id = ? AND date_str = ? 
        ORDER BY is_completed ASC, 
                 CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, 
                 id ASC
      `).all(cleanId, targetDate) as PlanTask[];
    } catch (err: any) {
      logger.error(`❌ [SmartPlanner] Failed to get tasks for ${cleanId} on ${targetDate}:`, err);
      return [];
    }
  }

  /**
   * Формирование персонального ежедневного SMART-брифинга
   */
  public async generateDailyBriefing(chatId: string, dateStr?: string): Promise<DailyBriefingResult> {
    const cleanId = String(chatId).replace(/^[a-z_]+/, '').trim();
    const targetDate = dateStr || new Date().toISOString().split('T')[0];
    const goals = this.getGoals(cleanId, 'active');
    const tasks = this.getTasksForDate(cleanId, targetDate);

    let aiMotivation = "Каждый выполненный шаг приближает главную цель. Действуйте уверенно!";
    try {
      if (goals.length > 0 || tasks.length > 0) {
        const prompt = `Сгенерируй короткую (1-2 емких предложения) бодрую утреннюю мотивацию на день для руководителя.
Активные цели: ${goals.map(g => g.title).join(', ') || 'Развитие бизнеса'}
Задач на сегодня: ${tasks.length}. Без банальностей и воды.`;
        const res = await llmService.smartCall(cleanId, prompt);
        if (res && res.trim()) {
          aiMotivation = res.trim();
        }
      }
    } catch {}

    const taskLines = tasks.length > 0
      ? tasks.map((t, idx) => `${idx + 1}. [${t.is_completed ? 'x' : ' '}] ${t.title}${t.scheduled_time ? ` (${t.scheduled_time})` : ''}`).join('\n')
      : 'На сегодня задач пока нет. Напишите «задача: [текст]», чтобы добавить.';

    const goalLines = goals.length > 0
      ? goals.slice(0, 3).map((g, idx) => `🎯 ${g.title}${g.target_date ? ` (до ${g.target_date})` : ''}`).join('\n')
      : 'Фокусные цели еще не заданы. Напишите «цель: [текст]», чтобы зафиксировать стратегию.';

    const formattedText = `📋 **SMART-План на день (${targetDate})**\n\n**Главные цели:**\n${goalLines}\n\n**Задачи на сегодня:**\n${taskLines}\n\n💡 *${aiMotivation}*`;

    return {
      date: targetDate,
      chatId: cleanId,
      activeGoalsCount: goals.length,
      todayTasks: tasks,
      aiMotivation,
      formattedText
    };
  }
}

export const smartPlannerService = new SmartPlannerService();
