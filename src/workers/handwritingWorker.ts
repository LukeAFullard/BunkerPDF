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
};

export type HandwritingWorkerResponse = {
  type: 'READY' | 'RESULT' | 'ERROR';
  jobId?: string;
  text?: string;
  error?: string;
};

self.onmessage = async (e: MessageEvent<HandwritingWorkerMessage>) => {
  const { type, image, jobId } = e.data;

  try {
    if (type === 'INIT') {
      if (!initPromise) {
        initPromise = pipeline('image-to-text', 'Xenova/trocr-small-handwritten', {
          quantized: true,
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

      const out = await handwritingPipeline(image);
      const text = out[0]?.generated_text || '';

      self.postMessage({
        type: 'RESULT',
        jobId,
        text: text
      } satisfies HandwritingWorkerResponse);
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    self.postMessage({ type: 'ERROR', jobId, error: error.message } satisfies HandwritingWorkerResponse);
  }
};
