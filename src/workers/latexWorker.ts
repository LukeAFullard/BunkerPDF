import * as ort from 'onnxruntime-web';
import { get, set } from 'idb-keyval';
import { preprocessRegion, resolveInputSize, encode, decodeGreedy, postProcessLatex, loadTokenizer, toTensor } from '../lib/latexOcrEngine';
import type { Tokenizer } from '../lib/latexOcrEngine';

// Ensure WebAssembly uses multi-threading and SIMD where supported
ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 1);
ort.env.wasm.simd = true;

const HF_REPO = 'inYourOwnBrowser/rapid-latex-ocr-onnx';
const HF_REVISION = '676264a4475cedba38b2cbda32c8b2d978d49453';
const MODEL_BASE_URL = `https://huggingface.co/${HF_REPO}/resolve/${HF_REVISION}`;

const MODEL_URLS = {
  encoder: `${MODEL_BASE_URL}/encoder.onnx`,
  decoder: `${MODEL_BASE_URL}/decoder.onnx`,
  imageResizer: `${MODEL_BASE_URL}/image_resizer.onnx`,
  tokenizer: `${MODEL_BASE_URL}/tokenizer.json`,
} as const;

let sessions: { encoder: ort.InferenceSession; decoder: ort.InferenceSession; resizer: ort.InferenceSession } | null = null;
let tokenizer: Tokenizer | null = null;
let initPromise: Promise<void> | null = null;

async function fetchWithProgress(url: string, name: string): Promise<ArrayBuffer> {
    const cacheKey = `latex-ocr-model-${name}-${HF_REVISION}`;

    // Check IDB cache first
    try {
        const cached = await get<Uint8Array>(cacheKey);
        if (cached && cached.byteLength > 0) {
            console.log(`[LatexWorker] Loaded ${name} from cache`);
            return cached.buffer as ArrayBuffer;
        }
    } catch (e) {
        console.warn(`[LatexWorker] Failed to read ${name} from cache`, e);
    }

    console.log(`[LatexWorker] Downloading ${name}...`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}`);

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    let loaded = 0;
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];

    if (reader) {
        while(true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                chunks.push(value);
                loaded += value.length;
                if (total > 0) {
                    self.postMessage({ type: 'PROGRESS', name, loaded, total });
                }
            }
        }
    } else {
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
    return buffer as ArrayBuffer;
    }

    const result = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }

    // Save to cache if we got everything
    if (total === 0 || loaded === total) {
        try {
            await set(cacheKey, result);
        } catch (e) {
            console.warn(`[LatexWorker] Failed to save ${name} to cache`, e);
        }
    } else {
        console.warn(`[LatexWorker] Skipped caching ${name}: loaded ${loaded} != total ${total}`);
    }

    return result.buffer;
}

async function init() {
    try {
        self.postMessage({ type: 'PROGRESS', name: 'tokenizer', loaded: 0, total: 100 });
        const tokenizerRes = await fetch(MODEL_URLS.tokenizer);
        const tokenizerJson = await tokenizerRes.json();
        self.postMessage({ type: 'PROGRESS', name: 'tokenizer', loaded: 100, total: 100 });

        const [encoderBuf, decoderBuf, resizerBuf] = await Promise.all([
            fetchWithProgress(MODEL_URLS.encoder, 'encoder'),
            fetchWithProgress(MODEL_URLS.decoder, 'decoder'),
            fetchWithProgress(MODEL_URLS.imageResizer, 'resizer')
        ]);

        const [encoder, decoder, resizer] = await Promise.all([
            ort.InferenceSession.create(encoderBuf, { executionProviders: ['wasm'] }),
            ort.InferenceSession.create(decoderBuf, { executionProviders: ['wasm'] }),
            ort.InferenceSession.create(resizerBuf, { executionProviders: ['wasm'] }),
        ]);

        sessions = { encoder, decoder, resizer };
        tokenizer = loadTokenizer(tokenizerJson);
    } catch (err) {
        console.error("Init failed", err);
        throw err;
    }
}

async function dataUrlToImageData(dataUrl: string): Promise<ImageData> {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    // We need an offscreen canvas to extract ImageData in a worker
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not get 2D context in worker");
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

self.onmessage = async (e: MessageEvent) => {
    const { type, payload } = e.data;

    if (type === 'INIT') {
        if (!initPromise) {
            initPromise = init();
        }
        try {
            await initPromise;
            self.postMessage({ type: 'READY' });
        } catch (err) {
            self.postMessage({ type: 'ERROR', error: String(err) });
        }
        return;
    }

    if (type === 'RECOGNIZE') {
        try {
            if (!initPromise) {
                initPromise = init();
            }
            await initPromise;

            if (!sessions || !tokenizer) {
                throw new Error("Models not initialized properly");
            }

            const imageData = await dataUrlToImageData(payload.dataUrl);
            const pre = preprocessRegion(imageData);

            const { width, height, tensor: resizedData } = await resolveInputSize(sessions.resizer, pre.tensor, pre.width, pre.height);

            const tensor = toTensor(resizedData, width, height);

            const context = await encode(sessions.encoder, tensor);
            const raw = await decodeGreedy(sessions.decoder, context, tokenizer);

            self.postMessage({ type: 'RESULT', text: postProcessLatex(raw), runId: payload.runId });
        } catch (err) {
            self.postMessage({ type: 'ERROR', error: String(err), runId: payload.runId });
        }
    }
};
