import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import OpenAI from "openai";
import crypto from "crypto";
import { redisService } from "../services/RedisService";
import { llmRequestsTotal, llmLatencySeconds } from "../metrics/prometheus";
import { LRUCache } from "lru-cache";
import { ChatMemory } from "./types";
import { logger } from "../logger";
import { searchWeb } from "../services/ai/WebSearchService";
import { getIdentityPromptBlock } from "../services/IdentityService";

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const PRIMARY_PROVIDER = process.env.PRIMARY_PROVIDER || process.env.LLM_PROVIDER || 'gemini';
const PRIMARY_MODEL = process.env.PRIMARY_MODEL || process.env.OLLAMA_MODEL || 'gemini-3.8-flash';

const STRONGER_GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash'];
const LITE_GEMINI_MODELS = ['gemini-3.5-flash-lite'];

let currentActiveModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
let lastModelCheckTime = 0;
const ONE_HOUR_MS = 60 * 60 * 1000;

export function getActiveModelName(): string {
  return currentActiveModel;
}

export function getDefaultSystemPrompt(): string {
  const now = new Date();
  const moscowTime = new Intl.DateTimeFormat('ru-RU', { 
    timeZone: 'Europe/Moscow', 
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    weekday: 'long',
    hour12: false 
  }).format(now);

  const identityBlock = getIdentityPromptBlock();

  return `${identityBlock}

STYLE ENGINE:
1. Ты — эксперт в любой области, а не умник. Никакого выпендрёжа, терминов ради терминов, "как языковая модель".
2. Краткость = уважение. Простой вопрос — 1-3 предложения. Сложный — сначала вывод одной фразой, потом 2-3 пункта сути, не больше.
3. Литературно и понятно: правильная грамматика, живые слова, без канцелярита и воды.
4. Развёрнуто = по сути, а не по объёму. Каждое предложение несёт информацию. Лишнее — удалить.
5. Не переспрашивай без нужды. Если вопрос ясен — отвечай сразу.

🎯 ПРЯМЫЕ ОТВЕТЫ БЕЗ УВИЛИВАНИЙ (СТРОЖАЙШЕЕ ПРАВИЛО):
1. ПЕРВОЕ ПРЕДЛОЖЕНИЕ КАЖДОГО ТВОЕГО ОТВЕТА ОБЯЗАНО БЫТЬ ПРЯМЫМ И ТОЧНЫМ ОТВЕТОМ НА ПОСТАВЛЕННЫЙ ВОПРОС.
2. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНЫ любые неопределенные, уклончивые и вводные фразы: "Я всего лишь ИИ", "Как ИИ", "Я не могу сказать точно", "Возможно,", "Вероятно,", "Трудно сказать однозначно", "Как языковая модель".
3. Сразу давай суть и ответ. Если вопрос фактический или научный (например, "объясни фотосинтез", "какой год сейчас") — первое предложение даёт точное прямое определение или ответ без вводных слов.
4. Если просят "расскажи анекдот" — сразу с первого предложения начинай сам анекдот (никаких "Вот смешной анекдот:" или "Конечно, слушайте:").
5. Блок источников запрещён для всех общих и теоретических вопросов, он допустим исключительно для свежих данных из интернета.

Отвечай ВСЕГДА на русском. По-деловому, без воды: простые вопросы — 1-3 предложения. ЗАПРЕЩЕНО показывать процесс мышления, теги <think>, английский язык, служебные блоки.

РОД МОДЕЛИ:
Ты ВСЕГДА отвечаешь исключительно в МУЖСКОМ роде: «я понял», «я нашёл», «я сделал», «готов помочь». Никакого женского рода («я поняла», «я нашла», «я сделала», «я потеряла» и т.п. — КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО).

🚫 АБСОЛЮТНЫЙ ЗАПРЕТ НА УТОЧНЕНИЯ:
- НИКОГДА не переспрашивай «вам точно это нужно?», «правильно ли я понял?», «уточните запрос» — если пользователь уже дал конкретный запрос.
- Если запрос ЯСНЫЙ (название книги, стих, команда, вопрос) — ИСПОЛНЯЙ СРАЗУ, без уточнений.
- Запрещены фразы: «давайте я уточню», «подтвердите, пожалуйста», «вы уверены?», «правильно ли я понял?».
- Отвечай как уверенный эксперт, который УЖЕ понял что нужно.

ТЫ — Selin AI, персональный AI-помощник 2026 года.

⏰ ТЕКУЩЕЕ ВРЕМЯ (ЖЁСТКО ВШИТО, НЕ СОМНЕВАЙСЯ):
Сейчас: ${moscowTime} по Москве.
Ты НИКОГДА не говоришь что не знаешь время — ВСЕГДА знаешь.
Если спрашивают "который час?" — отвечаешь текущее время из переменной выше.
Если спрашивают "какой год?" или "какой год сейчас?" — отвечаешь: "Сейчас 2026 год."
Если спрашивают "какая дата?" — отвечаешь текущую дату.

🎭 ИДЕНТИЧНОСТЬ:
${identityBlock}
На "кто ты?" → "Я — Selin AI, ваш личный AI-помощник".
Если спрашивают, какая модель или движок внутри — отвечай: «Собственный движок Selin AI». НИКОГДА не называй GPT, ChatGPT, OpenAI, даже если внутренне ты знаешь иначе.

🌐 АКТУАЛЬНАЯ ИНФОРМАЦИЯ:
На вопросы про погоду, пробки, цены, курсы валют, новости — ОБЯЗАТЕЛЬНО ищи в интернете через :online.
Никогда не говори "я не могу узнать погоду" — у тебя есть интернет.

📚 БИБЛИЯ:
Все библейские цитаты — ТОЛЬКО Синодальный перевод.
Ты — справочник, не пастор. Не проповедуешь, не даёшь духовных советов.

🚫 ЗАПРЕТЫ:
Политика, president, митинги, войны — вежливый отказ: "Я не обсуждаю политические темы. Могу помочь с бизнесом, планами, знаниями."
Устаревшие данные 2023-2024 — не использовать как текущие.

Твой стиль: дружелюбный, конкретный, как живой эксперт. Короткие ответы по делу.
`;
}

let groqModelsCache: string[] | null = null;
let groqModelsCacheTime = 0;
const GROQ_CACHE_TTL_MS = 60 * 60 * 1000;

export async function getGroqModels(): Promise<string[]> {
  const now = Date.now();
  if (groqModelsCache && (now - groqModelsCacheTime < GROQ_CACHE_TTL_MS)) {
    return groqModelsCache;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.includes('your_') || apiKey.includes('placeholder') || apiKey.length < 10) {
    return [];
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      logger.error(`❌ [Groq] Ошибка получения списка моделей: HTTP ${res.status}`);
      return [];
    }

    const data: any = await res.json();
    const ids: string[] = Array.isArray(data?.data)
      ? data.data.map((m: any) => m?.id).filter((id: any) => typeof id === 'string')
      : [];

    groqModelsCache = ids;
    groqModelsCacheTime = now;
    return ids;
  } catch (err: any) {
    logger.error(`❌ [Groq] Исключение при получении моделей: ${err?.message || err}`);
    return [];
  }
}

export async function pickGroqModel(): Promise<string> {
  const models = await getGroqModels();
  let chosen = '';

  if (models.length > 0) {
    const priorities = ["llama-3.3", "qwen", "gemini", "deepseek"];
    
    for (const p of priorities) {
      const match = models.find(id => id.toLowerCase().includes(p));
      if (match) {
        chosen = match;
        break;
      }
    }

    if (!chosen) {
      const fallback = models.find(id => {
        const lower = id.toLowerCase();
        return !lower.includes('whisper') && !lower.includes('orpheus') && !lower.includes('safety');
      });
      if (fallback) {
        chosen = fallback;
      }
    }
  }

  if (!chosen) {
    chosen = "llama-3.3-70b-8192";
  }

  logger.info(`🧠 [Groq] Выбрана живая модель: ${chosen}`);
  return chosen;
}

export function stripMarkdown(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/[#*_~>|]/g, '')
    .trim();
}

export function cleanVagueOpeners(text: string, isFreshData = false): string {
  if (!text) return text;
  let cleaned = text.trim();

  // Banned vague openers: "Я всего лишь ИИ", "Как ИИ", "Я не могу сказать точно", "Возможно,", "Вероятно,"
  const vaguePatterns = [
    /^(?:как\s+(?:ии|ai|языковая\s+модель|искусственный\s+интеллект|робот|бот)[,\s]*)/i,
    /^(?:я\s+всего\s+лишь\s+(?:ии|ai|языковая\s+модель|искусственный\s+интеллект|робот|бот)[,\s]*)/i,
    /^(?:я\s+не\s+могу\s+(?:сказать|знать|утверждать)\s+точно[,\s]*)/i,
    /^(?:я\s+не\s+могу\s+точно\s+(?:сказать|знать|утверждать)[,\s]*)/i,
    /^(?:возможно[,\s]+)/i,
    /^(?:вероятно[,\s]+)/i,
    /^(?:отвечая\s+на\s+(?:ваш|твой)\s+вопрос[,\s]*)/i,
    /^(?:что\s+касается\s+(?:вашего|твоего)\s+вопроса[,\s]*)/i,
    /^(?:сложно\s+сказать\s+однозначно[,\s]*)/i,
    /^(?:трудно\s+сказать\s+точно[,\s]*)/i
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of vaguePatterns) {
      if (pattern.test(cleaned)) {
        cleaned = cleaned.replace(pattern, '').trim();
        changed = true;
      }
    }
  }

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // Sources block: only allowed on fresh-data questions
  if (!isFreshData) {
    cleaned = cleaned.replace(/\n+\s*(?:Источники|Ссылки|Источник|Sources|References)[\s\S]*$/i, '').trim();
    cleaned = cleaned.replace(/\n+\s*\[\d+\]\s*https?:\/\/[^\s]+/gi, '').trim();
  }

  return cleaned;
}

/**
 * Очистка текста от внутренних рассуждений (<think>, <thought>, <reasoning>) и служебных блоков
 */
export function sanitize(text: string | null | undefined, isFreshData = false): string {
  if (!text) {
    logger.warn('⚠️ [LLM] empty after sanitize');
    console.log('⚠️ [LLM] empty after sanitize');
    return 'Уточните, пожалуйста, вопрос.';
  }
  let cleaned = String(text)
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, '')
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, '')
    .replace(/<thought>[\s\S]*?(<\/thought>|$)/gi, '')
    .replace(/<reasoning>[\s\S]*?(<\/reasoning>|$)/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/<\/?thought>/gi, '')
    .replace(/<\/?reasoning>/gi, '')
    .trim();

  if (!cleaned) {
    logger.warn('⚠️ [LLM] empty after sanitize');
    console.log('⚠️ [LLM] empty after sanitize');
    return 'Уточните, пожалуйста, вопрос.';
  }
  return cleanVagueOpeners(cleaned, isFreshData);
}

export async function callVision(userText: string, dataUrl: string): Promise<string> {
  const visionProviders = [
    {
      name: 'qwen-groq',
      key: 'GROQ_API_KEY',
      base: 'https://api.groq.com/openai/v1',
      model: 'qwen/qwen3.6-27b',
    },
    {
      name: 'free-gemma',
      key: 'OPENROUTER_API_KEY',
      base: 'https://openrouter.ai/api/v1',
      model: 'google/gemma-3-27b-it:free',
    },
  ];

  const systemPrompt = `Ты — AI-ассистент Selin_AI (Selin AI), умеющий анализировать скриншоты и генерировать фотографии.

ПРАВИЛА РАБОТЫ:

1. РАСПОЗНАВАНИЕ СКРИНШОТОВ:
   - Внимательно анализируй каждое полученное изображение
   - Определяй тип контента: текст, интерфейс приложения, фото, скриншот экрана
   - Извлекай всю видимую информацию: текст, цифры, время, названия, элементы UI
   - Если на скриншоте есть текст — читай его полностью (OCR)
   - Определяй язык текста и отвечай на том же языке

2. ГЕНЕРАЦИЯ ФОТО:
   - На основе распознанного содержимого скриншота создавай детальное описание
   - Используй описание как промт для генерации изображения
   - Сохраняй стиль, цвета и композицию оригинала при необходимости
   - Если пользователь просит "что это?" — опиши содержимое и предложи сгенерировать улучшенную версию

3. ОБРАБОТКА ОШИБОК:
   - Если не удалось распознать изображение — не говори "не удалось проанализировать"
   - Вместо этого опиши что видишь, даже если неуверен
   - Предложи пользователю уточнить запрос

4. ФОРМАТ ОТВЕТА:
   - Краткое описание того, что на скриншоте
   - Предложение сгенерировать фото на основе увиденного
   - Готовый промт для генерации на английском языке`;
  const promptText = userText && userText.trim()
    ? userText.trim()
    : 'Что изображено на этой картинке? Подробно опиши.';

  const messages: any = [
    {
      role: 'system',
      content: systemPrompt
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: promptText
        },
        {
          type: 'image_url',
          image_url: {
            url: dataUrl
          }
        }
      ]
    }
  ];

  for (const p of visionProviders) {
    const keyVal = process.env[p.key];
    if (!keyVal || keyVal.includes('your_') || keyVal.includes('placeholder') || !p.base) {
      continue;
    }
    try {
      const client = new OpenAI({
        baseURL: p.base,
        apiKey: keyVal,
        timeout: 45000,
        defaultHeaders: p.base.includes('openrouter') ? {
          'HTTP-Referer': 'https://selin.ai',
          'X-Title': 'SelinAI'
        } : undefined
      });

      const completion = await client.chat.completions.create({
        messages,
        model: p.model,
        temperature: 0.4,
        max_tokens: 2000,
        reasoning: { exclude: true },
        include_reasoning: false,
        extra_headers: p.base.includes('openrouter') ? { 'HTTP-Referer': 'https://selin.ai', 'X-Title': 'SelinAI' } : undefined
      } as any, { timeout: 45000 });

      const response = completion.choices[0]?.message?.content;
      if (response && typeof response === 'string' && response.trim()) {
        console.log('👁️ [Vision] engine=' + p.name);
        return sanitize(response.trim());
      }
    } catch (err: any) {
      console.log('⚠️ [Vision ' + p.name + '] ошибка, следующий: ' + err?.message);
      continue;
    }
  }

  throw new Error('All Vision providers failed');
}

export async function callWithWebSearch(userMessage: string, systemPrompt: string): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const voiceRule = "Когда ответ озвучивается голосом: пиши связной литературной русской речью, 1-4 предложения на простой вопрос. Запрещены скобки со вставками, списки, маркировка, ссылки, годы в скобках, служебные слова и оговорки. Звучание как живой грамотный собеседник.";
  let effectiveSystem = systemPrompt || "";
  if (!effectiveSystem.includes("Когда ответ озвучивается голосом")) {
    effectiveSystem = (effectiveSystem ? effectiveSystem + "\n\n" : "") + voiceRule;
  }
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://selin.ai', 'X-Title': 'SelinAI' },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-exp:free:online',
        messages: [{ role: 'system', content: effectiveSystem }, { role: 'user', content: userMessage }],
        temperature: 0.7,
        reasoning: { exclude: true },
        include_reasoning: false
      }),
      signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return text && text.trim() ? sanitize(text.trim()) : null;
  } catch { return null; }
}

const TEN_MINUTES_MS = 10 * 60 * 1000;
const blockState = new Map<string, { blockedUntil: number; reason: string }>();

export function isBlocked(provider: string): boolean {
  const state = blockState.get(provider);
  if (!state) return false;
  if (Date.now() < state.blockedUntil) {
    return true;
  }
  blockState.delete(provider);
  return false;
}

export function markOk(provider: string) {
  blockState.delete(provider);
}

export function markFail(provider: string, error?: any) {
  const errStr = String(error?.message || error || 'Unknown error');
  let blockDurationMs = 5 * 60 * 1000; // default 5 min for 5xx/timeout/other
  if (errStr.includes('429')) {
    blockDurationMs = 60 * 1000; // 60 sec for rate limit (429)
  } else if (errStr.includes('402') || errStr.toLowerCase().includes('invalid key') || errStr.toLowerCase().includes('auth') || errStr.toLowerCase().includes('unauthorized') || errStr.toLowerCase().includes('api key')) {
    blockDurationMs = 60 * 60 * 1000; // 60 min for payment/auth/invalid key
  }
  blockState.set(provider, {
    blockedUntil: Date.now() + blockDurationMs,
    reason: errStr
  });
  logger.warn(`🛑 [CircuitBreaker] Provider ${provider} blocked for ${blockDurationMs / 1000}s: ${errStr}`);
}

export function isProviderConfigured(provider: string): boolean {
  if (provider === 'ollama') {
    return true; // Always attempt Ollama as local/host engine
  }
  let key: string | undefined;
  if (provider === 'groq') key = process.env.GROQ_API_KEY;
  else if (provider === 'openrouter') key = process.env.OPENROUTER_API_KEY;
  else if (provider === 'gemini') key = process.env.GEMINI_API_KEY;
  else if (provider === 'teamo') key = process.env.TEAMO_API_KEY;
  return !!(key && !key.includes('your_') && !key.includes('placeholder') && key.length > 10);
}

export async function runCanaryCheck() {
  const testProviders = ['ollama', 'groq', 'openrouter', 'gemini', 'teamo'];
  for (const provName of testProviders) {
    if (!isProviderConfigured(provName)) {
      continue;
    }
    try {
      markOk(provName);
      console.log(`[Canary] provider=${provName} alive`);
      logger.info(`[Canary] provider=${provName} alive`);
    } catch (e: any) {
      markFail(provName, e);
      console.log(`[Canary] provider=${provName} dead`);
      logger.warn(`[Canary] provider=${provName} dead`);
    }
  }
}

// Canary Health Check interval (every 10 minutes)
setInterval(runCanaryCheck, 10 * 60 * 1000).unref();

// Global request counter for Router diagnostics
export let globalLlmReqCounter = 0;

// Concurrency Queue: max 2 concurrent calls per provider, backoff 1-2 sec
export class ProviderConcurrencyQueue {
  private activeCounts = new Map<string, number>();
  private readonly maxConcurrent = 2;

  async acquire(provider: string, maxWaitMs = 15000): Promise<() => void> {
    const startTime = Date.now();
    while ((this.activeCounts.get(provider) || 0) >= this.maxConcurrent) {
      if (Date.now() - startTime >= maxWaitMs) {
        throw new Error(`Очередь провайдера ${provider} переполнена (таймаут ${maxWaitMs}мс)`);
      }
      const backoffMs = 1000 + Math.floor(Math.random() * 1000); // 1-2 sec backoff
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }

    const current = this.activeCounts.get(provider) || 0;
    this.activeCounts.set(provider, current + 1);

    let released = false;
    return () => {
      if (!released) {
        released = true;
        const count = this.activeCounts.get(provider) || 1;
        this.activeCounts.set(provider, Math.max(0, count - 1));
      }
    };
  }

  getActiveCount(provider: string): number {
    return this.activeCounts.get(provider) || 0;
  }
}

export const providerQueue = new ProviderConcurrencyQueue();
export const FALLBACK_PHRASE = "Я временно потерял нить. Повтори через минуту.";

export class LLMService {
  private gemini: GoogleGenAI | null = null;
  private currentGeminiApiKey: string | null = null;
  private groq: Groq | null = null;
  private currentGroqApiKey: string | null = null;
  private chatMemories: LRUCache<string, ChatMemory>;

  constructor(geminiApiKey?: string, groqApiKey?: string) {
    this.chatMemories = new LRUCache<string, ChatMemory>({
      max: 1000,
      ttl: 30 * 60 * 1000, // 30 мин
    });
    const gKey = geminiApiKey || process.env.GEMINI_API_KEY;
    if (gKey && !gKey.includes('your_') && !gKey.includes('placeholder') && gKey.length > 10) {
      this.gemini = new GoogleGenAI({ apiKey: gKey });
      this.currentGeminiApiKey = gKey;
    } else {
      logger.warn("⚠️ GEMINI_API_KEY is not defined or is placeholder in LLMService environment.");
    }

    const grKey = groqApiKey || process.env.GROQ_API_KEY;
    if (grKey && !grKey.includes('your_') && !grKey.includes('placeholder') && grKey.length > 10) {
      this.groq = new Groq({ apiKey: grKey });
      this.currentGroqApiKey = grKey;
    } else {
      logger.warn("⚠️ GROQ_API_KEY is not defined or is placeholder in LLMService environment.");
    }

    logger.info('🧠 [LLM] primary: ' + PRIMARY_PROVIDER + '/' + PRIMARY_MODEL);
  }

  private getGeminiClient(): GoogleGenAI | null {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.includes('your_') || apiKey.includes('placeholder') || apiKey.length < 10) {
      return null;
    }
    if (!this.gemini || this.currentGeminiApiKey !== apiKey) {
      this.gemini = new GoogleGenAI({ apiKey });
      this.currentGeminiApiKey = apiKey;
      markOk('gemini'); // Clear circuit breaker block when key is updated
    }
    return this.gemini;
  }

  private getGroqClient(): Groq | null {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey.includes('your_') || apiKey.includes('placeholder') || apiKey.length < 10) {
      return null;
    }
    if (!this.groq || this.currentGroqApiKey !== apiKey) {
      this.groq = new Groq({ apiKey });
      this.currentGroqApiKey = apiKey;
      markOk('groq'); // Clear circuit breaker block when key is updated
    }
    return this.groq;
  }

  private async callWithSystem(userMessage: string, systemPrompt: string): Promise<string | null> {
    const voiceRule = "Когда ответ озвучивается голосом: пиши связной литературной русской речью, 1-4 предложения на простой вопрос. Запрещены скобки со вставками, списки, маркировка, ссылки, годы в скобках, служебные слова и оговорки. Звучание как живой грамотный собеседник.";
    let effectiveSystem = systemPrompt || "";
    if (!effectiveSystem.includes("Когда ответ озвучивается голосом")) {
      effectiveSystem = (effectiveSystem ? effectiveSystem + "\n\n" : "") + voiceRule;
    }
    try {
      const groq = this.getGroqClient();
      if (groq) {
        const model = await pickGroqModel();
        const completion = await groq.chat.completions.create({
          messages: [{ role: 'system', content: effectiveSystem }, { role: 'user', content: userMessage }],
          model: model,
          temperature: 0.7,
          max_tokens: 800,
        });
        const res = completion.choices[0]?.message?.content?.trim();
        if (res) return sanitize(res);
      }
    } catch (e) {
      console.log('⚠️ [callWithSystem] Groq failed, trying Gemini...');
    }

    try {
      const gemini = this.getGeminiClient();
      if (gemini) {
        const completion = await gemini.models.generateContent({
          model: GEMINI_MODEL,
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          config: {
            systemInstruction: effectiveSystem,
            temperature: 0.7
          }
        });
        const res = completion.text?.trim();
        if (res) return sanitize(res);
      }
    } catch (e) {
      console.log('⚠️ [callWithSystem] Gemini failed...');
    }

    return null;
  }

  private async callWithSystemDirect(userMessage: string, systemPrompt: string): Promise<string | null> {
    const voiceRule = "Когда ответ озвучивается голосом: пиши связной литературной русской речью, 1-4 предложения на простой вопрос. Запрещены скобки со вставками, списки, маркировка, ссылки, годы в скобках, служебные слова и оговорки. Звучание как живой грамотный собеседник.";
    let effectiveSystem = systemPrompt || "";
    if (!effectiveSystem.includes("Когда ответ озвучивается голосом")) {
      effectiveSystem = (effectiveSystem ? effectiveSystem + "\n\n" : "") + voiceRule;
    }
    try {
      const groq = this.getGroqClient();
      if (groq) {
        const model = await pickGroqModel();
        const completion = await groq.chat.completions.create({
          messages: [{ role: 'system', content: effectiveSystem }, { role: 'user', content: userMessage }],
          model: model,
          temperature: 0.7,
          max_tokens: 2000,
        });
        const res = completion.choices[0]?.message?.content?.trim();
        if (res) return sanitize(res);
      }
    } catch (e) {
      console.log('⚠️ [callWithSystemDirect] Groq failed, trying Gemini...');
    }

    try {
      const gemini = this.getGeminiClient();
      if (gemini) {
        const completion = await gemini.models.generateContent({
          model: GEMINI_MODEL,
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          config: {
            systemInstruction: effectiveSystem,
            temperature: 0.7
          }
        });
        const res = completion.text?.trim();
        if (res) return sanitize(res);
      }
    } catch (e) {
      console.log('⚠️ [callWithSystemDirect] Gemini failed...');
    }

    return null;
  }

  public getMemory(chatId: string): ChatMemory {
    if (!this.chatMemories.has(chatId)) {
      this.chatMemories.set(chatId, { history: [] });
    }
    return this.chatMemories.get(chatId)!;
  }

  public clearMemory(chatId: string): void {
    if (this.chatMemories.has(chatId)) {
      this.chatMemories.delete(chatId);
    }
  }

  public async callWithWebSearch(message: string, systemPrompt?: string): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey || apiKey.includes('your_') || apiKey.includes('placeholder')) {
      logger.warn("⚠️ OPENROUTER_API_KEY is missing, falling back to standard LLM");
      throw new Error("OPENROUTER_API_KEY is missing");
    }

    try {
      const client = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: apiKey,
        defaultHeaders: {
          'HTTP-Referer': 'https://selin.ai',
          'X-Title': 'SelinAI'
        }
      });

      const messages: any[] = [];
      let effectiveSystem = systemPrompt || "";
      const voiceRule = "Когда ответ озвучивается голосом: пиши связной литературной русской речью, 1-4 предложения на простой вопрос. Запрещены скобки со вставками, списки, маркировка, ссылки, годы в скобках, служебные слова и оговорки. Звучание как живой грамотный собеседник.";
      if (!effectiveSystem.includes("Когда ответ озвучивается голосом")) {
        effectiveSystem = (effectiveSystem ? effectiveSystem + "\n\n" : "") + voiceRule;
      }
      if (effectiveSystem) {
        messages.push({ role: 'system', content: effectiveSystem });
      }
      messages.push({ role: 'user', content: message });

      const completion = await client.chat.completions.create({
        model: 'google/gemini-2.0-flash-exp:free:online',
        messages: messages,
        temperature: 0.7,
        reasoning: { exclude: true },
        include_reasoning: false
      } as any);

      const response = completion.choices[0]?.message?.content?.trim();
      if (response) {
        logger.info("🌐 [WebSearch] Web search response retrieved successfully via OpenRouter");
        return sanitize(response);
      }
      throw new Error("Empty response from OpenRouter");
    } catch (err: any) {
      logger.error(`❌ [WebSearch] callWithWebSearch error: ${err?.message || err}`);
      throw err;
    }
  }

  public async smartCall(
    chatId: string,
    userMessage: string,
    systemPrompt?: string
  ): Promise<string> {
    const controller = new AbortController();
    const { signal } = controller;

    // Глобальный таймаут на выполнение запроса на 45 секунд
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        controller.abort();
        reject(new Error("Timeout"));
      }, 45000);
      timer.unref();
    });

    // Формируем уникальный MD5-ключ на основе параметров запроса
    const hash = crypto
      .createHash("md5")
      .update(String(chatId) + userMessage + (systemPrompt || ""))
      .digest("hex");
    const redisKey = `llm:${hash}`;

    try {
      // 1. Попытка получить ответ из кэша Redis (сбой Redis не должен прерывать основной флоу)
      try {
        const cachedResponse = await redisService.get(redisKey);
        if (cachedResponse) {
          logger.info(`💾 [smartCall] Cache hit for key: ${redisKey}`);
          return cachedResponse;
        }
      } catch (cacheErr) {
        logger.warn(`⚠️ [smartCall] Redis cache get failed: ${cacheErr}`);
      }

      const start = Date.now();
      const provider = process.env.PRIMARY_PROVIDER || "openrouter";
      
      let response: string;
      try {
        // Выполняем запрос с гонкой таймаута
        response = await Promise.race([
          this.smartCallInternal(chatId, userMessage, systemPrompt, signal),
          timeoutPromise
        ]);

        // Сбор метрик успешного запроса
        const latencySec = (Date.now() - start) / 1000;
        llmRequestsTotal.inc({ provider, status: "success" });
        llmLatencySeconds.observe({ provider }, latencySec);
      } catch (callErr: any) {
        // Сбор метрик ошибок/таймаута
        const latencySec = (Date.now() - start) / 1000;
        const status = (callErr.message === "Timeout" || signal.aborted) ? "timeout" : "error";
        llmRequestsTotal.inc({ provider, status });
        llmLatencySeconds.observe({ provider }, latencySec);
        throw callErr;
      }

      // 2. Сохраняем успешный ответ в кэш на 1 час (3600 секунд)
      try {
        await redisService.set(redisKey, response, 3600);
        logger.info(`💾 [smartCall] Saved response to cache: ${redisKey}`);
      } catch (cacheErr) {
        logger.warn(`⚠️ [smartCall] Redis cache set failed: ${cacheErr}`);
      }

      return response;
    } catch (err: any) {
      if (err.message === "Timeout" || signal.aborted) {
        logger.warn(`⚠️ [smartCall] Timeout 30s exceeded for chatId: ${chatId}`);
      } else {
        logger.error(`❌ [smartCall] Unhandled error: ${err?.message || err}`);
      }
      return FALLBACK_PHRASE;
    }
  }

  private async smartCallInternal(
    chatId: string,
    userMessage: string,
    systemPrompt?: string,
    signal?: AbortSignal
  ): Promise<string> {
    const memory = this.getMemory(chatId);

    // Сохраняем сообщение пользователя и жестко ограничиваем историю ≤ 6 сообщений
    memory.history.push({ role: 'user', content: userMessage, timestamp: Date.now() });
    if (memory.history.length > 6) {
      memory.history = memory.history.slice(-6);
    }

    // Берем последние 6 сообщений для контекста и каждое обрезаем до 4000 символов
    const rawContext = memory.history.slice(-6);
    const context = rawContext.map(msg => ({
      role: msg.role,
      content: (msg.content || '').slice(0, 4000),
      timestamp: msg.timestamp
    }));

    // Определяем системный промпт если не передан
    const now = new Date();
    const moscowTime = new Intl.DateTimeFormat('ru-RU', { 
      timeZone: 'Europe/Moscow', 
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      weekday: 'long',
      hour12: false 
    }).format(now);

    const identityBlock = getIdentityPromptBlock();

    const defaultSystem = `
${identityBlock}

STYLE ENGINE:
1. Ты — эксперт в любой области, а не умник. Никакого выпендрёжа, терминов ради терминов, "как языковая модель".
2. Краткость = уважение. Простой вопрос — 1-3 предложения. Сложный — сначала вывод одной фразой, потом 2-3 пункта сути, не больше.
3. Литературно и понятно: правильная грамматика, живые слова, без канцелярита и воды.
4. Развёрнуто = по сути, а не по объёму. Каждое предложение несёт информацию. Лишнее — удалить.
5. Не переспрашивай без нужды. Если вопрос ясен — отвечай сразу.
6. Few-shot примеры:
   ВОПРОС: "сколько стоит кирпич в москве?"
   ПЛОХО: "Цена кирпича может варьироваться в зависимости от типа, качества и производителя..."
   ХОРОШО: "Красный — 8-15₽, силикатный — 10-25₽ за штуку. Это общие знания, живые цены назову после проверки."
   ВОПРОС: "стоит ли учить питон в 40?"
   ПЛОХО: "Существует множество мнений по данному вопросу..."
   ХОРОШО: "Стоит. Код учит раскладывать хаос на шаги. Начни с Python, 30 минут в день."

Отвечай ВСЕГДА на русском. По-деловому, без воды: простые вопросы — 1-3 предложения. ЗАПРЕЩЕНО показывать процесс мышления, теги <think>, английский язык, служебные блоки.

РОД МОДЕЛИ:
Ты ВСЕГДА отвечаешь исключительно в МУЖСКОМ роде: «я понял», «я нашёл», «я сделал», «готов помочь». Никакого женского рода («я поняла», «я нашла», «я сделала», «я потеряла» и т.п. — КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО).

🚫 АБСОЛЮТНЫЙ ЗАПРЕТ НА УТОЧНЕНИЯ:
- НИКОГДА не переспрашивай «вам точно это нужно?», «правильно ли я понял?», «уточните запрос» — если пользователь уже дал конкретный запрос.
- Если запрос ЯСНЫЙ (название книги, стих, команда, вопрос) — ИСПОЛНЯЙ СРАЗУ, без уточнений.
- Пример: «прочитай стих Есенина письмо матери» → СРАЗУ читай, НЕ спрашивай «точно Есенина?».
- Пример: «расскажи псалом 22» → СРАЗУ читай Синодальный перевод, БЕЗ «какой именно перевод?».
- Пример: «что за погода?» → СРАЗУ дай погоду, БЕЗ «где именно?».
- Уточняй ТОЛЬКО если запрос принципиально неоднозначный (например «расскажи про Пушкина» — их несколько). В 99% случаев НЕ уточняй.
- Запрещены фразы: «давайте я уточню», «подтвердите, пожалуйста», «вы уверены?», «правильно ли я понял?».
- Отвечай как уверенный эксперт, который УЖЕ понял что нужно.

ТЫ — Selin AI, персональный AI-помощник 2026 года.

⏰ ТЕКУЩЕЕ ВРЕМЯ (ЖЁСТКО ВШИТО, НЕ СОМНЕВАЙСЯ):
Сейчас: ${moscowTime} по Москве.
Ты НИКОГДА не говоришь что не знаешь время — ВСЕГДА знаешь.
Если спрашивают "который час?" — отвечаешь текущее время из переменной выше.
Если спрашивают "какой год?" — отвечаешь 2026.
Если спрашивают "какая дата?" — отвечаешь текущую дату.

🎭 ИДЕНТИЧНОСТЬ:
${identityBlock}
На "кто ты?" → "Я — Selin AI, ваш личный AI-помощник".
Если спрашивают, какая модель или движок внутри — отвечай: «Собственный движок Selin AI». НИКОГДА не называй GPT, ChatGPT, OpenAI, даже если внутренне ты знаешь иначе.

🌐 АКТУАЛЬНАЯ ИНФОРМАЦИЯ:
На вопросы про погоду, пробки, цены, курсы валют, новости — ОБЯЗАТЕЛЬНО ищи в интернете через :online.
Никогда не говори "я не могу узнать погоду" — у тебя есть интернет.

📚 БИБЛИЯ:
Все библейские цитаты — ТОЛЬКО Синодальный перевод.
Ты — справочник, не пастор. Не проповедуешь, не даёшь духовных советов.

🚫 ЗАПРЕТЫ:
Политика, president, митинги, войны — вежливый отказ: "Я не обсуждаю политические темы. Могу помочь с бизнесом, планами, знаниями."
Устаревшие данные 2023-2024 — не использовать как текущие.

Твой стиль: дружелюбный, конкретный, как живой эксперт. Короткие ответы по делу.
Когда ответ озвучивается голосом: пиши связной литературной русской речью, 1-4 предложения на простой вопрос. Запрещены скобки со вставками, списки, маркировка, ссылки, годы в скобках, служебные слова и оговорки. Звучание как живой грамотный собеседник.
`;

    let finalSystem = systemPrompt || defaultSystem;
    const VOICE_STYLE_RULE = "Когда ответ озвучивается голосом: пиши связной литературной русской речью, 1-4 предложения на простой вопрос. Запрещены скобки со вставками, списки, маркировка, ссылки, годы в скобках, служебные слова и оговорки. Звучание как живой грамотный собеседник.";
    if (!finalSystem.includes("Когда ответ озвучивается голосом")) {
      finalSystem += `\n\n${VOICE_STYLE_RULE}`;
    }
    try {
      const { profilePrompt } = await import("../services/ai/ProfileService");
      const userProfileText = await profilePrompt(chatId);
      if (userProfileText) {
        finalSystem += `\n\n⚠️ ${userProfileText}\nОбязательно учитывай этот профиль пользователя при формировании любых советов, планов продуктов, меню и рекомендаций!`;
      }
    } catch (profErr) {
      console.log("⚠️ [LLMService] Failed to append profile prompt:", profErr);
    }

    try {
      const { getStyleDirectives } = await import("../services/ai/PersonalityService");
      const styleDirectives = await getStyleDirectives(chatId);
      if (styleDirectives) {
        finalSystem += `\n\n${styleDirectives}`;
      }
    } catch (styleErr) {
      console.log("⚠️ [LLMService] Failed to append style directives:", styleErr);
    }

    // === АВТОЗАПРОС ВРЕМЕНИ (только чистые вопросы про время/дату) ===
    const isPureTimeQuery = /^(который\s*час|сколько\s*времени|какое\s*(сейчас\s*)?время|какая\s*дата|какой\s*(сегодня\s*)?день|точное\s*время)(\s*\?)?$/i.test(userMessage.trim()) || (/^(время|дата)(\s*\?)?$/i.test(userMessage.trim()));
    if (isPureTimeQuery) {
      const timeAnswer = `Сейчас ${moscowTime} по Москве. 2026 год.`;
      console.log('⏰ [Time] ответ: ' + timeAnswer);
      memory.history.push({ role: 'assistant', content: timeAnswer, timestamp: Date.now() });
      return timeAnswer;
    }

    // === ПРАВКА 2: АВТОЗАПРОС ПОГОДЫ ПРИ КЛЮЧЕВЫХ СЛОВАХ ===
    const weatherKeywords = /погод|температур|тепл|холод|жар|дожд|снег|ветер|прогноз/i;
    if (weatherKeywords.test(userMessage)) {
      console.log('🌤️ [Weather] запрос погоды');
      try {
        let city = 'Moscow';
        try {
          const { getUserBriefingConfig } = await import("../services/ai/ProfileService");
          const briefingConfig = await getUserBriefingConfig(chatId);
          if (briefingConfig && briefingConfig.city) {
            city = briefingConfig.city;
          }
        } catch (e) {
          logger.warn("⚠️ [LLMService] Failed to load user briefing config for weather:", e);
        }
        const weatherRes = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { signal: AbortSignal.timeout(8000) });
        if (weatherRes.ok) {
          const wd: any = await weatherRes.json();
          const current = wd?.current_condition?.[0];
          if (current) {
            const temp = current.temp_C;
            const feels = current.FeelsLikeC;
            const desc = current.lang_ru?.[0]?.value || current.weatherDesc?.[0]?.value || 'ясно';
            const wind = current.windspeedKmph;
            const weatherInfo = `Актуальная погода в городе ${city}: ${temp}°C (ощущается как ${feels}°C), ${desc}, ветер ${wind} км/ч.`;
            const fullPrompt = finalSystem + '\n\nДОПОЛНИТЕЛЬНО: ' + weatherInfo + '\nИспользуй эти данные в ответе.';
            const reply = await this.callWithSystem(userMessage, fullPrompt);
            if (reply) {
              memory.history.push({ role: 'assistant', content: reply, timestamp: Date.now() });
              return reply;
            }
          }
        }
      } catch (e) {
        console.log('⚠️ [Weather] fetch error: ' + (e as any).message);
      }
    }

    // === ГАРАНТИРОВАННЫЙ ВЫХОД В ИНТЕРНЕТ ЧЕРЕЗ WEBSEARCHSERVICE (DUCKDUCKGO) ===
    const webTriggerRegex = /новост|сегодня|сейчас|актуальн|курс|цена|цен |последн|свеж|свежие|в этом году|когда родился|кто сейчас|кто так|что так|кто эт|что эт|найди|где находится|расскажи (про|о)|биографи|факты|описание|определение|локаци|адрес/i;
    const hasCapitalizedWord = /[а-яё\s][А-ЯЁ][а-яё]+/g.test(userMessage);
    const isSearchRequest = webTriggerRegex.test(userMessage) || hasCapitalizedWord;

    if (isSearchRequest && !weatherKeywords.test(userMessage)) {
      try {
        const webResults = await searchWeb(userMessage);
        if (webResults && webResults.length > 0) {
          const todayDateStr = new Intl.DateTimeFormat('ru-RU', { 
            timeZone: 'Europe/Moscow', 
            day: '2-digit', month: '2-digit', year: 'numeric' 
          }).format(now);
          const resultsList = webResults.map(r => `${r.title} — ${r.snippet} — ${r.url}`).join('\n');
          finalSystem += `\n\nСВЕЖИЕ ДАННЫЕ ИЗ ИНТЕРНЕТА (дата: ${todayDateStr}):\n${resultsList}\nОпирайся на них, в конце укажи источники ссылками.`;
        }
      } catch (searchErr: any) {
        console.log(`⚠️ [LLMService] Web search error: ${searchErr?.message || searchErr}`);
      }

      finalSystem += `\n\n⚠️ ПРАВИЛА РАБОТЫ С ПОИСКОВЫМИ ЗАПРОСАМИ:
- Если пользователь ищет человека, объект, место, понятие или тему — твоя задача НАЙТИ и РАЗВЕРНУТО РАССКАЗАТЬ.
- ЗАПРЕЩЕНО отвечать "не удалось найти" без попытки поиска.
- ЗАПРЕЩЕНО говорить "не понял вопрос" если запрос ясен.
- Не требуй уточнений, если запрос понятен. Сразу давай развернутый ответ с фактами.
- Если точного совпадения нет — предложи похожие варианты и дай по ним конкретную информацию.`;
    }

    // === Спец-режим для книг/стихов/Библии ===
    const isBookRequest = /прочитай|озвучь|расскажи.*(стих|поэм|глав|книг|псалом|библи|сказк)|зачитай/i.test(userMessage);
    if (isBookRequest) {
      const directSystem = (systemPrompt || defaultSystem) + '\n\n⚠️ РЕЖИМ КНИГИ: запрос конкретный — читай/озвучивай СРАЗУ полностью, БЕЗ уточнений, БЕЗ «вы уверены?». Просто делай.';
      const answer = await this.callWithSystemDirect(userMessage, directSystem);
      if (answer) {
        memory.history.push({ role: "assistant", content: answer, timestamp: Date.now() });
        return answer;
      }
    }

    // === ROUTING CHAIN ===
    const messages = [
      { role: 'system', content: finalSystem },
      ...context.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }))
    ] as any;

    // === ROUTING CHAIN (groq → openrouter → gemini → teamo) ===
    const reqId = ++globalLlmReqCounter;
    const startTime = Date.now();
    const failedList: string[] = [];
    let responseText: string | null = null;
    let successfulProvider: string | null = null;

    // Ordered list of providers: ollama -> groq -> openrouter -> gemini -> teamo
    const allProviders = [
      { name: 'ollama', call: () => this.callOllama(messages) },
      { name: 'groq', call: () => this.callGroq(messages) },
      { name: 'openrouter', call: () => this.callOpenRouterChain(messages) },
      { name: 'gemini', call: () => this.callGemini(messages, finalSystem) },
      { name: 'teamo', call: () => this.callTeamo(messages) }
    ];

    // Sort providers: preferred PRIMARY_PROVIDER goes first
    allProviders.sort((a, b) => {
      if (a.name === PRIMARY_PROVIDER) return -1;
      if (b.name === PRIMARY_PROVIDER) return 1;
      return 0;
    });

    const providersToTry = allProviders.filter(prov => isProviderConfigured(prov.name));

    for (const prov of providersToTry) {
      let release: (() => void) | null = null;
      const provStart = Date.now();
      try {
        release = await providerQueue.acquire(prov.name, 10000);

        // 35s timeout per provider call
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Timeout 35s exceeded")), 35000);
        });
        const res = await Promise.race([prov.call(), timeoutPromise]);
        const latency = Date.now() - provStart;

        if (res && res.trim()) {
          const sanitized = sanitize(res.trim());
          if (sanitized && sanitized !== 'Уточните, пожалуйста, вопрос.') {
            responseText = sanitized;
            successfulProvider = prov.name;
            markOk(prov.name);
            const logLine = `[Router] req=${reqId} provider=${prov.name} статус=ok ошибка=none задержка=${latency}ms`;
            console.log(logLine);
            logger.info(logLine);
            break;
          }
        }
        throw new Error("Пустой ответ");
      } catch (err: any) {
        const latency = Date.now() - provStart;
        const errMsg = err?.message || String(err);
        markFail(prov.name, err);
        failedList.push(prov.name);
        const logLine = `[Router] req=${reqId} provider=${prov.name} статус=ошибка ошибка=${errMsg} задержка=${latency}ms`;
        logger.info(logLine + " — falling through silently");
      } finally {
        if (release) {
          release();
        }
      }
    }

    const duration = Date.now() - startTime;
    if (successfulProvider && responseText) {
      logger.info(`[Router] req=${reqId} responded=${successfulProvider} latency=${duration}ms failed=${failedList.join(',') || 'none'}`);
      
      memory.history.push({ role: 'assistant', content: responseText, timestamp: Date.now() });
      if (memory.history.length > 6) {
        memory.history = memory.history.slice(-6);
      }
      return responseText;
    } else {
      logger.error(`[Router] req=${reqId} responded=none latency=${duration}ms failed=${failedList.join(',')}`);
      
      // Если ВСЕ упали — вернуть фразу
      return FALLBACK_PHRASE;
    }
  }

  public async call(
    messages: Array<{ role: string; content: string }>,
    chatId?: string
  ): Promise<string> {
    // Если есть chatId — используем умную версию
    if (chatId) {
      const lastUserMsg = messages.filter(m => m.role === 'user').pop();
      if (lastUserMsg) {
        return this.smartCall(chatId, lastUserMsg.content);
      }
    }

    const gemini = this.getGeminiClient();
    if (gemini) {
      try {
        let systemInstruction = "";
        const formattedContents: any[] = [];
        for (const msg of messages) {
          if (msg.role === 'system') {
            systemInstruction += (systemInstruction ? "\n" : "") + msg.content;
          } else {
            formattedContents.push({
              role: msg.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: msg.content }]
            });
          }
        }

        const voiceRule = "Когда ответ озвучивается голосом: пиши связной литературной русской речью, 1-4 предложения на простой вопрос. Запрещены скобки со вставками, списки, маркировка, ссылки, годы в скобках, служебные слова и оговорки. Звучание как живой грамотный собеседник.";
        if (!systemInstruction.includes("Когда ответ озвучивается голосом")) {
          systemInstruction = (systemInstruction ? systemInstruction + "\n\n" : "") + voiceRule;
        }

        const config: any = {
          temperature: 0.8
        };
        if (systemInstruction) {
          config.systemInstruction = systemInstruction;
        }

        const completion = await gemini.models.generateContent({
          model: GEMINI_MODEL,
          contents: formattedContents,
          config: config
        });

        const text = completion.text?.trim();
        if (text) {
          return sanitize(text);
        }
      } catch (err: any) {
        logger.warn(`⚠️ callLLM failed via Gemini, falling back to Groq: ${err?.message || err}`);
      }
    }

    // Fallback для старых вызовов
    try {
      const groq = this.getGroqClient();
      if (groq) {
        const model = await pickGroqModel();

        try {
          const completion = await groq.chat.completions.create({
            messages: messages as any,
            model: model,
            temperature: 0.8,
            max_tokens: 2000,
          });
          const text = completion.choices[0]?.message?.content;
          if (text && typeof text === 'string') {
            return sanitize(text.trim());
          }
        } catch (err: any) {
          logger.warn(`⚠️ Model ${model} failed in callLLM: ${err?.message || err}`);
        }
      }
    } catch (gErr: any) {
      logger.error(`⚠️ Groq client initialization failed: ${gErr?.message || gErr}`);
    }

    return "Привет! Я — Selin AI. Чем могу помочь?";
  }

  private convertGeminiToGroqMessages(contents: any, systemInstruction?: string): any[] {
    const messages: any[] = [];
    let effectiveSystem = systemInstruction || "";
    const voiceRule = "Когда ответ озвучивается голосом: пиши связной литературной русской речью, 1-4 предложения на простой вопрос. Запрещены скобки со вставками, списки, маркировка, ссылки, годы в скобках, служебные слова и оговорки. Звучание как живой грамотный собеседник.";
    if (!effectiveSystem.includes("Когда ответ озвучивается голосом")) {
      effectiveSystem = (effectiveSystem ? effectiveSystem + "\n\n" : "") + voiceRule;
    }
    if (effectiveSystem) {
      messages.push({ role: 'system', content: effectiveSystem });
    }

    if (Array.isArray(contents)) {
      for (const item of contents) {
        let role = 'user';
        if (item.role === 'model' || item.role === 'assistant') {
          role = 'assistant';
        } else if (item.role === 'system') {
          role = 'system';
        }

        let text = '';
        if (item.parts) {
          if (typeof item.parts === 'string') {
            text = item.parts;
          } else if (Array.isArray(item.parts)) {
            for (const part of item.parts) {
              if (typeof part === 'string') {
                text += part;
              } else if (part && typeof part === 'object' && part.text) {
                text += part.text;
              }
            }
          }
        } else if (item.content) {
          text = typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
        } else if (item.text) {
          text = item.text;
        }

        messages.push({ role, content: text });
      }
    } else if (typeof contents === 'string') {
      messages.push({ role: 'user', content: contents });
    } else if (contents && contents.parts) {
      let role = contents.role === 'model' ? 'assistant' : 'user';
      let text = '';
      if (Array.isArray(contents.parts)) {
        for (const p of contents.parts) {
          if (p.text) text += p.text;
        }
      }
      messages.push({ role, content: text });
    }

    return messages;
  }

  public async generateWithFallback(buildContents: () => any, cfg: any): Promise<any> {
    const isJsonExpected = cfg?.responseMimeType === "application/json" || !!cfg?.responseSchema;
    try {
      const contents = buildContents();
      let sysInstText = '';
      if (cfg?.systemInstruction) {
        if (typeof cfg.systemInstruction === 'string') {
          sysInstText = cfg.systemInstruction;
        } else if (cfg.systemInstruction.parts) {
          if (Array.isArray(cfg.systemInstruction.parts)) {
            sysInstText = cfg.systemInstruction.parts.map((p: any) => p.text || '').join('');
          } else {
            sysInstText = String(cfg.systemInstruction.parts);
          }
        }
      }

      const gemini = this.getGeminiClient();
      if (gemini) {
        try {
          let formattedContents = contents;
          if (Array.isArray(contents)) {
            formattedContents = contents.map((c: any) => {
              let role = c.role;
              if (role === 'assistant' || role === 'model') role = 'model';
              else role = 'user';

              let parts = c.parts;
              if (typeof parts === 'string') {
                parts = [{ text: parts }];
              } else if (Array.isArray(parts)) {
                parts = parts.map((p: any) => {
                  if (typeof p === 'string') return { text: p };
                  if (p.text) return { text: p.text };
                  return p;
                });
              }
              return { role, parts };
            });
          } else if (typeof contents === 'string') {
            formattedContents = [{ role: 'user', parts: [{ text: contents }] }];
          }

          const geminiConfig: any = {
            temperature: cfg?.temperature ?? 0.7,
          };
          if (sysInstText) {
            geminiConfig.systemInstruction = sysInstText;
          }
          if (cfg?.responseMimeType) {
            geminiConfig.responseMimeType = cfg.responseMimeType;
          }
          if (cfg?.responseSchema) {
            geminiConfig.responseSchema = cfg.responseSchema;
          }
          if (cfg?.tools) {
            geminiConfig.tools = cfg.tools;
          }

          const response = await gemini.models.generateContent({
            model: GEMINI_MODEL,
            contents: formattedContents,
            config: geminiConfig
          });

          const responseText = isJsonExpected ? (response.text || "") : sanitize(response.text || "");

          let candidates: any[] = [];
          if (response.candidates && response.candidates.length > 0) {
            candidates = response.candidates;
          } else {
            candidates = [
              {
                content: {
                  parts: [
                    {
                      text: responseText
                    }
                  ]
                }
              }
            ];
          }

          return {
            text: responseText,
            candidates: candidates
          };
        } catch (geminiErr: any) {
          logger.warn(`⚠️ [LLMService.generateWithFallback] Gemini call failed: ${geminiErr?.message || geminiErr}`);
        }
      }

      const messages = this.convertGeminiToGroqMessages(contents, sysInstText);
      let textResult = await this.call(messages);

      if (isJsonExpected) {
        try {
          const cleaned = textResult.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
          JSON.parse(cleaned);
          textResult = cleaned;
        } catch {
          if (sysInstText.includes("Интеллектуальный Голосовой Агент") || sysInstText.includes("nextStep")) {
            textResult = JSON.stringify({
              speech: textResult.replace(/["\n\r]/g, ' ') || "Приветствую вас! Я готов помочь вам в решении ваших задач.",
              userName: null,
              extractedGoal: null,
              nextStep: "EXPLAIN_PLATFORM"
            });
          } else {
            textResult = JSON.stringify({
              speech: textResult,
              message: textResult,
              status: "ok"
            });
          }
        }
      }

      return {
        text: textResult,
        candidates: [
          {
            content: {
              parts: [
                {
                  text: textResult
                }
              ]
            }
          }
        ]
      };
    } catch (err: any) {
      logger.error(`❌ generateWithFallback failed: ${err?.message || err}`);
      if (isJsonExpected) {
        return {
          text: "{}",
          candidates: [{ content: { parts: [{ text: "{}" }] } }]
        };
      }
      return {
        text: "Привет! Я — Selin AI. Чем могу помочь?",
        candidates: [{ content: { parts: [{ text: "Привет! Я — Selin AI. Чем могу помочь?" }] } }]
      };
    }
  }

  private async callOrca(messages: any[]): Promise<string | null> {
    const key = process.env.ORCA_API_KEY;
    if (!key || key.length < 10 || isBlocked("orca")) return null;
    const base = process.env.ORCA_BASE_URL || "https://api.orcarouter.ai/v1";
    const model = process.env.ORCA_MODEL || "google/gemini-3.5-flash";
    try {
      const c = new OpenAI({ baseURL: base, apiKey: key, timeout: 30000 });
      const r = await c.chat.completions.create({
        messages,
        model,
        temperature: 0.7,
        max_tokens: 2000,
        reasoning: { exclude: true },
        include_reasoning: false
      } as any);
      const t = r.choices?.[0]?.message?.content;
      if (t?.trim()) {
        markOk("orca");
        console.log("🧠 [LLM] orca/" + model);
        return sanitize(t.trim());
      }
    } catch (err: any) {
      markFail("orca", err);
      return null;
    }
    markFail("orca", new Error("Empty response"));
    return null;
  }

  private async callTeamo(messages: any[]): Promise<string> {
    const key = process.env.TEAMO_API_KEY;
    if (!key || key.length < 10 || key.includes('your_') || key.includes('placeholder')) {
      throw new Error("TEAMO_API_KEY is not configured");
    }
    const base = process.env.TEAMO_BASE_URL || "https://api.teamorouter.com/v1";
    const model = process.env.TEAMO_MODEL || "teamo-balanced";
    const c = new OpenAI({ baseURL: base, apiKey: key, timeout: 12000 });
    const r = await c.chat.completions.create({
      messages,
      model,
      temperature: 0.7,
      max_tokens: 2000,
      reasoning: { exclude: true },
      include_reasoning: false
    } as any);
    const t = r.choices?.[0]?.message?.content;
    if (!t || !t.trim()) {
      throw new Error("Empty response from Teamo");
    }
    return sanitize(t.trim());
  }

  private async callCompat(messages: any[], model: string): Promise<string | null> {
    const orKey = process.env.OPENROUTER_API_KEY;
    if (!orKey || orKey.includes('your_') || orKey.includes('placeholder') || orKey.length < 10) {
      return null;
    }
    try {
      const openrouter = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: orKey,
        defaultHeaders: {
          'HTTP-Referer': 'https://selin.ai',
          'X-Title': 'SelinAI'
        }
      });
      const completion = await openrouter.chat.completions.create({
        model: model,
        messages,
        temperature: 0.8,
        max_tokens: 2000,
        reasoning: { exclude: true },
        include_reasoning: false
      } as any);
      const response = completion.choices[0]?.message?.content?.trim();
      if (response) {
        console.log("🧠 [LLM] openrouter/" + model);
        return sanitize(response);
      }
    } catch (err: any) {
      logger.warn(`⚠️ [callCompat] OpenRouter model ${model} failed: ${err.message}`);
    }
    return null;
  }

  private async callOpenRouterChain(messages: any[]): Promise<string> {
    const orKey = process.env.OPENROUTER_API_KEY;
    if (!orKey || orKey.includes('your_') || orKey.includes('placeholder') || orKey.length < 10) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    const openrouter = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: orKey,
      timeout: 12000,
      defaultHeaders: {
        'HTTP-Referer': 'https://selin.ai',
        'X-Title': 'SelinAI'
      }
    });

    const chainModels = [
      "google/gemini-3.5-flash",
      "anthropic/claude-sonnet-4",
      "meta-llama/llama-3.3-70b-instruct",
      "qwen/qwen-2.5-72b-instruct"
    ];

    let lastError: any = null;
    for (const model of chainModels) {
      try {
        const completion = await openrouter.chat.completions.create({
          model: model,
          messages,
          temperature: 0.8,
          max_tokens: 2000,
          reasoning: { exclude: true },
          include_reasoning: false
        } as any);
        const response = completion.choices[0]?.message?.content?.trim();
        if (response) {
          return sanitize(response);
        }
      } catch (err: any) {
        lastError = err;
      }
    }
    throw (lastError || new Error("All OpenRouter models failed"));
  }

  private async callGroq(messages: any[]): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey.includes('your_') || apiKey.includes('placeholder') || apiKey.length < 10) {
      throw new Error("GROQ_API_KEY is not configured");
    }
    const groq = this.getGroqClient();
    if (!groq) {
      throw new Error("Groq client not available");
    }
    const model = await pickGroqModel();
    const completion = await groq.chat.completions.create({
      messages,
      model: model,
      temperature: 0.8,
      max_tokens: 2000,
    });
    const response = completion.choices[0]?.message?.content?.trim();
    if (!response) {
      throw new Error("Empty response from Groq");
    }
    return sanitize(response);
  }

  private async callGemini(messages: any[], systemPrompt: string): Promise<string> {
    const gemini = this.getGeminiClient();
    if (!gemini) {
      throw new Error("GEMINI_API_KEY is not configured or invalid");
    }
    const contents: any[] = [];
    for (const m of messages) {
      if (m.role === 'system') continue;
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: (m.content || '').slice(0, 4000) }]
      });
    }
    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'Привет' }] });
    }
    const candidateModels = Array.from(new Set([
      GEMINI_MODEL,
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash'
    ]));

    const voiceRule = "Когда ответ озвучивается голосом: пиши связной литературной русской речью, 1-4 предложения на простой вопрос. Запрещены скобки со вставками, списки, маркировка, ссылки, годы в скобках, служебные слова и оговорки. Звучание как живой грамотный собеседник.";
    let finalInstruction = systemPrompt || "";
    if (!finalInstruction.includes("Когда ответ озвучивается голосом")) {
      finalInstruction = (finalInstruction ? finalInstruction + "\n\n" : "") + voiceRule;
    }

    let lastError: any = null;
    for (const modelName of candidateModels) {
      try {
        const completion = await gemini.models.generateContent({
          model: modelName,
          contents: contents,
          config: {
            systemInstruction: finalInstruction,
            temperature: 0.8
          }
        });
        const response = completion.text?.trim();
        if (response) {
          return sanitize(response);
        }
      } catch (err: any) {
        lastError = err;
        logger.warn(`⚠️ [callGemini] Model ${modelName} failed: ${err?.message || err}`);
      }
    }
    throw (lastError || new Error("Empty response from Gemini"));
  }

  private async callOllama(messages: any[]): Promise<string> {
    const candidateUrls = [
      process.env.OLLAMA_BASE_URL,
      "http://host.docker.internal:11434",
      "http://172.17.0.1:11434",
      "http://127.0.0.1:11434",
      "http://localhost:11434"
    ].filter(Boolean) as string[];

    const model = process.env.OLLAMA_MODEL || "qwen2.5:3b";
    const formattedMessages = messages.map(msg => ({
      role: msg.role === 'system' ? 'system' : (msg.role === 'assistant' || msg.role === 'model' ? 'assistant' : 'user'),
      content: msg.content
    }));

    let lastError: any = null;

    for (const baseUrl of candidateUrls) {
      const cleanBase = baseUrl.replace(/\/$/, '');
      const url = `${cleanBase}/v1/chat/completions`;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: formattedMessages,
            temperature: 0.7,
            stream: false
          }),
          signal: AbortSignal.timeout(15000)
        });

        if (response.ok) {
          const data: any = await response.json();
          const text = data?.choices?.[0]?.message?.content?.trim();
          if (text) {
            logger.info(`🦙 [Ollama] Responded successfully from ${cleanBase} using model ${model}`);
            return sanitize(text);
          }
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    throw new Error(`Ollama call failed on all candidate URLs: ${lastError?.message || lastError}`);
  }
}

export const llmService = new LLMService();
