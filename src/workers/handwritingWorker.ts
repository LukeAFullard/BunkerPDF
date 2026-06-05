import { pipeline, env } from '@huggingface/transformers';

// Disable local models to use the Hugging Face Hub (cached via IndexedDB in browser)
env.allowLocalModels = false;
env.useBrowserCache = true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let visionPipeline: any = null;

self.onmessage = async (e: MessageEvent) => {
  const { action, runId, imageUrl } = e.data;

  if (action === 'INIT') {
    try {
      if (!visionPipeline) {
        visionPipeline = await pipeline('image-to-text', 'Xenova/trocr-base-handwritten', {
          dtype: 'q8', device: 'webgpu', // Will fallback to CPU/WASM if WebGPU is not available
        });
      }
      self.postMessage({ type: 'INIT_SUCCESS' });
    } catch (error) {
      console.error("Worker INIT error:", error);
      self.postMessage({ type: 'INIT_ERROR', error: String(error) });
    }
  } else if (action === 'RECOGNIZE_HANDWRITING') {
    try {
      if (!visionPipeline) {
        throw new Error('Pipeline not initialized');
      }

      // Generate text from the image URL
      const output = await visionPipeline(imageUrl);

      const text = output?.[0]?.generated_text || '';

      self.postMessage({
        type: 'RECOGNIZE_SUCCESS',
        runId,
        text: text.trim()
      });

    } catch (error) {
      console.error("Worker RECOGNIZE error:", error);
      self.postMessage({
        type: 'RECOGNIZE_ERROR',
        runId,
        error: String(error)
      });
    }
  }
};
