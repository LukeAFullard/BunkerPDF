import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PersistStorage } from 'zustand/middleware';
import { get, set as idbSet, del } from 'idb-keyval';

export interface DocumentSegment {
  id: string; // docId + segment index
  docId: string;
  docName: string;
  pageNumber: number;
  text: string;
  embedding?: number[];
}

interface SearchState {
  segments: DocumentSegment[];
  isIndexing: boolean;
  indexingProgress: number; // 0 to 100
  failedIndexDocs: string[];

  addSegments: (newSegments: DocumentSegment[]) => void;
  updateSegmentEmbedding: (id: string, embedding: number[]) => void;
  removeDocumentSegments: (docId: string) => void;
  setIndexingState: (isIndexing: boolean, progress?: number) => void;
  clearAllSegments: () => void;
  addFailedIndexDoc: (docId: string) => void;
}

const customStorage: PersistStorage<SearchState> = {
  getItem: async (name) => {
    return (await get(name)) || null;
  },
  setItem: async (name, value) => {
    await idbSet(name, value);
  },
  removeItem: async (name) => {
    await del(name);
  },
};

export const useSearchStore = create<SearchState>()(
  persist(
    (set) => ({
      segments: [],
      isIndexing: false,
      indexingProgress: 0,
      failedIndexDocs: [],

      addSegments: (newSegments) => set((state) => {
        // Filter out segments that might already exist to prevent duplicates
        const existingIds = new Set(state.segments.map(s => s.id));
        const uniqueNew = newSegments.filter(s => !existingIds.has(s.id));
        return { segments: [...state.segments, ...uniqueNew] };
      }),

      updateSegmentEmbedding: (id, embedding) => set((state) => ({
        segments: state.segments.map(s => s.id === id ? { ...s, embedding } : s)
      })),

      removeDocumentSegments: (docId) => set((state) => ({
        segments: state.segments.filter(s => s.docId !== docId)
      })),

      setIndexingState: (isIndexing, progress) => set((state) => ({
        isIndexing,
        indexingProgress: progress !== undefined ? progress : state.indexingProgress
      })),

      clearAllSegments: () => set({ segments: [], failedIndexDocs: [] }),
      addFailedIndexDoc: (docId) => set((state) => ({
        failedIndexDocs: [...state.failedIndexDocs, docId]
      }))
    }),
    {
      name: 'bunkerpdf-search-index',
      storage: customStorage,
      partialize: (state) => ({ segments: state.segments } as SearchState),
    }
  )
);
