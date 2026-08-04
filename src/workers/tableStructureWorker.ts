import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tableModelPromise: Promise<any> | null = null;

async function getTableModel() {
  if (!tableModelPromise) {
    // model_quantized.onnx (~30MB) is used by default
    tableModelPromise = pipeline('object-detection', 'Xenova/table-transformer-structure-recognition');
  }
  return tableModelPromise;
}

export type TableWorkerMessage = {
  type: 'INIT' | 'DETECT';
  imageData?: ImageData;
  jobId: string;
};

export type TableWorkerResponse = {
  type: 'READY' | 'RESULT' | 'ERROR';
  jobId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detections?: any[];
  error?: string;
};

self.onmessage = async (e: MessageEvent<TableWorkerMessage>) => {
  const { type, imageData, jobId } = e.data;

  try {
    if (type === 'INIT') {
      await getTableModel();
      self.postMessage({ type: 'READY', jobId } satisfies TableWorkerResponse);
    } else if (type === 'DETECT') {
      const model = await getTableModel();
      if (!imageData) throw new Error('No image provided for detection');

      const detections = await model(imageData, { threshold: 0.7 });

      self.postMessage({
        type: 'RESULT',
        jobId,
        detections
      } satisfies TableWorkerResponse);
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    self.postMessage({
      type: 'ERROR',
      jobId,
      error: error.message
    } satisfies TableWorkerResponse);
  }
};
