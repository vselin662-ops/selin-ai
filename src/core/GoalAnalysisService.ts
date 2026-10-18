import { llmService } from "./LLMService";
import { logger } from "../logger";

export interface ParsedGoal {
  goalDefinition: string;           // Что человек хочет достичь
  domain: string;                   // Динамическая область/домен (не из списка)
  requiredExpertise: string;        // Какой уровень экспертизы требуется
  processType: 'one_time' | 'long_term' | string; // Длительность процесса (разовая или долгосрочная)
  risksAndPitfalls: string[];       // Риски и подводные камни
  impliedNeeds: string[];           // Скрытые потребности (подразумеваемое)
  neededResources: string[];        // Необходимые ресурсы
  neededKnowledge: string[];        // Необходимые знания
  formatConfig: {
    needsPlan: boolean;             // Нужен ли пошаговый план
    needsLearning: boolean;         // Нужно ли обучение
    needsMotivation: boolean;       // Нужна ли мотивация
    needsControl: boolean;          // Нужен ли контроль выполнения
  };
  strategy: string;                 // Результирующая динамическая стратегия достижения
  successCriteria: string[];        // Динамические критерии успеха
}

const ANALYZE_META_PROMPT = `
Ты — суверенный универсальный аналитик целей Selin AI. Твоя задача — понять, чего именно хочет человек на основе его сырого запроса (текстового или голосового), и описать это в максимально глубокой, сухой и структурированной форме.

Запрещено использовать любые заранее заданные сценарии, категории или шаблоны. Изучи запрос изнутри и опиши его структуру так, как она есть, со всеми индивидуальными нюансами.

Ты должен мыслить критически и извлечь скрытые (невысказанные напрямую) потребности пользователя, выявить потенциальные технические, организационные и психологические риски, и определить оптимальный формат нашего дальнейшего взаимодействия.

Ты должен ВСЕГДА отвечать исключительно в МУЖСКОМ роде («я проанализировал», «я определил», «я выявил»).

Верни ответ строго в формате JSON со следующей структурой (без markdown разметки, без тройных бэктэков):
{
  "goalDefinition": "Суть того, чего пользователь хочет достичь (конкретная формулировка цели)",
  "domain": "Уникальное название сферы деятельности, к которой относится цель (например: 'Офлайн производство деревянной мебели', 'Снижение тревожности и биохакинг сна' и т.д. — придумывай динамически)",
  "requiredExpertise": "Какой уровень знаний или навыков требуется от ИИ-ассистента для решения задачи",
  "processType": "one_time" или "long_term" (в зависимости от природы цели),
  "risksAndPitfalls": [
    "Перечень скрытых рисков, барьеров и подводных камней, с которыми столкнется пользователь"
  ],
  "impliedNeeds": [
    "Скрытые потребности: то, что пользователь не озвучил прямо, но что критически важно для успеха задачи"
  ],
  "neededResources": [
    "Ресурсы и инструменты (софт, бюджет, внешние API, физические материалы), которые понадобятся"
  ],
  "neededKnowledge": [
    "Знания и теории, которые пользователю необходимо усвоить или прочитать"
  ],
  "formatConfig": {
    "needsPlan": true или false (нужен ли пошаговый план для достижения цели),
    "needsLearning": true или false (нужен ли обучающий блок и мини-теория),
    "needsMotivation": true или false (нужна ли поддержка, преодоление барьеров и мотивация),
    "needsControl": true или false (нужен ли жесткий пошаговый контроль выполнения с отчетами)
  },
  "strategy": "Общая динамическая стратегия, которую ИИ-помощник выбирает для ведения пользователя к успеху",
  "successCriteria": [
    "Конкретные, измеримые критерии, по которым пользователь поймет, что цель достигнута"
  ]
}
`;

export class GoalAnalysisService {
  /**
   * Выполняет глубокий, неструктурированный семантический анализ сырого запроса пользователя
   * с использованием мета-промпта на базе Google Gemini.
   */
  public async analyzeGoal(rawInput: string): Promise<ParsedGoal> {
    if (!rawInput || rawInput.trim() === '') {
      throw new Error("Запрос не может быть пустым.");
    }

    logger.info(`🔍 [GoalAnalysisService] Запуск глубокого ИИ-анализа запроса: "${rawInput.slice(0, 60)}..."`);

    try {
      const prompt = `Проанализируй следующий входящий запрос пользователя:
---
Запрос: "${rawInput}"
---`;

      const responseText = await llmService.smartCall(
        "analysis_service",
        prompt,
        ANALYZE_META_PROMPT
      );

      const cleanedJson = this.cleanJsonString(responseText);
      const parsed: ParsedGoal = JSON.parse(cleanedJson);

      // Валидируем базовое наличие необходимых полей, чтобы избежать ошибок
      if (!parsed.goalDefinition || !parsed.domain || !parsed.formatConfig) {
        throw new Error("Неполная структура ответа от ИИ-модели.");
      }

      logger.info(`✅ [GoalAnalysisService] Анализ завершен. Область: "${parsed.domain}", Формат: Plan=${parsed.formatConfig.needsPlan}`);
      return parsed;

    } catch (err: any) {
      logger.error(`❌ [GoalAnalysisService] Ошибка ИИ-анализа запроса: ${err.message || err}`);
      
      // Локальный надежный фолбэк-анализатор без вызова внешнего ИИ в случае сетевых сбоев
      return this.generateFallbackGoal(rawInput);
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
  private generateFallbackGoal(rawInput: string): ParsedGoal {
    logger.warn("⚠️ [GoalAnalysisService] Применение резервного локального анализатора...");
    return {
      goalDefinition: rawInput,
      domain: "Универсальный домен",
      requiredExpertise: "Общая эрудиция",
      processType: "one_time",
      risksAndPitfalls: ["Недостаток детализации", "Отсутствие внешней обратной связи"],
      impliedNeeds: ["Пошаговая структуризация задачи", "Мониторинг прогресса"],
      neededResources: ["Доступ в интернет", "Личное время"],
      neededKnowledge: ["Основы логики планирования"],
      formatConfig: {
        needsPlan: true,
        needsLearning: false,
        needsMotivation: true,
        needsControl: false
      },
      strategy: "Поэтапное выполнение запроса с регулярными срезами результатов.",
      successCriteria: ["Запрос пользователя выполнен и закрыт."]
    };
  }
}

export const goalAnalysisService = new GoalAnalysisService();
