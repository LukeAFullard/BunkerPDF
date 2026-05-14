import type { SearchWorkerMessage, SearchWorkerResponse } from '../workers/searchWorker';
import { useEngineStore } from '../store/engineStore';

let searchWorker: Worker | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const searchResolvers = new Map<string, { resolve: (res: any) => void, reject: (err: Error) => void }>();

export const initSearchEngine = async (): Promise<void> => {
  if (searchWorker) return;

  useEngineStore.getState().setAiStatus('loading');

  searchWorker = new Worker(new URL('../workers/searchWorker.ts', import.meta.url), { type: 'module' });

  searchWorker.onmessage = (e: MessageEvent<SearchWorkerResponse>) => {
    const { type, jobId, embedding, error } = e.data;

    if (type === 'READY') {
      useEngineStore.getState().setAiStatus('ready');
      if (jobId && searchResolvers.has(jobId)) {
        searchResolvers.get(jobId)?.resolve(true);
        searchResolvers.delete(jobId);
      }
    } else if (type === 'RESULT' && jobId) {
      if (searchResolvers.has(jobId)) {
        searchResolvers.get(jobId)?.resolve(embedding);
        searchResolvers.delete(jobId);
      }
    } else if (type === 'ERROR' && jobId) {
      if (searchResolvers.has(jobId)) {
        searchResolvers.get(jobId)?.reject(new Error(error || 'Search Engine Error'));
        searchResolvers.delete(jobId);
      }
    }
  };

  return new Promise((resolve, reject) => {
    const jobId = crypto.randomUUID();
    searchResolvers.set(jobId, { resolve, reject });
    searchWorker?.postMessage({ type: 'INIT', jobId } satisfies SearchWorkerMessage);
  });
};

export const generateEmbedding = async (text: string): Promise<number[]> => {
  if (!searchWorker) {
    await initSearchEngine();
  }

  return new Promise((resolve, reject) => {
    const jobId = crypto.randomUUID();
    searchResolvers.set(jobId, { resolve, reject });
    searchWorker?.postMessage({ type: 'EMBED', text, jobId } satisfies SearchWorkerMessage);
  });
};

// Calculate cosine similarity between two vectors
export const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length !== b.length) throw new Error('Vectors must be of same length');
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};
