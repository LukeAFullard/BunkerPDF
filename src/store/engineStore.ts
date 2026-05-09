import { create } from 'zustand';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

interface EngineState {
  aiStatus: EngineStatus;
  aiError: string | null;
  pyodideStatus: EngineStatus;
  pyodideError: string | null;
  pyodideStage: string | null;

  setAiStatus: (status: EngineStatus, error?: string | null) => void;
  setPyodideStatus: (status: EngineStatus, error?: string | null, stage?: string | null) => void;
}

export const useEngineStore = create<EngineState>((set) => ({
  aiStatus: 'idle',
  aiError: null,
  pyodideStatus: 'idle',
  pyodideError: null,
  pyodideStage: null,

  setAiStatus: (status, error = null) => set({ aiStatus: status, aiError: error }),
  setPyodideStatus: (status, error = null, stage = null) => set({
    pyodideStatus: status,
    pyodideError: error,
    pyodideStage: stage !== null ? stage : (status === 'loading' ? 'Loading...' : null)
  }),
}));
