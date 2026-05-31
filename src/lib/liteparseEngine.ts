import init, { LiteParse } from "@llamaindex/liteparse-wasm";

let isInitialized = false;
let initPromise: Promise<void> | null = null;

export async function initLiteparse() {
  if (isInitialized) return;
  if (!initPromise) {
    initPromise = init().then(() => {
      isInitialized = true;
    });
  }
  await initPromise;
}

export async function extractTextLiteparse(pdfBytes: Uint8Array): Promise<string> {
  await initLiteparse();
  const parser = new LiteParse({ outputFormat: "text", ocrEnabled: false });
  try {
    const result = await parser.parse(pdfBytes);
    return result.text;
  } finally {
    parser.free();
  }
}

export async function extractAllPagesTextLiteparse(pdfBytes: Uint8Array): Promise<string[]> {
  await initLiteparse();
  const parser = new LiteParse({ outputFormat: "json", ocrEnabled: false });
  try {
    const result = await parser.parse(pdfBytes);
    if (result.pages && Array.isArray(result.pages)) {
       return result.pages.map((p: { text?: string }) => p.text || '');
    }
    return [result.text];
  } finally {
    parser.free();
  }
}
