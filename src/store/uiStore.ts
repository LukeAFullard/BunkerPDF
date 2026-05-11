import { create } from 'zustand';

export type ComplexityMode = 'simple' | 'enhanced' | 'professional';

interface UIState {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  complexityMode: ComplexityMode;
  setComplexityMode: (mode: ComplexityMode) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isDarkMode: false,
  toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
  complexityMode: 'simple',
  setComplexityMode: (mode) => set({ complexityMode: mode }),
}));
