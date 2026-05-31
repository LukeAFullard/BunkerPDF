import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ComplexityMode = 'simple' | 'enhanced' | 'professional';
export type ExtractionMethod = 'pyodide' | 'liteparse';

interface UIState {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  complexityMode: ComplexityMode;
  setComplexityMode: (mode: ComplexityMode) => void;
  activeTool: string | null;
  setActiveTool: (tool: string | null) => void;
  extractionMethod: ExtractionMethod;
  setExtractionMethod: (method: ExtractionMethod) => void;
  feedbackPrompt: {
    isOpen: boolean;
    toolName: string;
  };
  showFeedbackPrompt: (toolName: string) => void;
  hideFeedbackPrompt: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
  isDarkMode: false,
  toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
  complexityMode: 'simple',
  setComplexityMode: (mode) => set({ complexityMode: mode }),
  activeTool: null,
  setActiveTool: (tool) => set({ activeTool: tool }),
  extractionMethod: 'pyodide',
  setExtractionMethod: (method) => set({ extractionMethod: method }),
  feedbackPrompt: { isOpen: false, toolName: '' },
  showFeedbackPrompt: (toolName) => set({ feedbackPrompt: { isOpen: true, toolName } }),
  hideFeedbackPrompt: () => set({ feedbackPrompt: { isOpen: false, toolName: '' } }),
    }),
    {
      name: 'bunkerpdf-ui-storage',
      partialize: (state) => ({ isDarkMode: state.isDarkMode, complexityMode: state.complexityMode, extractionMethod: state.extractionMethod }),
    }
  )
);
