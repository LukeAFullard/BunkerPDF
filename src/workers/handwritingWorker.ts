import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let handwritingPipeline: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let initPromise: Promise<any> | null = null;

export type HandwritingWorkerMessage = {
  type: 'INIT' | 'RECOGNIZE';
  image?: string; // Data URL
  jobId?: string;
  dtype?: 'q4f16' | 'fp16' | 'fp32';
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
  const { type, image, jobId, dtype } = e.data;

  try {
    if (type === 'INIT') {
      if (!initPromise) {
        // For q4f16, we explicitly pair an fp16 encoder with the q4f16 decoder
        // for better performance and memory usage.
        const pipelineDtype = dtype === 'q4f16' ? { encoder: 'fp16', decoder: 'q4f16' } : (dtype ?? 'fp32');

        initPromise = pipeline('image-to-text', 'onnx-community/trocr-base-handwritten-ONNX', {
          // Caller picks the dtype per attempt. This worker makes exactly ONE
          // attempt — multi-dtype fallback is handled by the caller spawning a
          // new Worker per attempt (see InteractiveCopyModal.tsx), not by
          // retrying here, since retrying in the same worker after a failed
          // session creation causes subsequent attempts to fail identically.
          dtype: pipelineDtype,
          session_options: {
            // 'fp16' fails with a SimplifiedLayerNormFusion node-lookup error with optimization level 'all'.
            // 'basic' keeps safe optimizations (constant folding, dead-node elimination) but skips the fusion tier
            // the error comes from, letting the unfused (but still correct) graph
            // load directly instead of crashing on rewrite.
            graphOptimizationLevel: 'basic',
          },
          progress_callback: (p: { status: string, file: string, loaded: number, total: number }) => {
            if (p.status === 'progress') {
              self.postMessage({ type: 'PROGRESS', name: p.file, loaded: p.loaded, total: p.total } satisfies HandwritingWorkerResponse);
            }
          }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any).then(pipe => {
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
        max_new_tokens: 64,
        no_repeat_ngram_size: 3,
        repetition_penalty: 1.2,
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
