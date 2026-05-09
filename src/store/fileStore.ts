import { create } from 'zustand';

export interface PDFDocument {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount?: number;
  lastModified: number;
  isEncrypted?: boolean;
  isCorrupt?: boolean;
}

interface FileStore {
  documents: PDFDocument[];
  activeDocumentId: string | null;
  addDocuments: (docs: PDFDocument[]) => void;
  removeDocument: (id: string) => void;
  setActiveDocument: (id: string) => void;
  updateDocument: (id: string, updates: Partial<PDFDocument>) => void;
  clearAll: () => void;
}

export const useFileStore = create<FileStore>((set) => ({
  documents: [],
  activeDocumentId: null,

  addDocuments: (docs: PDFDocument[]) => set((state) => {
    const newDocs = [...state.documents, ...docs].slice(0, 8); // Enforce 8 file cap
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

  clearAll: () => set({ documents: [], activeDocumentId: null }),
}));
