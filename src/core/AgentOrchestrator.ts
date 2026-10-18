import { AIResponse, MessageContext } from "./types";
import { LLMService, llmService } from "./LLMService";
import { logger } from "../logger";
import { CacheService } from "./CacheService";
import { agentQueueService } from "../services/ai/agentQueueService";
import { sqliteDb } from "../../db";

const META_GOAL_PROMPT = `
Ты — суверенный мета-оркестратор Selin AI. Твоя задача — проанализировать абсолютно любой входящий запрос пользователя, определить его цель, контекст, необходимые ресурсы, ограничения и критерии успеха, а затем динамически декомпозировать её на адаптивный план действий.

Запрещено использовать любые заранее захардкоженные категории или шаблоны. Твоя задача — синтезировать персональную стратегию с чистого листа.

Ты должен ВСЕГДА отвечать исключительно в МУЖСКОМ роде («я проанализировал», «я составил», «я готов начать»).

Формат взаимодействия (interaction_format) для каждого шага должен быть выбран из следующих вариантов:
- "interview": серия вопросов для уточнения исходных данных.
- "instruction": четкое пошаговое руководство к действию.
- "checklist": список пунктов для проверки или выполнения.
- "learning": краткая теория по теме и проверочный вопрос.
- "motivation": вдохновляющий формат для преодоления психологических или организационных барьеров.

Верни ответ строго в формате JSON со следующей структурой (без markdown разметки, без тройных бэктэков):
{
  "goal": "Краткое название цели (до 10 слов)",
  "context": "Уникальная ситуация пользователя на основе его запроса",
  "resources": "Необходимые ресурсы или внешние инструменты для выполнения этой цели",
  "limitations": "Ключевые ограничения, которые необходимо учитывать",
  "metrics": "Критерии измерения успешного достижения цели",
  "intro_text": "Поддерживающее введение, описывающее пользователю синтезированный для него план действий и мотивирующее начать первый шаг.",
  "steps": [
    {
      "id": "step_1",
      "title": "Название шага",
      "description": "Описание того, что именно нужно сделать на этом шаге",
      "interaction_format": "interview" | "instruction" | "checklist" | "learning" | "motivation",
      "priority": "high" | "medium" | "low",
      "status": "pending"
    }
  ]
}
`;

const ADAPTIVE_FEEDBACK_PROMPT = (goal: string, context: string, currentStep: any, stepsCount: number, completedCount: number, userMessage: string) => `
Ты — суверенный мета-оркестратор Selin AI. Твоя задача — проанализировать ответ пользователя и динамически адаптировать его план действий.
Пользователь выполняет цель: "${goal}".
Контекст цели: "${context}".
Выполняемый шаг: "${currentStep.title}" (Формат: "${currentStep.interaction_format}").
Описание шага: "${currentStep.description}".

Прогресс выполнения плана: ${completedCount} из ${stepsCount} шагов выполнено.

Пользователь прислал следующее сообщение/отчет:
---
${userMessage}
---

Ты должен ВСЕГДА отвечать исключительно в МУЖСКОМ роде («я изучил», «я принял», «я обновил»).

Проанализируй ответ пользователя и реши:
1. Считать ли текущий шаг выполненным (step_completed: true или false)?
2. Требуется ли адаптировать дальнейший план действий (добавить новые шаги, убрать нерелевантные, переформулировать будущие задачи)?

Верни ответ строго в формате JSON со следующей структурой (без markdown разметки, без тройных бэктэков):
{
  "step_completed": true | false,
  "reply_text": "Развернутый, поддерживающий ответ пользователю на русском языке: разбор его результатов, рекомендации, мотивация и анонс следующего шага плана.",
  "updated_steps": [
    // Полный обновленный массив шагов (включая выполненные, текущие и будущие) со статусами. Статус выполненных шагов должен быть 'completed', текущего (если выполнен) - тоже 'completed'.
  ]
}
`;

export class AgentOrchestrator {
  private llm: LLMService;
  private cache: CacheService;

  constructor(llmServiceInstance: LLMService = llmService) {
    this.llm = llmServiceInstance;
    this.cache = new CacheService();
  }

  public registerAgent(agent: any): void {}
  public registerAgents(agents: any[]): void {}

  public async processMessage(message: string, context: MessageContext): Promise<AIResponse> {
    return this.routeAndExecute(message, context);
  }

  public getStatus(): { agents: any[]; queueLength: number; tasksCount: number } {
    const queueData = agentQueueService.getAgentsStatus();
    return {
      agents: queueData.agents.map(a => ({
        id: a.id,
        name: a.name,
        code: a.code,
        description: a.role,
        status: a.status,
        queueCount: a.queueCount,
        maxCapacity: a.maxCapacity,
        activeTask: a.activeTask,
        completedToday: a.completedToday,
        latencyMs: a.latencyMs,
        capabilitiesCount: a.capabilities.length
      })),
      queueLength: queueData.summary.totalQueue,
      tasksCount: queueData.summary.totalCompletedToday
    };
  }

  public getActiveAgents(): string[] {
    return ["universal-meta-orchestrator"];
  }

  private isPolitics(message: string): boolean {
    const lower = message.toLowerCase();
    const keywords = ["президент", "путин", "политик", "выбор", "госдум", "санкци", "войн", "сво", "украин", "митинг", "оппозици", "парти ", "кремль"];
    return keywords.some(k => lower.includes(k));
  }

  private cleanJsonString(raw: string): string {
    return raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  public async routeAndExecute(message: string, context: MessageContext): Promise<AIResponse> {
    // 1. Фильтр безопасности (политический блок)
    if (this.isPolitics(message)) {
      logger.warn(`🛡️ [Policy Shield] Блокировка политического запроса от ${context.chatId}`);
      return {
        text: "Я — Selin AI, ваш личный универсальный ассистент. Я не обсуждаю политические темы, новости политики или государственных деятелей. Давайте сфокусируемся на ваших целях, планах или задачах!",
        confidence: 1.0
      };
    }

    const tenantId = context.tenantId || `web_${context.chatId}`;

    try {
      // 2. Ищем существующий активный план в SQLite
      const activePlan = sqliteDb
        .prepare("SELECT * FROM plans WHERE tenant_id = ? AND status = 'active'")
        .get(tenantId);

      if (!activePlan) {
        // === СЛУЧАЙ А: Нет активного плана, инициализируем мета-цель с нуля ===
        logger.info(`🎯 [Meta-Orchestrator] Инициализация новой цели для тенанта ${tenantId}`);

        const prompt = `Проанализируй цель пользователя и составь адаптивный пошаговый план:
---
Запрос пользователя: "${message}"
---`;

        const responseText = await this.llm.smartCall(
          context.chatId,
          prompt,
          META_GOAL_PROMPT
        );

        const cleanedJson = this.cleanJsonString(responseText);
        const parsedData = JSON.parse(cleanedJson);

        const planId = `plan_${Date.now()}`;
        const stepsJson = JSON.stringify(parsedData.steps);
        const goalData = JSON.stringify({
          goal: parsedData.goal,
          context: parsedData.context,
          resources: parsedData.resources,
          limitations: parsedData.limitations,
          metrics: parsedData.metrics
        });

        // Записываем новый план в БД
        sqliteDb
          .prepare(
            "INSERT INTO plans (id, tenant_id, goal, steps_json, status, progress_percent, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', 0, ?, ?)"
          )
          .run(planId, tenantId, goalData, stepsJson, Date.now(), Date.now());

        // Формируем красивый структурированный ответ пользователю
        const firstStep = parsedData.steps[0];
        const formattedResponse = `🎯 **Я сформировал для вас индивидуальный план действий!**

**Цель:** ${parsedData.goal}
**Контекст:** ${parsedData.context}
**Критерии успеха:** ${parsedData.metrics}
**Ограничения:** ${parsedData.limitations}

---
${parsedData.intro_text}

---
🟢 **Шаг 1:** ${firstStep.title} (${firstStep.priority === 'high' ? '🔥 Высший приоритет' : '⚡ Нормальный приоритет'})
*Формат шага:* ${this.getFormatName(firstStep.interaction_format)}
*Описание:* ${firstStep.description}

*Отправьте мне отчет, файл или напишите, когда будете готовы двигаться дальше!*`;

        return {
          text: formattedResponse,
          confidence: 1.0,
          metadata: { planId, goal: parsedData.goal }
        };

      } else {
        // === СЛУЧАЙ Б: Есть активный план, обрабатываем обратную связь и адаптируем шаги ===
        logger.info(`🔄 [Meta-Orchestrator] Обработка обратной связи для активного плана ${activePlan.id}`);

        const goalObj = JSON.parse(activePlan.goal);
        const steps = JSON.parse(activePlan.steps_json);

        // Ищем текущий невыполненный шаг
        const currentStepIndex = steps.findIndex((s: any) => s.status === "pending" || s.status === "active");
        if (currentStepIndex === -1) {
          // Если все шаги завершены, закрываем план
          sqliteDb
            .prepare("UPDATE plans SET status = 'completed', progress_percent = 100, updated_at = ? WHERE id = ?")
            .run(Date.now(), activePlan.id);

          return {
            text: `🎉 **Поздравляю! Ваша глобальная цель "${goalObj.goal}" успешно достигнута!**\n\nВсе шаги выполнены на 100%. Напишите мне ваш новый запрос или цель, и мы составим новую стратегию!`,
            confidence: 1.0
          };
        }

        const currentStep = steps[currentStepIndex];
        const stepsCount = steps.length;
        const completedCount = steps.filter((s: any) => s.status === "completed").length;

        // Вызываем адаптивный промпт для оценки прогресса
        const systemPrompt = ADAPTIVE_FEEDBACK_PROMPT(
          goalObj.goal,
          goalObj.context,
          currentStep,
          stepsCount,
          completedCount,
          message
        );

        const responseText = await this.llm.smartCall(
          context.chatId,
          "Пользователь прислал ответ на текущий шаг. Проанализируй его.",
          systemPrompt
        );

        const cleanedJson = this.cleanJsonString(responseText);
        const parsedFeedback = JSON.parse(cleanedJson);

        let updatedSteps = parsedFeedback.updated_steps || steps;

        // Если шаг помечен как выполненный, гарантируем статус 'completed' в БД
        if (parsedFeedback.step_completed) {
          updatedSteps[currentStepIndex].status = "completed";
        }

        // Рассчитываем процент прогресса
        const newCompletedCount = updatedSteps.filter((s: any) => s.status === "completed").length;
        const progressPercent = Math.round((newCompletedCount / updatedSteps.length) * 100);

        // Обновляем план в SQLite
        sqliteDb
          .prepare("UPDATE plans SET steps_json = ?, progress_percent = ?, updated_at = ? WHERE id = ?")
          .run(JSON.stringify(updatedSteps), progressPercent, Date.now(), activePlan.id);

        // Проверяем, завершен ли весь план
        const allCompleted = updatedSteps.every((s: any) => s.status === "completed");
        if (allCompleted) {
          sqliteDb
            .prepare("UPDATE plans SET status = 'completed', progress_percent = 100, updated_at = ? WHERE id = ?")
            .run(Date.now(), activePlan.id);

          return {
            text: `${parsedFeedback.reply_text}\n\n🎉 **Великолепно! Все шаги плана выполнены на 100%, и цель успешно закрыта!** Напишите ваш следующий запрос, и мы разработаем новую стратегию!`,
            confidence: 1.0
          };
        }

        // Поиск следующего шага
        const nextPendingIndex = updatedSteps.findIndex((s: any) => s.status === "pending");
        let nextStepText = "";
        if (nextPendingIndex !== -1) {
          const nextStep = updatedSteps[nextPendingIndex];
          nextStepText = `\n\n⏭️ **Следующий Шаг:** ${nextStep.title}\n*Формат:* ${this.getFormatName(nextStep.interaction_format)}\n*Инструкция:* ${nextStep.description}`;
        }

        return {
          text: `${parsedFeedback.reply_text}${nextStepText}\n\n📊 *Прогресс вашей цели: ${progressPercent}% выполнено*`,
          confidence: 1.0,
          metadata: { planId: activePlan.id, progressPercent }
        };
      }

    } catch (err: any) {
      logger.error(`❌ [Meta-Orchestrator] Ошибка обработки мета-цели: ${err.message || err}`);
      // Каскадный фолбэк на прямое общение без ИИ-слопа в случае системных сбоев
      try {
        const fallback = await this.llm.smartCall(context.chatId, message);
        return {
          text: fallback,
          confidence: 0.9,
          metadata: { agent: "universal-fallback" }
        };
      } catch (fbErr: any) {
        return {
          text: "Система временно перегружена. Пожалуйста, повторите ваш запрос через несколько секунд.",
          confidence: 0.0,
          metadata: { agent: "error" }
        };
      }
    }
  }

  private getFormatName(format: string): string {
    switch (format) {
      case "interview":
        return "❓ Интерактивное Интервью (Вопросы)";
      case "instruction":
        return "📜 Четкое Руководство (Инструкция)";
      case "checklist":
        return "✅ Чек-лист (Проверка готовности)";
      case "learning":
        return "📚 Обучение (Теория + Проверочный вопрос)";
      case "motivation":
        return "🔥 Мотивационная сессия (Преодоление барьеров)";
      default:
        return "💬 Свободный формат взаимодействия";
    }
  }
}

export const agentOrchestrator = new AgentOrchestrator(llmService);
