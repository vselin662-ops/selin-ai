import React, { useState, useEffect, useRef } from 'react';
import {
  Globe,
  Briefcase,
  Car,
  Bot,
  ExternalLink,
  Sparkles,
  BookOpen,
  Target,
  CheckCircle,
  BarChart3,
  Flame,
  Volume2,
  Send,
  MessageSquare,
  Shield,
  Database,
  Sliders,
  HelpCircle,
  Menu,
  X,
  Clock,
  Award,
  Mic,
  VolumeX,
  Play,
  Info,
  Terminal as TerminalIcon
} from 'lucide-react';
import { GlassPanel } from './components/GlassPanel';
import { NeonButton } from './components/NeonButton';
import { StaffFeed } from './components/StaffFeed';
import { ModerationPanel } from './components/ModerationPanel';
import { KnowledgeBasePanel } from './components/KnowledgeBasePanel';
import { BibleTrackerPanel } from './components/BibleTrackerPanel';
import { VoiceButton } from './components/VoiceButton';
import { useVoiceRecorder } from './hooks/useVoiceRecorder';
import { SettingsPanel } from './components/SettingsPanel';
import { FAQPanel } from './components/FAQPanel';
import { TerminalPanel } from './components/TerminalPanel';
import { VPNPanel } from './components/VPNPanel';
import { AppConfig } from './types';
import { adminApi } from './lib/adminApi';
import { useAppStore } from './store/useAppStore';
import { ManualModal } from './components/ManualModal';
import { MicGuideModal } from './components/MicGuideModal';
import { VoiceDialogueModal } from './components/VoiceDialogueModal';

const MAX_BOT_URL = "https://max.ru/se13914883_bot";

interface VoiceDialogueState {
  userText: string;
  assistantText: string;
  isGenerating: boolean;
  isOpen: boolean;
}

function normalizeWakeText(text: string): string {
  if (!text) return "";
  let s = text.toLowerCase();
  s = s.replace(/семьсот\s*семьдесят\s*семь/g, "777");
  s = s.replace(/три\s*сем[её]рки/g, "777");
  s = s.replace(/три\s*нуля/g, "000");
  s = s.replace(/семь\s*семь\s*семь/g, "777");
  s = s.replace(/ноль\s*ноль\s*ноль/g, "000");
  s = s.replace(/нуль\s*нуль\s*нуль/g, "000");
  s = s.replace(/\bсемь\b/g, "7");
  s = s.replace(/\bноль\b/g, "0");
  s = s.replace(/\bнуль\b/g, "0");
  return s;
}

function detectClientWakeWord(rawText: string) {
  if (!rawText) return { detected: false, voice: null, mode: null, cleanedText: "", isOnlyWakeWord: false, confirmationSpeech: "" };
  const normalized = normalizeWakeText(rawText);
  const compactText = rawText.toLowerCase().replace(/[\s\-_.,!?:;]+/g, "");

  const maleRegex = /(?:selin|селин|силин|селен|салин|целин|zelin)\s*(?:7\s*7\s*7|777|три\s*сем[её]рки|семь\s*семь\s*семь|семьсот\s*семьдесят\s*семь)/i;
  const femaleRegex = /(?:selin|селин|силин|селен|салин|целин|zelin)\s*(?:0\s*0\s*0|000|[oо]\s*[oо]\s*[oо]|[oо]{3}|три\s*нуля|ноль\s*ноль\s*ноль|нуль\s*нуль\s*нуль)/i;

  let matchedMode: "male" | "female" | null = null;
  let targetVoice: "Charon" | "Kore" | null = null;

  if (maleRegex.test(normalized) || compactText.includes("selin777") || compactText.includes("селин777") || compactText.includes("силин777")) {
    matchedMode = "male";
    targetVoice = "Charon";
  } else if (femaleRegex.test(normalized) || compactText.includes("selin000") || compactText.includes("селин000") || compactText.includes("силин000") || compactText.includes("selinooo") || compactText.includes("селинооо")) {
    matchedMode = "female";
    targetVoice = "Kore";
  }

  if (!matchedMode || !targetVoice) {
    return { detected: false, voice: null, mode: null, cleanedText: rawText.trim(), isOnlyWakeWord: false, confirmationSpeech: "" };
  }

  let cleaned = rawText;
  if (matchedMode === "male") {
    cleaned = cleaned.replace(/(?:привет[\s,]*)?(?:selin|селин|силин|селен|салин|целин|zelin)[\s\-_]*(?:7[\s\-_]*7[\s\-_]*7|777|три\s*сем[её]рки|семь\s*семь\s*семь|семьсот\s*семьдесят\s*семь|семьсемьсемь)[\s,]*/gi, " ");
  } else {
    cleaned = cleaned.replace(/(?:привет[\s,]*)?(?:selin|селин|силин|селен|салин|целин|zelin)[\s\-_]*(?:0[\s\-_]*0[\s\-_]*0|000|[oо][\s\-_]*[oо][\s\-_]*[oо]|[oо]{3}|три\s*нуля|ноль\s*ноль\s*ноль|нольнольноль|нуль\s*нуль\s*нуль)[\s,]*/gi, " ");
  }
  cleaned = cleaned.replace(/\s*,\s*,+/g, ", ").replace(/\s{2,}/g, " ").replace(/^[\s,!:;?—-]+/, "").replace(/[\s,!:;?—-]+$/, "").trim();

  const isOnlyWakeWord = cleaned.length === 0;
  const confirmationSpeech = matchedMode === "male"
    ? "Мужской режим активирован. Я на связи."
    : "Женский режим активирован.";

  return { detected: true, voice: targetVoice, mode: matchedMode, cleanedText: cleaned, isOnlyWakeWord, confirmationSpeech };
}

const AVAILABLE_VOICES = [
  { id: 'Kore', name: 'Kore', label: 'Теплый женский (заводской по умолчанию) ✨', gender: 'female' },
  { id: 'Charon', name: 'Charon', label: 'Инженер / Мужской голос (Selin777) 🏛️', gender: 'male' },
  { id: 'Aoede', name: 'Aoede', label: 'Мелодичный женский 🎵', gender: 'female' },
  { id: 'Orus', name: 'Orus', label: 'Уверенный мужской 🎙️', gender: 'male' },
  { id: 'Alnilam', name: 'Alnilam', label: 'Глубокий мужской 🔊', gender: 'male' },
  { id: 'Fenrir', name: 'Fenrir', label: 'Бархатный мужской 🎙️', gender: 'male' },
  { id: 'Puck', name: 'Puck', label: 'Энергичный мужской ⚡', gender: 'male' },
  { id: 'Zephyr', name: 'Zephyr', label: 'Мягкий доверительный 🍃', gender: 'neutral' },
];

export default function App() {
  const {
    activeTab,
    setActiveTab,
    menuOpen,
    setMenuOpen,
    voiceToast,
    setVoiceToast,
    showMicGuide,
    setShowMicGuide,
    config,
    setConfig,
    activeVoice,
    setActiveVoice,
    conversationId,
    voiceDialogue,
    setVoiceDialogue,
    showManual,
    setShowManual,
    manualTitle,
    manualContent,
    openManual,
  } = useAppStore();

  const voiceStepRef = useRef<string>('ASK_NAME');
  const voiceUserNameRef = useRef<string>('');

  const [isAdminAuthorized] = useState<boolean>(true);

  useEffect(() => {
    // Admin password removed: auto-provision admin token
    if (!localStorage.getItem('selin_admin_token')) {
      fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.token) {
            localStorage.setItem('selin_admin_token', data.token);
          }
        })
        .catch(() => {
          localStorage.setItem('selin_admin_token', 'admin-direct-access');
        });
    }
  }, []);

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Load server config on startup
  useEffect(() => {
    adminApi('/api/get-config')
      .then((res) => res.json())
      .then((data) => {
        if (data?.config) {
          setConfig(data.config);
          const savedVoice = data.config.tts_voice || data.config.voice_id;
          if (savedVoice) {
            setActiveVoice(savedVoice);
            localStorage.setItem('selin_voice', savedVoice);
          }
        }
      })
      .catch((err) => console.warn('Failed to load company config:', err));
  }, []);

  const handleSaveConfig = async (updatedConfig: AppConfig) => {
    setConfig(updatedConfig);
    if (updatedConfig.tts_voice || updatedConfig.voice_id) {
      const v = updatedConfig.tts_voice || updatedConfig.voice_id;
      setActiveVoice(v);
      localStorage.setItem('selin_voice', v);
    }
    try {
      await adminApi('/api/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig),
      });
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  };

  const handleVoiceChange = (newVoice: string) => {
    setActiveVoice(newVoice);
    localStorage.setItem('selin_voice', newVoice);
    if (config) {
      const updated = { ...config, tts_voice: newVoice, voice_id: newVoice };
      handleSaveConfig(updated);
    }
  };

  // Stop any ongoing audio playback
  const stopAllAudio = () => {
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current = null;
      } catch (_) {}
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        currentUtteranceRef.current = null;
      } catch (_) {}
    }
  };

  // Synthesize and speak text via Studio Neural TTS (Gemini TTS with WAV audio)
  const speakText = async (text: string, voiceOverride?: string, onEnd?: () => void) => {
    if (!text || !text.trim()) {
      if (onEnd) onEnd();
      return;
    }

    stopAllAudio();
    const chosenVoice = voiceOverride || activeVoice || config?.tts_voice || config?.voice_id || 'Charon';

    try {
      setVoiceStateCustom('speaking');

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: chosenVoice, chatId: conversationId }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.audioUrl) {
          const audio = new Audio(data.audioUrl);
          currentAudioRef.current = audio;

          audio.onended = () => {
            setVoiceStateCustom('idle');
            currentAudioRef.current = null;
            if (onEnd) onEnd();
          };

          audio.onerror = (e) => {
            console.warn('Audio playback error:', e);
            setVoiceStateCustom('idle');
            currentAudioRef.current = null;
            if (onEnd) onEnd();
          };

          await audio.play();
          return;
        }
      }
    } catch (err) {
      console.warn('Studio High-Quality TTS call failed, fallback to Web Speech:', err);
    }

    // Fallback to browser SpeechSynthesis ONLY if server neural TTS fails
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        currentUtteranceRef.current = utterance;
        utterance.lang = 'ru-RU';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        const voices = window.speechSynthesis.getVoices();
        const ruVoice = voices.find((v) => v.lang?.includes('ru') || v.lang?.includes('RU'));
        if (ruVoice) utterance.voice = ruVoice;

        utterance.onend = () => {
          setVoiceStateCustom('idle');
          currentUtteranceRef.current = null;
          if (onEnd) onEnd();
        };
        utterance.onerror = () => {
          setVoiceStateCustom('idle');
          currentUtteranceRef.current = null;
          if (onEnd) onEnd();
        };

        window.speechSynthesis.speak(utterance);
      } catch (_) {
        setVoiceStateCustom('idle');
        currentUtteranceRef.current = null;
        if (onEnd) onEnd();
      }
    } else {
      setVoiceStateCustom('idle');
      if (onEnd) onEnd();
    }
  };

  const handleVoiceInput = async (text: string) => {
    if (!text || !text.trim()) {
      setVoiceStateCustom('idle');
      return;
    }

    console.log("voice_turn_start", text);

    stopAllAudio();

    // Check for smart speaker voice wake words ("Selin777" for Charon male, "Selin000" for Kore female)
    const wakeResult = detectClientWakeWord(text);
    let effectiveVoice = activeVoice;

    if (wakeResult.detected) {
      effectiveVoice = wakeResult.voice!;
      setActiveVoice(wakeResult.voice!);
      localStorage.setItem('selin_voice', wakeResult.voice!);
      if (config) {
        handleSaveConfig({ ...config, tts_voice: wakeResult.voice!, voice_id: wakeResult.voice! });
      }

      setVoiceToast(wakeResult.mode === 'male' 
        ? '🎙️ Голосовая команда Selin777: Включен мужской голос (Charon)' 
        : '🎙️ Голосовая команда Selin000: Включен заводской женский голос (Kore)');

      if (wakeResult.isOnlyWakeWord) {
        setVoiceDialogue({
          userText: text,
          assistantText: wakeResult.confirmationSpeech,
          isGenerating: false,
          isOpen: true,
        });
        await speakText(wakeResult.confirmationSpeech, wakeResult.voice!, () => {
          console.log("voice_tts_ended");
          console.log("voice_loop_rearm");
          startRecording().catch(console.error);
        });
        return;
      }
    }

    setVoiceDialogue({
      userText: text,
      assistantText: '',
      isGenerating: true,
      isOpen: true,
    });
    if (!wakeResult.detected) {
      setVoiceToast(`Вы: "${text}"`);
    }

    // Set UI to 'processing' state
    setVoiceStateCustom('processing');

    let speakingStarted = false;
    try {
      const res = await fetch('/api/voice-organism-dialogue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userInput: text,
          history: [],
          step: voiceStepRef.current,
          userName: voiceUserNameRef.current,
          chatId: conversationId,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const reply = data?.speech || data?.reply || 'Я вас слышу! Чем я могу помочь по вашим задачам или языкам?';

      if (data?.nextStep) voiceStepRef.current = data.nextStep;
      if (data?.userName) voiceUserNameRef.current = data.userName;

      setVoiceDialogue({
        userText: text,
        assistantText: reply,
        isGenerating: false,
        isOpen: true,
      });

      const voiceToUse = data?.voice || effectiveVoice;
      speakingStarted = true;
      await speakText(reply, voiceToUse, () => {
        console.log("voice_tts_ended");
        console.log("voice_loop_rearm");
        startRecording().catch(console.error);
      });
    } catch (err) {
      console.warn('Voice AI dialogue error, fallback to local reply:', err);
      const fallbackReply = `Принято! Вы сказали: "${text}". Я готов помочь с автоматизацией бизнеса, изучением языков или рутиной.`;
      setVoiceDialogue({
        userText: text,
        assistantText: fallbackReply,
        isGenerating: false,
        isOpen: true,
      });
      speakingStarted = true;
      await speakText(fallbackReply, effectiveVoice, () => {
        console.log("voice_tts_ended");
        console.log("voice_loop_rearm");
        startRecording().catch(console.error);
      });
    } finally {
      if (!speakingStarted) {
        setVoiceStateCustom('idle');
      }
    }
  };

  const {
    state: voiceState,
    volume: voiceVolume,
    duration: voiceDuration,
    error: voiceError,
    startRecording,
    stopRecording,
    setState: setVoiceStateCustom,
    clearError,
  } = useVoiceRecorder({
    onTranscript: (text) => {
      handleVoiceInput(text);
    },
    onError: (err) => {
      setVoiceToast(err);
      setShowMicGuide(true);
    },
  });

  const handleVoiceClick = () => {
    if (voiceState === 'idle') {
      stopAllAudio();
      clearError();
      startRecording();
    } else if (voiceState === 'recording') {
      stopRecording();
    } else if (voiceState === 'speaking') {
      stopAllAudio();
      setVoiceStateCustom('idle');
    }
  };

  // Quick stats state
  const [langStats, setLangStats] = useState({ level: 'A1', words: 0, streak: 0, lang: 'Английский' });
  const [bizStats, setBizStats] = useState({ tasksDone: 0, streak: 0, stage: 'Идея' });

  return (
    <div className="min-h-screen bg-[#0F0D0C] text-[#EAE6DF] font-sans selection:bg-[#C5A059]/30 relative overflow-x-hidden">
      {/* Background Glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gradient-to-b from-[#C5A059]/15 via-[#C5A059]/5 to-transparent blur-[120px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#161210]/90 backdrop-blur-xl border-b border-[#2A231F]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-bold text-[#EAE6DF] tracking-wide leading-none flex items-center gap-2">
                Selin AI
                <span className="text-[10px] font-semibold tracking-wider text-[#C5A059] bg-[#C5A059]/10 border border-[#C5A059]/30 px-2 py-0.5 rounded-full uppercase">
                  v2.1
                </span>
              </h1>
              <p className="text-xs text-[#9E958C] mt-0.5">Интеллектуальный наставник</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Header Voice Button */}
            <button
              onClick={handleVoiceClick}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                voiceState === 'recording'
                  ? 'bg-red-950/80 border-red-500/80 text-red-100 animate-pulse shadow-lg shadow-red-500/20'
                  : voiceState === 'speaking'
                  ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-100 shadow-lg shadow-emerald-500/20'
                  : 'bg-[#221C19] border-[#362E29] text-[#EAE6DF] hover:border-[#C5A059]/50 hover:bg-[#2A221E]'
              }`}
              title={voiceState === 'recording' ? 'Остановить запись' : 'Голосовой ввод'}
            >
              <Mic className={`w-3.5 h-3.5 ${voiceState === 'recording' ? 'text-red-400 animate-ping' : 'text-[#C5A059]'}`} />
              <span className="hidden sm:inline">
                {voiceState === 'recording' ? 'Слушаю...' : voiceState === 'speaking' ? 'Говорю...' : 'Голос'}
              </span>
            </button>

            <a
              href={MAX_BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#C5A059] text-[#0F0D0C] hover:bg-[#D4B06A] transition-all duration-200 shadow-lg shadow-[#C5A059]/15 hover:shadow-[#C5A059]/25 hover:-translate-y-0.5 active:translate-y-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Открыть в Max</span>
              <ExternalLink className="w-3 h-3 opacity-70" />
            </a>

            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 rounded-xl bg-[#221C19] border border-[#362E29] text-[#9E958C] hover:text-[#EAE6DF] hover:border-[#C5A059]/50 transition-all md:hidden"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {menuOpen && (
          <div className="md:hidden border-t border-[#2A231F] bg-[#161210]/95 px-4 py-3 space-y-1.5 animate-fade-in">
            <button
              onClick={() => { setActiveTab('main'); setMenuOpen(false); }}
              className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-all ${
                activeTab === 'main' ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold' : 'text-[#9E958C] hover:bg-[#221C19] hover:text-[#EAE6DF]'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Главная</span>
            </button>
            <button
              onClick={() => { setActiveTab('languages'); setMenuOpen(false); }}
              className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-all ${
                activeTab === 'languages' ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold' : 'text-[#9E958C] hover:bg-[#221C19] hover:text-[#EAE6DF]'
              }`}
            >
              <Globe className="w-4 h-4 text-blue-400" />
              <span>Языки</span>
            </button>
            <button
              onClick={() => { setActiveTab('business'); setMenuOpen(false); }}
              className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-all ${
                activeTab === 'business' ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold' : 'text-[#9E958C] hover:bg-[#221C19] hover:text-[#EAE6DF]'
              }`}
            >
              <Briefcase className="w-4 h-4 text-amber-400" />
              <span>Бизнес</span>
            </button>
            <button
              onClick={() => { setActiveTab('feed'); setMenuOpen(false); }}
              className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-all ${
                activeTab === 'feed' ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold' : 'text-[#9E958C] hover:bg-[#221C19] hover:text-[#EAE6DF]'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Лента штаба</span>
            </button>
            <button
              onClick={() => { setActiveTab('terminal'); setMenuOpen(false); }}
              className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-all ${
                activeTab === 'terminal' ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold' : 'text-[#9E958C] hover:bg-[#221C19] hover:text-[#EAE6DF]'
              }`}
            >
              <TerminalIcon className="w-4 h-4" />
              <span>Терминал СВМ</span>
            </button>
            <button
              onClick={() => { setActiveTab('vpn'); setMenuOpen(false); }}
              className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-all ${
                activeTab === 'vpn' ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold' : 'text-[#9E958C] hover:bg-[#221C19] hover:text-[#EAE6DF]'
              }`}
            >
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Selin VPN</span>
            </button>
            <button
              onClick={() => { setActiveTab('moderation'); setMenuOpen(false); }}
              className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-all ${
                activeTab === 'moderation' ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold' : 'text-[#9E958C] hover:bg-[#221C19] hover:text-[#EAE6DF]'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Модерация</span>
            </button>
            <button
              onClick={() => { setActiveTab('knowledge'); setMenuOpen(false); }}
              className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-all ${
                activeTab === 'knowledge' ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold' : 'text-[#9E958C] hover:bg-[#221C19] hover:text-[#EAE6DF]'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>База знаний</span>
            </button>
            <button
              onClick={() => { setActiveTab('settings'); setMenuOpen(false); }}
              className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-all ${
                activeTab === 'settings' ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold' : 'text-[#9E958C] hover:bg-[#221C19] hover:text-[#EAE6DF]'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Настройки</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Layout */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 relative z-10">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6 custom-scrollbar border-b border-[#2A231F]">
          <button
            onClick={() => setActiveTab('main')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all shrink-0 flex items-center gap-2 ${
              activeTab === 'main'
                ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold'
                : 'bg-[#1C1715] text-[#9E958C] hover:text-[#EAE6DF] hover:bg-[#26201D]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Главная</span>
          </button>

          <button
            onClick={() => setActiveTab('languages')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all shrink-0 flex items-center gap-2 ${
              activeTab === 'languages'
                ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold'
                : 'bg-[#1C1715] text-[#9E958C] hover:text-[#EAE6DF] hover:bg-[#26201D]'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            <span>Языки</span>
          </button>

          <button
            onClick={() => setActiveTab('business')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all shrink-0 flex items-center gap-2 ${
              activeTab === 'business'
                ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold'
                : 'bg-[#1C1715] text-[#9E958C] hover:text-[#EAE6DF] hover:bg-[#26201D]'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5 text-amber-400" />
            <span>Бизнес</span>
          </button>

          <button
            onClick={() => setActiveTab('feed')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all shrink-0 flex items-center gap-2 ${
              activeTab === 'feed'
                ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold'
                : 'bg-[#1C1715] text-[#9E958C] hover:text-[#EAE6DF] hover:bg-[#26201D]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Лента штаба</span>
          </button>

          <button
            onClick={() => setActiveTab('terminal')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all shrink-0 flex items-center gap-2 ${
              activeTab === 'terminal'
                ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold'
                : 'bg-[#1C1715] text-[#9E958C] hover:text-[#EAE6DF] hover:bg-[#26201D]'
            }`}
          >
            <TerminalIcon className="w-3.5 h-3.5" />
            <span>Терминал СВМ</span>
          </button>

          <button
            onClick={() => setActiveTab('vpn')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all shrink-0 flex items-center gap-2 ${
              activeTab === 'vpn'
                ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold'
                : 'bg-[#1C1715] text-[#9E958C] hover:text-[#EAE6DF] hover:bg-[#26201D]'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Selin VPN</span>
          </button>

          <button
            onClick={() => setActiveTab('bible')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all shrink-0 flex items-center gap-2 ${
              activeTab === 'bible'
                ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold'
                : 'bg-[#1C1715] text-[#9E958C] hover:text-[#EAE6DF] hover:bg-[#26201D]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
            <span>Библия и трекер</span>
          </button>

          <button
            onClick={() => setActiveTab('moderation')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all shrink-0 flex items-center gap-2 ${
              activeTab === 'moderation'
                ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold'
                : 'bg-[#1C1715] text-[#9E958C] hover:text-[#EAE6DF] hover:bg-[#26201D]'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Модерация</span>
          </button>

          <button
            onClick={() => setActiveTab('knowledge')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all shrink-0 flex items-center gap-2 ${
              activeTab === 'knowledge'
                ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold'
                : 'bg-[#1C1715] text-[#9E958C] hover:text-[#EAE6DF] hover:bg-[#26201D]'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>База знаний</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all shrink-0 flex items-center gap-2 ${
              activeTab === 'settings'
                ? 'bg-[#C5A059] text-[#0F0D0C] font-semibold'
                : 'bg-[#1C1715] text-[#9E958C] hover:text-[#EAE6DF] hover:bg-[#26201D]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Настройки</span>
          </button>
        </div>

        {/* Интерактивная Кнопка Мануала и Руководства для текущего открытого окна */}
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-[#201916] to-[#161210] border border-[#C5A059]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#C5A059]/10 border border-[#C5A059]/30 flex items-center justify-center text-[#C5A059] shrink-0">
              <HelpCircle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#EAE6DF] uppercase tracking-wider">❓ Как устроен этот раздел?</h4>
              <p className="text-[11px] text-[#9E958C] mt-0.5">
                {activeTab === 'main' && 'Главный пульт управления, голосовой интерфейс и быстрые команды.'}
                {activeTab === 'languages' && 'Профессиональный ИИ-репетитор с алгоритмом Anki (SM-2), Shadowing и разбором ДЗ.'}
                {activeTab === 'business' && 'Интеллектуальный бизнес-трекер: SMART-задачи, отчетность и симулятор продаж.'}
                {activeTab === 'lifestyle' && 'Автоматизация быта (такси, еда, отели) голосовыми командами.'}
                {activeTab === 'feed' && 'Живой логгер и пульт HITL (утверждение ответов ИИ перед отправкой клиентам).'}
                {activeTab === 'terminal' && 'Прямой доступ к ядру СВМ: выполнение системных команд, мониторинг ресурсов и логи сервера.'}
                {activeTab === 'vpn' && 'Сверхзащищенный SOCKS5-туннель для безопасного выхода в сеть и анонимизации трафика.'}
                {activeTab === 'bible' && 'Духовный трекер: План Победы, рассылка псалмов, молитв и утренний брифинг.'}
                {activeTab === 'moderation' && 'Панель модерации контента и управление поведением нейросети.'}
                {activeTab === 'knowledge' && 'Локальный суверенный поисковик и база знаний проекта (без передачи данных в США).'}
                {activeTab === 'settings' && 'Конфигурация проекта, выбор голоса и тон общения ИИ.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              let title = "Руководство";
              let content = "";
              if (activeTab === 'main') {
                title = "Главный пульт Selin AI";
                content = "Добро пожаловать в Ядро Selin AI! На главном экране вы можете общаться с ИИ голосом. Встроенный голосовой интерфейс понимает Wake-слова (Selin777 для мужского голоса, Selin000 для женского). Бот работает автономно без отправки ваших аудио в США. Вы можете нажать быстрые команды внизу голосовой карточки для моментального старта.";
              } else if (activeTab === 'languages') {
                title = "Модуль Языкового Наставника";
                content = "Агент не просто выдает слова, он ведет вас по стадиям обучения. \n\nКоманды в MAX-боте:\n• /язык английский (или другой) — выбор курса. Агент выполнит суверенный поиск по Яндексу и найдет лучшую бесплатную программу.\n• новый урок — агент объяснит тему, даст 3-4 ключевых слова и ЗАДАСТ ПРОВЕРОЧНЫЙ ВОПРОС.\n• Ответ на вопрос — просто напишите ответ в чат. Агент сам распознает проверку ДЗ, оценит по 5-бальной шкале и разберет ошибки.\n• повторение — запуск карточек Anki (SM-2) со скрытым переводом.\n• прогресс — просмотр вашей статистики и ударных дней (streak).";
              } else if (activeTab === 'business') {
                title = "Бизнес-Ментор Selin AI";
                content = "Этот модуль заменяет дорогого трекера и помогает расти по SMART-методологии.\n\nКоманды в MAX-боте:\n• /бизнес — запустить менторинг и диагностику.\n• задание — получить жесткую прикладную задачу на сегодня. Срок сдачи — до 20:00.\n• отчёт [ваш текст] — сдать отчет о выполнении. Агент проанализирует результат и зафиксирует его в БД.\n• ролевая игра — бот притворится вредным клиентом или крупным байером и будет возражать, а вы должны закрыть сделку.\n• обзор — еженедельный срез узких мест бизнеса.";
              } else if (activeTab === 'feed') {
                title = "Живой Реестр Штаба (HITL)";
                content = "Ваш пульт безопасности. Если ИИ-продавцу пишет внешний клиент, ответ не улетает напрямую. Черновик ответа падает в эту ленту. Вы читаете его и нажимаете кнопку 'Утвердить' или вносите корректировки. Это исключает галлюцинации ИИ перед клиентами.";
              } else if (activeTab === 'terminal') {
                title = "Консоль Ядра СВМ";
                content = "Прямой терминал управления вашей виртуальной машиной. Вы можете выполнять безопасные системные команды, проверять логи и статус Docker-контейнеров. Все действия логируются в системе аудита.";
              } else if (activeTab === 'vpn') {
                title = "Selin Security Tunnel (VPN)";
                content = "Ваш персональный SOCKS5-прокси сервер, запущенный внутри проекта. \n\nКак использовать:\n1. Нажмите 'Запустить VPN'.\n2. Настройте ваше устройство или браузер на использование SOCKS5 прокси (адрес текущего сайта, порт по умолчанию 1080).\n3. Трафик будет шифроваться и проходить через узел Selin AI, скрывая ваш реальный IP и защищая данные.";
              } else if (activeTab === 'bible') {
                title = "План Победы и Духовный трекер";
                content = "Настройка утренней рассылки духовного брифинга (Библия, псалмы, погода, притчи) и вечернего контроля. Вы можете настроить время рассылки и часовой пояс кнопками прямо в MAX-боте.";
              } else if (activeTab === 'knowledge') {
                title = "Суверенная База Знаний";
                content = "Сюда вы можете загружать свои регламенты, книги, законы. Поиск по базе полностью суверенен и происходит локально. Все американские системы вырезаны. Поиск в сети идет через Яндекс.XML API.";
              } else {
                title = "Настройка Selin AI";
                content = "Здесь вы задаете имя владельца, название бизнеса, язык по умолчанию и выбираете голосовой движок. Все изменения мгновенно сохраняются в локальной SQLite БД.";
              }
              openManual(title, content);
            }}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#C5A059] text-[#0F0D0C] text-xs font-bold uppercase tracking-wider hover:bg-[#D4B06A] transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-[#C5A059]/10 shrink-0"
          >
            <Info className="w-4 h-4" />
            <span>Открыть Инструкцию</span>
          </button>
        </div>

        {/* TAB 1: MAIN HERO SCREEN */}
        {activeTab === 'main' && (
          <div className="space-y-8">
            {/* Banner with Embedded Voice Terminal */}
            <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-[#1E1815] via-[#161210] to-[#120F0D] border border-[#2E2621] relative overflow-hidden shadow-2xl flex flex-col lg:flex-row items-center justify-between gap-8">
              <div className="absolute top-0 right-0 w-96 h-96 bg-[#C5A059]/10 rounded-full blur-3xl pointer-events-none" />
              <div className="max-w-xl relative z-10 space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#C5A059]/10 border border-[#C5A059]/30 text-[#C5A059] text-xs font-medium">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Selin AI — Автономный Интеллект</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-[#EAE6DF] tracking-tight leading-tight">
                  Selin AI — <span className="text-[#C5A059]">автономный интеллект</span> общего назначения
                </h2>
                <p className="text-sm text-[#A89E94] leading-relaxed">
                  Не чат-бот. Не помощник. Интеллект, который учится, помнит и действует.
                </p>
                <div className="text-xs text-[#C5A059] font-medium italic">
                  «Сегодня в твоём телефоне. Завтра — рядом с тобой.»
                </div>
                <div className="pt-2 flex flex-wrap gap-3">
                  <a
                    href={MAX_BOT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3 rounded-xl bg-[#C5A059] text-[#0F0D0C] font-bold text-xs uppercase tracking-wider hover:bg-[#D4B06A] transition-all duration-200 inline-flex items-center gap-2 shadow-lg shadow-[#C5A059]/20"
                  >
                    <span>Открыть в Max</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => setActiveTab('terminal')}
                    className="px-6 py-3 rounded-xl bg-[#26201D] text-[#EAE6DF] border border-[#382F2A] font-semibold text-xs hover:border-[#C5A059]/40 transition-all"
                  >
                    Консоль Ядра
                  </button>
                </div>
              </div>

              {/* Embedded Voice Station on the Main Page */}
              <div className="w-full lg:w-80 relative z-10">
                <div className="p-5 rounded-2xl bg-[#14100E]/90 border border-[#C5A059]/30 shadow-2xl backdrop-blur-md flex flex-col items-center text-center space-y-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#C5A059] uppercase tracking-wider">
                    <Mic className="w-4 h-4" />
                    <span>Голосовой интерфейс</span>
                  </div>

                  <VoiceButton
                    state={voiceState}
                    volume={voiceVolume}
                    duration={voiceDuration}
                    onClick={handleVoiceClick}
                    error={voiceError}
                    onOpenPermissionGuide={() => setShowMicGuide(true)}
                    variant="embedded"
                  />

                  {/* Fast Suggested Prompts */}
                  <div className="w-full pt-1 border-t border-[#261E1A] space-y-1.5">
                    <div className="text-[10px] text-[#7A7167] font-medium">Быстрый голосовой запрос:</div>
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      <button
                        onClick={() => {
                          console.log("quick_command_click", "Читай Библию");
                          console.log("quick_command_click(Читай Библию)");
                          handleVoiceInput('Читай Библию');
                        }}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-[#1F1916] text-[#A89E94] hover:text-[#EAE6DF] hover:bg-[#2A221E] border border-[#332822] transition-colors"
                      >
                        «Читай Библию»
                      </button>
                      <button
                        onClick={() => {
                          console.log("quick_command_click", "Аудит бизнеса");
                          console.log("quick_command_click(Аудит бизнеса)");
                          handleVoiceInput('Проведи аудит моего бизнеса');
                        }}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-[#1F1916] text-[#A89E94] hover:text-[#EAE6DF] hover:bg-[#2A221E] border border-[#332822] transition-colors"
                      >
                        «Аудит бизнеса»
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2 СУВЕРЕННЫЕ СЛУЖБЫ ШТАБА */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card 1: Languages */}
              <div
                onClick={() => {
                  console.log("quick_command_click", "Языковой Наставник");
                  console.log("quick_command_click(Языковой Наставник)");
                  setActiveTab('languages');
                  handleVoiceInput('Помоги выучить английский');
                }}
                className="group p-6 rounded-2xl bg-[#161210] border border-[#2A231F] hover:border-[#C5A059]/50 transition-all duration-300 cursor-pointer flex flex-col justify-between hover:-translate-y-1 shadow-xl hover:shadow-[#C5A059]/5"
              >
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                    <Globe className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[#EAE6DF] group-hover:text-[#C5A059] transition-colors">
                      🌍 Языковой Наставник
                    </h3>
                    <p className="text-xs text-[#A89E94] mt-2 leading-relaxed">
                      Интервальные повторения Anki (SM-2), генерация уроков с диалогами, shadowing произношения и проверка домашних заданий.
                    </p>
                  </div>
                </div>

                <div className="pt-6 border-t border-[#26201D] mt-6 flex items-center justify-between text-xs font-semibold text-blue-400">
                  <span>Перейти к обучению</span>
                  <span>→</span>
                </div>
              </div>

              {/* Card 2: Business */}
              <div
                onClick={() => {
                  console.log("quick_command_click", "Бизнес-Ментор");
                  console.log("quick_command_click(Бизнес-Ментор)");
                  setActiveTab('business');
                  handleVoiceInput('Проведи аудит моего бизнеса');
                }}
                className="group p-6 rounded-2xl bg-[#161210] border border-[#2A231F] hover:border-[#C5A059]/50 transition-all duration-300 cursor-pointer flex flex-col justify-between hover:-translate-y-1 shadow-xl hover:shadow-[#C5A059]/5"
              >
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                    <Briefcase className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[#EAE6DF] group-hover:text-[#C5A059] transition-colors">
                      💼 Бизнес-Ментор
                    </h3>
                    <p className="text-xs text-[#A89E94] mt-2 leading-relaxed">
                      Экспресс-диагностика бизнеса, ежедневные SMART-задания, симулятор ролевых игр по продажам и еженедельный разбор отчётов.
                    </p>
                  </div>
                </div>

                <div className="pt-6 border-t border-[#26201D] mt-6 flex items-center justify-between text-xs font-semibold text-amber-400">
                  <span>Запустить менторство</span>
                  <span>→</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LANGUAGES */}
        {activeTab === 'languages' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-[#161210] border border-[#2A231F] space-y-4">
              <div className="flex items-center gap-3">
                <Globe className="w-8 h-8 text-blue-400" />
                <div>
                  <h3 className="text-xl font-bold text-[#EAE6DF]">🌍 Языковой модуль Selin AI</h3>
                  <p className="text-xs text-[#A89E94]">Профессиональный наставник с алгоримом SM-2</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
                <div className="p-4 rounded-xl bg-[#1C1715] border border-[#2A231F]">
                  <div className="text-xs text-[#9E958C]">Алгоритм повторений</div>
                  <div className="text-lg font-bold text-[#EAE6DF] mt-1">Anki (SM-2)</div>
                  <div className="text-[10px] text-blue-400 mt-1">Интервалы 1d, 6d, ef</div>
                </div>

                <div className="p-4 rounded-xl bg-[#1C1715] border border-[#2A231F]">
                  <div className="text-xs text-[#9E958C]">Практика произношения</div>
                  <div className="text-lg font-bold text-[#EAE6DF] mt-1">Shadowing</div>
                  <div className="text-[10px] text-emerald-400 mt-1">Голосовой анализ AI</div>
                </div>

                <div className="p-4 rounded-xl bg-[#1C1715] border border-[#2A231F]">
                  <div className="text-xs text-[#9E958C]">Проверка домашних заданий</div>
                  <div className="text-lg font-bold text-[#EAE6DF] mt-1">Selin AI</div>
                  <div className="text-[10px] text-amber-400 mt-1">Оценка и разбор ошибок</div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#1F1916] border border-[#382E27] space-y-2">
                <h4 className="text-xs font-bold text-[#C5A059] uppercase tracking-wider">Команды в Max-боте:</h4>
                <div className="text-xs text-[#D8D2C9] space-y-1 font-mono">
                  <p><span className="text-[#C5A059]">/язык английский</span> — начать курс или сменить язык</p>
                  <p><span className="text-[#C5A059]">новый урок</span> — сгенерировать 5 новых слов и диалог</p>
                  <p><span className="text-[#C5A059]">повторение</span> — список слов для повторения сегодня</p>
                  <p><span className="text-[#C5A059]">прогресс</span> — общая статистика и текущий streak</p>
                </div>
              </div>

              <div className="pt-2">
                <a
                  href={MAX_BOT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 rounded-xl bg-[#C5A059] text-[#0F0D0C] font-bold text-xs uppercase tracking-wider hover:bg-[#D4B06A] transition-all inline-flex items-center gap-2 shadow-lg shadow-[#C5A059]/15"
                >
                  <span>Начать обучение в Max</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BUSINESS */}
        {activeTab === 'business' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-[#161210] border border-[#2A231F] space-y-4">
              <div className="flex items-center gap-3">
                <Briefcase className="w-8 h-8 text-amber-400" />
                <div>
                  <h3 className="text-xl font-bold text-[#EAE6DF]">💼 Бизнес-ментор Selin AI</h3>
                  <p className="text-xs text-[#A89E94]">Пошаговое сопровождение предпринимателя до результата</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
                <div className="p-4 rounded-xl bg-[#1C1715] border border-[#2A231F]">
                  <div className="text-xs text-[#9E958C]">Экспресс-диагностика</div>
                  <div className="text-lg font-bold text-[#EAE6DF] mt-1">5 Вопросов</div>
                  <div className="text-[10px] text-amber-400 mt-1">Ниша, стадия, цели</div>
                </div>

                <div className="p-4 rounded-xl bg-[#1C1715] border border-[#2A231F]">
                  <div className="text-xs text-[#9E958C]">Дневные задачи</div>
                  <div className="text-lg font-bold text-[#EAE6DF] mt-1">SMART-контроль</div>
                  <div className="text-[10px] text-emerald-400 mt-1">1 задача на сегодня</div>
                </div>

                <div className="p-4 rounded-xl bg-[#1C1715] border border-[#2A231F]">
                  <div className="text-xs text-[#9E958C]">Симулятор переговоров</div>
                  <div className="text-lg font-bold text-[#EAE6DF] mt-1">Sales Roleplay</div>
                  <div className="text-[10px] text-blue-400 mt-1">AI-клиент с возражениями</div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#1F1916] border border-[#382E27] space-y-2">
                <h4 className="text-xs font-bold text-[#C5A059] uppercase tracking-wider">Команды в Max-боте:</h4>
                <div className="text-xs text-[#D8D2C9] space-y-1 font-mono">
                  <p><span className="text-[#C5A059]">/бизнес</span> — запустить экспресс-диагностику</p>
                  <p><span className="text-[#C5A059]">задание</span> — получить конкретную задачу на сегодня</p>
                  <p><span className="text-[#C5A059]">отчёт [текст]</span> — сдать отчёт о выполнении</p>
                  <p><span className="text-[#C5A059]">ролевая игра</span> — запустить тренировку продаж</p>
                  <p><span className="text-[#C5A059]">обзор</span> — еженедельный разбор результатов</p>
                </div>
              </div>

              <div className="pt-2">
                <a
                  href={MAX_BOT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 rounded-xl bg-[#C5A059] text-[#0F0D0C] font-bold text-xs uppercase tracking-wider hover:bg-[#D4B06A] transition-all inline-flex items-center gap-2 shadow-lg shadow-[#C5A059]/15"
                >
                  <span>Запустить ментор в Max</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* PANELS FROM HEADQUARTERS */}
        {activeTab === 'feed' && <StaffFeed />}
        {activeTab === 'terminal' && <TerminalPanel />}
        {activeTab === 'vpn' && <VPNPanel />}
        {activeTab === 'bible' && <BibleTrackerPanel />}
        {activeTab === 'moderation' && <ModerationPanel />}
        {activeTab === 'knowledge' && <KnowledgeBasePanel />}
        {activeTab === 'settings' && (
          <SettingsPanel
            config={config || {
              project_name: 'Selin AI',
              owner_name: 'Пользователь',
              business_name: 'Мой Бизнес',
              industry: 'Продажи и услуги',
              channels: ['telegram'],
              tone: 'friendly',
              autonomy_level: 'full',
              voice_id: activeVoice,
              tts_voice: activeVoice,
              is_active: true,
              auto_synthesize: true,
            }}
            onSave={handleSaveConfig}
          />
        )}
      </main>

      {/* Voice Dialogue Modal */}
      <VoiceDialogueModal
        voiceState={voiceState}
        onVoiceChange={handleVoiceChange}
        onStopAudio={stopAllAudio}
        onSpeakText={speakText}
        onStartRecording={startRecording}
        onClearError={clearError}
      />

      {/* Microphone Permission Guide Modal */}
      <MicGuideModal onRetry={() => { clearError(); startRecording(); }} />

      {/* Модальное окно суверенного мануала Selin AI */}
      <ManualModal />

      {/* Интерактивный Голосовой ИИ-Помощник Настройщик (Виджет в углу) */}
      <div className="fixed bottom-6 right-6 z-[1000] animate-bounce">
        <button
          onClick={() => {
            const advice = 
              `Привет! Я — ваш локальный ассистент Selin AI. \n\n` +
              `Сейчас вы находитесь в разделе «${activeTab.toUpperCase()}». \n` +
              `Я могу прямо сейчас помочь вам настроить эту страницу!\n` +
              `Просто нажмите кнопку «Микрофон» на панели выше и дайте мне команду голосом, или перейдите в MAX-бот для глубокой автоматизации.`;
            setVoiceDialogue({
              userText: 'Помощь в настройке',
              assistantText: advice,
              isGenerating: false,
              isOpen: true
            });
            speakText(advice, activeVoice);
          }}
          className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#C5A059] to-[#D4B06A] text-[#0F0D0C] flex items-center justify-center shadow-2xl border-2 border-[#161210] hover:scale-110 transition-transform cursor-pointer"
          title="Нужна помощь с настройкой?"
        >
          <Bot className="w-7 h-7" />
        </button>
      </div>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-8 border-t border-[#2A231F] mt-12 text-center text-xs text-[#7A7167]">
        <p>© 2026 Selin AI · Интеллектуальный наставник & Автономный цифровой сотрудник</p>
      </footer>
    </div>
  );
}
