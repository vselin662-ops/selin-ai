/**
 * Selin AI — Двухуровневый Транслятор Речи и Текста (Voice & Text Renderer)
 * 
 * Внутренний поток: машинная логика, ReAct-рассуждения, JSON.
 * Внешний поток:
 *  - Текстовый вывод: красивый чистый Markdown для мессенджера MAX.
 *  - Голосовой вывод (TTS): безупречный дикторский литературный русский язык,
 *    без Markdown-тегов, без звездочек, без эмодзи, без 1. 2. 3. (заменяются на речевые связки).
 */

export class VoiceRenderer {
  /**
   * Преобразует текст или результат инструмента в дикторскую речь для TTS
   */
  public static renderForVoice(rawText: string): string {
    if (!rawText) return '';

    let text = rawText;

    // 1. Удаление тегов размышлений модели (<think>...</think>, [thinking]...[/thinking])
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    text = text.replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, '');

    // 2. Если ответ случайно оказался сырым JSON — извлекаем полезное поле
    if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
      try {
        const parsed = JSON.parse(text);
        text = parsed.voiceText || parsed.displayText || parsed.response || parsed.text || parsed.message || '';
      } catch {
        // не JSON, продолжаем
      }
    }

    // 3. Удаление блоков кода ```...``` и инлайн кода `...`
    text = text.replace(/```[\s\S]*?```/g, ' ');
    text = text.replace(/`([^`]+)`/g, '$1');

    // 4. Удаление Markdown-выделений (**жирный**, *курсив*, __подчеркнутый__)
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/\*([^*]+)\*/g, '$1');
    text = text.replace(/__([^_]+)__/g, '$1');
    text = text.replace(/_([^_]+)_/g, '$1');
    text = text.replace(/~~([^~]+)~~/g, '$1');

    // 5. Удаление заголовков Markdown (# Заголовок)
    text = text.replace(/^#{1,6}\s+/gm, '');

    // 6. Удаление разделительных линий (---, ===)
    text = text.replace(/^\s*[-=_*]{3,}\s*$/gm, ' ');

    // 7. Преобразование ссылок [Текст ссылки](http://...) в "Текст ссылки"
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // 8. Удаление эмодзи и графических символов
    text = text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu, '');
    text = text.replace(/[•●▪️✔️❌⚠️💡🚗💳💰📈⚖️☀️🌙🏠📦ℹ️📐📄]/g, '');

    // 9. Преобразование списков 1., 2., 3. в речевые связки
    const transitions = ['Во-первых,', 'Во-вторых,', 'В-третьих,', 'Кроме того,', 'Также,', 'В завершение,'];
    let transIndex = 0;
    text = text.replace(/^\s*\d+[.)]\s+/gm, () => {
      const trans = transitions[transIndex] || 'Также,';
      transIndex++;
      return `${trans} `;
    });

    // 10. Преобразование маркированных списков (тире, звездочки)
    text = text.replace(/^\s*[-*+]\s+/gm, '');

    // 11. Нормализация знаков препинания и пробелов
    text = text.replace(/\s+/g, ' ');
    text = text.replace(/\s+([.,!?:;])/g, '$1');
    text = text.replace(/([.,!?:;])\1+/g, '$1');

    return text.trim();
  }

  /**
   * Преобразует ответ в красивый Markdown для текстового сообщения в MAX
   */
  public static renderForText(rawText: string): string {
    if (!rawText) return '';

    let text = rawText;

    // Удаление тегов размышлений модели
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    text = text.replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, '');

    // Распаковка сырого JSON, если модель выдала его целиком
    if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
      try {
        const parsed = JSON.parse(text);
        text = parsed.displayText || parsed.response || parsed.text || parsed.message || text;
      } catch {
        // не JSON
      }
    }

    return text.trim();
  }
}
