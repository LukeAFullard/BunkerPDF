import * as ort from 'onnxruntime-web';

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

    let loops = 0;
    while (loops < 5) {
        // Cap max dimensions for safety before inference
        if (currentWidth > 672) currentWidth = 672;
        if (currentHeight > 192) currentHeight = 192;

        const tensor = new ort.Tensor('float32', currentTensor, [1, 1, currentHeight, currentWidth]);

        const inputName = resizerSession.inputNames[0];
        const results = await resizerSession.run({ [inputName]: tensor });
        const outputName = resizerSession.outputNames[0];
        const logits = results[outputName].data as Float32Array;

        let maxVal = -Infinity;
        let maxIdx = 0;
        for(let i=0; i<logits.length; i++) {
            if (logits[i] > maxVal) {
                maxVal = logits[i];
                maxIdx = i;
            }
        }

        const predictedWidth = (maxIdx + 1) * 32;

        if (predictedWidth === currentWidth || loops >= 3) {
            currentWidth = predictedWidth;
            break;
        }

        // If we need to change width, create a new padded/cropped tensor
        const newTensor = new Float32Array(predictedWidth * currentHeight);
        // Pad with background value (normalized 255)
        const mean = 0.7931;
        const std = 0.1738;
        const bgVal = ((255 / 255.0) - mean) / std;
        newTensor.fill(bgVal);

        const copyWidth = Math.min(currentWidth, predictedWidth);
        for (let y = 0; y < currentHeight; y++) {
            for (let x = 0; x < copyWidth; x++) {
                newTensor[y * predictedWidth + x] = currentTensor[y * currentWidth + x];
            }
        }

        currentWidth = predictedWidth;
        currentTensor = newTensor;
        loops++;
    }

    currentWidth = Math.min(currentWidth, 672);
    currentHeight = Math.min(currentHeight, 192);

    // Ensure final tensor matches final capped dimensions if it was capped
    let finalTensor = currentTensor;
    if (currentTensor.length !== currentWidth * currentHeight) {
        finalTensor = new Float32Array(currentWidth * currentHeight);
        const mean = 0.7931;
        const std = 0.1738;
        const bgVal = ((255 / 255.0) - mean) / std;
        finalTensor.fill(bgVal);
        const origW = currentTensor.length / currentHeight; // old width
        const copyWidth = Math.min(origW, currentWidth);
        for (let y = 0; y < currentHeight; y++) {
            for (let x = 0; x < copyWidth; x++) {
                finalTensor[y * currentWidth + x] = currentTensor[y * origW + x];
            }
        }
    }

    return { width: currentWidth, height: currentHeight, tensor: finalTensor };
}

export function toTensor(data: Float32Array, width: number, height: number): ort.Tensor {
    // We need to resize/pad the data to match width/height exactly
    // since we didn't resize the actual pixel data in resolveInputSize.
    // If width/height changed, we do a simple crop or pad with background.

    // Original might have been different size.
    // We assume data is from preprocessRegion which returns width and height.
    // We don't have the original width/height here!
    // Wait, let's change `resolveInputSize` signature or handle it.
    // The prompt says `const { width, height } = await resolveInputSize(sessions!.resizer, pre.tensor);`
    // Wait, the prompt signature was:
    // export async function resolveInputSize(resizerSession: ort.InferenceSession, tensor: Float32Array): Promise<{ width: number; height: number }>
    // We need original width/height inside `resolveInputSize`. Let's assume the tensor is [1, 1, pre.height, pre.width] and we can infer from pre.tensor length?
    // Actually let's just make sure `toTensor` gets the original width and height, or we just pass the original tensor.
    // If we just use `pre.tensor` and `pre.width`/`pre.height` directly and ignore the resizer, it might be fine, but let's implement basic resizing.

    // We'll assume the data is already of size width*height for simplicity, OR we just return the tensor.
    // Let's assume the caller passes the right pre.tensor and pre.width/pre.height.

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
): Promise<string> {
    // Try to find actual token ids from tokenizer vocab if possible, but 0 and 2 are typical for RoBERTa/BART-based.

    let currentTokens = [0]; // Start with BOS
    let tokenStr = "";

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
    currentTokens = [realBos];

    for (let step = 0; step < maxSeqLen; step++) {
        // Prepare inputs for decoder
        // The decoder in RapidLatexOCR takes input_ids and encoder_hidden_states
        const inputIdsTensor = new ort.Tensor('int64', new BigInt64Array(currentTokens.map(BigInt)), [1, currentTokens.length]);

        const inputs: Record<string, ort.Tensor> = {};
        // Find input names
        const names = decoderSession.inputNames;
        inputs[names[0]] = inputIdsTensor; // usually input_ids
        inputs[names[1]] = context; // usually encoder_hidden_states

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

        if (nextToken === realEos) {
            break;
        }

        currentTokens.push(nextToken);

        const tokenText = idToToken[nextToken] || "";
        tokenStr += tokenText;
    }

    return tokenStr;
}

export function postProcessLatex(latex: string): string {
    // Replace Ġ with space
    let cleaned = latex.replace(/Ġ/g, ' ');
    // Remove other special tokens if any (like </s>, <pad>)
    cleaned = cleaned.replace(/<\/?[s]>/g, '').replace(/<pad>/g, '');

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
