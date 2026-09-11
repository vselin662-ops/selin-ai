import { logger } from "../logger";

export interface QueuedTaskItem {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: number;
  durationEstSec?: number;
  source?: string;
}

export interface AgentStatusInfo {
  id: string;
  code: string;
  name: string;
  role: string;
  category: string;
  status: 'online' | 'busy' | 'offline';
  queueCount: number;
  maxCapacity: number;
  activeTask?: string | null;
  completedToday: number;
  latencyMs: number;
  uptimePercent: number;
  lastActive: string;
  capabilities: string[];
  queuedTasks: QueuedTaskItem[];
}

class AgentQueueService {
  private agents: Map<string, AgentStatusInfo> = new Map();

  constructor() {
    this.initDefaultAgents();
  }

  private initDefaultAgents(): void {
    const defaultList: AgentStatusInfo[] = [
      {
        id: "order",
        code: "OrderAgent",
        name: "Агент заказов & расчётов",
        role: "Приём заказов, валидация позиций, расчёт Smart Fee Matrix и оформление счетов",
        category: "Коммерция & Доставка",
        status: "online",
        queueCount: 2,
        maxCapacity: 10,
        activeTask: "Расчёт динамического тарифа для заказа #2481",
        completedToday: 47,
        latencyMs: 32,
        uptimePercent: 99.8,
        lastActive: "Только что",
        capabilities: ["Smart Fee Matrix", "E-commerce чеки", "Скидки на объём"],
        queuedTasks: [
          { id: "task_ord_1", title: "Верификация позиций корзины пользователя", priority: "high", createdAt: Date.now() - 45000, source: "Telegram" },
          { id: "task_ord_2", title: "Применение промокода и расчёт доставки", priority: "medium", createdAt: Date.now() - 20000, source: "Web" }
        ]
      },
      {
        id: "sales",
        code: "SalesAgent",
        name: "Отдел продаж & CRM",
        role: "Квалификация входящих лидов, работа с возражениями, доведение до сделки",
        category: "Продажи & Лидогенерация",
        status: "online",
        queueCount: 1,
        maxCapacity: 8,
        activeTask: "Квалификация B2B лида из формы обратной связи",
        completedToday: 38,
        latencyMs: 44,
        uptimePercent: 99.9,
        lastActive: "1 мин назад",
        capabilities: ["B2B/B2C воронка", "Скоринг готовности", "CRM-синхронизация"],
        queuedTasks: [
          { id: "task_sales_1", title: "Отправка персонализированного КП клиенту", priority: "medium", createdAt: Date.now() - 15000, source: "Max Bot" }
        ]
      },
      {
        id: "support",
        code: "SupportAgent",
        name: "Служба заботы & FAQ",
        role: "Круглосуточный клиентский сервис, консультации по базе знаний и решение вопросов",
        category: "Клиентский сервис",
        status: "online",
        queueCount: 0,
        maxCapacity: 15,
        activeTask: null,
        completedToday: 94,
        latencyMs: 18,
        uptimePercent: 100,
        lastActive: "Только что",
        capabilities: ["RAG База знаний", "SLA < 5 сек", "Эскалация оператору"],
        queuedTasks: []
      },
      {
        id: "business",
        code: "BusinessAgent",
        name: "Бизнес-Стратег & Ментор",
        role: "Экспресс-диагностика бизнеса, SMART-планирование, аудит метрик и unit-экономики",
        category: "Бизнес & Стратегия",
        status: "busy",
        queueCount: 3,
        maxCapacity: 6,
        activeTask: "Генерация 5-шагового SMART-плана масштабирования розницы",
        completedToday: 21,
        latencyMs: 85,
        uptimePercent: 99.4,
        lastActive: "Только что",
        capabilities: ["SMART-планирование", "P&L и unit-экономика", "SWOT-диагностика"],
        queuedTasks: [
          { id: "task_biz_1", title: "Анализ структуры операционных расходов", priority: "high", createdAt: Date.now() - 120000, source: "Web Dashboard" },
          { id: "task_biz_2", title: "Подготовка ролевого скрипта для менеджеров", priority: "medium", createdAt: Date.now() - 60000, source: "Web Dashboard" },
          { id: "task_biz_3", title: "Сравнение метрик конверсии за квартал", priority: "low", createdAt: Date.now() - 10000, source: "Web Dashboard" }
        ]
      },
      {
        id: "content",
        code: "ContentAgent",
        name: "Медиа & Контент-Генератор",
        role: "Написание виральных постов, сценариев, рекламных слоганов и контент-планов",
        category: "Медиа & Тексты",
        status: "online",
        queueCount: 1,
        maxCapacity: 8,
        activeTask: "Подготовка экспертной статьи о трендах автономных систем",
        completedToday: 56,
        latencyMs: 52,
        uptimePercent: 99.7,
        lastActive: "2 мин назад",
        capabilities: ["AIDA структура", "Tone of Voice", "SMM-адаптация"],
        queuedTasks: [
          { id: "task_cnt_1", title: "Генерация 3 вариантов рекламного слогана", priority: "medium", createdAt: Date.now() - 30000, source: "Telegram" }
        ]
      },
      {
        id: "coding",
        code: "CodingAgent",
        name: "Код-Архитектор & DevOps",
        role: "Аудит архитектуры кода, написание скриптов, ревью пул-реквестов и дебаг",
        category: "Разработка & Код",
        status: "busy",
        queueCount: 2,
        maxCapacity: 5,
        activeTask: "Анализ TypeScript интерфейсов и типизации адаптеров",
        completedToday: 29,
        latencyMs: 110,
        uptimePercent: 99.6,
        lastActive: "Только что",
        capabilities: ["TypeScript / Node.js", "Docker & CI/CD", "Security Audit"],
        queuedTasks: [
          { id: "task_code_1", title: "Оптимизация индексов базы данных", priority: "high", createdAt: Date.now() - 80000, source: "Console" },
          { id: "task_code_2", title: "Автотесты для маршрутов оплаты", priority: "medium", createdAt: Date.now() - 25000, source: "Git Hook" }
        ]
      },
      {
        id: "tutor",
        code: "TutorAgent",
        name: "Языковой Наставник",
        role: "Интервальные повторения Anki (SM-2), тренировка диалогов и shadowing произношения",
        category: "Обучение & Языки",
        status: "online",
        queueCount: 0,
        maxCapacity: 12,
        activeTask: null,
        completedToday: 63,
        latencyMs: 25,
        uptimePercent: 100,
        lastActive: "3 мин назад",
        capabilities: ["Алгоритм SM-2", "Shadowing", "Разбор ошибок"],
        queuedTasks: []
      },
      {
        id: "travel",
        code: "TravelAgent",
        name: "Консьерж Поездок & Логист",
        role: "Поиск оптимальных авиарейсов, подбор отелей, построение логистики и маршрутов",
        category: "Туризм & Поездки",
        status: "online",
        queueCount: 1,
        maxCapacity: 8,
        activeTask: "Мониторинг билетов по маршруту Москва — Сочи",
        completedToday: 19,
        latencyMs: 60,
        uptimePercent: 99.5,
        lastActive: "5 мин назад",
        capabilities: ["Авиапоиск", "Бронирование отелей", "Трансферы"],
        queuedTasks: [
          { id: "task_trv_1", title: "Поиск отелей 4* в центре с высоким рейтингом", priority: "medium", createdAt: Date.now() - 40000, source: "Max Bot" }
        ]
      },
      {
        id: "news",
        code: "NewsAgent",
        name: "Аналитик Новостей & Трендов",
        role: "Сквозной мониторинг инфополя, фактчекинг событий и формирование дайджестов",
        category: "Аналитика & Инфополе",
        status: "online",
        queueCount: 0,
        maxCapacity: 10,
        activeTask: null,
        completedToday: 42,
        latencyMs: 38,
        uptimePercent: 99.8,
        lastActive: "4 мин назад",
        capabilities: ["Сквозной веб-поиск", "Фактчекинг", "Утренний дайджест"],
        queuedTasks: []
      },
      {
        id: "legal",
        code: "LegalScout",
        name: "Юрист & Комплаенс-Скаут",
        role: "Правовой анализ договоров, проверка соответствия ФЗ-152 / ФЗ-436 и минимизация рисков",
        category: "Юриспруденция",
        status: "offline",
        queueCount: 0,
        maxCapacity: 4,
        activeTask: null,
        completedToday: 11,
        latencyMs: 0,
        uptimePercent: 98.2,
        lastActive: "35 мин назад",
        capabilities: ["Договорной комплаенс", "ФЗ-152 / ФЗ-436", "Риск-анализ"],
        queuedTasks: []
      }
    ];

    for (const agent of defaultList) {
      this.agents.set(agent.id, agent);
    }
  }

  public getAgentsStatus(): { agents: AgentStatusInfo[]; summary: { total: number; online: number; busy: number; offline: number; totalQueue: number; totalCompletedToday: number } } {
    const list = Array.from(this.agents.values());
    const online = list.filter(a => a.status === 'online').length;
    const busy = list.filter(a => a.status === 'busy').length;
    const offline = list.filter(a => a.status === 'offline').length;
    const totalQueue = list.reduce((sum, a) => sum + a.queueCount, 0);
    const totalCompletedToday = list.reduce((sum, a) => sum + a.completedToday, 0);

    return {
      agents: list,
      summary: {
        total: list.length,
        online,
        busy,
        offline,
        totalQueue,
        totalCompletedToday
      }
    };
  }

  public enqueueTask(agentId: string, taskTitle: string, priority: 'low' | 'medium' | 'high' | 'critical' = 'medium', source = 'Web Dashboard'): QueuedTaskItem | null {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    const newTask: QueuedTaskItem = {
      id: `task_${agentId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: taskTitle.trim(),
      priority,
      createdAt: Date.now(),
      source
    };

    agent.queuedTasks.push(newTask);
    agent.queueCount = agent.queuedTasks.length;

    // If agent was idle and online, assign as active task
    if (agent.status === 'online' && !agent.activeTask) {
      agent.activeTask = newTask.title;
      agent.status = 'busy';
    } else if (agent.status === 'offline') {
      // If offline, tasks can still queue up
    }

    agent.lastActive = "Только что";
    logger.info(`[AgentQueueService] Task enqueued for agent ${agentId}: ${newTask.id} (${taskTitle})`);
    return newTask;
  }

  public completeTask(agentId: string, taskId?: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    if (taskId) {
      const idx = agent.queuedTasks.findIndex(t => t.id === taskId);
      if (idx !== -1) {
        agent.queuedTasks.splice(idx, 1);
      }
    } else if (agent.queuedTasks.length > 0) {
      agent.queuedTasks.shift();
    }

    agent.queueCount = agent.queuedTasks.length;
    agent.completedToday += 1;

    // Update active task to next in queue, or return to online if empty
    if (agent.queuedTasks.length > 0) {
      agent.activeTask = agent.queuedTasks[0].title;
      agent.status = 'busy';
    } else {
      agent.activeTask = null;
      if (agent.status === 'busy') {
        agent.status = 'online';
      }
    }

    agent.lastActive = "Только что";
    logger.info(`[AgentQueueService] Task completed for agent ${agentId}, remaining in queue: ${agent.queueCount}`);
    return true;
  }

  public toggleStatus(agentId: string): AgentStatusInfo | null {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    if (agent.status === 'offline') {
      agent.status = agent.queueCount > 0 ? 'busy' : 'online';
      agent.latencyMs = Math.floor(Math.random() * 30) + 20;
      agent.lastActive = "Только что";
    } else {
      agent.status = 'offline';
      agent.activeTask = null;
    }

    logger.info(`[AgentQueueService] Agent ${agentId} status toggled to: ${agent.status}`);
    return agent;
  }

  public clearQueue(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    agent.queuedTasks = [];
    agent.queueCount = 0;
    agent.activeTask = null;
    if (agent.status === 'busy') {
      agent.status = 'online';
    }
    return true;
  }
}

export const agentQueueService = new AgentQueueService();
