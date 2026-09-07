import { aiOrchestrator } from './aiOrchestrator';
import { callVision } from '../core/LLMService';
import { logger } from '../logger';

export interface StyleGuide {
  style: string;
  colors: string[];
  layout: string;
  graphics: string;
}

export interface SlidePlan {
  slideNumber: number;
  title: string;
  bullets: string[];
  visualPrompt: string;
  comment: string;
}

export interface PresentationPlan {
  styleGuide: StyleGuide;
  slides: SlidePlan[];
}

/**
 * Сервис для анализа стилей и генерации профессиональных презентаций по запросу
 */
export class PresentationService {
  /**
   * Анализирует загруженное изображение для извлечения style_guide
   */
  public static async analyzeStyleFromImage(dataUrl: string): Promise<StyleGuide> {
    const prompt = `Внимательно проанализируй стиль этого слайда/изображения для создания презентации.
Определи:
1. Стиль (минимализм/корпоративный/креативный/темный/светлый)
2. Цветовую палитру (основные 3-5 цветов, желательно с HEX или точными названиями)
3. Структуру расположения элементов (например: заголовок слева + тезисы справа + фоновый визуал)
4. Тип графики (иконки/фото/иллюстрации/схемы)

Верни СТРОГО JSON-объект в следующем формате:
{
  "style": "название стиля",
  "colors": ["цвет1", "цвет2", "цвет3"],
  "layout": "описание структуры расположения элементов",
  "graphics": "тип используемой графики"
}
Ничего другого не пиши, не оборачивай в дополнительные теги, кроме стандартного блока кода json.`;

    try {
      const visionResponse = await callVision(prompt, dataUrl);
      const cleaned = visionResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return {
        style: parsed.style || 'корпоративный минимализм',
        colors: Array.isArray(parsed.colors) ? parsed.colors : ['темно-синий', 'белый', 'золотой акцент'],
        layout: parsed.layout || 'сбалансированное разделение контента',
        graphics: parsed.graphics || 'фото и бизнес-иконки'
      };
    } catch (err: any) {
      logger.warn(`⚠️ [PresentationService] Не удалось проанализировать стиль по фото: ${err?.message || err}. Используем дефолтный стиль.`);
      return {
        style: 'корпоративный минимализм',
        colors: ['темно-синий', 'белый', 'золотой акцент'],
        layout: 'заголовок + тезисы слева, визуал 16:9 справа',
        graphics: 'фото и векторные бизнес-иконки'
      };
    }
  }

  /**
   * Генерирует структуру презентации, слайды, тезисы и промты для картинок на основе запроса и style_guide
   */
  public static async generatePlan(userQuery: string, styleGuide: StyleGuide): Promise<PresentationPlan> {
    // Пытаемся извлечь количество слайдов из запроса пользователя
    let slideCount = 5;
    const countMatch = userQuery.match(/(\d+)\s*(слайд|slide)/i);
    if (countMatch) {
      const parsedCount = parseInt(countMatch[1], 10);
      if (parsedCount >= 5 && parsedCount <= 15) {
        slideCount = parsedCount;
      } else if (parsedCount < 5) {
        slideCount = 5; // Минимум 5 слайдов по регламенту
      } else {
        slideCount = 15; // Разумный лимит
      }
    }

    const systemPrompt = `Ты — ведущий AI-ассистент Selin_AI PRO, профессионал в области дизайна, копирайтинга и создания презентаций.
Твоя цель — разработать идеальную структуру презентации на основе требований пользователя и переданного руководства по стилю (style_guide).

РЕГЛАМЕНТ РАБОТЫ:
1. Создай ровно ${slideCount} слайдов.
2. Слайд 1: всегда Титульный (тема + подзаголовок).
3. Слайд 2: всегда Проблема/контекст/актуальность.
4. Слайды с 3 по ${slideCount - 1}: Основной контент, логически раскрывающий тему.
5. Слайд ${slideCount}: Выводы/CTA (Заключительный слайд).

ДЛЯ КАЖДОГО СЛАЙДА ОПРЕДЕЛИ:
- Заголовок (на русском языке, емкий, 5-10 слов).
- Тезисы (3-5 пунктов, содержательные факты, на русском языке).
- Описание визуального ряда для генерации изображения (тип визуала, детали).
- Специфический промт для генератора изображений (image_gen) на английском языке в формате:
  "[Тип слайда], [тема], [стиль из style_guide], [цветовая палитра из style_guide], professional presentation slide, clean layout, [детали], 4K, high quality"
- Комментарий (на русском языке: обоснование выбора визуала и структуры слайда).

Верни результат строго в формате JSON:
{
  "styleGuide": {
    "style": "стиль презентации",
    "colors": ["цвет1", "цвет2", "цвет3"],
    "layout": "структура элементов",
    "graphics": "тип графики"
  },
  "slides": [
    {
      "slideNumber": 1,
      "title": "Заголовок слайда",
      "bullets": ["Тезис 1", "Тезис 2", "Тезис 3"],
      "visualPrompt": "Английский промт для генерации",
      "comment": "Обоснование визуала и почему это подходит для презентации"
    }
  ]
}`;

    const userPrompt = `Запрос пользователя: "${userQuery}"
Руководство по стилю (из примера):
- Стиль: ${styleGuide.style}
- Цвета: ${styleGuide.colors.join(', ')}
- Структура: ${styleGuide.layout}
- Графика: ${styleGuide.graphics}

Создай детальный план из ${slideCount} слайдов, соблюдая все требования и формат JSON.`;

    try {
      const response = await aiOrchestrator.getResponse(userPrompt, systemPrompt);
      const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed: PresentationPlan = JSON.parse(cleaned);
      
      // Дополнительная валидация
      if (!parsed.slides || !Array.isArray(parsed.slides) || parsed.slides.length === 0) {
        throw new Error('Invalid JSON structure or empty slides array');
      }

      return parsed;
    } catch (err: any) {
      logger.error(`❌ [PresentationService] Ошибка генерации плана презентации: ${err?.message || err}`);
      
      // Фолбэк-структура, если JSON-генерация дала сбой
      const fallbackSlides: SlidePlan[] = [
        {
          slideNumber: 1,
          title: "Введение в тему: " + userQuery,
          bullets: ["Ключевые предпосылки развития", "Цели и задачи текущего исследования", "Актуальность проекта на сегодняшний день"],
          visualPrompt: `Title slide, ${userQuery}, modern minimalist style, corporate color palette ${styleGuide.colors.join(' ')}, professional presentation slide, clean layout, 4K, high quality`,
          comment: "Титульный слайд задаёт тон всей презентации и визуализирует ключевую тему."
        },
        {
          slideNumber: 2,
          title: "Существующая проблема на рынке",
          bullets: ["Основные ограничения текущих решений", "Неудовлетворенный спрос целевой аудитории", "Финансовые и операционные потери из-за неэффективности"],
          visualPrompt: `Infographic slide, market problem statement, corporate color palette ${styleGuide.colors.join(' ')}, professional business style, clean layout, bar chart, 4K, high quality`,
          comment: "Слайд фокусирует внимание инвесторов или слушателей на главной рыночной боли."
        },
        {
          slideNumber: 3,
          title: "Наше решение и его преимущества",
          bullets: ["Инновационный технологический подход", "Оптимизация ключевых бизнес-процессов", "Быстрая интеграция и масштабируемость системы"],
          visualPrompt: `Diagram slide, innovative solution visualization, modern clean style, ${styleGuide.colors.join(' ')} background, corporate graphics, 4K, high quality`,
          comment: "Показывает продукт как элегантный ответ на существующие рыночные вызовы."
        },
        {
          slideNumber: 4,
          title: "Финансовая модель и масштабирование",
          bullets: ["Прогноз роста выручки на ближайшие 3 года", "Основные драйверы увеличения прибыли", "Стратегия выхода на международные рынки"],
          visualPrompt: `Chart slide, financial forecast curves, corporate business style, ${styleGuide.colors.join(' ')} palette, 4K, high quality`,
          comment: "Отражает потенциал роста и бизнес-метрики для инвесторов."
        },
        {
          slideNumber: 5,
          title: "Заключение и призыв к действию",
          bullets: ["Подведение ключевых итогов встречи", "Контактная информация для обратной связи", "Призыв присоединиться к раунду финансирования"],
          visualPrompt: `Closing slide, Thank You, corporate clean style, elegant dark background, company logo placeholder, 4K, high quality`,
          comment: "Финальный слайд оставляет четкое впечатление и дает понятный призыв к действию."
        }
      ];

      return {
        styleGuide,
        slides: fallbackSlides
      };
    }
  }
}
