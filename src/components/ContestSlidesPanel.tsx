import React, { useState } from 'react';
import { 
  Award, 
  ArrowLeft, 
  ArrowRight, 
  Sparkles, 
  Globe, 
  Shield, 
  Briefcase, 
  Database, 
  Sliders, 
  Terminal, 
  CheckCircle, 
  Zap, 
  Mic, 
  Lock 
} from 'lucide-react';

interface Slide {
  id: number;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

export const ContestSlidesPanel: React.FC = () => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides: Slide[] = [
    {
      id: 1,
      title: "SELIN AI — Автономная ИИ-Платформа",
      subtitle: "Питч-презентация цифровых сотрудников корпоративного класса (Релиз 2026 г.)",
      icon: <Award className="w-8 h-8 text-[#C5A059]" />,
      content: (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-gradient-to-r from-[#221C19] to-[#161210] border border-[#C5A059]/30 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-48 h-48 bg-[#C5A059]/5 rounded-full blur-3xl" />
            <h3 className="text-2xl font-black text-[#EAE6DF] leading-tight">
              Суверенная ИИ-экосистема для автоматизации бизнеса в РФ
            </h3>
            <p className="text-sm text-[#A89E94] mt-3 leading-relaxed">
              **Selin AI** — это готовая к эксплуатации автономная платформа, разворачивающая специализированных цифровых сотрудников (AI Employees) с глубокой интеграцией в российские бизнес-каналы связи (Max Messenger, Telegram) и веб-интерфейсы.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-[#1C1715] border border-[#2A231F] flex flex-col justify-between">
              <span className="text-[10px] uppercase tracking-wider text-[#C5A059] font-bold">Архитектура</span>
              <h4 className="text-sm font-bold text-[#EAE6DF] mt-2">Multi-Agent Orchestrator</h4>
              <p className="text-xs text-[#9E958C] mt-1">Распределение задач между модулями (Finance, LegalScout, Languages, Planning).</p>
            </div>
            <div className="p-4 rounded-xl bg-[#1C1715] border border-[#2A231F] flex flex-col justify-between">
              <span className="text-[10px] uppercase tracking-wider text-blue-400 font-bold">Интерфейс</span>
              <h4 className="text-sm font-bold text-[#EAE6DF] mt-2">Voice-First Experience</h4>
              <p className="text-xs text-[#9E958C] mt-1">Встроенный двусторонний речевой ввод и синтез голоса с нормализацией текста в реальном времени.</p>
            </div>
            <div className="p-4 rounded-xl bg-[#1C1715] border border-[#2A231F] flex flex-col justify-between">
              <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">Безопасность</span>
              <h4 className="text-sm font-bold text-[#EAE6DF] mt-2">OWASP LLM 2026 Guard</h4>
              <p className="text-xs text-[#9E958C] mt-1">Встроенные шлюзы кибербезопасности, защита от инъекций, утечек ключей и рейтинг доверия.</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 2,
      title: "Технологический Стек и Хранение Данных",
      subtitle: "Суверенное, производительное и импортозамещенное ядро",
      icon: <Database className="w-8 h-8 text-blue-400" />,
      content: (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-[#161210] border border-[#2A231F] grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider">Фронтенд и Сборка</h4>
              <ul className="space-y-2 text-xs text-[#D8D2C9]">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <span>**SPA на React 18** с поддержкой адаптивных макетов и анимаций переходов.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <span>Сверхбыстрая сборка через **Vite** и оптимизация стилей на **Tailwind CSS**.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <span>Премиальная стилизация: градиенты, неоновое свечение и эффект стекла (Glassmorphism).</span>
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider">Бэкенд и СУБД</h4>
              <ul className="space-y-2 text-xs text-[#D8D2C9]">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <span>**Express.js сервер** на Node.js (компиляция typescript через esbuild).</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <span>**Pure SQLite (WAL Mode)** для изоляции тенантов и локального хранения сессий.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <span>Кэширование сессий и быстрых транзакций через распределенный **Redis**.</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-blue-300 leading-relaxed flex items-center gap-3">
            <Zap className="w-5 h-5 text-blue-400 shrink-0 animate-bounce" />
            <span>**Интеграция ИИ**: Ядро осуществляет вызовы к сверхскоростному **Google Gemini 2.0 Flash API** через официальный SDK `@google/genai` с полной валидацией схем на выходе.</span>
          </div>
        </div>
      )
    },
    {
      id: 3,
      title: "Интерактивный Голосовой Движок",
      subtitle: "Voice-First пользовательский интерфейс с нулевой задержкой",
      icon: <Mic className="w-8 h-8 text-amber-400" />,
      content: (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-[#161210] border border-[#2A231F] flex flex-col md:flex-row gap-6 items-center">
            <div className="w-full md:w-1/3 flex flex-col items-center justify-center p-6 rounded-xl bg-[#1F1916] border border-[#382E27] relative overflow-hidden">
              <div className="w-16 h-16 rounded-full bg-gradient-to-r from-[#C5A059] to-[#8C6F38] flex items-center justify-center text-[#0F0D0C] shadow-lg shadow-[#C5A059]/20 animate-pulse relative z-10">
                <Mic className="w-8 h-8" />
              </div>
              <span className="text-[10px] uppercase font-black text-[#C5A059] mt-3 tracking-widest">Selin Voice Core</span>
              <div className="flex gap-1.5 mt-2 h-6 items-end justify-center">
                <div className="w-1 h-3 bg-[#C5A059] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                <div className="w-1 h-5 bg-[#C5A059] rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                <div className="w-1 h-2 bg-[#C5A059] rounded-full animate-bounce" style={{ animationDelay: '0.5s' }} />
                <div className="w-1 h-6 bg-[#C5A059] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="w-1 h-4 bg-[#C5A059] rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>

            <div className="w-full md:w-2/3 space-y-4">
              <h4 className="text-sm font-bold text-[#EAE6DF]">Компоненты и логика голосовой обработки:</h4>
              <ul className="space-y-2.5 text-xs text-[#9E958C]">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>**Хук `useVoiceRecorder.ts`**: Захватывает микрофон через Web API, анализирует звук (`AudioContext` + `AnalyserNode`) и отправляет Opus чанки на бэкенд.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>**Эндпоинт `/api/voice/transcribe`**: Принимает аудио в формате FormData и преобразует его в текст через мультимодальное ядро Gemini.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>**Синтез речи (TTS `/api/tts`)**: Преобразует текстовые ответы в речь с автоматической интеллектуальной нормализацией чисел, дат и аббревиатур.</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#1C1715] border border-[#2A231F]">
            <h4 className="text-xs font-bold text-[#C5A059] uppercase tracking-wider">4 Состояния Кнопки `VoiceButton.tsx`:</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2.5 text-[11px]">
              <div className="p-2 rounded bg-amber-500/5 border border-amber-500/20 text-center text-[#EAE6DF]">**idle** (Ожидание)</div>
              <div className="p-2 rounded bg-red-500/5 border border-red-500/20 text-center text-red-400">**recording** (Запись)</div>
              <div className="p-2 rounded bg-purple-500/5 border border-purple-500/20 text-center text-purple-400">**processing** (Обработка)</div>
              <div className="p-2 rounded bg-emerald-500/5 border border-emerald-500/20 text-center text-emerald-400">**speaking** (Говорение)</div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 4,
      title: "Безопасность ИИ-Ядра (AI Security Shield)",
      subtitle: "Защита корпоративного уровня по стандарту OWASP LLM 2026",
      icon: <Shield className="w-8 h-8 text-emerald-400" />,
      content: (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[#161210] border border-[#2A231F] space-y-2">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-[#EAE6DF] uppercase">Фильтрация Входа и Выхода</h4>
              </div>
              <p className="text-[11px] text-[#9E958C] leading-relaxed">
                **`ai-shield.ts`** очищает промпты от инъекций, удаляет скрытые zero-width символы. **`output-filter.ts`** сканирует исходящие ответы нейросети, выявляя и вырезая любые попытки утечки JWT, Canary-токенов или API ключей.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#161210] border border-[#2A231F] space-y-2">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-[#EAE6DF] uppercase">Защита Коннекторов и Инструментов</h4>
              </div>
              <p className="text-[11px] text-[#9E958C] leading-relaxed">
                **`mcp-guardian.ts`** проверяет целостность вызываемых плагинов Model Context Protocol, сверяя SHA-256 хеши их схем, и выполняет запуск только в изолированной безопасной песочнице.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#161210] border border-[#2A231F] space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-[#EAE6DF] uppercase">Анализ Аномалий и Доверие</h4>
              </div>
              <p className="text-[11px] text-[#9E958C] leading-relaxed">
                **`trust-engine.ts`** рассчитывает динамический рейтинг доверия пользователя (Trust Score 0..100) на основе истории его запросов, автоматически урезая права доступа при подозрительном поведении.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#161210] border border-[#2A231F] space-y-2">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-[#EAE6DF] uppercase">Аварийный Аутлок (Killswitch)</h4>
              </div>
              <p className="text-[11px] text-[#9E958C] leading-relaxed">
                Наличие встроенного API **`POST /api/security/killswitch`** для мгновенной аварийной блокировки всех ИИ-модулей в один клик администратором в случае обнаружения киберинцидента.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>**Покрытие тестами (`tests/security.test.ts`)**: 10 из 10 тестов защиты пройдены на бэкенде.</span>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 5,
      title: "Интеллектуальные Модули и Карта Разделов",
      subtitle: "Специализированные цифровые роли платформы",
      icon: <Briefcase className="w-8 h-8 text-purple-400" />,
      content: (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-[#161210] border border-[#2A231F] space-y-4">
            <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider">Прикладной функционал агентов:</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-[#1C1715] border border-[#2A231F] space-y-1">
                <div className="font-bold text-[#EAE6DF]">🗣️ Обучение Языкам (LanguageTutor)</div>
                <div className="text-[11px] text-[#9E958C]">Алгоритм повторения Anki SM-2. Автоматическое распознавание домашних заданий из диалога.</div>
              </div>
              <div className="p-3 rounded-lg bg-[#1C1715] border border-[#2A231F] space-y-1">
                <div className="font-bold text-[#EAE6DF]">💼 Бизнес-Ментор (Business Module)</div>
                <div className="text-[11px] text-[#9E958C]">Аудит по вопросам диагностики, выдача дневных SMART-целей и симулятор сложных продаж.</div>
              </div>
              <div className="p-3 rounded-lg bg-[#1C1715] border border-[#2A231F] space-y-1">
                <div className="font-bold text-[#EAE6DF]">📚 База Знаний (RAG Engine)</div>
                <div className="text-[11px] text-[#9E958C]">Интерфейс загрузки корпоративных PDF, TXT, DOCX и суверенный локальный поиск по ним.</div>
              </div>
              <div className="p-3 rounded-lg bg-[#1C1715] border border-[#2A231F] space-y-1">
                <div className="font-bold text-[#EAE6DF]">⛪ Духовный Трекер и Сборки</div>
                <div className="text-[11px] text-[#9E958C]">План победы, утренние рассылки библейских псалмов и притч прямо в чаты клиентов.</div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#1C1715] border border-[#2A231F] text-xs text-[#9E958C] flex items-center justify-between">
            <span>Валидация форматов вывода: **Structured Outputs (Zod) + Safe Parsing**</span>
            <span className="text-[#C5A059] font-bold">100% стабильность работы</span>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="p-6 rounded-2xl bg-[#161210] border border-[#2A231F] space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#2A231F] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[#C5A059]/10 border border-[#C5A059]/30 flex items-center justify-center text-[#C5A059]">
            {slides[currentSlide].icon}
          </div>
          <div>
            <h2 className="text-xl font-black text-[#EAE6DF]">🏆 {slides[currentSlide].title}</h2>
            <p className="text-xs text-[#A89E94] mt-0.5">{slides[currentSlide].subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[#9E958C]">
            Слайд {currentSlide + 1} из {slides.length}
          </span>
        </div>
      </div>

      <div className="min-h-[320px] transition-all duration-300">
        {slides[currentSlide].content}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-[#2A231F]">
        <button
          onClick={() => setCurrentSlide((prev) => Math.max(0, prev - 1))}
          disabled={currentSlide === 0}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
            currentSlide === 0
              ? 'bg-[#1C1715] text-[#4A433F] cursor-not-allowed border border-transparent'
              : 'bg-[#1C1715] text-[#EAE6DF] hover:bg-[#26201D] border border-[#2A231F]'
          }`}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Назад</span>
        </button>

        <div className="flex gap-1.5">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentSlide(idx)}
              className={`w-2 h-2 rounded-full transition-all ${
                currentSlide === idx ? 'bg-[#C5A059] w-6' : 'bg-[#2A231F] hover:bg-[#382E27]'
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => setCurrentSlide((prev) => Math.min(slides.length - 1, prev + 1))}
          disabled={currentSlide === slides.length - 1}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
            currentSlide === slides.length - 1
              ? 'bg-[#1C1715] text-[#4A433F] cursor-not-allowed border border-transparent'
              : 'bg-[#C5A059] text-[#0F0D0C] hover:bg-[#D4B06A]'
          }`}
        >
          <span>Вперед</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
