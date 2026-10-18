import { llmService } from "../../core/LLMService";
import { logger } from "../../logger";
import { Goal, Step } from "../../core/types";
import { ScriptureService } from "../bible/ScriptureService";

export interface MotivationBlock {
  emotionalState: string;          // Распознанное эмоциональное состояние (тревога, лень, усталость и др.)
  supportType: 'overcoming_fear' | 'fighting_laziness' | 'comfort_failure' | 'gratitude_success' | 'patience_waiting' | string;
  scriptureReference: string;      // Ссылка на стих (например, "Иисус Навин 1:9")
  scriptureText: string;           // Текст стиха
  motivationalText: string;        // Персональный мотивационный комментарий ИИ
  morningBriefingLinked: string;   // Связующее утреннее напутствие (стих + сегодняшняя задача)
}

const MOTIVATION_META_PROMPT = `
Ты — суверенный духовный наставник и ИИ-куратор Selin AI. Твоя задача — проанализировать эмоциональное состояние пользователя по контексту его цели и текущей задачи, выбрать оптимальный тип поддержки и составить глубокое напутствие, связывающее духовную мудрость со светской задачей дня.

Ты должен ВСЕГДА отвечать исключительно в МУЖСКОМ роде («я проанализировал», «я подобрал», «я связал»).

ТИПЫ ПОДДЕРЖКИ:
- overcoming_fear (преодоление страха/тревоги)
- fighting_laziness (борьба с ленью/прокрастинацией)
- comfort_failure (утешение при неудаче/усталости)
- gratitude_success (благодарность за успех)
- patience_waiting (терпение при ожидании результатов)

Среди доступных библейских ориентиров выбери наиболее подходящий (например: "Иисус Навин 1:9", "Псалтирь 22:4", "Притчи 6:6", "Псалтирь 102:2", "Исаия 40:31", "Иакова 1:4" или любой другой известный стих Синодального перевода).

Сгенерируй ответ строго в формате JSON (без markdown разметки, без тройных бэктэков):
{
  "emotionalState": "краткое описание распознанного эмоционального настроя (например: легкая прокрастинация, неуверенность)",
  "supportType": "overcoming_fear | fighting_laziness | comfort_failure | gratitude_success | patience_waiting",
  "scriptureReference": "Книга Глава:Стих (например, Иисус Навин 1:9)",
  "motivationalText": "Глубокий мотивационный комментарий ИИ, поддерживающий дух пользователя",
  "morningBriefingLinked": "Утреннее напутствие, которое органично связывает выбранную мудрость стиха с практической задачей дня"
}
`;

export class MotivationService {
  /**
   * Список эталонных библейских стихов для надежного фоллбэка
   */
  private readonly fallbackVerses: Record<string, { ref: string; text: string }> = {
    overcoming_fear: {
      ref: "Иисус Навин 1:9",
      text: "Будь тверд и мужествен, не страшись и не ужасайся; ибо с тобою Господь Бог твой везде, куда ни пойдешь."
    },
    fighting_laziness: {
      ref: "Притчи 6:6",
      text: "Пойди к муравью, ленивец, посмотри на действия его, и будь мудрым."
    },
    comfort_failure: {
      ref: "Псалтирь 33:19",
      text: "Близко Господь к сокрушенным сердцем и смиренных духом спасет."
    },
    gratitude_success: {
      ref: "Псалтирь 102:2",
      text: "Благослови, душа моя, Господа и не забывай всех благодеяний Его."
    },
    patience_waiting: {
      ref: "Исаия 40:31",
      text: "А надеющиеся на Господа обновятся в силе: поднимут крылья, как орлы, потекут — и не устанут, пойдут — и не утомятся."
    }
  };

  /**
   * Генерирует суверенный духовный блок напутствия на день
   */
  public async generateDailyMotivation(goal: Goal, dailyTask: Step): Promise<MotivationBlock> {
    if (!goal || !dailyTask) {
      throw new Error("Необходимы объекты цели и текущей задачи.");
    }

    logger.info(`✨ [MotivationService] Генерация духовной поддержки для цели: "${goal.rawInput.slice(0, 40)}...", задача: "${dailyTask.description.slice(0, 40)}..."`);

    try {
      const prompt = `Проанализируй эмоциональное состояние и составь блок напутствия:
---
Цель пользователя: "${goal.rawInput}"
Контекст: ${JSON.stringify(goal.parsedContext)}
Состояние цели: ${JSON.stringify(goal.currentState)}
Текущая задача на сегодня: "${dailyTask.description}"
Тип задачи: "${dailyTask.type}"
---`;

      const responseText = await llmService.smartCall(
        "motivation_service",
        prompt,
        MOTIVATION_META_PROMPT
      );

      const cleanedJson = this.cleanJsonString(responseText);
      const parsed = JSON.parse(cleanedJson);

      // Интеграция с существующим ScriptureService проекта для получения реального стиха
      let finalScriptureText = "";
      try {
        const scripture = await ScriptureService.getPassageByQuery(parsed.scriptureReference);
        if (scripture && scripture.text) {
          finalScriptureText = scripture.text;
        }
      } catch (scriptureErr) {
        logger.warn(`⚠️ [MotivationService] Не удалось загрузить стих "${parsed.scriptureReference}" через ScriptureService:`, scriptureErr);
      }

      // Если в базе стих не найден, берем эталонный текст на основе распознанного типа поддержки
      if (!finalScriptureText) {
        const fallback = this.fallbackVerses[parsed.supportType] || this.fallbackVerses.overcoming_fear;
        parsed.scriptureReference = fallback.ref;
        finalScriptureText = fallback.text;
      }

      const result: MotivationBlock = {
        emotionalState: parsed.emotionalState || "нейтральное",
        supportType: parsed.supportType || "overcoming_fear",
        scriptureReference: parsed.scriptureReference,
        scriptureText: finalScriptureText,
        motivationalText: parsed.motivationalText || "Будьте верны своему пути.",
        morningBriefingLinked: parsed.morningBriefingLinked || `Сегодня ваша задача: "${dailyTask.description}". Шаг за шагом двигайтесь вперед.`
      };

      logger.info(`✅ [MotivationService] Духовный блок успешно сформирован. Тип: ${result.supportType}, Стих: ${result.scriptureReference}`);
      return result;

    } catch (err: any) {
      logger.error(`❌ [MotivationService] Ошибка генерации духовного блока: ${err.message || err}`);
      return this.generateFallbackMotivation(goal, dailyTask);
    }
  }

  private cleanJsonString(raw: string): string {
    return raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  /**
   * Локальный надежный фолбэк духовного блока
   */
  private generateFallbackMotivation(goal: Goal, dailyTask: Step): MotivationBlock {
    logger.warn("⚠️ [MotivationService] Применение резервного духовного блока...");
    const fallback = this.fallbackVerses.overcoming_fear;
    return {
      emotionalState: "преодоление трудностей",
      supportType: "overcoming_fear",
      scriptureReference: fallback.ref,
      scriptureText: fallback.text,
      motivationalText: "Каждое препятствие — это лишь возможность проявить силу характера и укрепить свою веру.",
      morningBriefingLinked: `Сегодня перед вами стоит важная задача: "${dailyTask.description}". Не бойтесь трудностей, сделайте этот шаг мужественно.`
    };
  }
}

export const motivationService = new MotivationService();
