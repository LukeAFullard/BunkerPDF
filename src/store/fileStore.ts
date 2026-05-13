import { create } from 'zustand';

export interface DocumentHistoryState {
  file: File;
  size: number;
  pageCount?: number;
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
  history?: {
    past: DocumentHistoryState[];
    future: DocumentHistoryState[];
  };
}

interface FileStore {
  documents: PDFDocument[];
  activeDocumentId: string | null;
  addDocuments: (docs: PDFDocument[]) => void;
  removeDocument: (id: string) => void;
  setActiveDocument: (id: string) => void;
  updateDocument: (id: string, updates: Partial<PDFDocument>) => void;
  updateDocumentFile: (id: string, newFile: File, newPageCount?: number) => void;
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

  updateDocumentFile: (id: string, newFile: File, newPageCount?: number) => set((state) => ({
    documents: state.documents.map(doc => {
      if (doc.id !== id) return doc;

      const currentState: DocumentHistoryState = {
        file: doc.file,
        size: doc.size,
        pageCount: doc.pageCount,
      };

      const newPast = [...(doc.history?.past || []), currentState].slice(-10); // keep last 10 states

      return {
        ...doc,
        file: newFile,
        size: newFile.size,
        pageCount: newPageCount !== undefined ? newPageCount : doc.pageCount,
        history: {
          past: newPast,
          future: [],
        }
      };
    })
  })),

  undo: (id: string) => set((state) => ({
    documents: state.documents.map(doc => {
      if (doc.id !== id || !doc.history || doc.history.past.length === 0) return doc;

      const past = [...doc.history.past];
      const previousState = past.pop()!;

      const currentState: DocumentHistoryState = {
        file: doc.file,
        size: doc.size,
        pageCount: doc.pageCount,
      };

      return {
        ...doc,
        file: previousState.file,
        size: previousState.size,
        pageCount: previousState.pageCount,
        history: {
          past,
          future: [currentState, ...(doc.history.future || [])]
        }
      };
    })
  })),

  redo: (id: string) => set((state) => ({
    documents: state.documents.map(doc => {
      if (doc.id !== id || !doc.history || doc.history.future.length === 0) return doc;

      const future = [...doc.history.future];
      const nextState = future.shift()!;

      const currentState: DocumentHistoryState = {
        file: doc.file,
        size: doc.size,
        pageCount: doc.pageCount,
      };

      return {
        ...doc,
        file: nextState.file,
        size: nextState.size,
        pageCount: nextState.pageCount,
        history: {
          past: [...(doc.history.past || []), currentState].slice(-10),
          future
        }
      };
    })
  })),

  clearAll: () => set({ documents: [], activeDocumentId: null }),
}));
