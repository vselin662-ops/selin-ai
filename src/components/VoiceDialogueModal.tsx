import React from 'react';
import { X, Volume2, VolumeX, Play, Mic } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

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

interface VoiceDialogueModalProps {
  voiceState: string;
  onVoiceChange: (voice: string) => void;
  onStopAudio: () => void;
  onSpeakText: (text: string, voice?: string) => void;
  onStartRecording: () => void;
  onClearError: () => void;
}

export const VoiceDialogueModal: React.FC<VoiceDialogueModalProps> = ({
  voiceState,
  onVoiceChange,
  onStopAudio,
  onSpeakText,
  onStartRecording,
  onClearError,
}) => {
  const { voiceDialogue, activeVoice, closeVoiceDialogue } = useAppStore();

  if (!voiceDialogue.isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg bg-[#161210] border border-[#C5A059]/40 rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[#2A231F] pb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-3 h-3 rounded-full ${voiceState === 'speaking' ? 'bg-emerald-400 animate-pulse' : 'bg-[#C5A059]'}`} />
            <h4 className="text-sm font-bold text-[#EAE6DF]">Голосовой диалог с Selin</h4>
          </div>
          <button
            onClick={() => {
              onStopAudio();
              closeVoiceDialogue();
            }}
            className="p-1 rounded-lg text-[#9E958C] hover:text-[#EAE6DF] hover:bg-[#221C19]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Voice Model Selector Chips */}
        <div className="space-y-1.5 bg-[#1B1512] p-3 rounded-xl border border-[#2E241E]">
          <div className="text-[10px] font-semibold text-[#C5A059] uppercase tracking-wider flex items-center justify-between">
            <span>Голос Selin (Студийный AI):</span>
            <span className="text-[#8E8478] lowercase">{AVAILABLE_VOICES.find(v => v.id === activeVoice)?.gender === 'female' ? 'женский' : 'мужской'}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {AVAILABLE_VOICES.map((v) => {
              const isSelected = activeVoice === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => {
                    onVoiceChange(v.id);
                    if (voiceDialogue.assistantText) {
                      onSpeakText(voiceDialogue.assistantText, v.id);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1 ${
                    isSelected
                      ? 'bg-[#C5A059] text-[#0F0D0C] font-bold shadow-md shadow-[#C5A059]/20'
                      : 'bg-[#241C18] text-[#B0A698] hover:text-white hover:bg-[#2F241F] border border-[#3A2D25]'
                  }`}
                >
                  <span>{v.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* User speech */}
        <div className="bg-[#1F1916] border border-[#2E2521] rounded-xl p-3 space-y-1">
          <div className="text-[10px] font-semibold text-[#C5A059] uppercase tracking-wider">Вы сказали:</div>
          <div className="text-xs text-[#EAE6DF] font-medium leading-relaxed">{voiceDialogue.userText}</div>
        </div>

        {/* Assistant response */}
        <div className="bg-gradient-to-br from-[#241B15] to-[#181310] border border-[#C5A059]/30 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" />
              <span>Selin отвечает ({activeVoice}):</span>
            </span>
            {voiceDialogue.isGenerating ? (
              <span className="text-[#C5A059] animate-pulse">Генерация ответа...</span>
            ) : voiceState === 'speaking' ? (
              <span className="text-emerald-400 animate-pulse font-bold">Озвучивание...</span>
            ) : null}
          </div>
          <div className="text-xs text-[#EAE6DF] leading-relaxed max-h-48 overflow-y-auto pr-1">
            {voiceDialogue.assistantText || (
              <span className="text-[#9E958C] italic">Обрабатываю ваш запрос...</span>
            )}
          </div>

          {/* Audio Controls */}
          {voiceDialogue.assistantText && (
            <div className="pt-2 flex items-center gap-2 border-t border-[#33261F]">
              {voiceState === 'speaking' ? (
                <button
                  onClick={() => {
                    onStopAudio();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-red-950/70 border border-red-500/40 text-red-200 text-xs font-semibold flex items-center gap-1.5 hover:bg-red-900/80 transition-all"
                >
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>Остановить голос</span>
                </button>
              ) : (
                <button
                  onClick={() => onSpeakText(voiceDialogue.assistantText, activeVoice)}
                  className="px-3 py-1.5 rounded-lg bg-[#2A201A] border border-[#C5A059]/40 text-[#EAE6DF] text-xs font-medium flex items-center gap-1.5 hover:bg-[#382B23] hover:border-[#C5A059] transition-all"
                >
                  <Play className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span>Послушать ещё раз ({activeVoice})</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => {
              onStopAudio();
              closeVoiceDialogue();
              onClearError();
              onStartRecording();
            }}
            className="flex-1 py-2.5 rounded-xl bg-[#C5A059] text-[#0F0D0C] text-xs font-bold flex items-center justify-center gap-2 hover:bg-[#D4B06A] transition-all shadow-md"
          >
            <Mic className="w-4 h-4" />
            <span>Сказать ещё</span>
          </button>
          <button
            onClick={() => {
              onStopAudio();
              closeVoiceDialogue();
            }}
            className="px-4 py-2.5 rounded-xl bg-[#26201D] text-[#EAE6DF] text-xs font-medium hover:bg-[#322A26] border border-[#382F2A]"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
