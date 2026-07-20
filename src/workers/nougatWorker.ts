import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let nougatPipeline: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let initPromise: Promise<any> | null = null;

export type NougatWorkerMessage = {
  type: 'INIT' | 'RECOGNIZE';
  image?: string; // Data URL
  jobId?: string;
};

export type NougatWorkerResponse = {
  type: 'READY' | 'RESULT' | 'ERROR';
  jobId?: string;
  text?: string;
  error?: string;
};

self.onmessage = async (e: MessageEvent<NougatWorkerMessage>) => {
  const { type, image, jobId } = e.data;

  try {
    if (type === 'INIT') {
      if (!initPromise) {
        initPromise = pipeline('image-to-text', 'Xenova/nougat-small', {
          quantized: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any).then(pipe => {
          nougatPipeline = pipe;
          return pipe;
        });
      }
      await initPromise;
      self.postMessage({ type: 'READY', jobId } satisfies NougatWorkerResponse);
    } else if (type === 'RECOGNIZE') {
      if (initPromise) {
        await initPromise;
      }
      if (!nougatPipeline) throw new Error('Pipeline not initialized');
      if (!image) throw new Error('No image provided for generation');

      const out = await nougatPipeline(image);
      const text = out[0]?.generated_text || '';

      self.postMessage({
        type: 'RESULT',
        jobId,
        text: text
      } satisfies NougatWorkerResponse);
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    self.postMessage({ type: 'ERROR', jobId, error: error.message } satisfies NougatWorkerResponse);
  }
};
