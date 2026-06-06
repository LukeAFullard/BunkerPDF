import { pipeline, env } from '@huggingface/transformers';

// Suppress local file warnings in browser
env.allowLocalModels = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractorPipeline: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let initPromise: Promise<any> | null = null;

export type SearchWorkerMessage = {
  type: 'INIT' | 'EMBED';
  text?: string;
  jobId?: string;
};

export type SearchWorkerResponse = {
  type: 'READY' | 'RESULT' | 'ERROR';
  jobId?: string;
  embedding?: number[];
  error?: string;
};

self.onmessage = async (e: MessageEvent<SearchWorkerMessage>) => {
  const { type, text, jobId } = e.data;

  try {
    if (type === 'INIT') {
      if (!initPromise) {
        initPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
          quantized: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any).then(pipe => {
          extractorPipeline = pipe;
          return pipe;
        });
      }
      await initPromise;
      self.postMessage({ type: 'READY', jobId } satisfies SearchWorkerResponse);
    } else if (type === 'EMBED') {
      if (initPromise) {
        await initPromise;
      }
      if (!extractorPipeline) throw new Error('Pipeline not initialized');
      if (!text) throw new Error('No text provided for generation');

      const out = await extractorPipeline(text, { pooling: 'mean', normalize: true });

      self.postMessage({
        type: 'RESULT',
        jobId,
        embedding: Array.from(out.data) as number[]
      } satisfies SearchWorkerResponse);
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    self.postMessage({ type: 'ERROR', jobId, error: error.message } satisfies SearchWorkerResponse);
  }
};
