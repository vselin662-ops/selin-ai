import React, { useState, useEffect, useRef } from 'react';
import { GlassPanel } from './GlassPanel';
import { NeonButton } from './NeonButton';
import { 
  BookOpen, 
  Search, 
  Volume2, 
  VolumeX,
  Sparkles, 
  CheckCircle, 
  Loader2, 
  Bookmark,
  ChevronRight,
  Play,
  Square,
  BookMarked
} from 'lucide-react';

interface BibleBook {
  name: string;
  testament: 'old' | 'new';
  chaptersCount: number;
}

interface ScriptureData {
  ref: string;
  text: string;
  source: string;
  versesCount?: number;
}

export function BibleTrackerPanel() {
  const [books, setBooks] = useState<BibleBook[]>([]);
  const [selectedTestament, setSelectedTestament] = useState<'all' | 'old' | 'new'>('all');
  const [selectedBook, setSelectedBook] = useState<string>('Иоанна');
  const [selectedChapter, setSelectedChapter] = useState<number>(1);
  const [chapterContent, setChapterContent] = useState<ScriptureData | null>(null);
  const [loadingChapter, setLoadingChapter] = useState(false);

  // Search state
  const [query, setQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<ScriptureData | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Psalm of the day
  const [psalm, setPsalm] = useState<ScriptureData | null>(null);
  const [psalmLoading, setPsalmLoading] = useState(false);

  // Audio TTS playback state
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // 1. Fetch available books
  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const res = await fetch('/api/bible/books');
        const data = await res.json();
        if (data.success && Array.isArray(data.books)) {
          setBooks(data.books);
        }
      } catch (err) {
        console.error("Failed to load bible books:", err);
      }
    };
    fetchBooks();
  }, []);

  // 2. Fetch psalm of day
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

  useEffect(() => {
    fetchPsalmOfDay();
  }, []);

  // 3. Load chapter when book or chapter changes
  const loadChapter = async (bookName: string, chapterNum: number) => {
    setLoadingChapter(true);
    stopAudio();
    try {
      const res = await fetch(`/api/bible/read?book=${encodeURIComponent(bookName)}&chapter=${chapterNum}`);
      const data = await res.json();
      if (data.success && data.data) {
        setChapterContent(data.data);
      }
    } catch (err) {
      console.error("Error reading chapter:", err);
    } finally {
      setLoadingChapter(false);
    }
  };

  useEffect(() => {
    if (selectedBook && selectedChapter > 0) {
      loadChapter(selectedBook, selectedChapter);
    }
  }, [selectedBook, selectedChapter]);

  // Search handler
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = query.trim();
    if (!clean) return;

    setSearchLoading(true);
    setSearchError(null);
    setSearchResult(null);
    stopAudio();

    try {
      const res = await fetch(`/api/bible/read?query=${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (data.success && data.data) {
        setSearchResult(data.data);
      } else {
        setSearchError(data.error || 'Стих или глава не найдены');
      }
    } catch (err) {
      setSearchError('Ошибка соединения при запросе стиха');
    } finally {
      setSearchLoading(false);
    }
  };

  // Browser TTS controls
  const stopAudio = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      currentUtteranceRef.current = null;
      setIsPlayingAudio(false);
    }
  };

  const playAudio = (text: string, title?: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      alert("Синтез речи не поддерживается в этом браузере.");
      return;
    }

    stopAudio();

    const fullSpeech = title ? `${title}. ${text}` : text;
    const utterance = new SpeechSynthesisUtterance(fullSpeech);
    utterance.lang = 'ru-RU';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const ruVoice = voices.find(v => v.lang?.includes('ru') || v.lang?.includes('RU'));
    if (ruVoice) {
      utterance.voice = ruVoice;
    }

    utterance.onstart = () => setIsPlayingAudio(true);
    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);

    currentUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const currentBookObj = books.find(b => b.name === selectedBook);
  const totalChapters = currentBookObj?.chaptersCount || 1;

  const filteredBooks = books.filter(b => {
    if (selectedTestament === 'all') return true;
    return b.testament === selectedTestament;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <GlassPanel className="p-6 relative overflow-hidden border border-[#C5A059]/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[#C5A059] mb-1">
              <BookOpen className="w-5 h-5" />
              <span className="text-xs uppercase tracking-wider font-semibold">Священное Писание • Синодальный перевод (Локальная база)</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Библия & Духовный Наставник</h2>
            <p className="text-sm text-stone-300 mt-1">
              Полный текст 66 канонических книг из локального файла <code>data/bible_synodal.json</code> без интернета и VPN.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isPlayingAudio ? (
              <button
                onClick={stopAudio}
                className="px-4 py-2 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-semibold flex items-center gap-2 hover:bg-rose-500/30 transition-all cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Остановить голос</span>
              </button>
            ) : (
              <div className="px-3.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                <span>Оффлайн база: 31 102 стиха</span>
              </div>
            )}
          </div>
        </div>
      </GlassPanel>

      {/* Main Grid: Reader + Tools */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Interactive Bible Reader */}
        <div className="lg:col-span-2 space-y-6">
          <GlassPanel className="p-6 border border-[#2A231F]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-5 border-b border-[#2A231F] gap-3">
              <div className="flex items-center gap-2 text-white font-bold text-lg">
                <BookMarked className="w-5 h-5 text-[#C5A059]" />
                <span>Интерактивное чтение</span>
              </div>

              {/* Testament Filter Toggle */}
              <div className="inline-flex p-1 bg-[#1A1614] rounded-xl border border-[#2A231F] text-xs">
                <button
                  onClick={() => setSelectedTestament('all')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    selectedTestament === 'all' ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold' : 'text-stone-400 hover:text-white'
                  }`}
                >
                  Все
                </button>
                <button
                  onClick={() => setSelectedTestament('old')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    selectedTestament === 'old' ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold' : 'text-stone-400 hover:text-white'
                  }`}
                >
                  Ветхий Завет
                </button>
                <button
                  onClick={() => setSelectedTestament('new')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    selectedTestament === 'new' ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold' : 'text-stone-400 hover:text-white'
                  }`}
                >
                  Новый Завет
                </button>
              </div>
            </div>

            {/* Selectors for Book and Chapter */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              <div>
                <label className="block text-xs font-medium text-stone-400 mb-1.5">
                  Выберите книгу:
                </label>
                <select
                  value={selectedBook}
                  onChange={(e) => {
                    setSelectedBook(e.target.value);
                    setSelectedChapter(1);
                  }}
                  className="w-full bg-[#181311] border border-[#352B26] rounded-xl px-3.5 py-2.5 text-sm text-stone-100 focus:outline-none focus:border-[#C5A059]"
                >
                  {filteredBooks.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name} ({b.chaptersCount} {b.chaptersCount === 1 ? 'глава' : b.chaptersCount < 5 ? 'главы' : 'глав'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-400 mb-1.5">
                  Выберите главу (всего {totalChapters}):
                </label>
                <select
                  value={selectedChapter}
                  onChange={(e) => setSelectedChapter(Number(e.target.value))}
                  className="w-full bg-[#181311] border border-[#352B26] rounded-xl px-3.5 py-2.5 text-sm text-stone-100 focus:outline-none focus:border-[#C5A059]"
                >
                  {Array.from({ length: totalChapters }, (_, i) => i + 1).map((ch) => (
                    <option key={ch} value={ch}>
                      Глава {ch}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Chapter Text Display Card */}
            <div className="rounded-2xl bg-[#14100E] border border-[#2E241F] p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-[#2A231F] pb-3">
                <span className="text-base sm:text-lg font-bold text-[#EAE6DF] tracking-wide flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-[#C5A059]" />
                  {selectedBook} {selectedChapter}
                </span>

                <button
                  onClick={() => {
                    if (chapterContent?.text) {
                      if (isPlayingAudio) {
                        stopAudio();
                      } else {
                        playAudio(chapterContent.text, `${selectedBook}, глава ${selectedChapter}`);
                      }
                    }
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                    isPlayingAudio
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-[#C5A059]/15 hover:bg-[#C5A059]/25 text-[#E0C080] border border-[#C5A059]/40'
                  }`}
                  title="Озвучить главу"
                >
                  {isPlayingAudio ? (
                    <>
                      <VolumeX className="w-4 h-4" />
                      <span>Пауза / Стоп</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4" />
                      <span>Слушать главу</span>
                    </>
                  )}
                </button>
              </div>

              {loadingChapter ? (
                <div className="py-12 text-center text-stone-500 flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[#C5A059]" />
                  <span className="text-xs">Загрузка текста из bible_synodal.json...</span>
                </div>
              ) : chapterContent ? (
                <div className="text-sm leading-relaxed text-stone-200 font-serif whitespace-pre-line max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {chapterContent.text}
                </div>
              ) : (
                <div className="py-8 text-center text-stone-500 text-sm">
                  Выберите книгу и главу для чтения
                </div>
              )}
            </div>
          </GlassPanel>

          {/* Quick Scripture Search */}
          <GlassPanel className="p-6 border border-[#2A231F]">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Search className="w-5 h-5 text-[#C5A059]" />
              Мгновенный поиск стиха или отрывка
            </h3>
            <p className="text-xs text-stone-400 mb-4">
              Введите точный стих (например: <code>Иоанна 3:16</code>, <code>Псалом 90</code>, <code>1 Коринфянам 13:4-8</code> или <code>Исаия 40:31</code>)
            </p>

            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Иоанна 3:16 или Псалом 22..."
                className="flex-1 bg-[#15110F] border border-[#352B26] rounded-xl px-4 py-2.5 text-sm text-white placeholder-stone-500 focus:outline-none focus:border-[#C5A059]"
              />
              <NeonButton type="submit" disabled={searchLoading} className="px-5 py-2.5">
                {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Найти'}
              </NeonButton>
            </form>

            <div className="flex flex-wrap gap-2 mt-3 text-xs">
              <span className="text-stone-500 py-1">Быстрые стихи:</span>
              {['Иоанна 3:16', 'Псалом 90', 'Псалом 22', '1 Коринфянам 13:4-8', 'Исаия 40:31', 'Иисус Навин 1:9', 'Римлянам 8:28'].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => { setQuery(item); }}
                  className="bg-[#1A1614] hover:bg-[#26201D] text-stone-300 hover:text-white px-2.5 py-1 rounded-lg border border-[#352B26] transition-colors cursor-pointer"
                >
                  {item}
                </button>
              ))}
            </div>

            {searchError && (
              <div className="mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
                {searchError}
              </div>
            )}

            {searchResult && (
              <div className="mt-5 p-5 rounded-2xl bg-[#1C1715] border border-[#C5A059]/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-[#E0C080] tracking-wide flex items-center gap-2">
                    <Bookmark className="w-4 h-4" />
                    {searchResult.ref}
                  </span>
                  <button
                    onClick={() => playAudio(searchResult.text, searchResult.ref)}
                    className="p-1.5 rounded-lg bg-[#C5A059]/15 hover:bg-[#C5A059]/25 text-[#E0C080] transition-colors cursor-pointer"
                    title="Озвучить стих"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-sm leading-relaxed text-stone-200 font-serif whitespace-pre-line">
                  {searchResult.text}
                </div>
              </div>
            )}
          </GlassPanel>
        </div>

        {/* Right 1 Col: Psalm of Day & Audio Overview */}
        <div className="space-y-6">
          {/* Psalm of the Day Card */}
          <GlassPanel className="p-6 border border-[#2A231F] relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[#C5A059]">
                <Sparkles className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">Псалом дня</h3>
              </div>
              <button
                onClick={fetchPsalmOfDay}
                disabled={psalmLoading}
                className="text-xs text-stone-400 hover:text-[#C5A059] transition-colors cursor-pointer"
              >
                {psalmLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Обновить'}
              </button>
            </div>

            {psalm ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#E0C080]">{psalm.ref}</span>
                  <button
                    onClick={() => playAudio(psalm.text, psalm.ref)}
                    className="p-1.5 rounded-lg bg-[#C5A059]/15 hover:bg-[#C5A059]/25 text-[#E0C080] transition-colors cursor-pointer"
                    title="Озвучить псалом"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-stone-200 leading-relaxed font-serif italic bg-[#15110F] p-4 rounded-xl border border-[#2E241F]">
                  «{psalm.text}»
                </p>
                <div className="text-xs text-stone-500 text-right">
                  Синодальный перевод • Без повторов
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-stone-500 text-sm">
                Загрузка ежедневного псалма...
              </div>
            )}
          </GlassPanel>

          {/* Offline Engine Guarantee */}
          <GlassPanel className="p-5 border border-[#2A231F] space-y-3">
            <h4 className="text-xs uppercase font-bold text-stone-400 tracking-wider">
              Локальная безопасность
            </h4>
            <div className="space-y-2 text-xs text-stone-300">
              <div className="p-2.5 rounded-xl bg-[#171311] border border-[#2E241F]">
                <div className="font-semibold text-white mb-0.5">100% Автономность</div>
                <div className="text-stone-400 text-[11px]">Писание читается из локального файла <code>data/bible_synodal.json</code> без сетевых задержек.</div>
              </div>
              <div className="p-2.5 rounded-xl bg-[#171311] border border-[#2E241F]">
                <div className="font-semibold text-white mb-0.5">Синтез речи (TTS)</div>
                <div className="text-stone-400 text-[11px]">Браузерный Web Speech API с поддержкой русского языка воспроизводит выбранные главы в реальном времени.</div>
              </div>
            </div>
          </GlassPanel>
        </div>

      </div>
    </div>
  );
}
