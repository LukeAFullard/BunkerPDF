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
  confidence?: number;
  error?: string;
};

self.onmessage = async (e: MessageEvent<HandwritingWorkerMessage>) => {
  const { type, image, jobId } = e.data;

  try {
    if (type === 'INIT') {
      if (!initPromise) {
        initPromise = pipeline('image-to-text', 'Xenova/trocr-base-handwritten', {
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

      const out = await handwritingPipeline(image, {
        num_beams: 4,
        max_new_tokens: 128,
        no_repeat_ngram_size: 3,
        return_dict_in_generate: true,
        output_scores: true,
      });

      const result = Array.isArray(out) ? out[0] : out;
      const text = result?.generated_text || '';

      // Calculate confidence if scores are available
      let confidence = 0;
      if (result?.scores && result.scores.length > 0) {
          let sumProb = 0;
          let count = 0;
          // result.scores is an array of tensors for each generated token step
          // because of num_beams: 4, shape of scores is [batch_size, vocab_size] where batch is num_beams.
          // We only care about the best beam. The pipeline's output scores tensor shape for batch might be flattened.
          for (const scoreTensor of result.scores) {
              const logits = scoreTensor.data as Float32Array;
              // A rough approximation of the top beam's confidence:
              // since it's flattened, we will compute softmax for the first vocabulary slice
              // (assuming the first slice corresponds to the top beam)
              const vocabSize = scoreTensor.dims[scoreTensor.dims.length - 1]; // last dimension is vocab_size
              let maxLogit = -Infinity;
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              for (let i = 0; i < vocabSize; i++) {
                  if (logits[i] > maxLogit) {
                      maxLogit = logits[i];
                  }
              }
              // Softmax probability of the chosen token in the top beam
              let sumExp = 0;
              for (let i = 0; i < vocabSize; i++) {
                  sumExp += Math.exp(logits[i] - maxLogit);
              }
              sumProb += (1 / sumExp);
              count++;
          }
          if (count > 0) {
              confidence = sumProb / count;
          }
      }

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
