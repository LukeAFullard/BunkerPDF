import { create } from 'zustand';

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

  addSegments: (newSegments: DocumentSegment[]) => void;
  updateSegmentEmbedding: (id: string, embedding: number[]) => void;
  removeDocumentSegments: (docId: string) => void;
  setIndexingState: (isIndexing: boolean, progress?: number) => void;
  clearAllSegments: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  segments: [],
  isIndexing: false,
  indexingProgress: 0,

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

  clearAllSegments: () => set({ segments: [] })
}));
