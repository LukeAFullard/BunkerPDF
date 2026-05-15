import { create } from 'zustand';
import { set as idbSet, get as idbGet, del as idbDel } from 'idb-keyval';

export interface DocumentOperation {
  id: string;
  type: 'rotate' | 'delete_pages' | 'reorder' | 'watermark' | 'optimize' | 'redact' | 'merge' | 'other';
  timestamp: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any>;
  undoData?: Uint8Array;
  fileKey: string;
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

  updateDocumentFile: (id: string, newFile: File, newPageCount?: number, operation?: Partial<DocumentOperation>) => {
    const fileKey = `doc_state_${id}_${Date.now()}_${crypto.randomUUID()}`;
    // Save to IndexedDB asynchronously
    idbSet(fileKey, newFile).catch(console.error);

    useFileStore.setState((state) => ({
      documents: state.documents.map(doc => {
        if (doc.id !== id) return doc;

        const ops = doc.operations || [];
        const currentIndex = doc.operationIndex ?? -1;

        // Truncate future operations
        const newOps = ops.slice(0, currentIndex + 1);

        // Always store the previous state as operation 0 if operations are empty
        if (newOps.length === 0) {
           const initialKey = `doc_state_${id}_initial`;
           idbSet(initialKey, doc.file).catch(console.error);
           newOps.push({
             id: 'initial',
             timestamp: Date.now() - 1000,
             type: 'other',
             params: { name: 'Initial Upload' },
             fileKey: initialKey,
             pageCount: doc.pageCount,
           });
        }

        newOps.push({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: operation?.type || 'other',
          params: operation?.params || {},
          undoData: operation?.undoData,
          fileKey: fileKey,
          pageCount: newPageCount !== undefined ? newPageCount : doc.pageCount,
        });

        // Keep only last 20 operations to manage IDB size
        if (newOps.length > 21) {
          const removed = newOps.shift();
          if (removed) idbDel(removed.fileKey).catch(console.error);
        }

        return {
          ...doc,
          file: newFile,
          size: newFile.size,
          pageCount: newPageCount !== undefined ? newPageCount : doc.pageCount,
          operations: newOps,
          operationIndex: newOps.length - 1,
        };
      })
    }));
  },

  undo: async (id: string) => {
    const state = useFileStore.getState();
    const doc = state.documents.find(d => d.id === id);
    if (!doc || !doc.operations || (doc.operationIndex ?? -1) <= 0) return;

    const targetIndex = (doc.operationIndex ?? 0) - 1;
    const targetOp = doc.operations[targetIndex];
    if (!targetOp) return;

    try {
      const storedFile = await idbGet<File>(targetOp.fileKey);
      if (!storedFile) {
        console.error("Undo failed: File not found in IndexedDB");
        return;
      }
      useFileStore.setState((state) => ({
        documents: state.documents.map(d =>
          d.id === id
            ? { ...d, file: storedFile, size: storedFile.size, pageCount: targetOp.pageCount, operationIndex: targetIndex }
            : d
        )
      }));
    } catch (e) {
      console.error("Undo failed:", e);
    }
  },

  redo: async (id: string) => {
    const state = useFileStore.getState();
    const doc = state.documents.find(d => d.id === id);
    if (!doc || !doc.operations) return;

    const maxIndex = (doc.operations?.length ?? 0) - 1;
    const currentIndex = doc.operationIndex ?? -1;

    if (currentIndex >= maxIndex) return;

    const targetIndex = currentIndex + 1;
    const targetOp = doc.operations[targetIndex];
    if (!targetOp) return;

    try {
      const storedFile = await idbGet<File>(targetOp.fileKey);
      if (!storedFile) {
        console.error("Redo failed: File not found in IndexedDB");
        return;
      }
      useFileStore.setState((state) => ({
        documents: state.documents.map(d =>
          d.id === id
            ? { ...d, file: storedFile, size: storedFile.size, pageCount: targetOp.pageCount, operationIndex: targetIndex }
            : d
        )
      }));
    } catch (e) {
      console.error("Redo failed:", e);
    }
  },

  clearAll: () => set({ documents: [], activeDocumentId: null }),
}));
