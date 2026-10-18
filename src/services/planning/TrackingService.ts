import { llmService } from "../../core/LLMService";
import { logger } from "../../logger";
import { Goal, Step, Interaction } from "../../core/types";
import { Strategy } from "../../core/GoalStrategyService";

export interface DailyPlan {
  goalId: string;
  stepId: string;
  taskDescription: string;
  motivationElement: string; // Модуль "План Победы"
  interactionType: 'question' | 'instruction' | 'motivation' | 'verification' | string;
  content: string;
  context: string; // Обоснование ИИ, почему выбрано именно это
}

const DAILY_PLAN_META_PROMPT = `
Ты — суверенный ИИ-куратор и мотивационный наставник Selin AI. Твоя задача — проанализировать текущее состояние цели и составить идеальный План Победы (DailyPlan) для пользователя на сегодняшний день.

Ты абсолютно свободен от любых шаблонов. Твои решения должны быть адаптивными, точными и глубоко индивидуальными для каждого пользователя.

Ты должен ВСЕГДА отвечать исключительно в МУЖСКОМ роде («я проанализировал», «я выбрал», «я определил»).

Для формирования плана:
1. Выбери из контекста или currentState наиболее критичный текущий шаг.
2. Сформулируй конкретную задачу на день, которая двигает пользователя вперед.
3. Разработай модуль "План Победы" — мощную мотивационную установку, объясняющую пользователю, почему именно эта задача сегодня приведет его к победе.
4. Выбери наиболее подходящий формат взаимодействия (interactionType: question, instruction, motivation, verification).

Верни ответ строго в формате JSON (без markdown разметки, без тройных бэктэков):
{
  "goalId": "ID цели пользователя",
  "stepId": "ID выбранного шага",
  "taskDescription": "Максимально детальное и понятное описание сегодняшней задачи",
  "motivationElement": "Модуль План Победы: Твоя главная суперсила на сегодня...",
  "interactionType": "instruction",
  "content": "Полное текстовое обращение к пользователю с заданием и словами поддержки",
  "context": "Обоснование: почему именно эта задача критична сегодня на основе текущего состояния"
}
`;

const FEEDBACK_PROCESSOR_META_PROMPT = `
Ты — суверенный ИИ-аналитик обратной связи Selin AI. Твоя задача — проанализировать отзывы пользователя ("не получается", "слишком сложно", "слишком просто", "я застрял" и т.д.) по текущей цели и динамически скорректировать параметры этой цели.

Никаких захардкоженных правил адаптации. Используй всю свою эрудицию для глубокого анализа препятствий:
- Если пользователю слишком сложно ➡️ упрощай шаги, снижай уровень сложности (complexity), добавляй дополнительные поддерживающие ресурсы.
- Если пользователю слишком легко ➡️ повышай планку сложности, ускоряй темп, добавляй более амбициозные критерии успеха.
- Если у пользователя "не работает" ➡️ выявляй технические или организационные риски, предлагай альтернативные пути достижения и добавляй новые ограничения (constraints) или ресурсы.
- Если пользователь застрял ➡️ находи ментальные или практические барьеры и предлагай конкретное решение.

Ты должен ВСЕГДА отвечать исключительно в МУЖСКОМ роде («я скорректировал», «я проанализировал», «я пересчитал»).

Верни обновленные абстрактные параметры цели строго в формате JSON (без markdown разметки, без тройных бэктэков):
{
  "parsedContext": {
    "goalDefinition": "Новое определение или уточненная суть цели",
    "domain": "Домен цели",
    "complexity": "easy | medium | hard",
    "additionalContext": "Любые новые динамические параметры и выводы анализа"
  },
  "successCriteria": [
    "Обновленные и скорректированные критерии успеха"
  ],
  "constraints": [
    "Новые или измененные ограничения"
  ],
  "resources": [
    "Новые необходимые ресурсы для преодоления трудностей"
  ],
  "currentState": {
    "lastFeedbackAnalysis": "Результат твоего анализа последнего отзыва пользователя",
    "completionPercentage": 50, // Число: примерный процент выполнения от 0 до 100
    "currentFocus": "На чем пользователю нужно сфокусироваться прямо сейчас"
  }
}
`;

export class TrackingService {
  /**
   * Утреннее планирование: Анализирует цель и генерирует персональную задачу на день.
   */
  public async generateDailyPlan(goal: Goal): Promise<DailyPlan> {
    if (!goal) {
      throw new Error("Цель не может быть пустой.");
    }

    logger.info(`🌅 [TrackingService] Генерация утреннего плана на день для цели: "${goal.rawInput.slice(0, 50)}..."`);

    try {
      const prompt = `Составь утренний план для цели:
---
ID Цели: ${goal.id}
Запрос: "${goal.rawInput}"
Контекст: ${JSON.stringify(goal.parsedContext)}
Стратегия: "${goal.strategy}"
Текущее состояние: ${JSON.stringify(goal.currentState)}
Критерии успеха: ${JSON.stringify(goal.successCriteria)}
Ограничения: ${JSON.stringify(goal.constraints)}
Ресурсы: ${JSON.stringify(goal.resources)}
---`;

      const responseText = await llmService.smartCall(
        "daily_planner",
        prompt,
        DAILY_PLAN_META_PROMPT
      );

      const cleanedJson = this.cleanJsonString(responseText);
      const parsed: DailyPlan = JSON.parse(cleanedJson);

      logger.info(`✅ [TrackingService] Daily plan generated. Interaction: ${parsed.interactionType}`);
      return parsed;

    } catch (err: any) {
      logger.error(`❌ [TrackingService] Ошибка ИИ-планирования дня: ${err.message || err}`);
      return this.generateFallbackDailyPlan(goal);
    }
  }

  /**
   * Вечерний анализ: Анализирует фидбек пользователя, обновляет контекст, ограничения, ресурсы и состояние цели.
   */
  public async processFeedback(goal: Goal, feedback: string): Promise<Goal> {
    if (!goal) {
      throw new Error("Цель не может быть пустой.");
    }

    logger.info(`🌌 [TrackingService] Анализ вечерней обратной связи по цели "${goal.id}". Фидбек: "${feedback.slice(0, 60)}..."`);

    try {
      const prompt = `Проанализируй обратную связь пользователя и предложи корректировки параметров цели:
---
Цель пользователя: "${goal.rawInput}"
Контекст: ${JSON.stringify(goal.parsedContext)}
Текущее состояние: ${JSON.stringify(goal.currentState)}
Критерии успеха: ${JSON.stringify(goal.successCriteria)}
Ограничения: ${JSON.stringify(goal.constraints)}
Ресурсы: ${JSON.stringify(goal.resources)}
Стратегия: "${goal.strategy}"
---
ОТЗЫВ ПОЛЬЗОВАТЕЛЯ: "${feedback}"
---`;

      const responseText = await llmService.smartCall(
        "feedback_processor",
        prompt,
        FEEDBACK_PROCESSOR_META_PROMPT
      );

      const cleanedJson = this.cleanJsonString(responseText);
      const updates = JSON.parse(cleanedJson);

      // Глубокое слияние обновлений в оригинальный объект цели
      const updatedGoal: Goal = {
        ...goal,
        parsedContext: {
          ...goal.parsedContext,
          ...updates.parsedContext
        },
        successCriteria: updates.successCriteria || goal.successCriteria,
        constraints: updates.constraints || goal.constraints,
        resources: updates.resources || goal.resources,
        currentState: {
          ...goal.currentState,
          ...updates.currentState,
          lastFeedback: feedback,
          lastFeedbackTime: Date.now()
        },
        updatedAt: Date.now()
      };

      logger.info(`✅ [TrackingService] Вечерний фидбек успешно обработан. Новый уровень сложности: ${updatedGoal.parsedContext.complexity}`);
      return updatedGoal;

    } catch (err: any) {
      logger.error(`❌ [TrackingService] Ошибка вечерней обработки фидбека: ${err.message || err}`);
      
      // Возвращаем исходную цель с зафиксированным фидбеком в случае сбоя парсинга ИИ
      return {
        ...goal,
        currentState: {
          ...goal.currentState,
          lastFeedback: feedback,
          lastFeedbackError: err.message || String(err),
          lastFeedbackTime: Date.now()
        },
        updatedAt: Date.now()
      };
    }
  }

  /**
   * Адаптация стратегии: Перестраивает всю дорожную карту шагов на основе обновленного состояния цели.
   */
  public async adaptStrategy(goal: Goal): Promise<Strategy> {
    logger.info(`🔄 [TrackingService] Адаптация и перестроение ИИ-стратегии для цели: "${goal.rawInput.slice(0, 50)}..."`);
    const { goalStrategyService } = await import("../../core/GoalStrategyService");
    return goalStrategyService.generateStrategy(goal);
  }

  private cleanJsonString(raw: string): string {
    return raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  /**
   * Резервный локальный план дня
   */
  private generateFallbackDailyPlan(goal: Goal): DailyPlan {
    logger.warn("⚠️ [TrackingService] Применение резервного плана дня...");
    return {
      goalId: goal.id,
      stepId: "step_current",
      taskDescription: "Сделать фокусное действие для продвижения по вашей цели на сегодня.",
      motivationElement: "План Победы: Каждый шаг приближает тебя к цели. Ты сильнее, чем думаешь!",
      interactionType: "instruction",
      content: `Здравствуйте! Сегодня отличный день, чтобы сделать шаг навстречу вашей цели: "${goal.rawInput}". Пожалуйста, уделите этому хотя бы 15 минут сегодня.`,
      context: "Резервный локальный план для обеспечения бесперебойности."
    };
  }
}

export const trackingService = new TrackingService();
