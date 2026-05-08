import { create } from 'zustand';

export interface PDFDocument {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount?: number;
  lastModified: number;
}

interface FileStore {
  documents: PDFDocument[];
  activeDocumentId: string | null;
  addDocuments: (files: File[]) => void;
  removeDocument: (id: string) => void;
  setActiveDocument: (id: string) => void;
  updateDocument: (id: string, updates: Partial<PDFDocument>) => void;
  clearAll: () => void;
}

export const useFileStore = create<FileStore>((set) => ({
  documents: [],
  activeDocumentId: null,

  addDocuments: (files: File[]) => set((state) => {
    const newDocs: PDFDocument[] = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified
    }));

    return {
      documents: [...state.documents, ...newDocs],
      // If there wasn't an active document, set the first new one as active
      activeDocumentId: state.activeDocumentId || (newDocs.length > 0 ? newDocs[0].id : null)
    };
  }),

  removeDocument: (id: string) => set((state) => {
    const remaining = state.documents.filter(doc => doc.id !== id);
    return {
      documents: remaining,
      activeDocumentId: state.activeDocumentId === id
        ? (remaining.length > 0 ? remaining[0].id : null)
        : state.activeDocumentId
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