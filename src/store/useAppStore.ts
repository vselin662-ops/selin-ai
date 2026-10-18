import { create } from 'zustand';
import { AppConfig } from '../types';

interface VoiceDialogueState {
  userText: string;
  assistantText: string;
  isGenerating: boolean;
  isOpen: boolean;
}

interface AppStore {
  // Navigation
  activeTab: 'main' | 'languages' | 'business' | 'bible' | 'feed' | 'terminal' | 'vpn' | 'moderation' | 'knowledge' | 'settings';
  menuOpen: boolean;
  setActiveTab: (tab: 'main' | 'languages' | 'business' | 'bible' | 'feed' | 'terminal' | 'vpn' | 'moderation' | 'knowledge' | 'settings') => void;
  setMenuOpen: (open: boolean) => void;

  // Voice & TTS State
  activeVoice: string;
  voiceToast: string | null;
  showMicGuide: boolean;
  conversationId: string;
  voiceStep: string;
  voiceUserName: string;
  voiceDialogue: VoiceDialogueState;
  
  setActiveVoice: (voice: string) => void;
  setVoiceToast: (toast: string | null) => void;
  setShowMicGuide: (show: boolean) => void;
  setVoiceStep: (step: string) => void;
  setVoiceUserName: (name: string) => void;
  setVoiceDialogue: (dialogue: Partial<VoiceDialogueState>) => void;
  closeVoiceDialogue: () => void;

  // Configuration
  config: AppConfig | null;
  setConfig: (config: AppConfig | null) => void;

  // Manual / Documentation Modal
  showManual: boolean;
  manualTitle: string;
  manualContent: string;
  setShowManual: (show: boolean) => void;
  openManual: (title: string, content: string) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  // Navigation Defaults
  activeTab: 'main',
  menuOpen: false,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setMenuOpen: (open) => set({ menuOpen: open }),

  // Voice Defaults
  activeVoice: localStorage.getItem('selin_voice') || 'Kore',
  voiceToast: null,
  showMicGuide: false,
  conversationId: (() => {
    let id = sessionStorage.getItem('selin_conversation_id');
    if (!id) {
      id = 'conv_' + Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem('selin_conversation_id', id);
    }
    return id;
  })(),
  voiceStep: 'ASK_NAME',
  voiceUserName: '',
  voiceDialogue: {
    userText: '',
    assistantText: '',
    isGenerating: false,
    isOpen: false,
  },

  setActiveVoice: (voice) => {
    localStorage.setItem('selin_voice', voice);
    set({ activeVoice: voice });
  },
  setVoiceToast: (toast) => set({ voiceToast: toast }),
  setShowMicGuide: (show) => set({ showMicGuide: show }),
  setVoiceStep: (step) => set({ voiceStep: step }),
  setVoiceUserName: (name) => set({ voiceUserName: name }),
  setVoiceDialogue: (dialogue) => set((state) => ({
    voiceDialogue: { ...state.voiceDialogue, ...dialogue }
  })),
  closeVoiceDialogue: () => set((state) => ({
    voiceDialogue: { ...state.voiceDialogue, isOpen: false }
  })),

  // Config Defaults
  config: null,
  setConfig: (config) => set({ config }),

  // Manual Defaults
  showManual: false,
  manualTitle: 'Главный Экран',
  manualContent: '',
  setShowManual: (show) => set({ showManual: show }),
  openManual: (title, content) => set({
    showManual: true,
    manualTitle: title,
    manualContent: content
  }),
}));
