import React from 'react';
import { X, ExternalLink, Mic } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

interface MicGuideModalProps {
  onRetry: () => void;
}

export const MicGuideModal: React.FC<MicGuideModalProps> = ({ onRetry }) => {
  const { showMicGuide, setShowMicGuide } = useAppStore();

  if (!showMicGuide) return null;

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg bg-[#181412] border border-amber-500/40 rounded-2xl p-6 shadow-2xl space-y-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-base font-bold text-[#EAE6DF]">Включение микрофона</h4>
              <p className="text-xs text-[#9E958C]">Инструкция для Android Chrome и Safari</p>
            </div>
          </div>
          <button
            onClick={() => setShowMicGuide(false)}
            className="p-1 rounded-lg text-[#9E958C] hover:text-[#EAE6DF] hover:bg-[#221C19]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs text-[#C8BFAF]">
          <div className="p-3.5 rounded-xl bg-[#221C19] border border-[#332A25] flex gap-3 items-start">
            <div className="w-5 h-5 rounded-full bg-[#C5A059]/20 text-[#C5A059] flex items-center justify-center font-bold shrink-0 mt-0.5">
              1
            </div>
            <div>
              <div className="font-semibold text-[#EAE6DF]">Разрешите доступ в адресной строке</div>
              <div className="text-[11px] text-[#9E958C] mt-0.5">
                Нажмите на значок <strong className="text-amber-300">замка 🔒</strong> или <strong className="text-amber-300">настроек сайта ⚙️</strong> слева от URL браузера и выберите <strong>"Микрофон" → "Разрешить"</strong>.
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#221C19] border border-[#332A25] flex gap-3 items-start">
            <div className="w-5 h-5 rounded-full bg-[#C5A059]/20 text-[#C5A059] flex items-center justify-center font-bold shrink-0 mt-0.5">
              2
            </div>
            <div>
              <div className="font-semibold text-[#EAE6DF]">Или откройте сайт в отдельной вкладке</div>
              <div className="text-[11px] text-[#9E958C] mt-0.5">
                В окне предпросмотра фрейм может блокировать микрофон. В отдельной вкладке всплывающий запрос разрешения появится моментально.
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <button
            onClick={() => {
              try {
                window.open(window.location.href, '_blank');
              } catch (_) {}
              setShowMicGuide(false);
            }}
            className="w-full py-3 rounded-xl bg-[#C5A059] text-[#0F0D0C] text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-[#D4B06A] transition-all shadow-lg"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Открыть сайт в отдельной вкладке</span>
          </button>

          <button
            onClick={() => {
              setShowMicGuide(false);
              onRetry();
            }}
            className="w-full py-2.5 rounded-xl bg-[#2A221E] text-[#EAE6DF] border border-[#3D322B] text-xs font-medium hover:bg-[#342B25] transition-all"
          >
            Повторить запрос микрофона сейчас
          </button>
        </div>
      </div>
    </div>
  );
};
