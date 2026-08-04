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
  imageData: ImageData;
  requestId: string;
};

export type TableWorkerResponse = {
  requestId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detections?: any[];
  error?: string;
};

self.onmessage = async (e: MessageEvent<TableWorkerMessage>) => {
  const { imageData, requestId } = e.data;

  try {
    const model = await getTableModel();
    const detections = await model(imageData, { threshold: 0.7 });

    self.postMessage({
      requestId,
      detections
    } satisfies TableWorkerResponse);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    self.postMessage({
      requestId,
      error: error.message
    } satisfies TableWorkerResponse);
  }
};
