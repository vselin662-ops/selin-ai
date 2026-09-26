import React, { useState, useEffect } from 'react';
import { GlassPanel } from './GlassPanel';
import { NeonButton } from './NeonButton';
import { 
  BookOpen, 
  Search, 
  Calendar, 
  Volume2, 
  Sparkles, 
  CheckCircle, 
  Loader2, 
  Bookmark,
  Share2
} from 'lucide-react';

interface ScriptureData {
  ref: string;
  text: string;
  source: string;
}

export function BibleTrackerPanel() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScriptureData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Psalm of the day
  const [psalm, setPsalm] = useState<ScriptureData | null>(null);
  const [psalmLoading, setPsalmLoading] = useState(false);

  // Plan status
  const [planEnabled, setPlanEnabled] = useState(true);
  const [planSummary, setPlanSummary] = useState<string>('');
  const [togglingPlan, setTogglingPlan] = useState(false);

  const fetchPsalmOfDay = async () => {
    setPsalmLoading(true);
    try {
      const res = await fetch('/api/bible/psalm');
      const data = await res.json();
      if (data.success && data.data) {
        setPsalm(data.data);
      }
    } catch {
      // offline fallback
    } finally {
      setPsalmLoading(false);
    }
  };

  const fetchPlanInfo = async () => {
    try {
      const res = await fetch('/api/bible/plan');
      const data = await res.json();
      if (data.success) {
        setPlanEnabled(data.config?.plan_enabled !== 0);
        setPlanSummary(data.today || '');
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchPsalmOfDay();
    fetchPlanInfo();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = query.trim();
    if (!clean) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/bible/read?query=${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (data.success && data.data) {
        setResult(data.data);
      } else {
        setError(data.error || 'Стих или глава не найдены');
      }
    } catch (err: unknown) {
      setError('Ошибка соединения при запросе стиха');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePlan = async () => {
    setTogglingPlan(true);
    try {
      const nextState = !planEnabled;
      const res = await fetch('/api/bible/plan/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState })
      });
      const data = await res.json();
      if (data.success) {
        setPlanEnabled(data.plan_enabled !== 0);
      }
    } catch {
      // ignore
    } finally {
      setTogglingPlan(false);
    }
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ru-RU';
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <GlassPanel className="p-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 mb-1">
              <BookOpen className="w-5 h-5" />
              <span className="text-xs uppercase tracking-wider font-semibold">Священное Писание • Синодальный перевод</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Духовный трекер и Библия</h2>
            <p className="text-sm text-slate-400 mt-1">
              Мгновенный поиск стихов, чтение глав, Псалом дня и сопровождение Плана Победы на 365 дней.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2 ${
              planEnabled 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                : 'bg-slate-800/40 border-slate-700 text-slate-400'
            }`}>
              <CheckCircle className="w-4 h-4" />
              <span>План Победы: {planEnabled ? 'Активен' : 'Выключен'}</span>
            </div>

            <button
              onClick={handleTogglePlan}
              disabled={togglingPlan}
              className="text-xs px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 transition-all cursor-pointer"
            >
              {planEnabled ? 'Приостановить' : 'Включить'}
            </button>
          </div>
        </div>
      </GlassPanel>

      {/* Grid: Search & Psalm of the Day */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Quick Scripture Search (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <GlassPanel className="p-6">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Search className="w-5 h-5 text-cyan-400" />
              Поиск отрывка или главы
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Введите ссылку (например: <code>Иоанна 3:16</code>, <code>Псалом 90</code>, <code>1 Коринфянам 13:4-8</code> или <code>Бытие 1</code>)
            </p>

            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Иоанна 3:16 или Псалом 22..."
                className="flex-1 bg-slate-900/60 border border-slate-700/60 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
              />
              <NeonButton type="submit" disabled={loading} className="px-5 py-2.5">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Найти'}
              </NeonButton>
            </form>

            {/* Quick preset chips */}
            <div className="flex flex-wrap gap-2 mt-3 text-xs">
              <span className="text-slate-500 py-1">Быстрые ссылки:</span>
              {['Иоанна 3:16', 'Псалом 90', 'Псалом 22', '1 Коринфянам 13:4-8', 'Исаия 40:31', 'Римлянам 8:28'].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => { setQuery(item); }}
                  className="bg-slate-800/60 hover:bg-slate-700/60 text-slate-300 hover:text-white px-2.5 py-1 rounded-lg border border-slate-700/40 transition-colors cursor-pointer"
                >
                  {item}
                </button>
              ))}
            </div>

            {error && (
              <div className="mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
                {error}
              </div>
            )}

            {result && (
              <div className="mt-6 p-5 rounded-2xl bg-cyan-950/20 border border-cyan-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-cyan-300 tracking-wide flex items-center gap-2">
                    <Bookmark className="w-4 h-4" />
                    {result.ref}
                  </span>
                  <button
                    onClick={() => speakText(`${result.ref}. ${result.text}`)}
                    className="p-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 transition-colors cursor-pointer"
                    title="Озвучить"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-sm leading-relaxed text-slate-200 font-serif whitespace-pre-line">
                  {result.text}
                </div>
              </div>
            )}
          </GlassPanel>

          {/* Today's Reading Plan Card */}
          {planSummary && (
            <GlassPanel className="p-6">
              <div className="flex items-center gap-2 text-amber-400 mb-2">
                <Calendar className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">План Победы на сегодня</h3>
              </div>
              <div className="text-sm text-slate-300 leading-relaxed font-serif whitespace-pre-line bg-slate-900/40 p-4 rounded-xl border border-slate-800">
                {planSummary}
              </div>
            </GlassPanel>
          )}
        </div>

        {/* Right: Psalm of the Day (1 col) */}
        <div className="space-y-6">
          <GlassPanel className="p-6 relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-cyan-400">
                <Sparkles className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">Псалом дня</h3>
              </div>
              <button
                onClick={fetchPsalmOfDay}
                disabled={psalmLoading}
                className="text-xs text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
              >
                {psalmLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Обновить'}
              </button>
            </div>

            {psalm ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-cyan-300">{psalm.ref}</span>
                  <button
                    onClick={() => speakText(`${psalm.ref}. ${psalm.text}`)}
                    className="p-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 transition-colors cursor-pointer"
                    title="Озвучить псалом"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-slate-200 leading-relaxed font-serif italic bg-slate-900/40 p-4 rounded-xl border border-slate-800/60">
                  «{psalm.text}»
                </p>
                <div className="text-xs text-slate-500 text-right">
                  Синодальный перевод • Без повторов
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500 text-sm">
                Загрузка ежедневного псалма...
              </div>
            )}
          </GlassPanel>

          {/* Quick Voice / Text Commands Info */}
          <GlassPanel className="p-5">
            <h4 className="text-xs uppercase font-bold text-slate-400 mb-3 tracking-wider">
              Команды в MAX Messenger
            </h4>
            <div className="space-y-2 text-xs text-slate-300">
              <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                <code>прочитай [книга] [глава]:[стих]</code>
                <div className="text-slate-500 text-[11px] mt-0.5">Пример: «прочитай Иоанна 3:16»</div>
              </div>
              <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                <code>псалом</code> или <code>псалом дня</code>
                <div className="text-slate-500 text-[11px] mt-0.5">Случайный псалом с озвучкой</div>
              </div>
              <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                <code>план победы</code> / <code>план на сегодня</code>
                <div className="text-slate-500 text-[11px] mt-0.5">Текущий духовный слот разбора</div>
              </div>
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
