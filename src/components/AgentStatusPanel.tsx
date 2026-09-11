import React, { useState, useEffect, useCallback } from 'react';
import {
  ShoppingBag,
  TrendingUp,
  Headphones,
  Briefcase,
  PenTool,
  Code,
  Globe,
  Plane,
  Newspaper,
  Shield,
  Activity,
  RefreshCw,
  Plus,
  CheckCircle2,
  Clock,
  Power,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
  Zap,
  Server,
  AlertCircle
} from 'lucide-react';

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

interface AgentStatusResponse {
  success: boolean;
  agents: AgentStatusInfo[];
  summary: {
    total: number;
    online: number;
    busy: number;
    offline: number;
    totalQueue: number;
    totalCompletedToday: number;
  };
}

const AGENT_ICONS: Record<string, React.ComponentType<any>> = {
  order: ShoppingBag,
  sales: TrendingUp,
  support: Headphones,
  business: Briefcase,
  content: PenTool,
  coding: Code,
  tutor: Globe,
  travel: Plane,
  news: Newspaper,
  legal: Shield,
};

const AGENT_THEME_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  order: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', badge: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40' },
  sales: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', badge: 'bg-blue-950/60 text-blue-300 border-blue-800/40' },
  support: { bg: 'bg-teal-500/10', border: 'border-teal-500/30', text: 'text-teal-400', badge: 'bg-teal-950/60 text-teal-300 border-teal-800/40' },
  business: { bg: 'bg-[#C5A059]/10', border: 'border-[#C5A059]/30', text: 'text-[#C5A059]', badge: 'bg-[#C5A059]/20 text-[#E0C68E] border-[#C5A059]/40' },
  content: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', badge: 'bg-purple-950/60 text-purple-300 border-purple-800/40' },
  coding: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400', badge: 'bg-cyan-950/60 text-cyan-300 border-cyan-800/40' },
  tutor: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-400', badge: 'bg-indigo-950/60 text-indigo-300 border-indigo-800/40' },
  travel: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', badge: 'bg-amber-950/60 text-amber-300 border-amber-800/40' },
  news: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-400', badge: 'bg-rose-950/60 text-rose-300 border-rose-800/40' },
  legal: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', badge: 'bg-orange-950/60 text-orange-300 border-orange-800/40' },
};

export const AgentStatusPanel: React.FC = () => {
  const [agents, setAgents] = useState<AgentStatusInfo[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    online: 0,
    busy: 0,
    offline: 0,
    totalQueue: 0,
    totalCompletedToday: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [filter, setFilter] = useState<'all' | 'online' | 'busy' | 'with_queue' | 'offline'>('all');
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

  // New task modal state
  const [showTaskModal, setShowTaskModal] = useState<boolean>(false);
  const [selectedAgentForTask, setSelectedAgentForTask] = useState<string>('order');
  const [taskTitleInput, setTaskTitleInput] = useState<string>('');
  const [taskPriorityInput, setTaskPriorityInput] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const fetchStatus = useCallback(async (quiet = false) => {
    if (!quiet) setIsRefreshing(true);
    try {
      const res = await fetch('/api/ai/agents/status');
      if (res.ok) {
        const data: AgentStatusResponse = await res.json();
        if (data && data.agents) {
          setAgents(data.agents);
          if (data.summary) {
            setSummary(data.summary);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load agent status from backend:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Auto-refresh every 6 seconds for live monitoring
    const interval = setInterval(() => {
      fetchStatus(true);
    }, 6000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setActionMessage({ text, type });
    setTimeout(() => {
      setActionMessage(null);
    }, 4000);
  };

  const handleToggleStatus = async (agentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch('/api/ai/agents/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.agents) {
          setAgents(data.agents);
          if (data.summary) setSummary(data.summary);
        }
        const agentName = agents.find(a => a.id === agentId)?.name || agentId;
        const newStatus = data.agent?.status === 'offline' ? 'переведён в оффлайн' : 'активирован онлайн';
        showToast(`ИИ-Агент «${agentName}» ${newStatus}`, 'info');
      }
    } catch (err) {
      showToast('Ошибка при переключении статуса агента', 'error');
    }
  };

  const handleCompleteTask = async (agentId: string, taskId?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch('/api/ai/agents/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, taskId })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.agents) {
          setAgents(data.agents);
          if (data.summary) setSummary(data.summary);
        }
        showToast('Задача успешно выполнена и снята с очереди', 'success');
      }
    } catch (err) {
      showToast('Ошибка при выполнении задачи', 'error');
    }
  };

  const handleClearQueue = async (agentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch('/api/ai/agents/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.agents) {
          setAgents(data.agents);
          if (data.summary) setSummary(data.summary);
        }
        showToast('Очередь задач агента очищена', 'info');
      }
    } catch (err) {
      showToast('Ошибка при очистке очереди', 'error');
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitleInput.trim()) return;

    try {
      const res = await fetch('/api/ai/agents/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgentForTask,
          title: taskTitleInput.trim(),
          priority: taskPriorityInput,
          source: 'Главный экран'
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.agents) {
          setAgents(data.agents);
          if (data.summary) setSummary(data.summary);
        }
        showToast(`Задача добавлена в очередь агента`, 'success');
        setTaskTitleInput('');
        setShowTaskModal(false);
      }
    } catch (err) {
      showToast('Ошибка добавления задачи в очередь', 'error');
    }
  };

  const filteredAgents = agents.filter(agent => {
    if (filter === 'online') return agent.status === 'online';
    if (filter === 'busy') return agent.status === 'busy';
    if (filter === 'offline') return agent.status === 'offline';
    if (filter === 'with_queue') return agent.queueCount > 0;
    return true;
  });

  return (
    <section id="agent-status-section" className="space-y-6 pt-2">
      {/* Toast notification */}
      {actionMessage && (
        <div
          id="agent-action-toast"
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center justify-between shadow-xl backdrop-blur-md animate-fade-in transition-all ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200 shadow-emerald-900/20'
              : actionMessage.type === 'error'
              ? 'bg-rose-950/90 border-rose-500/40 text-rose-200 shadow-rose-900/20'
              : 'bg-[#1C1715]/95 border-[#C5A059]/40 text-[#EAE6DF] shadow-black/40'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-[#C5A059] shrink-0" />
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-[11px] underline opacity-75 hover:opacity-100 ml-4 cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      )}

      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-[#161210] border border-[#2A231F] shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#C5A059] uppercase tracking-wider">
            <Activity className="w-4 h-4" />
            <span>Мониторинг Автономного Штаба</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#C5A059]/15 text-[#C5A059] border border-[#C5A059]/30">
              Live
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-[#EAE6DF] tracking-tight">
            Статус и Нагрузка ИИ-Агентов
          </h3>
          <p className="text-xs text-[#A89E94] max-w-2xl leading-relaxed">
            Отслеживание состояния подключения (онлайн/оффлайн), текущей загрузки вычислительных очередей и распределения задач между специализированными агентами.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            id="refresh-agents-button"
            onClick={() => fetchStatus()}
            disabled={isRefreshing}
            className="px-3.5 py-2 rounded-xl bg-[#221C19] text-[#D8D2C9] border border-[#362E29] hover:border-[#C5A059]/50 hover:bg-[#2A221E] transition-all text-xs font-medium flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
            title="Обновить метрики"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#C5A059] ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Синхронизация...' : 'Обновить'}</span>
          </button>

          <button
            id="add-agent-task-button"
            onClick={() => setShowTaskModal(true)}
            className="px-4 py-2 rounded-xl bg-[#C5A059] text-[#0F0D0C] hover:bg-[#D4B06A] transition-all duration-200 text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-[#C5A059]/15 hover:shadow-[#C5A059]/25 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Добавить задачу</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl bg-[#181311] border border-[#2A231F] space-y-1">
          <div className="text-[11px] text-[#8C8276] font-medium flex items-center justify-between">
            <span>Всего агентов</span>
            <Server className="w-3.5 h-3.5 text-[#C5A059]" />
          </div>
          <div className="text-xl font-bold text-[#EAE6DF]">{summary.total || agents.length}</div>
          <div className="text-[10px] text-[#A89E94]">Специализаций</div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#181311] border border-[#2A231F] space-y-1">
          <div className="text-[11px] text-emerald-400/90 font-medium flex items-center justify-between">
            <span>Онлайн</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div className="text-xl font-bold text-emerald-400">{summary.online}</div>
          <div className="text-[10px] text-emerald-500/80">Готовы к задачам</div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#181311] border border-[#2A231F] space-y-1">
          <div className="text-[11px] text-amber-400/90 font-medium flex items-center justify-between">
            <span>В работе</span>
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          </div>
          <div className="text-xl font-bold text-amber-400">{summary.busy}</div>
          <div className="text-[10px] text-amber-500/80">Выполняют процесс</div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#181311] border border-[#2A231F] space-y-1">
          <div className="text-[11px] text-[#8C8276] font-medium flex items-center justify-between">
            <span>Оффлайн</span>
            <span className="w-2 h-2 rounded-full bg-neutral-600" />
          </div>
          <div className="text-xl font-bold text-[#8C8276]">{summary.offline}</div>
          <div className="text-[10px] text-[#7A7167]">В режиме ожидания</div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#181311] border border-[#2A231F] space-y-1">
          <div className="text-[11px] text-[#C5A059] font-medium flex items-center justify-between">
            <span>В очередях</span>
            <Layers className="w-3.5 h-3.5 text-[#C5A059]" />
          </div>
          <div className="text-xl font-bold text-[#C5A059]">{summary.totalQueue}</div>
          <div className="text-[10px] text-[#A89E94]">Задач ожидает</div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#181311] border border-[#2A231F] space-y-1">
          <div className="text-[11px] text-[#DCD6CD] font-medium flex items-center justify-between">
            <span>За сутки</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-[#EAE6DF]">{summary.totalCompletedToday}</div>
          <div className="text-[10px] text-emerald-400/80">Завершено успешно</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-2 border-b border-[#2A231F] pb-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            id="filter-all-button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              filter === 'all'
                ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold'
                : 'text-[#9E958C] hover:text-[#EAE6DF] hover:bg-[#221C19]'
            }`}
          >
            Все агенты ({agents.length})
          </button>
          <button
            id="filter-online-button"
            onClick={() => setFilter('online')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              filter === 'online'
                ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold'
                : 'text-[#9E958C] hover:text-[#EAE6DF] hover:bg-[#221C19]'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Онлайн ({agents.filter(a => a.status === 'online').length})</span>
          </button>
          <button
            id="filter-busy-button"
            onClick={() => setFilter('busy')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              filter === 'busy'
                ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold'
                : 'text-[#9E958C] hover:text-[#EAE6DF] hover:bg-[#221C19]'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>В работе ({agents.filter(a => a.status === 'busy').length})</span>
          </button>
          <button
            id="filter-queue-button"
            onClick={() => setFilter('with_queue')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              filter === 'with_queue'
                ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold'
                : 'text-[#9E958C] hover:text-[#EAE6DF] hover:bg-[#221C19]'
            }`}
          >
            <Layers className="w-3 h-3 text-[#C5A059]" />
            <span>С очередью ({agents.filter(a => a.queueCount > 0).length})</span>
          </button>
          <button
            id="filter-offline-button"
            onClick={() => setFilter('offline')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              filter === 'offline'
                ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold'
                : 'text-[#9E958C] hover:text-[#EAE6DF] hover:bg-[#221C19]'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
            <span>Оффлайн ({agents.filter(a => a.status === 'offline').length})</span>
          </button>
        </div>

        <div className="text-[11px] text-[#7A7167] shrink-0 hidden sm:block">
          Обновление каждые 6 сек
        </div>
      </div>

      {/* Agents Grid */}
      {isLoading ? (
        <div className="py-16 text-center text-xs text-[#8C8276] flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-6 h-6 text-[#C5A059] animate-spin" />
          <span>Опрос состояния нейросетевых агентов...</span>
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[#161210] border border-[#2A231F] text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-[#8C8276] mx-auto opacity-70" />
          <div className="text-sm font-semibold text-[#EAE6DF]">Агенты по заданному фильтру не найдены</div>
          <div className="text-xs text-[#8C8276]">Переключите фильтр на «Все агенты» для просмотра всех компонентов системы.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAgents.map((agent) => {
            const Icon = AGENT_ICONS[agent.id] || Sparkles;
            const theme = AGENT_THEME_COLORS[agent.id] || {
              bg: 'bg-neutral-500/10',
              border: 'border-neutral-500/30',
              text: 'text-neutral-400',
              badge: 'bg-neutral-900 text-neutral-300 border-neutral-700'
            };

            const isExpanded = expandedAgentId === agent.id;
            const capacityRatio = Math.min(100, Math.round((agent.queueCount / agent.maxCapacity) * 100));
            const isHeavyLoad = capacityRatio >= 70;
            const isMediumLoad = capacityRatio >= 30;

            return (
              <div
                key={agent.id}
                id={`agent-card-${agent.id}`}
                className={`p-5 rounded-2xl bg-[#161210] border transition-all duration-300 hover:border-[#C5A059]/40 shadow-xl flex flex-col justify-between ${
                  agent.status === 'offline'
                    ? 'border-[#241E1A] opacity-75'
                    : agent.status === 'busy'
                    ? 'border-amber-500/30 shadow-amber-950/10'
                    : 'border-[#2A231F]'
                }`}
              >
                <div>
                  {/* Top Bar: Icon, Name, Category & Status Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-xl ${theme.bg} border ${theme.border} flex items-center justify-center ${theme.text} shrink-0 shadow-inner`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-bold text-[#EAE6DF] leading-tight">
                            {agent.name}
                          </h4>
                          <span className="text-[10px] font-mono text-[#7A7167]">
                            {agent.code}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#A89E94] mt-0.5">
                          {agent.category}
                        </div>
                      </div>
                    </div>

                    {/* Live Status Badge */}
                    <div className="flex items-center gap-2 shrink-0">
                      {agent.status === 'online' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 shadow-sm shadow-emerald-500/10">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Онлайн</span>
                        </span>
                      ) : agent.status === 'busy' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950/70 border border-amber-500/40 text-amber-300 shadow-sm shadow-amber-500/10">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                          <span>В работе</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-900 border border-neutral-700/60 text-[#8C8276]">
                          <span className="w-2 h-2 rounded-full bg-neutral-600" />
                          <span>Оффлайн</span>
                        </span>
                      )}

                      {/* Online/Offline Toggle Button */}
                      <button
                        id={`toggle-agent-${agent.id}`}
                        onClick={(e) => handleToggleStatus(agent.id, e)}
                        className={`p-1.5 rounded-lg border text-xs transition-all cursor-pointer ${
                          agent.status === 'offline'
                            ? 'bg-neutral-800/80 border-neutral-700 text-[#A89E94] hover:text-emerald-400 hover:border-emerald-500/40'
                            : 'bg-emerald-950/40 border-emerald-800/40 text-emerald-400 hover:bg-rose-950/40 hover:text-rose-400 hover:border-rose-800/40'
                        }`}
                        title={agent.status === 'offline' ? 'Включить агента (Онлайн)' : 'Перевести в режим ожидания (Оффлайн)'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Role description */}
                  <p className="text-xs text-[#9E958C] mt-3 leading-relaxed">
                    {agent.role}
                  </p>

                  {/* Capabilities Tags */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {agent.capabilities.map((cap, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-[#1C1715] border border-[#2A231F] text-[#A89E94]"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>

                  {/* LOAD & QUEUE SECTION */}
                  <div className="mt-4 pt-4 border-t border-[#241E1A] space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Layers className="w-3.5 h-3.5 text-[#C5A059]" />
                        <span className="font-semibold text-[#EAE6DF]">Нагрузка очереди:</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold px-2 py-0.5 rounded text-xs ${
                          agent.queueCount === 0
                            ? 'bg-[#1C1715] text-[#8C8276] border border-[#2A231F]'
                            : isHeavyLoad
                            ? 'bg-rose-950/80 text-rose-300 border border-rose-600/40'
                            : isMediumLoad
                            ? 'bg-amber-950/80 text-amber-300 border border-amber-600/40'
                            : 'bg-emerald-950/80 text-emerald-300 border border-emerald-600/40'
                        }`}>
                          {agent.queueCount} {agent.queueCount === 1 ? 'задача' : agent.queueCount > 1 && agent.queueCount < 5 ? 'задачи' : 'задач'} в очереди
                        </span>
                        <span className="text-[10px] text-[#7A7167]">
                          (макс. {agent.maxCapacity})
                        </span>
                      </div>
                    </div>

                    {/* Progress / Capacity Bar */}
                    <div className="w-full h-2 rounded-full bg-[#1F1916] border border-[#2E2621] overflow-hidden relative">
                      <div
                        className={`h-full transition-all duration-500 ${
                          agent.status === 'offline'
                            ? 'bg-neutral-600'
                            : isHeavyLoad
                            ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                            : isMediumLoad
                            ? 'bg-gradient-to-r from-[#C5A059] to-amber-400'
                            : 'bg-gradient-to-r from-emerald-500 to-[#C5A059]'
                        }`}
                        style={{ width: `${Math.max(agent.queueCount > 0 ? 8 : 0, capacityRatio)}%` }}
                      />
                    </div>

                    {/* Current Active Task or Status */}
                    <div className="text-[11px] p-2 rounded-lg bg-[#181311] border border-[#26201D] flex items-start gap-2">
                      <Zap className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${agent.status === 'busy' ? 'text-amber-400 animate-pulse' : 'text-[#7A7167]'}`} />
                      <div className="flex-1 min-w-0">
                        {agent.activeTask ? (
                          <div className="space-y-0.5">
                            <span className="text-[10px] text-amber-400 uppercase font-semibold block">Текущий процесс:</span>
                            <p className="text-xs text-[#EAE6DF] truncate font-medium">{agent.activeTask}</p>
                          </div>
                        ) : agent.status === 'offline' ? (
                          <span className="text-[#7A7167] italic">Агент в режиме ожидания (оффлайн)</span>
                        ) : (
                          <span className="text-emerald-400/90 font-medium">Очередь свободна, готов к приёму заданий</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Footer: Stats & Actions */}
                <div className="mt-4 pt-3 border-t border-[#241E1A] space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-[#8C8276]">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-[#C5A059]" />
                      <span>Отклик: <strong className="text-[#D8D2C9]">{agent.latencyMs ? `${agent.latencyMs} мс` : '—'}</strong></span>
                    </div>
                    <div>
                      Выполнено: <strong className="text-emerald-400">{agent.completedToday}</strong>
                    </div>
                    <div>
                      Uptime: <strong className="text-[#D8D2C9]">{agent.uptimePercent}%</strong>
                    </div>
                  </div>

                  {/* Action Buttons: Add task, Complete next, View queue list */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      id={`enqueue-btn-${agent.id}`}
                      onClick={() => {
                        setSelectedAgentForTask(agent.id);
                        setShowTaskModal(true);
                      }}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#221C19] border border-[#362E29] hover:border-[#C5A059]/50 hover:bg-[#2A221E] text-[#EAE6DF] text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#C5A059]" />
                      <span>В очередь</span>
                    </button>

                    {agent.queueCount > 0 && (
                      <button
                        id={`complete-task-btn-${agent.id}`}
                        onClick={(e) => handleCompleteTask(agent.id, undefined, e)}
                        className="py-1.5 px-3 rounded-lg bg-emerald-950/60 border border-emerald-500/40 hover:bg-emerald-900/60 text-emerald-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        title="Выполнить текущую задачу"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="hidden sm:inline">Завершить</span>
                      </button>
                    )}

                    <button
                      id={`expand-queue-btn-${agent.id}`}
                      onClick={() => setExpandedAgentId(isExpanded ? null : agent.id)}
                      className={`p-1.5 rounded-lg border text-xs transition-all cursor-pointer flex items-center gap-1 ${
                        isExpanded
                          ? 'bg-[#C5A059]/15 border-[#C5A059]/40 text-[#C5A059]'
                          : 'bg-[#1E1815] border-[#2A231F] text-[#8C8276] hover:text-[#EAE6DF]'
                      }`}
                      title={isExpanded ? 'Скрыть список задач' : 'Показать задачи в очереди'}
                    >
                      <span className="text-[10px] font-semibold">{agent.queueCount}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Expanded Task Queue Details */}
                  {isExpanded && (
                    <div className="mt-3 p-3 rounded-xl bg-[#120F0D] border border-[#2E2621] space-y-2 animate-fade-in text-xs">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-[#C5A059] border-b border-[#241E1A] pb-1.5">
                        <span>Задачи в очереди ({agent.queuedTasks.length}):</span>
                        {agent.queuedTasks.length > 0 && (
                          <button
                            onClick={(e) => handleClearQueue(agent.id, e)}
                            className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                          >
                            Очистить очередь
                          </button>
                        )}
                      </div>

                      {agent.queuedTasks.length === 0 ? (
                        <div className="text-[11px] text-[#7A7167] py-2 text-center">
                          Очередь пуста. Нажмите «В очередь» для отправки нового задания.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {agent.queuedTasks.map((t, index) => (
                            <div
                              key={t.id}
                              className="p-2 rounded-lg bg-[#181412] border border-[#28211C] flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-mono text-[#C5A059]">#{index + 1}</span>
                                  <span className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded ${
                                    t.priority === 'high' || t.priority === 'critical'
                                      ? 'bg-rose-950/80 text-rose-300 border border-rose-600/40'
                                      : t.priority === 'medium'
                                      ? 'bg-amber-950/80 text-amber-300 border border-amber-600/40'
                                      : 'bg-neutral-800 text-neutral-300'
                                  }`}>
                                    {t.priority}
                                  </span>
                                  <span className="text-[10px] text-[#7A7167]">{t.source || 'Web'}</span>
                                </div>
                                <p className="text-xs text-[#EAE6DF] font-medium truncate mt-0.5">
                                  {t.title}
                                </p>
                              </div>

                              <button
                                onClick={(e) => handleCompleteTask(agent.id, t.id, e)}
                                className="p-1 rounded bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/80 transition-colors cursor-pointer shrink-0"
                                title="Пометить задачу выполненной"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Task Creation Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-[#1A1412] border border-[#3A3029] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#2A231F] pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[#EAE6DF]">
                <Plus className="w-4 h-4 text-[#C5A059]" />
                <span>Добавить задачу в очередь агента</span>
              </div>
              <button
                onClick={() => setShowTaskModal(false)}
                className="text-[#8C8276] hover:text-[#EAE6DF] text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4">
              {/* Agent Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#C5A059] block">
                  Выберите ИИ-Агента:
                </label>
                <select
                  id="modal-agent-select"
                  value={selectedAgentForTask}
                  onChange={(e) => setSelectedAgentForTask(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-[#14100E] border border-[#332822] text-[#EAE6DF] text-xs focus:border-[#C5A059] focus:outline-none"
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.status === 'online' ? 'Онлайн' : a.status === 'busy' ? 'В работе' : 'Оффлайн'}) — Очередь: {a.queueCount}
                    </option>
                  ))}
                </select>
              </div>

              {/* Task Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#C5A059] block">
                  Название задачи / Запрос:
                </label>
                <input
                  id="modal-task-title"
                  type="text"
                  value={taskTitleInput}
                  onChange={(e) => setTaskTitleInput(e.target.value)}
                  placeholder="Например: Проверить расчёт чека для клиента #902"
                  className="w-full p-2.5 rounded-xl bg-[#14100E] border border-[#332822] text-[#EAE6DF] placeholder-[#7A7167] text-xs focus:border-[#C5A059] focus:outline-none"
                  autoFocus
                />
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#C5A059] block">
                  Приоритет исполнения:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'medium', 'high'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setTaskPriorityInput(p)}
                      className={`py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer capitalize ${
                        taskPriorityInput === p
                          ? 'bg-[#C5A059] text-[#0F0D0C] border-[#C5A059] font-bold'
                          : 'bg-[#14100E] text-[#9E958C] border-[#2A231F] hover:bg-[#221C19]'
                      }`}
                    >
                      {p === 'low' ? 'Низкий' : p === 'medium' ? 'Обычный' : 'Высокий'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#2A231F]">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#221C19] text-[#9E958C] hover:text-[#EAE6DF] text-xs font-medium cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  id="modal-submit-task-btn"
                  type="submit"
                  disabled={!taskTitleInput.trim()}
                  className="px-5 py-2 rounded-xl bg-[#C5A059] text-[#0F0D0C] hover:bg-[#D4B06A] text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-[#C5A059]/15"
                >
                  Поставить в очередь
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
