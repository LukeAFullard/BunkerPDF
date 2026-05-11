import { create } from 'zustand';

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  action: string;
  details: string;
  documentName?: string;
}

interface AuditState {
  logs: AuditLogEntry[];
  addLog: (action: string, details: string, documentName?: string) => void;
  clearLogs: () => void;
}

export const useAuditStore = create<AuditState>((set) => ({
  logs: [],
  addLog: (action, details, documentName) =>
    set((state) => ({
      logs: [
        {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: Date.now(),
          action,
          details,
          documentName,
        },
        ...state.logs,
      ],
    })),
  clearLogs: () => set({ logs: [] }),
}));
