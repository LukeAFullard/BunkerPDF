import { create } from 'zustand';

export interface DocumentOperation {
  id: string;
  type: 'rotate' | 'delete_pages' | 'reorder' | 'watermark' | 'optimize' | 'redact' | 'merge' | 'other';
  timestamp: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any>;
  undoData?: Uint8Array;
}

export interface PDFDocument {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount?: number;
  lastModified: number;
  isEncrypted?: boolean;
  isCorrupt?: boolean;
  operations?: DocumentOperation[];
  operationIndex?: number;
}

interface FileStore {
  documents: PDFDocument[];
  activeDocumentId: string | null;
  addDocuments: (docs: PDFDocument[]) => void;
  removeDocument: (id: string) => void;
  setActiveDocument: (id: string) => void;
  updateDocument: (id: string, updates: Partial<PDFDocument>) => void;
  updateDocumentFile: (id: string, newFile: File, newPageCount?: number, operation?: Partial<DocumentOperation>) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
  clearAll: () => void;
}

export const useFileStore = create<FileStore>((set) => ({
  documents: [],
  activeDocumentId: null,

  addDocuments: (docs: PDFDocument[]) => set((state) => {
    const newDocs = [...state.documents, ...docs].slice(0, 50); // Enforce 50 file cap
    return {
      documents: newDocs,
      // If there wasn't an active document, set the first new one as active
      activeDocumentId: state.activeDocumentId || (newDocs.length > 0 ? newDocs[0].id : null)
    };
  }),

  removeDocument: (id: string) => set((state) => {
    const remaining = state.documents.filter(doc => doc.id !== id);
    let nextActiveId = state.activeDocumentId;

    if (state.activeDocumentId === id) {
      if (remaining.length > 0) {
        // Find the index of the document being removed
        const index = state.documents.findIndex(doc => doc.id === id);
        // Set the active document to the one before it, or the first one if it was the first
        const nextIndex = Math.max(0, index - 1);
        nextActiveId = remaining[nextIndex]?.id || remaining[0].id;
      } else {
        nextActiveId = null;
      }
    }

    return {
      documents: remaining,
      activeDocumentId: nextActiveId
    };
  }),

  setActiveDocument: (id: string) => set({ activeDocumentId: id }),

  updateDocument: (id: string, updates: Partial<PDFDocument>) => set((state) => ({
    documents: state.documents.map(doc =>
      doc.id === id ? { ...doc, ...updates } : doc
    )
  })),

  updateDocumentFile: (id: string, newFile: File, newPageCount?: number, operation?: Partial<DocumentOperation>) => set((state) => ({
    documents: state.documents.map(doc => {
      if (doc.id !== id) return doc;

      const ops = doc.operations || [];
      const currentIndex = doc.operationIndex ?? -1;

      const newOps = ops.slice(0, currentIndex + 1);

      if (operation) {
        newOps.push({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: operation.type || 'other',
          params: operation.params || {},
          undoData: operation.undoData,
        });
      }

      const trimmedOps = newOps.slice(-20);

      return {
        ...doc,
        file: newFile,
        size: newFile.size,
        pageCount: newPageCount !== undefined ? newPageCount : doc.pageCount,
        operations: trimmedOps,
        operationIndex: trimmedOps.length - 1,
      };
    })
  })),

  undo: async (id: string) => {
    const state = useFileStore.getState();
    const doc = state.documents.find(d => d.id === id);
    if (!doc || !doc.operations || (doc.operationIndex ?? -1) < 0) return;

    const targetIndex = (doc.operationIndex ?? 0) - 1;
    if (targetIndex < -1) return;

    set((state) => ({
      documents: state.documents.map(d =>
        d.id === id
          ? { ...d, operationIndex: targetIndex }
          : d
      )
    }));
  },

  redo: async (id: string) => {
    const state = useFileStore.getState();
    const doc = state.documents.find(d => d.id === id);
    if (!doc || !doc.operations) return;

    const maxIndex = (doc.operations?.length ?? 0) - 1;
    const currentIndex = doc.operationIndex ?? -1;

    if (currentIndex >= maxIndex) return;

    set((state) => ({
      documents: state.documents.map(d =>
        d.id === id
          ? { ...d, operationIndex: currentIndex + 1 }
          : d
      )
    }));
  },

  clearAll: () => set({ documents: [], activeDocumentId: null }),
}));
