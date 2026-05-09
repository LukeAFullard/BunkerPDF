import { create } from 'zustand';

interface ProcessingState {
  isActive: boolean;
  stage: string;
  canCancel: boolean;
  onCancel: (() => void) | null;

  startProcessing: (stage: string, canCancel?: boolean, onCancel?: () => void) => void;
  updateStage: (stage: string) => void;
  stopProcessing: () => void;
}

export const useProcessingStore = create<ProcessingState>((set) => ({
  isActive: false,
  stage: '',
  canCancel: false,
  onCancel: null,

  startProcessing: (stage, canCancel = false, onCancel?) =>
    set({ isActive: true, stage, canCancel, onCancel: onCancel || null }),

  updateStage: (stage) =>
    set((state) => (state.isActive ? { stage } : state)),

  stopProcessing: () =>
    set({ isActive: false, stage: '', canCancel: false, onCancel: null }),
}));
