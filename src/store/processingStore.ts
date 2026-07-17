import { create } from 'zustand';

interface ProcessingState {
  isActive: boolean;
  stage: string;
  progress: number | null;
  canCancel: boolean;
  onCancel: (() => void) | null;

  startProcessing: (stage: string, canCancel?: boolean, onCancel?: () => void) => void;
  updateStage: (stage: string) => void;
  updateProgress: (progress: number | null) => void;
  stopProcessing: () => void;
}

export const useProcessingStore = create<ProcessingState>((set) => ({
  isActive: false,
  stage: '',
  progress: null,
  canCancel: false,
  onCancel: null,

  startProcessing: (stage, canCancel = false, onCancel?) =>
    set({ isActive: true, stage, progress: null, canCancel, onCancel: onCancel || null }),

  updateStage: (stage) =>
    set((state) => (state.isActive ? { stage } : state)),

  updateProgress: (progress) =>
    set((state) => (state.isActive ? { progress } : state)),

  stopProcessing: () =>
    set({ isActive: false, stage: '', progress: null, canCancel: false, onCancel: null }),
}));
