import { BaseAgent } from './BaseAgent';
import { Task, MessageContext, AIResponse, TaskType } from '../core/types';
import { LLMService, llmService } from '../core/LLMService';
import { logger } from '../logger';

/**
 * Универсальный Агент Бизнес-Экспертизы и Стратегического Консалтинга (Enterprise Business Agent).
 * Покрывает АБСОЛЮТНО ВСЕ ключевые отрасли и бизнес-направления:
 * 1. Логистика, ВЭД, цепочки поставок и автопарки
 * 2. Розничная торговля (Retail), E-commerce, маркетплейсы (Wildberries, Ozon, Яндекс Маркет)
 * 3. Производство, промышленность, сельское хозяйство и агробизнес
 * 4. Сфера услуг, HoReCa (рестораны, кафе, гостиницы), бьюти-индустрия
 * 5. Недвижимость, девелопмент, строительство и арендный бизнес
 * 6. IT, SaaS, финтех, стартапы и цифровые платформы
 * 7. Финансы: юнит-экономика, P&L, Cash Flow, EBITDA, налоги РФ (ОСНО, УСН, ПСН)
 * 8. Маркетинг, продажи, воронки, B2B-переговоры и управление персоналом (HR)
 */
export class BusinessAgent extends BaseAgent {
  public readonly name = 'BusinessAgent';
  public readonly role = 'business';
  public readonly description = 'Универсальный финансовый директор, стратег и ментор по всем отраслям бизнеса РФ.';

  constructor(llm: LLMService = llmService) {
    super('BusinessAgent', 'Универсальный бизнес-советник и финансовый стратег.', llm);
    this.capabilities = [
      {
        name: 'universal_business_consulting',
        description: 'Расчет юнит-экономики, P&L, оптимизация издержек, стратегии роста и антикризисные планы во всех нишах',
        supportedTaskTypes: [TaskType.BUSINESS_AUTOMATION, TaskType.MARKET_RESEARCH],
        capabilities: [] as any,
        supportsVoice: true,
        supportsCamera: false,
        supportsLocation: false
      }
    ];
  }

  public canHandle(task: Task): boolean {
    if (task.type === TaskType.BUSINESS_AUTOMATION || task.type === TaskType.MARKET_RESEARCH) return true;
    const msg = (task.payload?.message || '').toLowerCase();
    const keywords = [
      'бизнес', 'стартап', 'выручк', 'прибыль', 'рентабельн', 'себестоимост', 'издержк', 'тариф',
      'маркетплейс', 'вайлдберриз', 'озон', 'wb', 'ozon', 'ритейл', 'магазин', 'товар', 'поставк',
      'производств', 'завод', 'склад', 'логистик', 'груз', 'автопарк', 'фуры', 'стройка', 'недвижим',
      'аренд', 'кафе', 'ресторан', 'общепит', 'клиент', 'продаж', 'маркетинг', 'лид', 'воронк',
      'налог', 'усн', 'осно', 'бухгалтер', 'инвестиц', 'окупаемост', 'p&l', 'ebitda', 'cash flow',
      'юнит-экономик', 'cac', 'ltv', 'персонал', 'найм', 'фот', 'мотиваци'
    ];
    return keywords.some(k => msg.includes(k));
  }

  public async process(message: string, context: MessageContext): Promise<AIResponse> {
    logger.info(`💼 [BusinessAgent] Analyzing business inquiry for ${context.chatId}: "${message.substring(0, 60)}..."`);

    const systemPrompt = `Ты — Главный Стратегический Консультант и Финансовый Директор (CFO/COO) экосистемы Selin AI.
Твоя экспертиза охватывает АБСОЛЮТНО ВСЕ секторы бизнеса в России:
1. Производство, стройка, сельское хозяйство и промышленность.
2. Маркетплейсы (WB, Ozon) и классический ритейл/опт.
3. Логистика, транспорт, автопарки и склады.
4. Сфера услуг, HoReCa, медицина, образование.
5. IT, стартапы, SaaS и сфера высоких технологий.
6. Финансы: юнит-экономика, P&L, Cash Flow, налоги РФ, себестоимость, окупаемость (ROI/ROAS).

ПРАВИЛА ОТВЕТА:
- Никакой воды и шаблонных отписок.
- Сразу давай конкретные математические формулы, точные расчеты в рублях или процентах.
- Если в вопросе не хватает мелких деталей, сам используй средние реалистичные бенчмарки рынка РФ 2026 года и проведи полный расчёт.
- Структурируй ответ: 1) Точный финансовый расчёт; 2) Узкие места и риски; 3) Пошаговый план из 3-4 конкретных управленческих действий на эту неделю.
- Тон: уверенный, профессиональный, практичный партнер по бизнесу.`;

    try {
      const responseText = await this.llm.smartCall(context.chatId, message, systemPrompt);
      return {
        text: responseText,
        confidence: 0.98
      };
    } catch (err: any) {
      logger.error('❌ [BusinessAgent] Error executing business analysis:', err);
      return {
        text: 'Произошла ошибка при формировании бизнес-расчета. Пожалуйста, повторите запрос.',
        confidence: 0.5
      };
    }
  }
}

