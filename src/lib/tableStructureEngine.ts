import type { TableWorkerMessage, TableWorkerResponse } from '../workers/tableStructureWorker';

let tableWorker: Worker | null = null;
let initPromise: Promise<void> | null = null;
const resolvers = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();

export const initTableStructureEngine = async (): Promise<void> => {
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    if (tableWorker) { resolve(); return; }

    tableWorker = new Worker(new URL('../workers/tableStructureWorker.ts', import.meta.url), { type: 'module' });

    tableWorker.onmessage = (e: MessageEvent<TableWorkerResponse>) => {
      const { type, jobId, detections, error } = e.data;
      const pending = resolvers.get(jobId);
      if (!pending) return; // Ignore messages without a matching jobId

      if (type === 'READY' || type === 'RESULT') {
        pending.resolve(detections ?? true);
        resolvers.delete(jobId);
      } else if (type === 'ERROR') {
        pending.reject(new Error(error ?? 'Table structure worker error'));
        resolvers.delete(jobId);
      }
    };

    const jobId = crypto.randomUUID();
    resolvers.set(jobId, { resolve, reject });
    tableWorker.postMessage({ type: 'INIT', jobId } satisfies TableWorkerMessage);
  });

  return initPromise;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const recognizeTableStructureWorker = async (imageData: ImageData): Promise<any[]> => {
  if (!tableWorker) await initTableStructureEngine();

  return new Promise((resolve, reject) => {
    const jobId = crypto.randomUUID();
    resolvers.set(jobId, { resolve, reject });
    tableWorker?.postMessage({ type: 'DETECT', imageData, jobId } satisfies TableWorkerMessage);
  });
};
