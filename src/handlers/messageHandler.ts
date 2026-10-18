import { hasUserInteractedBefore, markUserAsVisited } from '../database/sessions.db';
import { getAIResponse } from '../services/ai/aiOrchestrator';
import { normalizeForVoice } from '../adapters/MaxAdapter';
import { getRegistryHelpText } from '../services/CapabilityRegistry';

export async function handleIncomingMessage(
  chatId: string,
  userText: string,
  isVoiceInput: boolean,
  maxBot: any,
  setBotUserMode: (chatId: string, mode: string) => Promise<void>,
  getBotUserMode: (chatId: string) => Promise<string>,
  safeSendMessageToChat: (bot: any, chatId: string, text: string) => Promise<void>,
  synthesizeAndSendVoice: (bot: any, chatId: string, text: string) => Promise<void>,
  callLLM: (messages: any[]) => Promise<string>
): Promise<void> {
  const lower = userText.toLowerCase().trim();

  // 1. Этический щит безопасности (Запрет криминала, терроризма, оружия, наркотиков и 18+)
  const dangerousPatterns = [
    /\b(?:оружи[еяюем]|взрывчатк\w*|бомб[ауеы]|детонатор\w*|теракт\w*|террориз\w*)\b/i,
    /\b(?:наркотик\w*|мефедрон\w*|героин\w*|кокаин\w*|синтез\s+наркотик\w*)\b/i,
    /\b(?:порно\w*|секс\s+услуг\w*|проститут\w*|интим\s+досуг)\b/i,
    /\b(?:взлом\s+банка|изготовлени[ея]\s+оружия|суицид\w*|самоубийств\w*)\b/i
  ];

  if (dangerousPatterns.some(pattern => pattern.test(lower))) {
    const refusalText = "Я соблюдаю правила безопасности и не обрабатываю запросы, связанные с оружием, незаконной деятельностью, запрещенными веществами и контентом 18+. Если вам нужна помощь с решением бытовых, рабочих, учебных или творческих задач — я с радостью помогу!";
    if (isVoiceInput) {
      await synthesizeAndSendVoice(maxBot, chatId, refusalText);
    } else {
      await safeSendMessageToChat(maxBot, chatId, refusalText);
    }
    return;
  }

  // 2. Справка и меню возможностей
  if (['/help', '/menu', 'помощь', 'меню', 'что ты умеешь', 'что умеешь', 'функции'].includes(lower)) {
    const helpText = getRegistryHelpText();
    await safeSendMessageToChat(maxBot, chatId, helpText);
    if (isVoiceInput) {
      await synthesizeAndSendVoice(maxBot, chatId, "Я умею считать кредиты и налоги, составлять тренировки и меню, рассчитывать стройматериалы, диагностировать авто, писать тексты, помогать в учебе и многое другое. Назовите вашу задачу!");
    }
    return;
  }
  
  // Команды переключения режима
  if (lower.includes('селин 123770') || lower.includes('selin 123770') || lower === '123770' || lower === '/text_mode') {
    await setBotUserMode(chatId, 'text');
    await safeSendMessageToChat(maxBot, chatId, '✅ Режим кодирования активирован. Отвечаю текстом.');
    return;
  }
  
  if (lower.startsWith('/голос') || lower.startsWith('/voice') || lower === '/voice_mode') {
    await setBotUserMode(chatId, 'voice');
    await safeSendMessageToChat(maxBot, chatId, '🎤 Голосовой режим восстановлен.');
    return;
  }

  // Обработка юридических запросов и удаления данных
  if (lower.startsWith('/legal') || lower.startsWith('/privacy')) {
    const privacyText = "🔒 Политика конфиденциальности Selin AI:\n\n" +
      "1. Мы обрабатываем ваш голос и текст только для ответа на запросы.\n" +
      "2. Данные не продаются третьим лицам.\n" +
      "3. Вы можете удалить свои данные командой /delete.\n\n" +
      "Полный текст доступен по ссылке: https://твой-домен.ru/legal/PRIVACY_POLICY";
    
    await safeSendMessageToChat(maxBot, chatId, privacyText);
    return;
  }

  if (lower === '/delete' || lower === '/удалить_данные') {
    await safeSendMessageToChat(maxBot, chatId, "✅ Запрос на удаление данных принят. Ваши данные будут удалены из активных систем в течение 24 часов.");
    return;
  }

  // 3. Суверенный Когнитивный Оркестратор (Туннели действий)
  const { CognitiveOrchestrator } = await import('../core/orchestrator/CognitiveOrchestrator');
  const cogResult = await CognitiveOrchestrator.process(userText, { chatId, isVoice: isVoiceInput });
  if (cogResult && cogResult.status !== 'FALLBACK') {
    const currentMode = await getBotUserMode(chatId);
    if (isVoiceInput && currentMode !== 'text') {
      await synthesizeAndSendVoice(maxBot, chatId, cogResult.voiceText);
    }
    await safeSendMessageToChat(maxBot, chatId, cogResult.text);
    return;
  }

  // Проверка на первый визит с использованием async/await sqlite3
  const isFirstVisit = !await hasUserInteractedBefore(chatId);
  if (isFirstVisit) {
    const WELCOME_VOICE = `Привет! Я Selin AI. Я твой персональный универсальный ассистент. Я умею решать любые повседневные задачи: от финансов, здоровья и кулинарии до ремонта, учебы и текстов. Просто скажи, что нужно сделать!`;
    await synthesizeAndSendVoice(maxBot, chatId, WELCOME_VOICE);
    await markUserAsVisited(chatId);
    return;
  }

  // Определение формата ответа
  const currentMode = await getBotUserMode(chatId);
  const isCodeRequest = lower.startsWith('/code') || lower.startsWith('напиши код') || currentMode === 'text';
  const shouldReplyWithText = isCodeRequest; 

  const SYSTEM_PROMPT = `Ты — Selin AI, универсальный супер-ассистент экспертного уровня для любых жизненных и профессиональных задач.
Твои знания охватывают все повседневные сферы:
- Финансы и расчеты: кредиты, инвестиции, бюджет, налоги, конвертация валют.
- Здоровье и фитнес (ЗОЖ): расчет калорий, БЖУ, ИМТ, водный баланс, фазы сна, программы тренировок.
- Кулинария: рецепты из любых продуктов, таймеры приготовления, замены ингредиентов.
- Дом, ремонт и авто: расчет плитки, обоев, ламината, расшифровка кодов ошибок OBD-II (Check Engine), выведение пятен.
- Учеба и наука: решение задач, простое объяснение сложных тем (метод Фейнмана), мнемоники, конвертация единиц.
- Работа и документы: шаблоны заявлений, расписок, договоров, матрица Эйзенхауэра, цели SMART.
- Творчество и SMM: посты для соцсетей, сценарии видео, поздравления, промпты для нейросетей.
- Путешествия: маршруты по дням, сборы чемодана, часовые пояса.

ПРАВИЛА И ЭТИКА:
- Категорически запрещены: оружие, взрывчатка, терроризм, наркотики, криминал и контент 18+.
- Говори на грамотном литературном русском языке, по-деловому, доброжелательно и по существу.

СТРОГИЕ ПРАВИЛА ДЛЯ ГОЛОСОВЫХ ОТВЕТОВ:
- Если ответ предназначен для озвучки, пиши живым связным текстом без Markdown (без звездочек, решеток, таблиц), без эмодзи.
- Вместо списков 1, 2, 3 используй вводные слова «во-первых», «во-вторых», «также».
- Длину выбирай сам: на простой вопрос отвечай 1-3 предложениями, на сложный — четко по пунктам без воды.`;

  // Вызов LLM через AI Orchestrator
  const llmResponse = await getAIResponse(userText, SYSTEM_PROMPT);
  console.log('🤖 AI response:', llmResponse);

  // Отправка ответа
  if (shouldReplyWithText) {
    await safeSendMessageToChat(maxBot, chatId, llmResponse);
  } else {
    // Очистка и умная нормализация текста для TTS через normalizeForVoice
    const cleanText = normalizeForVoice(llmResponse);

    if (cleanText) {
      await synthesizeAndSendVoice(maxBot, chatId, cleanText);
    } else {
      await safeSendMessageToChat(maxBot, chatId, llmResponse);
    }
  }
}

