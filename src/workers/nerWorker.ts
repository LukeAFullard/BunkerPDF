import { pipeline, env } from '@huggingface/transformers';

// Suppress local file warnings in browser
env.allowLocalModels = false;

let nerPipeline: any = null;

// Messages
export type NERWorkerMessage = {
  type: 'INIT' | 'EXTRACT';
  text?: string;
};

export type NERWorkerResponse = {
  type: 'READY' | 'RESULT' | 'ERROR';
  result?: any;
  error?: string;
};

self.onmessage = async (e: MessageEvent<NERWorkerMessage>) => {
  const { type, text } = e.data;

  try {
    if (type === 'INIT') {
      if (!nerPipeline) {
        // Use a lightweight quantized model for initial load
        // Xenova/bert-base-NER or dslim/bert-base-NER
        nerPipeline = await pipeline('token-classification', 'Xenova/bert-base-NER', {
          quantized: true,
        } as any);
      }
      self.postMessage({ type: 'READY' });
    } else if (type === 'EXTRACT') {
      if (!nerPipeline) {
        throw new Error('Pipeline not initialized');
      }
      if (!text) {
        throw new Error('No text provided for extraction');
      }

      const result = await nerPipeline(text);
      self.postMessage({ type: 'RESULT', result });
    }
  } catch (error: any) {
    self.postMessage({ type: 'ERROR', error: error.message });
  }
};
