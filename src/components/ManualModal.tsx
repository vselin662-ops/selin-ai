import React from 'react';
import { X, ExternalLink } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

const MAX_BOT_URL = "https://max.ru/se13914883_bot";

export const ManualModal: React.FC = () => {
  const { showManual, manualTitle, manualContent, setShowManual } = useAppStore();

  if (!showManual) return null;

  return (
    <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-xl bg-[#161210] border border-[#C5A059]/40 rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[#2A231F] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#C5A059] animate-pulse" />
            <h4 className="text-sm font-bold text-[#EAE6DF] uppercase tracking-wider">📖 {manualTitle}</h4>
          </div>
          <button
            onClick={() => setShowManual(false)}
            className="p-1 rounded-lg text-[#9E958C] hover:text-[#EAE6DF] hover:bg-[#221C19]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-xs text-[#C8BFAF] leading-relaxed whitespace-pre-line max-h-96 overflow-y-auto pr-1">
          {manualContent}
        </div>

        <div className="pt-2 border-t border-[#2A231F] flex justify-end gap-2">
          <a
            href={MAX_BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl bg-[#C5A059] text-[#0F0D0C] text-xs font-bold uppercase flex items-center gap-1.5 hover:bg-[#D4B06A]"
          >
            <span>Перейти в MAX-бот</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={() => setShowManual(false)}
            className="px-4 py-2 rounded-xl bg-[#26201D] text-[#EAE6DF] text-xs font-medium border border-[#382F2A] hover:bg-[#322A26]"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
