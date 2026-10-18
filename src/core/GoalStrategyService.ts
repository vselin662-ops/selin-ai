import { llmService } from "./LLMService";
import { logger } from "../logger";
import { Goal, Step } from "./types";

export interface Strategy {
  overallStrategy: string;              // Общая стратегия достижения цели, сгенерированная ИИ
  successCriteria: string[];            // Критерии успеха: как мы поймем, что цель достигнута
  steps: Array<{
    id: string;                         // Уникальный ID шага (например, step_1)
    title: string;                      // Название шага
    description: string;                // Описание (учебный блок, инструкция, скрипт или творческое задание)
    type: string;                       // Тип шага (ИИ выбирает динамически: "learning_module", "physical_instruction", "dialog_script", "creative_quest", и т.д.)
    dependencies: string[];             // Зависимости от ID других шагов
    verification: string;               // Точка проверки: как ИИ поймет, что шаг выполнен успешно
    priority: 'high' | 'medium' | 'low';
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | string;
  }>;
}

const STRATEGIST_META_PROMPT = `
Ты — суверенный ИИ-стратег и планировщик Selin AI. Твоя задача — на основе абстрактного анализа цели придумать оптимальный, наиболее эффективный путь её достижения.

Ты АБСОЛЮТНО не ограничен никакими шаблонами, списками, категориями или жесткими промптами. Придумай план и выбери форматы шагов, которые идеально подходят именно для этой уникальной цели пользователя.

Ты должен ВСЕГДА отвечать исключительно в МУЖСКОМ роде («я разработал», «я распределил», «я учел»).

В зависимости от характера цели динамически подбирай типы шагов (type):
- Если цель требует получения новых знаний ➡️ создавай шаги с типом "learning_module" (внедряй краткую теорию в описание).
- Если цель физическая/прикладная ➡️ создавай "physical_instruction" или "action_guide" (четкие шаги-инструкции).
- Если цель требует общения или переговоров ➡️ создавай "dialog_script" или "comms_template" (внедряй скрипты, сценарии диалога и речевые заготовки).
- Если цель творческая ➡️ создавай "creative_quest" или "inspiration_task" (вдохновляющие и нестандартные задания).
- ...или придумывай любой другой уникальный тип шага на ходу!

При проектировании шагов:
1. Декомпозируй цель на последовательные логические шаги (от 3 до 7 шагов).
2. Задавай зависимости (dependencies) — массив ID шагов, выполнение которых критически необходимо перед запуском текущего.
3. Четко определяй метод верификации (verification) — как ИИ-система проверит успешность отчета пользователя по этому шагу.

Верни ответ строго в формате JSON со следующей структурой (без markdown разметки, без тройных бэктэков):
{
  "overallStrategy": "Общее текстовое описание уникальной стратегии достижения цели",
  "successCriteria": [
    "Конкретные измеримые показатели успеха достижения этой конкретной цели"
  ],
  "steps": [
    {
      "id": "step_1",
      "title": "Краткое название шага",
      "description": "Детальное содержание шага (учебка, инструкция, скрипт или творческое задание)",
      "type": "Тип шага, выбранный динамически",
      "dependencies": [], // Массив ID предыдущих шагов-зависимостей, например: ["step_1"]
      "verification": "Инструкция для ИИ-системы, как именно проверить выполнение этого шага",
      "priority": "high" | "medium" | "low",
      "status": "pending"
    }
  ]
}
`;

export class GoalStrategyService {
  /**
   * Синтезирует уникальную стратегию и пошаговый граф задач для абстрактной цели.
   * Полностью исключает hardcode-ветвление по типам целей.
   */
  public async generateStrategy(goal: Goal): Promise<Strategy> {
    if (!goal) {
      throw new Error("Объект цели не может быть пустым.");
    }

    logger.info(`🗺️ [GoalStrategyService] Синтез оптимального пути достижения для цели: "${goal.rawInput.slice(0, 60)}..."`);

    try {
      const parsedContextStr = JSON.stringify(goal.parsedContext);
      const prompt = `Разработай пошаговый план и стратегию для цели:
---
Название цели: "${goal.rawInput}"
Контекст цели: ${parsedContextStr}
Критерии успеха (анализ): ${JSON.stringify(goal.successCriteria)}
Ограничения (анализ): ${JSON.stringify(goal.constraints)}
Ресурсы (анализ): ${JSON.stringify(goal.resources)}
---`;

      const responseText = await llmService.smartCall(
        "strategy_service",
        prompt,
        STRATEGIST_META_PROMPT
      );

      const cleanedJson = this.cleanJsonString(responseText);
      const parsed: Strategy = JSON.parse(cleanedJson);

      if (!parsed.steps || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
        throw new Error("ИИ-модель вернула пустой список шагов стратегии.");
      }

      logger.info(`✅ [GoalStrategyService] Стратегия успешно построена. Всего шагов: ${parsed.steps.length}`);
      return parsed;

    } catch (err: any) {
      logger.error(`❌ [GoalStrategyService] Ошибка ИИ-планирования стратегии: ${err.message || err}`);
      
      // Локальный надежный фолбэк для бесперебойной работы
      return this.generateFallbackStrategy(goal);
    }
  }

  private cleanJsonString(raw: string): string {
    return raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  /**
   * Локальный фолбэк для обеспечения непрерывности работы (HITL/Failover)
   */
  private generateFallbackStrategy(goal: Goal): Strategy {
    logger.warn("⚠️ [GoalStrategyService] Применение резервной локальной стратегии...");
    return {
      overallStrategy: "Последовательное пошаговое выполнение сбора информации, подготовки ресурсов и реализации.",
      successCriteria: ["Пользователь подтвердил успешность решения задачи."],
      steps: [
        {
          id: "step_1",
          title: "Сбор и фиксация требований",
          description: "Уточнить у пользователя все детали его запроса, доступные инструменты и лимиты.",
          type: "interview",
          dependencies: [],
          verification: "Пользователь дал ответы на уточняющие вопросы.",
          priority: "high",
          status: "pending"
        },
        {
          id: "step_2",
          title: "Подготовка инфраструктуры и ресурсов",
          description: "Собрать все инструменты, ссылки и софт, определенные на Шаге 1.",
          type: "action_instruction",
          dependencies: ["step_1"],
          verification: "Пользователь подтвердил наличие нужных ресурсов.",
          priority: "medium",
          status: "pending"
        },
        {
          id: "step_3",
          title: "Реализация и получение первого результата",
          description: "Выполнить основную работу, сформировать прототип или получить первый результат.",
          type: "physical_instruction",
          dependencies: ["step_2"],
          verification: "Пользователь прислал отчет или файл с результатом.",
          priority: "high",
          status: "pending"
        }
      ]
    };
  }
}

export const goalStrategyService = new GoalStrategyService();
