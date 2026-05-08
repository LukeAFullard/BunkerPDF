import { create } from 'zustand';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

interface EngineState {
  aiStatus: EngineStatus;
  aiError: string | null;
  pyodideStatus: EngineStatus;
  pyodideError: string | null;

  setAiStatus: (status: EngineStatus, error?: string | null) => void;
  setPyodideStatus: (status: EngineStatus, error?: string | null) => void;
}

export const useEngineStore = create<EngineState>((set) => ({
  aiStatus: 'idle',
  aiError: null,
  pyodideStatus: 'idle',
  pyodideError: null,

  setAiStatus: (status, error = null) => set({ aiStatus: status, aiError: error }),
  setPyodideStatus: (status, error = null) => set({ pyodideStatus: status, pyodideError: error }),
}));
