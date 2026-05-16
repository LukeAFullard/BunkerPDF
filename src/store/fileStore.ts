import { create } from 'zustand';
import { set as idbSet, get as idbGet, del as idbDel, clear as idbClear } from 'idb-keyval';

export interface DocumentOperation {
  id: string;
  type: 'rotate' | 'delete_pages' | 'reorder' | 'watermark' | 'optimize' | 'redact' | 'merge' | 'other';
  timestamp: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any>;
  undoData?: Uint8Array;
  fileKey?: string;
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
  updateDocumentFile: (id: string, newFile: File, newPageCount?: number, operation?: Partial<DocumentOperation>) => Promise<void>;
  undoInProgress: boolean;
  redoInProgress: boolean;
  undo: (id: string) => Promise<void>;
  redo: (id: string) => Promise<void>;
  clearAll: () => void;
}

export const useFileStore = create<FileStore>((set, get) => ({
  documents: [],
  activeDocumentId: null,
  undoInProgress: false,
  redoInProgress: false,

  addDocuments: (docs: PDFDocument[]) => {
    // Store initial files to IDB
    docs.forEach(doc => {
      const fileKey = `doc_state_${doc.id}_initial`;
      idbSet(fileKey, doc.file).catch(console.error);
      doc.operations = [{
        id: 'initial',
        type: 'other',
        timestamp: Date.now(),
        params: { name: 'Initial Upload' },
        fileKey: fileKey,
        pageCount: doc.pageCount
      }];
      doc.operationIndex = 0;
    });

    useFileStore.setState((state) => {
      const newDocs = [...state.documents, ...docs].slice(0, 50); // Enforce 50 file cap
      return {
        documents: newDocs,
        // If there wasn't an active document, set the first new one as active
        activeDocumentId: state.activeDocumentId || (newDocs.length > 0 ? newDocs[0].id : null)
      };
    });
  },

  removeDocument: (id: string) => {
    const state = useFileStore.getState();
    const docToRemove = state.documents.find(doc => doc.id === id);
    if (docToRemove?.operations) {
      // Clean up IDB keys
      docToRemove.operations.forEach(op => {
        if (op.fileKey) idbDel(op.fileKey).catch(console.error);
      });
    }

    useFileStore.setState((state) => {
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
    });
  },

  setActiveDocument: (id: string) => set({ activeDocumentId: id }),

  updateDocument: (id: string, updates: Partial<PDFDocument>) => set((state) => ({
    documents: state.documents.map(doc =>
      doc.id === id ? { ...doc, ...updates } : doc
    )
  })),

  updateDocumentFile: async (id: string, newFile: File, newPageCount?: number, operation?: Partial<DocumentOperation>) => {
    // Check quota before proceeding
    if (navigator.storage?.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      if (quota > 0 && usage > quota * 0.7) {
        const state = get();
        for (const doc of state.documents) {
          const ops = doc.operations || [];
          if (ops.length > 5) {
            const toDelete = ops.slice(0, -5);
            for (const op of toDelete) {
              if (op.fileKey) {
                await idbDel(op.fileKey).catch(console.error);
              }
            }
          }
        }
      }
    }

    const fileKey = `doc_state_${id}_${Date.now()}_${crypto.randomUUID()}`;

    try {
      await idbSet(fileKey, newFile);
    } catch (error) {
      console.error('Failed to save to IndexedDB:', error);
      throw new Error('Storage full. Please clear browser data or use fewer files.', { cause: error });
    }

    set((state) => ({
      documents: state.documents.map(doc => {
        if (doc.id !== id) return doc;

        const ops = doc.operations || [];
        const currentIndex = doc.operationIndex ?? -1;

        // Truncate future operations, clean up their IDB keys
        const truncated = ops.slice(currentIndex + 1);
        truncated.forEach(op => {
          if (op.fileKey) idbDel(op.fileKey).catch(console.error);
        });

        const newOps = ops.slice(0, currentIndex + 1);

        newOps.push({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: operation?.type || 'other',
          params: operation?.params || {},
          undoData: operation?.undoData,
          fileKey: fileKey,
          pageCount: newPageCount !== undefined ? newPageCount : doc.pageCount,
        });

        // Keep only last 20 operations, clean up old keys, but preserve the initial state
        while (newOps.length > 20) {
          if (newOps.length === 1) break; // NEVER delete the initial state

          // Remove from position 1 (keeping initial at index 0)
          const removed = newOps.splice(1, 1)[0];
          if (removed?.fileKey) {
            idbDel(removed.fileKey).catch(console.error);
          }
        }

        // Adjust operationIndex based on newOps length
        const newOperationIndex = newOps.length - 1;

        return {
          ...doc,
          file: newFile,
          size: newFile.size,
          pageCount: newPageCount !== undefined ? newPageCount : doc.pageCount,
          operations: newOps,
          operationIndex: newOperationIndex,
        };
      })
    }));
  },

  undo: async (id: string) => {
    if (get().undoInProgress) return;
    set({ undoInProgress: true });

    try {
      const state = get();
      const doc = state.documents.find(d => d.id === id);
      if (!doc || !doc.operations || (doc.operationIndex ?? -1) <= 0) return;

      const targetIndex = (doc.operationIndex ?? 0) - 1;
      const targetOp = doc.operations[targetIndex];
      if (!targetOp || !targetOp.fileKey) return;

      const storedFile = await idbGet<File>(targetOp.fileKey);
      if (!storedFile) {
        console.error("Undo failed: File not found in IndexedDB");
        return;
      }
      set((state) => ({
        documents: state.documents.map(d =>
          d.id === id
            ? { ...d, file: storedFile, size: storedFile.size, pageCount: targetOp.pageCount, operationIndex: targetIndex }
            : d
        )
      }));
    } catch (e) {
      console.error("Undo failed:", e);
    } finally {
      set({ undoInProgress: false });
    }
  },

  redo: async (id: string) => {
    if (get().redoInProgress) return;
    set({ redoInProgress: true });

    try {
      const state = get();
      const doc = state.documents.find(d => d.id === id);
      if (!doc || !doc.operations) return;

      const maxIndex = (doc.operations?.length ?? 0) - 1;
      const currentIndex = doc.operationIndex ?? -1;

      if (currentIndex >= maxIndex) return;

      const targetIndex = currentIndex + 1;
      const targetOp = doc.operations[targetIndex];
      if (!targetOp || !targetOp.fileKey) return;

      const storedFile = await idbGet<File>(targetOp.fileKey);
      if (!storedFile) {
        console.error("Redo failed: File not found in IndexedDB");
        return;
      }
      set((state) => ({
        documents: state.documents.map(d =>
          d.id === id
            ? { ...d, file: storedFile, size: storedFile.size, pageCount: targetOp.pageCount, operationIndex: targetIndex }
            : d
        )
      }));
    } catch (e) {
      console.error("Redo failed:", e);
    } finally {
      set({ redoInProgress: false });
    }
  },

  clearAll: () => {
    idbClear().catch(console.error);
    useFileStore.setState({ documents: [], activeDocumentId: null });
  },
}));
