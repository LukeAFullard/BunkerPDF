import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let handwritingPipeline: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let initPromise: Promise<any> | null = null;

// Progressively smaller-to-larger dtypes to try. `q8` is much smaller
// (~338MB total) but is the export that previously hit a MatMulNBits
// session-creation bug on some onnxruntime-web versions. `fp16` (~668MB)
// is a safe middle ground if q8 fails. `fp32` (~1.33GB) is the last
// resort, previously confirmed working.
const DTYPE_FALLBACK_CHAIN: Array<'q8' | 'fp16' | 'fp32'> = ['q8', 'fp16', 'fp32'];

async function loadHandwritingPipeline() {
  let lastError: unknown = null;
  for (const dtype of DTYPE_FALLBACK_CHAIN) {
    try {
      const pipe = await pipeline('image-to-text', 'Xenova/trocr-base-handwritten', {
        dtype,
        progress_callback: (p: any) => {
          if (p.status === 'progress') {
            self.postMessage({
              type: 'PROGRESS',
              name: p.file,
              loaded: p.loaded,
              total: p.total,
            } satisfies HandwritingWorkerResponse);
          }
        },
      } as any);
      return pipe;
    } catch (err) {
      console.warn(`[handwritingWorker] Failed to load dtype "${dtype}", trying next fallback.`, err);
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Failed to load handwriting model in any dtype');
}

export type HandwritingWorkerMessage = {
  type: 'INIT' | 'RECOGNIZE';
  image?: string; // Data URL
  jobId?: string;
};

export type HandwritingWorkerResponse = {
  type: 'READY' | 'RESULT' | 'ERROR' | 'PROGRESS';
  jobId?: string;
  text?: string;
  confidence?: number;
  error?: string;
  name?: string;
  loaded?: number;
  total?: number;
};

self.onmessage = async (e: MessageEvent<HandwritingWorkerMessage>) => {
  const { type, image, jobId } = e.data;

  try {
    if (type === 'INIT') {
      if (!initPromise) {
        initPromise = loadHandwritingPipeline().then(pipe => {
          handwritingPipeline = pipe;
          return pipe;
        });
      }
      await initPromise;
      self.postMessage({ type: 'READY', jobId } satisfies HandwritingWorkerResponse);
    } else if (type === 'RECOGNIZE') {
      if (initPromise) {
        await initPromise;
      }
      if (!handwritingPipeline) throw new Error('Pipeline not initialized');
      if (!image) throw new Error('No image provided for generation');

      const out = await handwritingPipeline(image, {
        num_beams: 4,
        max_new_tokens: 128,
        no_repeat_ngram_size: 3,
      });

      const result = Array.isArray(out) ? out[0] : out;
      const text = result?.generated_text || '';

      const confidence = undefined;

      self.postMessage({
        type: 'RESULT',
        jobId,
        text: text,
        confidence
      } satisfies HandwritingWorkerResponse);
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    self.postMessage({ type: 'ERROR', jobId, error: error.message } satisfies HandwritingWorkerResponse);
  }
};
