import type { TTSWorkerMessage, TTSWorkerResponse } from '../workers/ttsWorker';

let worker: Worker | null = null;
let currentJobId: string | null = null;
let currentResolve: ((result: { audio: Float32Array; samplingRate: number }) => void) | null = null;
let currentReject: ((error: Error) => void) | null = null;

let initPromise: Promise<void> | null = null;

export function initTTSWorker(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    worker = new Worker(new URL('../workers/ttsWorker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (e: MessageEvent<TTSWorkerResponse>) => {
      const { type, jobId, audio, samplingRate, error } = e.data;
      if (type === 'READY') {
        console.log('TTS Worker initialized');
        resolve();
      } else if (type === 'RESULT' && jobId === currentJobId) {
        if (currentResolve && audio && samplingRate) currentResolve({ audio, samplingRate });
        currentJobId = null;
        currentResolve = null;
        currentReject = null;
      } else if (type === 'ERROR') {
        if (jobId === currentJobId && currentReject) {
          currentReject(new Error(error));
          currentJobId = null;
          currentResolve = null;
          currentReject = null;
        } else if (!currentJobId) {
          // Error during init
          reject(new Error(error));
        }
      }
    };

    worker.postMessage({ type: 'INIT' } satisfies TTSWorkerMessage);
  });

  return initPromise;
}

export async function generateSpeech(text: string, onProgress?: (progress: number) => void): Promise<{ audio: Float32Array; samplingRate: number }> {
  if (!worker) {
    await initTTSWorker();
  } else if (initPromise) {
    await initPromise;
  }

  // Clean text and split into sentences
  const cleanedText = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const sentences = cleanedText.match(/[^.!?]+[.!?]+/g) || [cleanedText];

  // Group sentences into chunks of max ~200 characters to prevent OOM
  const chunks: string[] = [];
  let currentChunk = '';
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > 200) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += ' ' + sentence;
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());

  let totalSamplingRate = 16000;
  const audioChunks: Float32Array[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) continue;

    if (onProgress) {
      onProgress(Math.round((i / chunks.length) * 100));
    }

    const result = await new Promise<{ audio: Float32Array; samplingRate: number }>((resolve, reject) => {
      const jobId = Math.random().toString(36).substring(7);
      currentJobId = jobId;
      currentResolve = resolve;
      currentReject = reject;

      worker!.postMessage({
        type: 'GENERATE',
        text: chunk,
        jobId
      } satisfies TTSWorkerMessage);
    });

    audioChunks.push(result.audio);
    totalSamplingRate = result.samplingRate;
  }

  // Concatenate all float arrays
  const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const combinedAudio = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of audioChunks) {
    combinedAudio.set(chunk, offset);
    offset += chunk.length;
  }

  return { audio: combinedAudio, samplingRate: totalSamplingRate };
}
