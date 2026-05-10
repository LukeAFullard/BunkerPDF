import { pipeline, env } from '@huggingface/transformers';

// Suppress local file warnings in browser
env.allowLocalModels = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ttsPipeline: any = null;

export type TTSWorkerMessage = {
  type: 'INIT' | 'GENERATE';
  text?: string;
  jobId?: string;
};

export type TTSWorkerResponse = {
  type: 'READY' | 'RESULT' | 'ERROR';
  jobId?: string;
  audio?: Float32Array;
  samplingRate?: number;
  error?: string;
};

self.onmessage = async (e: MessageEvent<TTSWorkerMessage>) => {
  const { type, text, jobId } = e.data;

  try {
    if (type === 'INIT') {
      if (!ttsPipeline) {
        ttsPipeline = await pipeline('text-to-speech', 'Xenova/mms-tts-eng', {
          quantized: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      }
      self.postMessage({ type: 'READY', jobId } satisfies TTSWorkerResponse);
    } else if (type === 'GENERATE') {
      if (!ttsPipeline) throw new Error('Pipeline not initialized');
      if (!text) throw new Error('No text provided for generation');

      const out = await ttsPipeline(text);

      self.postMessage({
        type: 'RESULT',
        jobId,
        audio: out.audio,
        samplingRate: out.sampling_rate
      } satisfies TTSWorkerResponse);
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    self.postMessage({ type: 'ERROR', jobId, error: error.message } satisfies TTSWorkerResponse);
  }
};
