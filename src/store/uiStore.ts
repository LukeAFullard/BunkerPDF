import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  extractionMethod: 'pyodide' | 'liteparse';
  setExtractionMethod: (method: 'pyodide' | 'liteparse') => void;
  liteparseOcrEnabled: boolean;
  setLiteparseOcrEnabled: (enabled: boolean) => void;
  enableLineTracing: boolean;
  setEnableLineTracing: (enabled: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
  isDarkMode: false,
  toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
  complexityMode: 'professional',
  setComplexityMode: (mode) => set({ complexityMode: mode }),
  activeTool: null,
  setActiveTool: (tool) => set({ activeTool: tool }),
  feedbackPrompt: { isOpen: false, toolName: '' },
  showFeedbackPrompt: (toolName) => set({ feedbackPrompt: { isOpen: true, toolName } }),
  hideFeedbackPrompt: () => set({ feedbackPrompt: { isOpen: false, toolName: '' } }),
  extractionMethod: 'liteparse',
  setExtractionMethod: (method) => set({ extractionMethod: method }),
  liteparseOcrEnabled: false,
  setLiteparseOcrEnabled: (enabled) => set({ liteparseOcrEnabled: enabled }),
  enableLineTracing: true,
  setEnableLineTracing: (enabled) => set({ enableLineTracing: enabled }),
    }),
    {
      name: 'bunkerpdf-ui-storage',
      partialize: (state) => ({
        isDarkMode: state.isDarkMode,
        complexityMode: state.complexityMode,
        extractionMethod: state.extractionMethod,
        liteparseOcrEnabled: state.liteparseOcrEnabled,
        enableLineTracing: state.enableLineTracing
      }),
    }
  )
);
