import { PureDatabase as Database } from '../../lib/pure-sqlite';
import path from 'path';
import { logger } from '../../logger';
import { LLMService, llmService } from '../../core/LLMService';

export interface ClientTrackRecord {
  id: string;
  chat_id: string;
  client_name: string;
  channel: 'telegram' | 'vk' | 'max' | 'avito' | 'instagram' | 'youtube' | 'other';
  day_of_program: number;
  status: 'active' | 'inactive';
  notes: string;
  last_topic?: string;
  sentiment?: 'Engaged' | 'Silent' | 'Confused' | 'Critical';
  updated_at: string;
}

const dbPath = path.join(process.cwd(), 'data', 'selin_data.db');
let db: any = null;

try {
  db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_clients (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      client_name TEXT NOT NULL,
      channel TEXT DEFAULT 'telegram',
      day_of_program INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      notes TEXT DEFAULT '',
      last_topic TEXT DEFAULT '',
      sentiment TEXT DEFAULT 'Engaged',
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_crm_clients_chat ON crm_clients(chat_id);
  `);
} catch (err) {
  logger.error('❌ [MarketingCRM] Failed to init crm_clients table:', err);
}

export class MarketingCRMService {
  /**
   * Анализ переписки с клиентом и дожим сделки (Sales Co-Pilot)
   */
  public static async analyzeChatAndAdvise(
    chatId: string | number,
    chatLog: string,
    clientGoal?: string
  ): Promise<{
    sentiment: string;
    riskOfChurn: string;
    bestReply: string;
    strategicAdvice: string;
  }> {
    const systemPrompt = `Ты — Главный Эксперт по продажам, дожиму сделок и удержанию клиентов в мессенджерах для бизнеса РФ (Selin Sales Co-Pilot).
Твоя задача: изучить переписку между менеджером и клиентом, определить эмоциональное состояние клиента и предложить идеальный ответ для закрытия сделки или снятия возражений.

ПРАВИЛА ОТВЕТА:
1. Оцени настроение клиента (Заинтересован / Сомневается / Молчит / Негатив).
2. Выяви скрытые страхи (Дорого, не уверен в качестве, боится обмана, сравнивает с другими).
3. Сформулируй ИДЕАЛЬНЫЙ ответ менеджера:
   - Живой русский язык без канцеляризмов.
   - Снятие страха через выгоду и конкретные факты.
   - Финальный вовлекающий вопрос, закрывающий на следующее действие (созвон, тест, оплату).
4. Дай краткий совет менеджеру на 1-2 предложения.

Верни ответ в формате:
🎭 Настроение: [кратко]
⚠️ Риск ухода: [Низкий / Средний / Высокий]
💬 Рекомендуемый ответ клиенту:
"[Текст ответа]"
💡 Совет: [Совет менеджеру]`;

    try {
      const prompt = `Контекст цели: ${clientGoal || 'Продажа и долгосрочное удержание'}\nДиалог:\n"""${chatLog}"""`;
      const response = await llmService.smartCall(chatId, prompt, systemPrompt);

      return {
        sentiment: 'Анализ завершен',
        riskOfChurn: 'Рассчитан',
        bestReply: response,
        strategicAdvice: 'Используйте предложенный скрипт для продолжения переговоров.'
      };
    } catch (err) {
      logger.error('❌ [MarketingCRM] Error analyzing chat:', err);
      return {
        sentiment: 'Не определено',
        riskOfChurn: 'Неизвестно',
        bestReply: 'Привет! Подскажи, удалось ознакомиться с предложением? Какие моменты хотелось бы уточнить?',
        strategicAdvice: 'Задайте открытый вопрос клиенту.'
      };
    }
  }

  /**
   * Генерация маркетинговой стратегии и контента (SMM & Трафик РФ)
   */
  public static async generateCampaignPlan(
    chatId: string | number,
    niche: string,
    goal: string
  ): Promise<string> {
    const systemPrompt = `Ты — Руководитель Маркетингового Роя экосистемы Selin AI.
Ты разрабатываешь практические, высококонверсионные стратегии продвижения для бизнеса РФ на любых платформах: Telegram, ВКонтакте, Авито, Instagram (органический SMM, Reels, воронки, работа с блогерами), YouTube (Shorts, автовебинары), классический контент-маркетинг и кросс-медийные воронки.

Ты глубоко понимаешь, что коммерческое продвижение в Instagram (через Reels, лид-магниты в Директ, автоворонки и инфлюенс-маркетинг) и YouTube — это мощнейшие инструменты ведения бизнеса и лидогенерации для русскоязычных предпринимателей. Ты полностью поддерживаешь и помогаешь строить стратегии, сценарии рилс/шортс, сценарии прогревов и дожимов для этих каналов.

Требования:
1. Никакой пустой теории. Только четкие цифры, воронки и тезисы.
2. Дай:
   - Позиционирование и УТП для выбранной ниши.
   - 3 темы для пробивающего контента (кейсы, боли, разоблачения).
   - Схему первого касания в переписке (лид-магнит -> диалог -> продажа).
   - План действий на ближайшие 7 дней.`;

    const userPrompt = `Ниша: ${niche}\nЦель: ${goal}`;
    return await llmService.smartCall(chatId, userPrompt, systemPrompt);
  }

  /**
   * Получение списка клиентов пользователя из CRM
   */
  public static getClients(chatId: string | number): ClientTrackRecord[] {
    if (!db) return [];
    try {
      return db.prepare('SELECT * FROM crm_clients WHERE chat_id = ? ORDER BY updated_at DESC').all(String(chatId)) as ClientTrackRecord[];
    } catch {
      return [];
    }
  }

  /**
   * Добавление/обновление клиента в CRM
   */
  public static saveClient(record: Partial<ClientTrackRecord> & { chat_id: string; client_name: string }): void {
    if (!db) return;
    try {
      const id = record.id || `crm_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT OR REPLACE INTO crm_clients (id, chat_id, client_name, channel, day_of_program, status, notes, last_topic, sentiment, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        record.chat_id,
        record.client_name,
        record.channel || 'telegram',
        record.day_of_program || 1,
        record.status || 'active',
        record.notes || '',
        record.last_topic || '',
        record.sentiment || 'Engaged',
        now
      );
    } catch (err) {
      logger.error('❌ [MarketingCRM] Error saving client:', err);
    }
  }
}
