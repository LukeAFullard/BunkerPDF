import { create } from 'zustand';

export type ComplexityMode = 'simple' | 'enhanced' | 'professional';

interface UIState {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  complexityMode: ComplexityMode;
  setComplexityMode: (mode: ComplexityMode) => void;
  activeTool: string | null;
  setActiveTool: (tool: string | null) => void;
  feedbackPrompt: {
    isOpen: boolean;
    toolName: string;
  };
  showFeedbackPrompt: (toolName: string) => void;
  hideFeedbackPrompt: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isDarkMode: false,
  toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
  complexityMode: 'simple',
  setComplexityMode: (mode) => set({ complexityMode: mode }),
  activeTool: null,
  setActiveTool: (tool) => set({ activeTool: tool }),
  feedbackPrompt: { isOpen: false, toolName: '' },
  showFeedbackPrompt: (toolName) => set({ feedbackPrompt: { isOpen: true, toolName } }),
  hideFeedbackPrompt: () => set({ feedbackPrompt: { isOpen: false, toolName: '' } }),
}));
