import * as ort from 'onnxruntime-web';
import temml from 'temml';

// Tokenizer types and loading
export type Tokenizer = {
    model: {
        vocab: Record<string, number>;
    };
    added_tokens: Array<{ id: number, content: string }>;
};

export function loadTokenizer(tokenizerJson: any): Tokenizer {
    return tokenizerJson as Tokenizer;
}

export function preprocessRegion(imageData: ImageData): { tensor: Float32Array; width: number; height: number } {
    const { width, height, data } = imageData;
    const channels = 4; // RGBA
    const numPixels = width * height;

    // 1. Grayscale and auto-invert
    let sumIntensity = 0;
    const grayscales = new Float32Array(numPixels);
    for (let i = 0; i < numPixels; i++) {
        const r = data[i * channels];
        const g = data[i * channels + 1];
        const b = data[i * channels + 2];
        const gray = (r * 299 + g * 587 + b * 114) / 1000;
        grayscales[i] = gray;
        sumIntensity += gray;
    }
    const avgIntensity = sumIntensity / numPixels;

    // If background is dark (average intensity < 127), invert colors
    if (avgIntensity < 127) {
        for (let i = 0; i < numPixels; i++) {
            grayscales[i] = 255 - grayscales[i];
        }
    }

    // Find bounding box to crop
    let minX = width, minY = height, maxX = 0, maxY = 0;
    const bgThreshold = 240; // Pixels brighter than this are background
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (grayscales[y * width + x] < bgThreshold) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }

    // Handle empty image
    if (minX > maxX || minY > maxY) {
        minX = 0; minY = 0; maxX = width - 1; maxY = height - 1;
    }

    // Add padding around content
    const padContent = 8;
    minX = Math.max(0, minX - padContent);
    minY = Math.max(0, minY - padContent);
    maxX = Math.min(width - 1, maxX + padContent);
    maxY = Math.min(height - 1, maxY + padContent);

    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;

    // Pad to multiple of 32
    const padWidth = Math.ceil(cropWidth / 32) * 32;
    const padHeight = Math.ceil(cropHeight / 32) * 32;

    const tensor = new Float32Array(padWidth * padHeight);

    // Initialize padded area with background (1.0 after normalization below, but here we just set to 255 before norm)
    // Actually we apply normalization directly
    const mean = 0.7931;
    const std = 0.1738;

    for (let y = 0; y < padHeight; y++) {
        for (let x = 0; x < padWidth; x++) {
            let pixelVal = 255; // Background padding
            if (x < cropWidth && y < cropHeight) {
                const origX = minX + x;
                const origY = minY + y;
                pixelVal = grayscales[origY * width + origX];
            }
            // Normalize: (pixel/255 - mean) / std
            tensor[y * padWidth + x] = ((pixelVal / 255.0) - mean) / std;
        }
    }

    return { tensor, width: padWidth, height: padHeight };
}

export async function resolveInputSize(
    resizerSession: ort.InferenceSession,
    initialTensor: Float32Array,
    initialWidth: number,
    initialHeight: number
): Promise<{ width: number; height: number; tensor: Float32Array }> {
    let currentWidth = initialWidth;
    let currentHeight = initialHeight;
    let currentTensor = initialTensor;

    // Initial clamp: proportional downscale if oversized (matches Python's minmax_size,
    // which scales both axes by the same ratio rather than clamping independently).
    const overRatio = Math.max(currentWidth / 672, currentHeight / 192, 1);
    if (overRatio > 1) {
        const targetW = roundTo32(Math.round(currentWidth / overRatio));
        const targetH = roundTo32(Math.round(currentHeight / overRatio));
        currentTensor = resizeGrayscaleTensor(currentTensor, currentWidth, currentHeight, targetW, targetH);
        currentWidth = targetW;
        currentHeight = targetH;
    }

    let loops = 0;
    while (loops < 5) {
        const tensor = new ort.Tensor('float32', currentTensor, [1, 1, currentHeight, currentWidth]);
        const inputName = resizerSession.inputNames[0];
        const results = await resizerSession.run({ [inputName]: tensor });
        const outputName = resizerSession.outputNames[0];
        const logits = results[outputName].data as Float32Array;

        let maxVal = -Infinity, maxIdx = 0;
        for (let i = 0; i < logits.length; i++) {
            if (logits[i] > maxVal) { maxVal = logits[i]; maxIdx = i; }
        }
        const predictedWidth = Math.min((maxIdx + 1) * 32, 672);

        if (predictedWidth === currentWidth || loops >= 3) break;

        // Scale height by the same ratio as width, matching Python's `h = int(h * r)`
        const ratio = predictedWidth / currentWidth;
        const newHeight = Math.min(roundTo32(Math.round(currentHeight * ratio)), 192);
        currentTensor = resizeGrayscaleTensor(currentTensor, currentWidth, currentHeight, predictedWidth, newHeight);
        currentWidth = predictedWidth;
        currentHeight = newHeight;
        loops++;
    }

    return { width: currentWidth, height: currentHeight, tensor: currentTensor };
}

function roundTo32(x: number): number {
    return Math.max(32, Math.round(x / 32) * 32);
}

function resizeGrayscaleTensor(data: Float32Array, oldW: number, oldH: number, newW: number, newH: number): Float32Array {
    const mean = 0.7931, std = 0.1738;

    const src = new OffscreenCanvas(oldW, oldH);
    const sctx = src.getContext('2d')!;
    const imgData = sctx.createImageData(oldW, oldH);
    for (let i = 0; i < oldW * oldH; i++) {
        const v = Math.round(((data[i] * std) + mean) * 255);
        imgData.data[i * 4] = imgData.data[i * 4 + 1] = imgData.data[i * 4 + 2] = v;
        imgData.data[i * 4 + 3] = 255;
    }
    sctx.putImageData(imgData, 0, 0);

    const dst = new OffscreenCanvas(newW, newH);
    const dctx = dst.getContext('2d')!;
    dctx.imageSmoothingEnabled = true;
    dctx.imageSmoothingQuality = 'high';
    dctx.drawImage(src, 0, 0, oldW, oldH, 0, 0, newW, newH);

    const out = new Float32Array(newW * newH);
    const scaled = dctx.getImageData(0, 0, newW, newH).data;
    for (let i = 0; i < newW * newH; i++) {
        out[i] = ((scaled[i * 4] / 255) - mean) / std;
    }
    return out;
}

export function toTensor(data: Float32Array, width: number, height: number): ort.Tensor {
    return new ort.Tensor('float32', data, [1, 1, height, width]);
}

export async function encode(encoderSession: ort.InferenceSession, tensor: ort.Tensor): Promise<ort.Tensor> {
    const inputName = encoderSession.inputNames[0];
    const results = await encoderSession.run({ [inputName]: tensor });
    const outputName = encoderSession.outputNames[0];
    return results[outputName];
}

export async function decodeGreedy(
    decoderSession: ort.InferenceSession,
    context: ort.Tensor,
    tokenizer: Tokenizer,
    maxSeqLen = 512,
): Promise<{ latex: string; confidence: number }> {
    // Try to find actual token ids from tokenizer vocab if possible, but 0 and 2 are typical for RoBERTa/BART-based.

    // Start with BOS
    let tokenStr = "";
    const tokenProbs: number[] = [];

    // Invert vocab for decoding
    const idToToken: Record<number, string> = {};
    for (const entry of Object.entries(tokenizer.model.vocab)) {
        const token = entry[0];
        const id = entry[1];
        idToToken[id as number] = token;
    }
    for (const token of (tokenizer.added_tokens || [])) {
        idToToken[token.id] = token.content;
    }

    // Find proper BOS/EOS if available
    const realBos = tokenizer.model.vocab['<s>'] ?? tokenizer.model.vocab['[BOS]'] ?? 0;
    const realEos = tokenizer.model.vocab['</s>'] ?? tokenizer.model.vocab['[EOS]'] ?? 2;
    const currentTokens = [realBos];

    for (let step = 0; step < maxSeqLen; step++) {
        // Prepare inputs for decoder
        // The decoder in RapidLatexOCR takes input_ids, mask, and encoder_hidden_states
        const seqLen = currentTokens.length;
        const inputIdsTensor = new ort.Tensor('int64', new BigInt64Array(currentTokens.map(BigInt)), [1, seqLen]);

        // Attention mask — reference impl uses an all-True mask the same shape as the tokens
        const maskTensor = new ort.Tensor('bool', new Uint8Array(seqLen).fill(1), [1, seqLen]);

        const inputs: Record<string, ort.Tensor> = {};
        const names = decoderSession.inputNames;
        inputs[names[0]] = inputIdsTensor; // tokens
        inputs[names[1]] = maskTensor;     // mask
        inputs[names[2]] = context;        // encoder context

        const results = await decoderSession.run(inputs);
        const outputName = decoderSession.outputNames[0];
        const logits = results[outputName].data as Float32Array; // shape [1, seq_len, vocab_size]

        // Logits is flat. We want the logits for the last token.
        const vocabSize = logits.length / currentTokens.length;
        const lastTokenLogitsOffset = (currentTokens.length - 1) * vocabSize;

        let maxVal = -Infinity;
        let nextToken = -1;
        for (let i = 0; i < vocabSize; i++) {
            const val = logits[lastTokenLogitsOffset + i];
            if (val > maxVal) {
                maxVal = val;
                nextToken = i;
            }
        }

        // Softmax probability of the chosen token (numerically stable: subtract maxVal first)
        let sumExp = 0;
        for (let i = 0; i < vocabSize; i++) {
            sumExp += Math.exp(logits[lastTokenLogitsOffset + i] - maxVal);
        }
        const chosenProb = 1 / sumExp; // exp(maxVal - maxVal) / sumExp = 1 / sumExp

        if (nextToken === realEos) {
            break;
        }

        currentTokens.push(nextToken);
        tokenProbs.push(chosenProb);

        const tokenText = idToToken[nextToken] || "";
        tokenStr += tokenText;
    }

    const confidence = tokenProbs.length > 0
        ? tokenProbs.reduce((a, b) => a + b, 0) / tokenProbs.length
        : 0;

    return { latex: tokenStr, confidence };
}

export function postProcessLatex(latex: string): string {
    // Replace Ġ with space
    let cleaned = latex.replace(/Ġ/g, ' ');
    // Remove other special tokens if any (like </s>, <pad>)
    cleaned = cleaned.replace(/\[EOS\]/g, '').replace(/\[BOS\]/g, '').replace(/\[PAD\]/g, '');

    // Collapse spurious whitespace around non-letter tokens:
    // Regex cleanup: \frac { x } { y } -> \frac{x}{y} (skip inside \text{...})
    // This is a simplified regex logic for standard latex formatting.
    // It's not a full parser, but handles common spaces.

    // Remove spaces around curly braces and common math operators
    cleaned = cleaned.replace(/\s*{\s*/g, '{');
    cleaned = cleaned.replace(/\s*}\s*/g, '}');
    cleaned = cleaned.replace(/\s*\^\s*/g, '^');
    cleaned = cleaned.replace(/\s*_\s*/g, '_');

    return cleaned.trim();
}

export function toWordMathML(latex: string): string {
    const mathml = temml.renderToString(latex, { displayMode: true, throwOnError: false });
    return mathml.replace('<math ', '<math xmlns="http://www.w3.org/1998/Math/MathML" ');
}
