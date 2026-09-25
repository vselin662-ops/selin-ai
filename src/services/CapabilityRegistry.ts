export interface Capability {
  name: string;
  description: string;
  commands: string[];
  examples: string[];
}

export const CAPABILITIES: Capability[] = [
  {
    name: "Voice Loops & Telegram TTS",
    description: "Полный цикл обработки голосовых сообщений (STT) и озвучки ответов (TTS). Автоматическое распознавание речи и умные ответы голосом.",
    commands: ["(Голосовой ввод)"],
    examples: ["Отправьте голосовое сообщение или видеозаметку для общения голосом."]
  },
  {
    name: "План Победы (Victory Plan)",
    description: "Интерактивный годовой план чтения Священного Писания, составление расписаний, ежедневные оповещения и духовные разборы.",
    commands: ["/plan", "план победы"],
    examples: ["/plan", "покажи сегодняшний план чтения"]
  },
  {
    name: "Рой Специалистов (Specialist Swarm)",
    description: "Многоагентная среда для глубокого анализа, бизнес-планирования, скоринга и решения задач.",
    commands: ["анализ проекта", "бизнес план"],
    examples: ["проанализируй бизнес модель стартапа", "составь матрицу рисков"]
  },
  {
    name: "Изучение Языков (Language Academy)",
    description: "Обучение иностранным языкам, интерактивные уроки с использованием интервального повторения и разборы текстов.",
    commands: ["урок английского", "разбор текста"],
    examples: ["начни урок английского", "разбери эту фразу"]
  },
  {
    name: "Многоуровневая Безопасность (Security Gateway & Shield)",
    description: "Защита от инъекций промптов (Prompt Injection), фильтрация утечек учетных данных, MCP Guardian, детекция джейлбрейков и Trust Engine.",
    commands: ["безопасность"],
    examples: ["Проверка промптов на безопасность выполняется автоматически."]
  },
  {
    name: "Генератор Презентаций (Presentation Service)",
    description: "Профессиональная генерация структуры слайдов, выбор цветовых палитр и стилей оформления на основе ИИ-анализа.",
    commands: ["сделай слайды", "презентация"],
    examples: ["создай структуру презентации на тему искусственного интеллекта"]
  }
];

export function getRegistryHelpText(): string {
  let text = "✨ Доступные инструменты и возможности Selin AI ✨\n\n";
  CAPABILITIES.forEach((cap, index) => {
    text += `${index + 1}. ${cap.name}\n`;
    text += `   📝 Описание: ${cap.description}\n`;
    if (cap.commands.length > 0) {
      text += `   💻 Команды: ${cap.commands.join(", ")}\n`;
    }
    if (cap.examples.length > 0) {
      text += `   💡 Примеры: ${cap.examples.join(", ")}\n`;
    }
    text += "\n";
  });
  text += "💡 Отправьте /help или /menu в любой момент для вывода этой справки.";
  return text;
}
