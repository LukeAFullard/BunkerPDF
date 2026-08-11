import { fromLines, buildGridFromIntersections, lineCoversSpan } from './lineTracingMath';
import init, { LiteParse } from "@llamaindex/liteparse-wasm";
import { useUIStore } from '../store/uiStore';
import { ocrPdf } from './ocrEngine';
import wasmUrl from '@llamaindex/liteparse-wasm/liteparse_wasm_bg.wasm?url';

let initPromise: Promise<void> | null = null;
let hasInit = false;

let cachedEngineJson: LiteParse | null = null;
let cachedEngineText: LiteParse | null = null;
let cachedEngineMarkdown: LiteParse | null = null;
let lastOcrEnabled: boolean | null = null;


export const getConfiguredLiteParse = async (options: {
  outputFormat?: 'json' | 'text' | 'markdown',
  extractLinks?: boolean,
  extractImages?: boolean,
  extractAnnotations?: boolean,
  extractFormFields?: boolean,
  extractStructureTree?: boolean,
  extractXfaPackets?: boolean,
  extractContentBounds?: boolean,
  extractVectorGraphics?: boolean,
  extractTextMetadata?: boolean,
  renderFormFields?: boolean
} = {}): Promise<LiteParse> => {
  await initLiteParse();
  const ocrEnabled = useUIStore.getState().liteparseOcrEnabled;
  const format = options.outputFormat || 'json';

  const hasAdvancedOptions = options.extractLinks || options.extractImages || options.extractAnnotations ||
    options.extractFormFields || options.extractStructureTree || options.extractXfaPackets ||
    options.extractContentBounds || options.extractVectorGraphics || options.extractTextMetadata || options.renderFormFields;

  // We only cache basic engines without extra flags for now to avoid complexity.
  // If advanced extraction is requested, we create a fresh one.
  if (!hasAdvancedOptions) {
    if (lastOcrEnabled !== null && lastOcrEnabled !== ocrEnabled) {
      if (cachedEngineJson) { cachedEngineJson.free(); cachedEngineJson = null; }
      if (cachedEngineText) { cachedEngineText.free(); cachedEngineText = null; }
      if (cachedEngineMarkdown) { cachedEngineMarkdown.free(); cachedEngineMarkdown = null; }
    }
    lastOcrEnabled = ocrEnabled;

    if (format === 'json' && cachedEngineJson) return cachedEngineJson;
    if (format === 'text' && cachedEngineText) return cachedEngineText;
    if (format === 'markdown' && cachedEngineMarkdown) return cachedEngineMarkdown;
  }

  // OCR via WASM natively in LiteParse is currently broken due to upstream panics in @llamaindex/liteparse-wasm
  // regarding the missing Tokio 1.x runtime when `ocrEnabled: true` is passed.
  // Instead, we handle OCR via a pre-processing step using the existing `ocrPdf` function
  // before passing the bytes to LiteParse. Therefore, we always initialize LiteParse with `ocrEnabled: false`.

  const engine = new LiteParse({
    outputFormat: format,
    ocrEnabled: false,
    extractLinks: options.extractLinks,
    extractImages: options.extractImages,
    extractAnnotations: options.extractAnnotations,
    extractFormFields: options.extractFormFields,
    extractStructureTree: options.extractStructureTree,
    extractXfaPackets: options.extractXfaPackets,
    extractContentBounds: options.extractContentBounds,
    extractVectorGraphics: options.extractVectorGraphics,
    extractTextMetadata: options.extractTextMetadata,
    renderFormFields: options.renderFormFields,
  });

  if (!hasAdvancedOptions) {
    if (format === 'json') cachedEngineJson = engine;
    if (format === 'text') cachedEngineText = engine;
    if (format === 'markdown') cachedEngineMarkdown = engine;
  }

  return engine;
};

export interface LineItem {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  type: 'horizontal' | 'vertical';
  strokeWidth?: number;
  opacity?: number;
  color?: string;
  disabled?: boolean;
}

/**
 * If an explicit vertical line runs through the middle of `item`'s bounding box
 * and the item's text has an internal space, split it into two items at the
 * space closest to the line. This corrects upstream liteparse-wasm word-merge
 * errors (two words returned as one text item with one wide bbox) that would
 * otherwise be misread as an intentional merged/spanning cell.
 * Note: If the upstream parser fuses items without leaving a space (e.g. "Contribution52.8"),
 * this recovery mechanism will fail as it relies on whitespace separation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isNearWhiteOrLightGray(color: string): boolean {
  if (color.startsWith('#')) {
    let r, g, b;
    if (color.length === 4) {
        r = parseInt(color[1] + color[1], 16);
        g = parseInt(color[2] + color[2], 16);
        b = parseInt(color[3] + color[3], 16);
    } else if (color.length === 7 || color.length === 9) {
        r = parseInt(color.substring(1, 3), 16);
        g = parseInt(color.substring(3, 5), 16);
        b = parseInt(color.substring(5, 7), 16);
    }
    if (r !== undefined && g !== undefined && b !== undefined) {
        return r > 200 && g > 200 && b > 200; // Light gray threshold
    }
  }
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isLikelyWatermark(item: any): boolean {
  if (item.mcidTag === 'Artifact') return true;
  if (item.rotation && Math.abs(item.rotation % 90) > 2) return true;
  if (item.opacity !== undefined && item.opacity < 0.35) return true;
  if (item.fillColor && isNearWhiteOrLightGray(item.fillColor)) return true;
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isProtectedSpanningItem(item: any): boolean {
  const fontNameLower = (item.fontName || '').toLowerCase();
  const isBold = fontNameLower.includes('bold');
  const isShaded = item.fillColor && isBackgroundColor(item.fillColor);
  return isBold || isShaded;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function splitItemAtInteriorLine(item: any, verticalLines: LineItem[]): any[] {
  const EDGE_MARGIN = 3; // px; ignore lines too close to the item's own edges
  const itemYStart = item.y;
  const itemYEnd = item.y + item.height;

  const interiorLine = verticalLines.find(l => {
    const xInRange = l.x0 > item.x + EDGE_MARGIN && l.x0 < item.x + item.width - EDGE_MARGIN;
    if (!xInRange) return false;

    // Require the line to actually run through this item's row, not just
    // exist somewhere else in the table at a matching X.
    const lineYStart = Math.min(l.y0, l.y1);
    const lineYEnd = Math.max(l.y0, l.y1);
    const Y_TOLERANCE = 3; // px
    return lineYEnd >= itemYStart - Y_TOLERANCE && lineYStart <= itemYEnd + Y_TOLERANCE;
  });

  if (!interiorLine) {
    return [item]; // nothing to split on — leave as-is
  }

  // Find the internal space whose estimated position is closest to the line.
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < item.text.length; i++) {
    if (item.text[i] !== ' ') continue;
    const estX = item.x + item.width * (i / item.text.length);
    const dist = Math.abs(estX - interiorLine.x0);
    if (dist < bestDist) { bestDist = dist; bestIdx = i; }
  }

  if (bestIdx === -1) {
    return [item];
  }

  // Sanity check: only split if the chosen space is plausibly near the
  // line (not just the closest of several distant candidates) — otherwise
  // this is likely a genuine spanning item and should be left alone.
  const MAX_SPLIT_DISTANCE = item.width * 0.25;
  if (bestDist > MAX_SPLIT_DISTANCE) {
    return [item];
  }

  // Use the line's own position as the geometric split point, not a
  // character-count estimate, so the pieces land in the correct columns
  const splitX = interiorLine.x0;

  const left = {
    ...item,
    text: item.text.slice(0, bestIdx).trimEnd(),
    width: splitX - item.x,
  };
  const right = {
    ...item,
    text: item.text.slice(bestIdx + 1).trimStart(),
    x: splitX,
    width: item.x + item.width - splitX,
  };

  // Recursively process the right half in case there are multiple lines (e.g., three-way fuse)
  return [left, ...splitItemAtInteriorLine(right, verticalLines)];
}

export function isBackgroundColor(color?: string): boolean {
  if (!color) return false;
  // Handle hex colors
  if (color.startsWith('#')) {
      let r, g, b;
      if (color.length === 4) {
          r = parseInt(color[1] + color[1], 16);
          g = parseInt(color[2] + color[2], 16);
          b = parseInt(color[3] + color[3], 16);
      } else if (color.length === 7) {
          r = parseInt(color.substring(1, 3), 16);
          g = parseInt(color.substring(3, 5), 16);
          b = parseInt(color.substring(5, 7), 16);
      } else if (color.length === 9) { // #rrggbbaa
          r = parseInt(color.substring(1, 3), 16);
          g = parseInt(color.substring(3, 5), 16);
          b = parseInt(color.substring(5, 7), 16);
      }
      if (r !== undefined && g !== undefined && b !== undefined) {
          return r > 240 && g > 240 && b > 240;
      }
  }
  // Handle rgb/rgba colors
  if (color.startsWith('rgb')) {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
          const r = parseInt(match[1]);
          const g = parseInt(match[2]);
          const b = parseInt(match[3]);
          return r > 240 && g > 240 && b > 240;
      }
  }
  return false;
}

export const initLiteParse = async (): Promise<void> => {
  if (hasInit) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Use Vite's ?url import to get the correct hashed path in production
      await init(wasmUrl);
      hasInit = true;
    } catch (error) {
      console.error("Failed to initialize LiteParse WASM:", error);
      throw error;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
};

import { useProcessingStore } from '../store/processingStore';

// Simple in-memory cache for OCR-processed bytes to prevent redundant expensive operations.
// Keys are generated from byte-length and a small sampling of the content (pseudo-fingerprint).
const ocrCache = new Map<string, Uint8Array>();

const getByteFingerprint = (bytes: Uint8Array): string => {
  if (bytes.length < 1024) return `${bytes.length}-${bytes.join(',')}`;
  // Sample start, middle, and end
  const sampleSize = 100;
  const mid = Math.floor(bytes.length / 2);
  return `${bytes.length}-${bytes.slice(0, sampleSize).join('')}-${bytes.slice(mid, mid + sampleSize).join('')}-${bytes.slice(-sampleSize).join('')}`;
};

const preprocessWithOcr = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const ocrEnabled = useUIStore.getState().liteparseOcrEnabled;
  if (!ocrEnabled) return bytes;

  const fingerprint = getByteFingerprint(bytes);
  const cached = ocrCache.get(fingerprint);
  if (cached) {
    console.log("Using cached OCR-processed PDF bytes...");
    return cached;
  }

  console.log("Pre-processing PDF with Tesseract OCR before passing to LiteParse...");
  const file = new File([bytes.buffer as ArrayBuffer], "temp-ocr.pdf", { type: "application/pdf" });

  // Use the processing store to update the UI progress bar during the synchronous LiteParse workflow
  const processedFile = await ocrPdf(file, undefined, (stage) => {
     useProcessingStore.getState().updateStage(stage);
  });

  const processedBytes = new Uint8Array(await processedFile.arrayBuffer());
  ocrCache.set(fingerprint, processedBytes);

  // Cap cache size to prevent memory leaks in long sessions
  if (ocrCache.size > 5) {
     const firstKey = ocrCache.keys().next().value;
     if (firstKey !== undefined) ocrCache.delete(firstKey);
  }

  return processedBytes;
};

export const extractTextLiteparse = async (bytes: Uint8Array): Promise<string> => {
  const processedBytes = await preprocessWithOcr(bytes);
  const engine = await getConfiguredLiteParse({ outputFormat: "text" });
  const result = await engine.parse(processedBytes);
  return result.text || "";
};

export const extractParagraphsLiteparse = async (bytes: Uint8Array): Promise<string[]> => {
  const processedBytes = await preprocessWithOcr(bytes);
  const engine = await getConfiguredLiteParse({ outputFormat: "json" });
  const result = await engine.parse(processedBytes);

  if (!result || !result.pages) return [];

  const paragraphs: string[] = [];

  for (const page of result.pages) {
    if (!page.textItems || page.textItems.length === 0) continue;

    // Use the robust formatParagraphFromItems which sorts by Y and then X
    // and correctly inserts "\n\n" between structural paragraphs.
    const fullPageText = formatParagraphFromItems(page.textItems);

    // Split by the double newlines inserted by formatParagraphFromItems
    const pageParagraphs = fullPageText.split("\n\n").map(p => p.trim()).filter(p => p.length > 0);
    paragraphs.push(...pageParagraphs);
  }

  return paragraphs;
};

export const extractAllPagesTextLiteparse = async (bytes: Uint8Array): Promise<string[]> => {
  const processedBytes = await preprocessWithOcr(bytes);
  // We need per-page strings, so we use JSON output which contains an array of pages.
  const engine = await getConfiguredLiteParse({ outputFormat: "json" });
  const result = await engine.parse(processedBytes);

  if (!result || !result.pages) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return result.pages.map((page: any) => page.text || "");
};

export const extractMarkdownLiteparse = async (bytes: Uint8Array): Promise<string> => {
  const processedBytes = await preprocessWithOcr(bytes);
  const engine = await getConfiguredLiteParse({
    outputFormat: "json",
    extractVectorGraphics: true,
    extractImages: true,
    extractLinks: true,
    extractTextMetadata: true,
    extractAnnotations: true
  });
  const result = await engine.parse(processedBytes);

  if (!result || !result.pages) return "";

  const markdownPages = [];

  for (const page of result.pages) {
    const pageNum = (page as any).page || 0;
    const pageImages = (result as any).images?.filter((img: any) => img.page === pageNum);
    const hasText = page.textItems && page.textItems.length > 0;

    if (!hasText && (!pageImages || pageImages.length === 0)) continue;

    // Map vector graphics to LineItems
    let explicitLines: LineItem[] = [];
    if (page.vectorGraphics && page.vectorGraphics.lines) {
      explicitLines = page.vectorGraphics.lines.map((l: any) => {
        let typeVal: "horizontal" | "vertical" | "unknown" = "unknown";
        if (Math.abs(l.y1 - l.y2) < 2) typeVal = "horizontal";
        else if (Math.abs(l.x1 - l.x2) < 2) typeVal = "vertical";
        return {
          x0: l.x1,
          y0: l.y1,
          x1: l.x2,
          y1: l.y2,
          type: typeVal
        };
      }).filter((l: any) => l.type !== 'unknown') as LineItem[];
    }

    // We'll use result.links loosely as any since it might not be in ParseResult typings yet
    const anyResult = result as any;
    const pageMarkdown = formatMarkdownFromItems(
        page.textItems || [],
        explicitLines,
        pageImages,
        anyResult.links?.filter((link: any) => link.page === pageNum),
        (page as any).annotations || []
    );
    markdownPages.push(pageMarkdown);
  }

  return markdownPages.join("\n\n---\n\n");
};

export const extractHtmlLiteparse = async (bytes: Uint8Array): Promise<string> => {
  // Use our new highly enriched custom markdown compiler (which already pre-processes OCR)
  const markdownText = await extractMarkdownLiteparse(bytes);

  if (!markdownText) return "";

  const { marked } = await import('marked');
  const DOMPurify = (await import('dompurify')).default;

  // Parse the semantic markdown into HTML
  const rawHtml = await marked.parse(markdownText);

  // Define a basic CSS template for accessibility and reading
  const css = `
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      color: #333;
    }
    h1, h2, h3, h4, h5, h6 {
      color: #111;
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }
    p {
      margin-bottom: 1em;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 1em;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    th {
      background-color: #f2f2f2;
    }
    img {
      max-width: 100%;
      height: auto;
    }
  `;

  // Sanitize the HTML to prevent XSS issues
  const cleanHtml = DOMPurify.sanitize(rawHtml);

  // Wrap in a full HTML document structure
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Extracted Document</title>
  <style>${css}</style>
</head>
<body>
${cleanHtml}
</body>
</html>`;
};

export const editParagraphLiteparse = async (bytes: Uint8Array, searchText: string, replacementText: string): Promise<Uint8Array> => {
  const engine = await getConfiguredLiteParse({ outputFormat: "json" });
  const result = await engine.parse(bytes);

  if (!result || !result.pages) return bytes;

  // Find bounding box for search text
  let targetBox = null;
  let targetPageNum = -1;
  let targetFontSize = 12;

  // We will search for a block of text that includes the searchText.
  for (let i = 0; i < result.pages.length; i++) {
    const page = result.pages[i];
    if (!page.textItems) continue;

    // A very simple search: concatenate all text in the page, find index.
    // If found, find the corresponding text items.
    let fullText = "";
    const itemStarts: number[] = [];
    for (const item of page.textItems) {
      itemStarts.push(fullText.length);
      fullText += item.text + " ";
    }

    const searchIndex = fullText.indexOf(searchText);
    if (searchIndex !== -1) {
      targetPageNum = i;
      // find which items match
      let startIndex = -1;
      let endIndex = -1;
      for (let j = 0; j < itemStarts.length; j++) {
        if (itemStarts[j] <= searchIndex && (j === itemStarts.length - 1 || itemStarts[j+1] > searchIndex)) {
          startIndex = j;
        }
        if (itemStarts[j] <= searchIndex + searchText.length && (j === itemStarts.length - 1 || itemStarts[j+1] > searchIndex + searchText.length)) {
          endIndex = j;
        }
      }

      if (startIndex !== -1 && endIndex !== -1) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let j = startIndex; j <= endIndex; j++) {
          const item = page.textItems[j];
          if (item.x < minX) minX = item.x;
          if (item.y < minY) minY = item.y;
          if (item.x + item.width > maxX) maxX = item.x + item.width;
          if (item.y + item.height > maxY) maxY = item.y + item.height;
          if (item.fontSize) targetFontSize = item.fontSize;
        }
        targetBox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        break; // found first occurrence
      }
    }
  }

  if (!targetBox || targetPageNum === -1) return bytes;

  // Use pdf-lib to overwrite
  const { PDFDocument, rgb } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;

  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  pdfDoc.registerFontkit(fontkit);

  let font;
  try {
    const fontUrl = new URL((typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL ? import.meta.env.BASE_URL : '/') + 'fonts/NotoSans-Regular.ttf', typeof window !== 'undefined' ? window.location.origin : (typeof import.meta !== 'undefined' ? import.meta.url : 'http://localhost')).href;
    const fontBytes = await fetch(fontUrl).then(res => {
      if (!res.ok) throw new Error(`Failed to fetch font: ${res.statusText}`);
      return res.arrayBuffer();
    });
    font = await pdfDoc.embedFont(fontBytes);
  } catch (e) {
    console.error('Failed to load custom font, falling back to Helvetica', e);
    const { StandardFonts } = await import('pdf-lib');
    font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  }

  const pages = pdfDoc.getPages();
  const pdfPage = pages[targetPageNum];

  // LiteParse coordinates are usually top-left, but pdf-lib uses bottom-left.
  // We need to map y coordinates.
  const { height } = pdfPage.getSize();
  const pdfLibY = height - targetBox.y - targetBox.height;

  // draw white box
  pdfPage.drawRectangle({
    x: targetBox.x,
    y: pdfLibY,
    width: targetBox.width,
    height: targetBox.height,
    color: rgb(1, 1, 1),
  });

  // Write new text. For simplicity, just write it at the top left of the box.
  pdfPage.drawText(replacementText, {
    x: targetBox.x,
    y: height - targetBox.y - targetFontSize, // baseline approximation
    size: targetFontSize,
    font,
    color: rgb(0, 0, 0),
    maxWidth: targetBox.width,
    lineHeight: targetFontSize * 1.2
  });

  return await pdfDoc.save();
};

function scoreConfidence(grid: string[][], rows: { items: any[]; isHeaderBand?: boolean }[]): { confidence: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 1.0;

  if (grid.length === 0) return { confidence: 0, reasons: ["No rows detected"] };

  const colCounts = grid.map(row => row.filter(c => c !== '').length);
  const mean = colCounts.reduce((a,b) => a+b, 0) / colCounts.length;
  const variance = colCounts.reduce((a,b) => a + (b-mean)**2, 0) / colCounts.length;
  if (variance > mean) { score -= 0.3; reasons.push("High variance in populated cells per row"); }

  const totalCells = grid.length * grid[0].length;
  const emptyCells = grid.flat().filter(c => c === '').length;
  const emptyRatio = emptyCells / totalCells;
  if (emptyRatio > 0.5) { score -= 0.3; reasons.push(`${Math.round(emptyRatio*100)}% of cells are empty`); }

  const singleColRows = rows.filter(r => !r.isHeaderBand && r.items.length === 1).length;
  if (singleColRows / rows.length > 0.3) { score -= 0.2; reasons.push("Many rows have only one detected column"); }

  return { confidence: Math.max(0, score), reasons };
}


export const recognizeTableStructure = async (
  pageProxy: any, // PDFPageProxy from pdfjs-dist
  textItems: any[],
  format: 'csv' | 'markdown' | 'latex' | 'html',
  requiresMultipleColumns = true,
  explicitLines?: LineItem[]
): Promise<{ text: string; confidence: number; confidenceReasons: string[]; source: 'geometry' | 'vision-fallback' }> => {
  const settings = useUIStore.getState();
  const tier1Result = formatTableFromItems(textItems, format, requiresMultipleColumns, explicitLines);

  if (tier1Result.confidence >= settings.confidenceThreshold || !settings.tier2Enabled) {
    return { ...tier1Result, source: 'geometry' };
  }

  // Tier 2 Fallback
  try {
    let minX = Infinity; let maxX = -Infinity;
    let minY = Infinity; let maxY = -Infinity;
    for (const item of textItems) {
      if (item.x < minX) minX = item.x;
      if (item.x + item.width > maxX) maxX = item.x + item.width;
      if (item.y < minY) minY = item.y;
      if (item.y + item.height > maxY) maxY = item.y + item.height;
    }

    // add padding
    minX = Math.max(0, minX - 10);
    minY = Math.max(0, minY - 10);
    maxX += 10;
    maxY += 10;

    // use the one at line 1344 if pageProxy is not available, but here we can just rename the local one
    const image = await renderTableRegionToImageFromProxy(pageProxy, { minX, minY, maxX, maxY });

    const { recognizeTableStructureWorker } = await import('./tableStructureEngine');
    const detections = await recognizeTableStructureWorker(image);

    if (detections && detections.length > 0) {
      const { text } = mapVisionStructureToGrid(detections, textItems, format, { minX, minY, maxX, maxY });
      return {
        text,
        confidence: 0.85,
        confidenceReasons: ["Resolved via local vision fallback"],
        source: 'vision-fallback'
      };
    }
  } catch (error) {
    console.error("Table vision fallback failed:", error);
  }

  return { ...tier1Result, source: 'geometry' };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const renderTableRegionToImageFromProxy = async (page: any, bounds: { minX: number; maxX: number; minY: number; maxY: number }): Promise<ImageData> => {
  const scale = 2.0;
  const viewport = page.getViewport({ scale });

  const width = Math.ceil((bounds.maxX - bounds.minX) * scale);
  const height = Math.ceil((bounds.maxY - bounds.minY) * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const transform = [1, 0, 0, 1, -bounds.minX * scale, -bounds.minY * scale];

  await page.render({
    canvasContext: ctx,
    viewport,
    transform,
  }).promise;

  return ctx.getImageData(0, 0, width, height);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapVisionStructureToGrid = (detections: any[], textItems: any[], format: 'csv' | 'markdown' | 'latex' | 'html', bounds: { minX: number; maxX: number; minY: number; maxY: number }) => {
  // Actually TATR outputs unnormalized coords based on the input image size, which was scaled by 2.0.
  const scaleDown = 1 / 2.0;

  const explicitLines: any[] = [];

  for (const det of detections) {
    const box = det.box; // { xmin, ymin, xmax, ymax } on the canvas image
    const xmin = bounds.minX + box.xmin * scaleDown;
    const ymin = bounds.minY + box.ymin * scaleDown;
    const xmax = bounds.minX + box.xmax * scaleDown;
    const ymax = bounds.minY + box.ymax * scaleDown;

    if (det.label === 'table column') {
      explicitLines.push({ type: 'vertical', x: xmin, y: ymin, x1: xmin, y1: ymin, x2: xmin, y2: ymax, strokeWidth: 1, color: '#000000', opacity: 1, disabled: false });
      explicitLines.push({ type: 'vertical', x: xmax, y: ymin, x1: xmax, y1: ymin, x2: xmax, y2: ymax, strokeWidth: 1, color: '#000000', opacity: 1, disabled: false });
    } else if (det.label === 'table row') {
      explicitLines.push({ type: 'horizontal', x: xmin, y: ymin, x1: xmin, y1: ymin, x2: xmax, y2: ymin, strokeWidth: 1, color: '#000000', opacity: 1, disabled: false });
      explicitLines.push({ type: 'horizontal', x: xmin, y: ymax, x1: xmin, y1: ymax, x2: xmax, y2: ymax, strokeWidth: 1, color: '#000000', opacity: 1, disabled: false });
    }
  }

  // Call the Tier 1 extractor with these forced explicit lines
  return formatTableFromItems(textItems, format, false, explicitLines);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any

const escapeLatex = (s: string): string =>
  s.replace(/\\/g, '\\textbackslash{}')
   .replace(/([&%$#_{}])/g, '\\$1')
   .replace(/~/g, '\\textasciitilde{}')
   .replace(/\^/g, '\\textasciicircum{}');

export const formatTableFromItems = (textItems: any[], format: 'csv' | 'markdown' | 'latex' | 'html', requiresMultipleColumns = true, explicitLines?: LineItem[]): { text: string; confidence: number; confidenceReasons: string[] } => {
  if (!textItems || textItems.length === 0) return { text: "", confidence: 1, confidenceReasons: [] };

  const removeWatermarks = useUIStore.getState().removeWatermarks;
  const filteredTextItems = removeWatermarks
    ? textItems.filter(item => !isLikelyWatermark(item))
    : textItems;

  // 1. Calculate the table bounding box for line filtering
  let minX = Infinity; let maxX = -Infinity;
  let minY = Infinity; let maxY = -Infinity;
  for (const item of filteredTextItems) {
      if (item.x < minX) minX = item.x;
      if (item.x + item.width > maxX) maxX = item.x + item.width;
      if (item.y < minY) minY = item.y;
      if (item.y + item.height > maxY) maxY = item.y + item.height;
  }
  const enableLineTracing = useUIStore.getState().enableLineTracing;
  const useLines = enableLineTracing && explicitLines && explicitLines.length > 0;

  // Determine row boundaries
  let rowBoundaries: number[] = [];
  if (useLines) {
      rowBoundaries = fromLines(explicitLines, 'horizontal');

      if (rowBoundaries.length > 0) {
        // Calculate spatial rows count for confidence check
        const rowTolerance = 5;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const spatialRows: { items: any[], y: number }[] = [];
        for (const item of filteredTextItems) {
          let foundRow = false;
          for (const row of spatialRows) {
            if (Math.abs(row.y - item.y) < rowTolerance) {
              row.items.push(item);
              foundRow = true;
              break;
            }
          }
          if (!foundRow) {
            spatialRows.push({ items: [item], y: item.y });
          }
        }

        spatialRows.sort((a, b) => a.y - b.y);

        // Instead of a global fallback, locally fallback for row bands where geometric and spatial differ.
        const mergedBoundaries: number[] = [];

        // Very basic local fallback: if a spatial boundary doesn't align with a geometric one, keep it.
        // So we merge spatial and geometric boundaries, but only spatial boundaries that are far enough from geometric.
        for (let i = 0; i < spatialRows.length - 1; i++) {
            const currentSpatialY = spatialRows[i].y;
            const nextSpatialY = spatialRows[i+1].y;

            // Wait, we should use the bottom of current and top of next to find mid.
            const currentBottom = spatialRows[i].items.reduce((max, it) => Math.max(max, it.y + it.height), currentSpatialY);
            const nextTop = spatialRows[i+1].items.reduce((min, it) => Math.min(min, it.y), nextSpatialY);

            let midY = (currentBottom + nextTop) / 2;

            // If they overlap or there is no gap, fallback to simple Y average
            if (nextTop <= currentBottom) {
                 midY = (currentSpatialY + nextSpatialY) / 2;
            }

            // Is there a geometric boundary near this midY?
            const nearGeometric = rowBoundaries.some(b => Math.abs(b - midY) < 15);
            const MIN_MEANINGFUL_GAP = 8;
            if (!nearGeometric && (nextTop - currentBottom) >= MIN_MEANINGFUL_GAP) {
                // If there isn't a geometric line separating these two distinct spatial rows,
                // we should insert a fallback boundary. This means the lines drawn are sparse.
                mergedBoundaries.push(midY);
            }
        }

        for (const b of rowBoundaries) {
            mergedBoundaries.push(b);
        }
        mergedBoundaries.sort((a, b) => a - b);
        rowBoundaries = mergedBoundaries;
      }
  }

  const rowTolerance = 5; // pixels
  const rows: { items: typeof textItems, y: number, isHeaderBand?: boolean, boundaryGroup: number, isSpanningDivider?: boolean }[] = [];

  const rawHorizontalLines = explicitLines?.filter(
    l => l.type === 'horizontal' && !l.disabled
  ) ?? [];

  // Which row-boundary interval (if any) an item's midpoint falls into.
  // Boundaries are sorted Y coordinates of horizontal lines (real geometric
  // lines, plus any locally-inferred fallback boundaries computed above).
  const getBoundaryGroup = (item: any): number => {
    if (rowBoundaries.length === 0) return 0;
    const itemMidY = item.y + item.height / 2;
    const itemXStart = item.x;
    const itemXEnd = item.x + item.width;

    let rowIndex = 0;
    for (let i = 0; i < rowBoundaries.length; i++) {
      const boundaryY = rowBoundaries[i];

      const isExplicitBoundary = rawHorizontalLines.some(l => Math.abs(l.y0 - boundaryY) <= 2);

      const appliesToThisItem = !isExplicitBoundary || rawHorizontalLines.some(l =>
        lineCoversSpan(l, boundaryY, itemXStart, itemXEnd)
      );

      if (appliesToThisItem && itemMidY > boundaryY) rowIndex = i + 1;
    }
    return rowIndex;
  };

  // IMPORTANT: always cluster items into physical rows using tight spatial
  // tolerance first, constrained to the same boundary interval. A row-boundary
  // interval can legitimately span several distinct physical lines of text
  // (e.g. a colored header band only produces a line at its top and bottom
  // edge, with no further ruling for the data rows underneath it) - if we
  // instead dumped every item whose midpoint falls in that interval into one
  // row (the previous behavior), every real row inside that interval silently
  // collapses into a single garbled row. Clustering by tight tolerance first,
  // then respecting boundaryGroup as a hard wall, fixes that without weakening
  // real ruled-line grids (where each physical row already gets its own
  // boundary interval, so this is a no-op there).
  for (const item of filteredTextItems) {
    const boundaryGroup = getBoundaryGroup(item);
    let foundRow = false;
    for (const row of rows) {
      if (row.boundaryGroup === boundaryGroup && Math.abs(row.y - item.y) < rowTolerance) {
        row.items.push(item);
        foundRow = true;
        break;
      }
    }
    if (!foundRow) {
      rows.push({ items: [item], y: item.y, boundaryGroup });
    }
  }


  // Sort rows by Y coordinate
  rows.sort((a, b) => a.y - b.y);

  // Sort items within each row: primarily by X coordinate, but treat items
  // whose X positions are within a small tolerance of each other as the same
  // column and order those by Y instead. This keeps multiple wrapped lines
  // of one label cell in top-to-bottom reading order even when their X
  // coordinates have tiny sub-pixel jitter (common with real PDFs) rather
  // than only handling the case where X values are byte-for-byte identical.
  const sortRowItems = (items: typeof textItems) => items.sort((a, b) => {
    const dx = a.x - b.x;
    if (Math.abs(dx) > 5) return dx;
    return a.y - b.y;
  });
  rows.forEach(row => sortRowItems(row.items));

  // Classify header bands before row boundary or merge logic runs
  const tableWidth = maxX - minX;
  const HEADER_BAND_WIDTH_FRACTION = 0.8;
  rows.forEach(row => {
    if (tableWidth <= 0) return;
    const widest = Math.max(...row.items.map((it: any) => it.width || 0));
    const isWideSingleItem = row.items.length === 1 && widest / tableWidth >= HEADER_BAND_WIDTH_FRACTION;

    // We proxy isLightColor by checking if text sits on a dark filled band.
    // Using isBackgroundColor which returns true for light colors.
    const looksLikeHeaderStyle = row.items.some((it: any) => {
      const fontNameLower = (it.fontName || '').toLowerCase();
      const isBold = fontNameLower.includes("bold");
      return isBold || (it.fillColor && isBackgroundColor(it.fillColor));
    });

    row.isHeaderBand = isWideSingleItem && looksLikeHeaderStyle;
  });

  // Second pass: merge wrapped lines into their logical row.
  //
  // A row-boundary interval (see boundaryGroup above) can contain several
  // physical lines that belong to ONE logical row (a wrapped multi-line
  // label cell) interleaved with lines that start a NEW logical row. Naively
  // merging every close, structurally-compatible pair of adjacent physical
  // rows (the previous approach) has no way to tell "this is still the same
  // wrapped label" apart from "this is the next record's label starting" -
  // both look identical in isolation (a single narrow item in the label
  // column). The fix: identify "anchor" rows (rows that already look like a
  // complete logical row - i.e. have content in 2+ non-overlapping column
  // positions, or are a header band) and assign every other, narrow,
  // single-column "continuation" line to whichever anchor is CLOSEST to it in
  // Y, never crossing a boundaryGroup wall, a header band, or a gap too large
  // to be a wrap (which preserves intentionally blank rows). This behaves
  // like a 1-D nearest-center clustering: the natural split point between two
  // consecutive wrapped labels falls at their vertical midpoint, exactly
  // where the reader would expect it to.
  {
    // 1. Calculate typical gap (used as a ceiling so we never bridge a
    // genuinely large blank-row gap just because it's the "nearest" anchor).
    const gaps: number[] = [];
    for (let i = 0; i < rows.length - 1; i++) {
      gaps.push(rows[i + 1].y - rows[i].y);
    }
    gaps.sort((a, b) => a - b);
    const medianGap = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : 20;

    const SPAN_WIDTH_FRACTION_ROW = useUIStore.getState().spanWidthFractionRow ?? 0.6;
    const rowColumnGroupCount = (row: typeof rows[number]): number => {
      const sortedItems = [...row.items].sort((a, b) => a.x - b.x);
      let groups = 0;
      let lastEnd = -Infinity;
      for (const it of sortedItems) {
        const start = it.x, end = it.x + it.width;
        if (start > lastEnd + 5) groups++;
        lastEnd = Math.max(lastEnd, end);
      }
      return groups;
    };
    const anchorIndex: (number | null)[] = rows.map((row, idx) =>
      (row.isHeaderBand || rowColumnGroupCount(row) >= 2) ? idx : null
    );

    // The first row of each boundary group is very often a column-header row
    // ("Item | Amount") rather than the start of a wrapped data cell - real
    // headers usually read as an anchor themselves (2+ columns) but sit right
    // above the first data row, which can be equidistant from the header and
    // from the data row's own anchor line. Deprioritize the group's first row
    // as a merge target so ties resolve toward the data row below it instead
    // of pulling a data label up into the header; only fall back to it if it
    // is truly the sole reachable anchor.
    const firstRowIndexOfGroup = new Map<number, number>();
    rows.forEach((row, idx) => {
      if (!firstRowIndexOfGroup.has(row.boundaryGroup)) firstRowIndexOfGroup.set(row.boundaryGroup, idx);
    });
    const isGroupFirstRow = (idx: number) => firstRowIndexOfGroup.get(rows[idx].boundaryGroup) === idx;

    // Reference width for "column 1" (the leftmost item) in each boundary
    // group, taken from actual anchor rows (excluding the group's first row,
    // which is usually a short header word like "Item" and a poor proxy for
    // real data width). Used below to catch section/case labels ("Case 2
    // (regulated)") that are much wider than normal column-1 content even
    // though they don't reach the SPAN_WIDTH_FRACTION_ROW share of the whole
    // table - which happens often on wide, many-column tables where a label
    // only needs to overflow past column 1 to be unambiguously a divider,
    // not the full table width.
    const col1WidthByGroup = new Map<number, number>();
    rows.forEach((row, idx) => {
      if (anchorIndex[idx] === null || row.isHeaderBand || isGroupFirstRow(idx)) return;
      const leftmost = [...row.items].sort((a, b) => a.x - b.x)[0];
      const prev = col1WidthByGroup.get(row.boundaryGroup) ?? 0;
      col1WidthByGroup.set(row.boundaryGroup, Math.max(prev, leftmost.width));
    });
    const COLUMN1_OVERFLOW_FACTOR = useUIStore.getState().spanningLabelOverflowFactor ?? 1.75;

    // A "spanning" row (a section/case label like "Case 2 (regulated)") is
    // identified by width, not by being exactly one text item. Real PDFs
    // frequently split a single visual label into multiple text runs
    // (kerning adjustments, a font/style change mid-label, etc.), so
    // requiring row.items.length === 1 silently defeats a naive check on
    // real documents - a 2-run label would fall through to being treated as
    // a narrow "continuation candidate" and get swallowed into a neighboring
    // data row instead of staying standalone. Two independent signals are
    // used, either of which is sufficient: (a) the row's combined width
    // covers most of the whole table (works for a wide banner/section
    // header), or (b) the row is a single column group but is much wider
    // than the real column-1 content nearby (works for a divider label in a
    // wide, many-column table, where the label never needs to reach most of
    // the table's total width to be unambiguously a section marker rather
    // than a data value). Requiring a single column group (no internal gap
    // large enough to look like a real column break) keeps this from
    // misfiring on genuine multi-column rows whose first and last items just
    // happen to be far apart.
    // Section/case labels are frequently styled distinctly (bold or italic) even
    // when they're neither wide nor much wider than column 1 - this is the
    // signal a human reader actually uses. Require ALL items in the row to
    // match (not just some) so a normal data row that happens to contain one
    // bold/italic value isn't misclassified - a genuine divider label has no
    // plain-styled content mixed in.
    const looksStyledAsLabel = (row: typeof rows[number]) => {
      if (row.items.length === 0) return false;
      const combinedText = row.items.map((it: any) => it.text).join(' ').trim();
      // Guard against short bold/italic units or codes (e.g. "kg", "m²") being
      // misread as section labels - require something phrase-like.
      if (combinedText.length < 6) return false;
      return row.items.every((it: any) => {
        const fontNameLower = (it.fontName || '').toLowerCase();
        return fontNameLower.includes('bold') || fontNameLower.includes('italic') || fontNameLower.includes('oblique');
      });
    };

    const isWideSpanningRow = (row: typeof rows[number], _idx: number) => {
      if (rowColumnGroupCount(row) !== 1) return false;
      const start = Math.min(...row.items.map((it: any) => it.x));
      const end = Math.max(...row.items.map((it: any) => it.x + it.width));
      const width = end - start;
      if (tableWidth > 0 && width / tableWidth >= SPAN_WIDTH_FRACTION_ROW) return true;
      const col1Width = col1WidthByGroup.get(row.boundaryGroup);
      if (col1Width && width >= col1Width * COLUMN1_OVERFLOW_FACTOR) return true;
      if (useUIStore.getState().enableStyledSpanningLabel && looksStyledAsLabel(row)) return true;
      return false;
    };

    // A row can safely absorb wrapped continuation lines ("is an anchor") if
    // it already looks like a complete logical row (2+ columns), or is a
    // header band. A row that spans almost the full table width on its own
    // (a section/spanning label) is deliberately excluded from being an
    // anchor OR a continuation candidate - it stays standalone, matching the
    // "spanning row" handling used later for column inference.
    const canMergeAcross = (a: number, b: number): boolean => {
      // Never bridge a real/inferred row boundary. boundaryGroup is already
      // derived from every explicit line (plus locally-inferred fallback
      // boundaries) via rowBoundaries/getBoundaryGroup above, so two rows in
      // the same boundaryGroup are, by construction, not separated by any of
      // those lines - re-testing raw proximity to explicit lines here would
      // double-count a line already consumed as a group boundary (e.g. a
      // header band's bottom edge sitting close to the first body row) and
      // spuriously block a legitimate merge just inside that group.
      if (rows[a].boundaryGroup !== rows[b].boundaryGroup) return false;
      for (let k = a; k < b; k++) {
        const gap = rows[k + 1].y - rows[k].y;
        if (rows[k].isHeaderBand || rows[k + 1].isHeaderBand) return false;
        if (isWideSpanningRow(rows[k], k) || isWideSpanningRow(rows[k + 1], k + 1)) return false;
        if (!(gap < medianGap * 0.8 || gap <= 15)) return false;
      }
      return true;
    };

    const assignedTo: (number | null)[] = rows.map((_, idx) => (anchorIndex[idx] !== null ? idx : null));

    for (let i = 0; i < rows.length; i++) {
      if (anchorIndex[i] !== null) continue; // already an anchor
      if (rows[i].isHeaderBand) continue; // stands alone
      if (isWideSpanningRow(rows[i], i)) {
        rows[i].isSpanningDivider = true; // stands alone, but is still a real table row
        continue;
      }

      const findBest = (allowGroupFirstRow: boolean): number | null => {
        let bestAnchor: number | null = null;
        let bestDist = Infinity;
        for (let j = 0; j < rows.length; j++) {
          if (anchorIndex[j] === null || rows[j].isHeaderBand) continue;
          if (!allowGroupFirstRow && isGroupFirstRow(j)) continue;
          if (!canMergeAcross(Math.min(i, j), Math.max(i, j))) continue;
          const dist = Math.abs(rows[j].y - rows[i].y);
          // On an exact tie between an anchor before and after this
          // continuation line, prefer the one AFTER it: <= (not <) means the
          // later candidate in this ascending-y scan wins ties. Real-world
          // wrapped labels very commonly show their value mid-label with more
          // label text still to come (the original bug case), so "belongs to
          // the row starting here" is the safer default than "trails the row
          // above" when distance alone can't decide.
          if (dist <= bestDist) {
            bestDist = dist;
            bestAnchor = j;
          }
        }
        return bestAnchor;
      };

      assignedTo[i] = findBest(false) ?? findBest(true);
    }

    const mergedInto = new Map<number, typeof rows[number]>();
    const keepRows: typeof rows = [];
    for (let i = 0; i < rows.length; i++) {
      if (assignedTo[i] === i || assignedTo[i] === null) {
        // Anchor, or standalone row with nowhere to merge - keep as its own row.
        mergedInto.set(i, rows[i]);
        keepRows.push(rows[i]);
      }
    }
    for (let i = 0; i < rows.length; i++) {
      const target = assignedTo[i];
      if (target !== null && target !== i) {
        mergedInto.get(target)!.items.push(...rows[i].items);
      }
    }

    rows.length = 0;
    rows.push(...keepRows);
    rows.sort((a, b) => a.y - b.y);
    // Re-sort items within each row after merge using the same
    // tolerance-aware column/row ordering.
    rows.forEach(row => sortRowItems(row.items));
  }

  const tables: { rows: typeof rows }[] = [];
  let currentTable: typeof rows = [];

  for (const row of rows) {
    // A row with fewer than 2 items is normally treated as "not part of a
    // table" (most likely a stray line of page prose/caption picked up
    // along with the page's other text) and used as a boundary between
    // separate table regions. That's wrong for a row the merge pass above
    // already identified as a genuine standalone divider WITHIN a table
    // (isHeaderBand, or isSpanningDivider - a section/case label like
    // "Case 2 (regulated)" sitting between real data rows) - those must stay
    // inside the current table rather than being discarded as a false table
    // boundary, which would also wrongly truncate/drop the table rows
    // gathered on either side of them.
    if (!requiresMultipleColumns || row.items.length >= 2 || rowBoundaries.length > 0 || row.isHeaderBand || row.isSpanningDivider) {
      currentTable.push(row);
    } else {
      if (currentTable.length > 1) {
        tables.push({ rows: currentTable });
      }
      currentTable = [];
    }
  }
  if (currentTable.length > 0) { // Keep even single-row tables if extracted explicitly
    tables.push({ rows: currentTable });
  }

  const allFormattedTablesOutput: string[] = [];
  let overallConfidence = 1.0;
  const allConfidenceReasons: string[] = [];

  for (const table of tables) {
    const columns: { start: number, end: number }[] = [];
    let colBoundaries: number[] = [];

    if (useLines) {
        colBoundaries = fromLines(explicitLines, 'vertical');

        if (colBoundaries.length > 0) {
          // Calculate spatial columns count for confidence check
          // Exclude header-band and spanning-divider rows (e.g. a caption
          // line or section label kept in this table by the row-merge pass)
          // from the interval computation below. A single wide item from one
          // of those rows can span almost the entire table width, bridging
          // over and masking the real gaps between adjacent data columns -
          // which would otherwise correctly become fallback column
          // boundaries - collapsing many real columns into one.
          const intervalRows = table.rows.filter(row => !row.isHeaderBand && !row.isSpanningDivider);
          const intervals: { start: number, end: number }[] = [];
          for (const row of intervalRows) {
            for (const item of row.items) {
              intervals.push({ start: item.x, end: item.x + item.width });
            }
          }
          intervals.sort((a, b) => a.start - b.start);

          // We can apply the same local fallback for columns as we did for rows
          const mergedColBoundaries: number[] = [];

          if (intervals.length > 0) {
            let currentInterval = intervals[0];
            for (let i = 1; i < intervals.length; i++) {
              const nextInterval = intervals[i];
              if (nextInterval.start <= currentInterval.end + 5) {
                currentInterval.end = Math.max(currentInterval.end, nextInterval.end);
              } else {
                const midX = (currentInterval.end + nextInterval.start) / 2;

                const nearGeometric = colBoundaries.some(b => Math.abs(b - midX) < 15);
                if (!nearGeometric) {
                    mergedColBoundaries.push(midX);
                }

                currentInterval = nextInterval;
              }
            }
          }

          for (const b of colBoundaries) {
              mergedColBoundaries.push(b);
          }
          mergedColBoundaries.sort((a, b) => a - b);
          colBoundaries = mergedColBoundaries;
        }
    }

    if (colBoundaries.length > 0) {
        // Use the extent of real table content (excluding header-band and
        // spanning-divider rows) for the leading/trailing catch-all columns,
        // not the raw min/max across every row in this table. A caption or
        // section-label row kept in this table by the row-merge pass can
        // have text extending well past the table's actual ruled width,
        // which would otherwise inflate the last column far beyond where a
        // real horizontal rule ends - causing buildGridFromIntersections
        // below to see only partial rule coverage for that column and
        // incorrectly merge two real rows together there.
        const denseContentRows = table.rows.filter(row => !row.isHeaderBand && !row.isSpanningDivider);
        const denseContentRowsSource = denseContentRows.length > 0 ? denseContentRows : table.rows;
        let denseMinX = Infinity, denseMaxX = -Infinity;
        for (const row of denseContentRowsSource) {
          for (const item of row.items) {
            if (item.x < denseMinX) denseMinX = item.x;
            if (item.x + item.width > denseMaxX) denseMaxX = item.x + item.width;
          }
        }
        const gridMinX = Number.isFinite(denseMinX) ? Math.min(denseMinX, colBoundaries[0]) : minX;
        const gridMaxX = Number.isFinite(denseMaxX)
          ? Math.max(denseMaxX, colBoundaries[colBoundaries.length - 1])
          : maxX;

        // Create intervals from vertical line boundaries
        let prev = gridMinX;
        for (const boundary of colBoundaries) {
            if (boundary > prev) {
                columns.push({ start: prev, end: boundary });
            }
            prev = boundary;
        }
        if (gridMaxX > prev) {
            columns.push({ start: prev, end: gridMaxX });
        }
    } else {
        // --- Stage 1: classify rows as "dense" (structural) vs "spanning" ---
        // Compute table content width for the span-fraction threshold.
        const tableContentWidth = maxX - minX;
        const SPAN_WIDTH_FRACTION = 0.6; // item wider than 60% of table => spanning candidate

        const isSpanningRow = (row: typeof table.rows[number]) => {
          if (row.isHeaderBand) return true;
          if (row.items.length <= 1) return true;
          const widest = Math.max(...row.items.map(it => it.width));
          return tableContentWidth > 0 && widest / tableContentWidth > SPAN_WIDTH_FRACTION;
        };

        let denseRows = table.rows.filter(row => !isSpanningRow(row));
        // Fallback: if everything got classified as spanning (pathological/very
        // sparse table), use all rows so we don't end up with zero columns.
        if (denseRows.length === 0) {
          denseRows = table.rows;
        }

        // --- Stage 2: infer column boundaries from dense rows only ---
        const intervals: { start: number, end: number }[] = [];
        for (const row of denseRows) {
          for (const item of row.items) {
            intervals.push({ start: item.x, end: item.x + item.width });
          }
        }
        intervals.sort((a, b) => a.start - b.start);

        if (intervals.length > 0) {
          let currentInterval = { ...intervals[0] };
          for (let i = 1; i < intervals.length; i++) {
            const nextInterval = intervals[i];
            // Merge if overlapping or within a small gutter (5px)
            if (nextInterval.start <= currentInterval.end + 5) {
              currentInterval.end = Math.max(currentInterval.end, nextInterval.end);
            } else {
              columns.push(currentInterval);
              currentInterval = { ...nextInterval };
            }
          }
          columns.push(currentInterval);
        }
        // Stage 3 (assigning ALL rows, including spanning ones, to these
        // columns) is handled by the existing unchanged item-assignment loop
        // below — no further change needed there.
    }

    const tableGrid: string[][] = [];
    const tableGridSpans: number[][] = [];
    const tableRowSpansMap: number[][] = [];

    // We compute rowSpans mapping here.
    // rowSpans[r][c] tells us if row `r` in column `c` is separated from row `r-1` in column `c`.
    // If it's NOT separated (edgeExists is false), it should be merged with row `r-1`.
    let rowSpans: number[][] = [];
    if (useLines && rowBoundaries.length > 0) {
      const hLines = explicitLines?.filter(l => l.type === 'horizontal' && !l.disabled) || [];
      // If hLines is empty but we have fallback boundaries, we shouldn't merge everything!
      // Actually, if we have local fallback boundaries inserted, they don't correspond to real lines.
      // We should only merge if we are sure there is no line AND we were expecting one.
      // A simple fix for sparse borders (where we insert fallback boundaries) is to treat all fallback boundaries as "edges".

      // We can create dummy lines for the fallback boundaries.
      // The `fromLines` method returns true geometric lines. `rowBoundaries` has some fallback lines.
      // Let's create an augmented list of hLines that includes full-width fallback lines.
      // For now, if we have fewer hLines than boundaries, let's just not merge.
      if (hLines.length > 0) {
          const augmentedLines = [...hLines];
          for (const rb of rowBoundaries) {
              const hasLine = augmentedLines.some(l => Math.abs(l.y0 - rb) < 15);
              if (!hasLine) {
                 augmentedLines.push({ x0: minX, x1: maxX, y0: rb, y1: rb, type: 'horizontal' });
              }
          }
      rowSpans = buildGridFromIntersections(augmentedLines, rowBoundaries, columns);
      }
    }

    let rIdx = 0;

    // Construct synthetic lines for column boundaries to enable splitItemAtInteriorLine
    // to work for borderless (gridless/whitespace-separated) tables as well.
    let verticalLines = explicitLines?.filter(l => l.type === 'vertical' && !l.disabled) || [];
    if (!useLines && columns.length > 1) {
      for (let i = 1; i < columns.length; i++) {
        // Approximate a vertical line running halfway through the gutter
        const gutterX = (columns[i - 1].end + columns[i].start) / 2;
        verticalLines.push({ type: 'vertical', x0: gutterX, x1: gutterX, y0: 0, y1: 10000, disabled: false });
      }
    }

    for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
      const row = table.rows[rowIdx];
      const gridRow: string[] = Array(columns.length).fill('');
      const spanRow: number[] = Array(columns.length).fill(1);

      const expandedItems = (verticalLines.length > 0 && !row.isHeaderBand && !row.isSpanningDivider)
        ? row.items.flatMap(item => {
            if (isProtectedSpanningItem(item)) {
              return [item];
            }

            // Secondary structural safety net: does it cleanly overlap multiple columns
            // AND does the row above or below have structural evidence of sub-columns?
            let startIndex = -1;
            let endIndex = -1;
            for (let i = 0; i < columns.length; i++) {
              const col = columns[i];
              const overlapStart = Math.max(item.x, col.start);
              const overlapEnd = Math.min(item.x + item.width, col.end);
              if (overlapEnd - overlapStart > 0.5) {
                if (startIndex === -1) startIndex = i;
                endIndex = i;
              }
            }
            if (endIndex > startIndex) {
                const prevRow = rowIdx > 0 ? table.rows[rowIdx - 1] : null;
                const nextRow = rowIdx < table.rows.length - 1 ? table.rows[rowIdx + 1] : null;

                const hasContentInCol = (targetRow: any, colIdx: number) => {
                    if (!targetRow) return false;
                    const col = columns[colIdx];
                    return targetRow.items.some((ri: any) => {
                        const overlapStart = Math.max(ri.x, col.start);
                        const overlapEnd = Math.min(ri.x + ri.width, col.end);
                        return (overlapEnd - overlapStart > 0.5);
                    });
                };

                const hasStructuralSubColumns = (targetRow: any) =>
                    hasContentInCol(targetRow, startIndex) && hasContentInCol(targetRow, endIndex);

                if (hasStructuralSubColumns(prevRow) || hasStructuralSubColumns(nextRow)) {
                    // Before fully deferring, check if there's a highly plausible interior line split point.
                    const splitResult = splitItemAtInteriorLine(item, verticalLines);
                    if (splitResult.length > 1) {
                        return splitResult; // the gap lines up perfectly with a known column gutter, allow split
                    }
                    return [item];
                }
            }

            return splitItemAtInteriorLine(item, verticalLines);
          })
        : row.items;

      for (const item of expandedItems) {
        const itemMid = item.x + item.width / 2;
        let startIndex = -1;
        let endIndex = -1;

        // Find which columns the item intersects
        for (let i = 0; i < columns.length; i++) {
          const col = columns[i];
          // Item intersects column if its overlap is slightly positive, preventing exact boundary touches from double-matching
          const overlapStart = Math.max(item.x, col.start);
          const overlapEnd = Math.min(item.x + item.width, col.end);
          if (overlapEnd - overlapStart > 0.5) {
            if (startIndex === -1) startIndex = i;
            endIndex = i;
          }
        }

        let colIndex = startIndex;
        let span = 1;

        // If it didn't intersect nicely, fallback to nearest mid point
        if (startIndex === -1) {
          let minDiff = Infinity;
          for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            const colMid = (col.start + col.end) / 2;
            const diff = Math.abs(colMid - itemMid);
            if (diff < minDiff) {
              minDiff = diff;
              colIndex = i;
            }
          }
        } else {
          span = (endIndex - startIndex) + 1;
        }

        const cleanedText = item.text.replace(/(\r\n|\n|\r)/gm, " ");
        if (gridRow[colIndex]) {
          gridRow[colIndex] += " " + cleanedText;
        } else {
          gridRow[colIndex] = cleanedText;
          if (span > 1) {
             spanRow[colIndex] = span;
          }
        }
      }

      const trsRow: number[] = Array(columns.length).fill(1);

      if (rIdx > 0 && rowSpans.length >= rIdx && rowSpans[rIdx - 1]) {
         const spansForBoundary = rowSpans[rIdx - 1];
         for (let c = 0; c < columns.length; c++) {
            if (spansForBoundary[c] === 0) {
               // No boundary separating this cell from the one above it.
               // Merge it upwards.

               // Find the top-most row that this cell belongs to
               let topR = rIdx - 1;
               while (topR > 0 && rowSpans[topR - 1][c] === 0) {
                  topR--;
               }

               // Increment rowspan of the top-most cell
               tableRowSpansMap[topR][c] += 1;

               // Set this cell's rowspan to 0 to indicate it's merged
               trsRow[c] = 0;

               // Also concatenate text upwards for markdown/csv fallback
               if (gridRow[c]) {
                   if (tableGrid[topR][c]) {
                       tableGrid[topR][c] += " " + gridRow[c];
                   } else {
                       tableGrid[topR][c] = gridRow[c];
                   }
                   gridRow[c] = ""; // clear it here
               }
            }
         }
      }

      tableGrid.push(gridRow);
      tableGridSpans.push(spanRow);
      tableRowSpansMap.push(trsRow);
      rIdx++;
    }

    // Unconditional cleanup: drop columns that are empty in every single row.
    // Safe on both Path A (line-traced) and Path B (spatial) because a
    // wholly-empty column can never contain data that would be lost.
    if (tableGrid.length > 0 && tableGrid[0].length > 1) {
      const numCols = tableGrid[0].length;
      const emptyColIndexes: number[] = [];
      for (let c = 0; c < numCols; c++) {
        const isEmpty = tableGrid.every(row => row[c] === '');
        if (isEmpty) emptyColIndexes.push(c);
      }

      // Never remove every column — always keep at least 1.
      const maxRemovable = numCols - 1;
      const toRemove = emptyColIndexes.slice(0, maxRemovable);

      // Remove from highest index to lowest so earlier indexes stay valid.
      for (let i = toRemove.length - 1; i >= 0; i--) {
        const c = toRemove[i];
        tableGrid.forEach(row => row.splice(c, 1));
        tableGridSpans.forEach(row => row.splice(c, 1));
        tableRowSpansMap.forEach(row => row.splice(c, 1));
        columns.splice(c, 1);
      }
    }

    // Safety-net post-process: merge mutually exclusive adjacent columns ONLY if we didn't use explicit lines
    if (colBoundaries.length === 0) {
        let merged = true;
        while (merged && tableGrid.length > 0 && tableGrid[0].length > 1) {
          merged = false;
          for (let c = 0; c < tableGrid[0].length - 1; c++) {
            let mutuallyExclusive = true;
            for (let r = 0; r < tableGrid.length; r++) {
              if (tableGrid[r][c] !== '' && tableGrid[r][c + 1] !== '') {
                mutuallyExclusive = false;
                break;
              }
            }

            if (mutuallyExclusive) {
              for (let r = 0; r < tableGrid.length; r++) {
                if (tableGrid[r][c + 1] !== '') {
                  tableGrid[r][c] = tableGrid[r][c] ? tableGrid[r][c] + " " + tableGrid[r][c + 1] : tableGrid[r][c + 1];
                }
              }
              for (let r = 0; r < tableGrid.length; r++) {
                tableGrid[r].splice(c + 1, 1);
              }
              merged = true;
              break;
            }
          }
        }
    }

    const { confidence, reasons } = scoreConfidence(tableGrid, table.rows);
    if (confidence < overallConfidence) {
        overallConfidence = confidence;
    }
    for (const reason of reasons) {
        if (!allConfidenceReasons.includes(reason)) {
            allConfidenceReasons.push(reason);
        }
    }

    // Header Row Detection Heuristic
    let hasHeader = false;
    if (table.rows.length >= 2) {
       const row0Height = table.rows[0].items.length > 0 ? table.rows[0].items.reduce((sum, it) => sum + (it.height || 0), 0) / table.rows[0].items.length : 0;
       const row1Height = table.rows[1].items.length > 0 ? table.rows[1].items.reduce((sum, it) => sum + (it.height || 0), 0) / table.rows[1].items.length : 0;

       if (row0Height > row1Height * 1.1) {
          hasHeader = true;
       }
    }

    if (format === 'html') {
      let html = "<table>\n";
      for (let i = 0; i < tableGrid.length; i++) {
        const row = tableGrid[i];
        const spans = tableGridSpans[i];
        const rowSpansMap = tableRowSpansMap[i];

        let rowHtml = "  <tr>\n";
        for (let j = 0; j < row.length; j++) {
           const colSpan = spans[j];
           const rowSpan = rowSpansMap[j];

           if (rowSpan === 0) {
               // Cell is merged upwards, skip rendering it
               continue;
           }

           const isHeader = (i === 0 && hasHeader);
           const cellTag = isHeader ? "th" : "td";

           let attrs = "";
           if (colSpan > 1) attrs += ` colspan="${colSpan}"`;
           if (rowSpan > 1) attrs += ` rowspan="${rowSpan}"`;

           rowHtml += `    <${cellTag}${attrs}>${row[j].trim() || "&nbsp;"}</${cellTag}>\n`;

           // Skip merged columns
           if (colSpan > 1) {
              j += (colSpan - 1);
           }
        }
        rowHtml += "  </tr>\n";
        html += rowHtml;
      }
      html += "</table>";
      allFormattedTablesOutput.push(html);
    } else if (format === 'csv') {
      const csvRows = tableGrid.map((row, rIdx) => {
         const spans = tableGridSpans[rIdx];
         const outRow = [];
         for (let i = 0; i < row.length; i++) {
            outRow.push(`"${row[i].replace(/"/g, '""')}"`);
            // Fill spanned cells with empty strings
            if (spans[i] > 1) {
               for (let j = 1; j < spans[i]; j++) {
                  outRow.push('""');
                  i++; // skip next processing
               }
            }
         }
         return outRow.join(',');
      });
      allFormattedTablesOutput.push(csvRows.join('\n'));
    } else if (format === 'markdown') {
      let md = "";
      for (let i = 0; i < tableGrid.length; i++) {
        const row = tableGrid[i];
        const spans = tableGridSpans[i];
        const outRow = [];

        for (let j = 0; j < row.length; j++) {
           outRow.push(row[j] || ' '); // Markdown tables need some whitespace for empty cells
           if (spans[j] > 1) {
              for (let s = 1; s < spans[j]; s++) {
                 outRow.push(' '); // Leave spanned columns blank
                 j++;
              }
           }
        }

        md += "| " + outRow.join(" | ") + " |\n";

        if (i === 0) {
          md += "|" + outRow.map(() => "---").join("|") + "|\n";
        }
      }
      allFormattedTablesOutput.push(md);
    } else if (format === 'latex') {
      const colCount = tableGrid.length > 0 ? tableGrid[0].length : 0;
      let latex = "\\begin{tabular}{|" + "c|".repeat(colCount) + "}\n\\hline\n";
      for (let i = 0; i < tableGrid.length; i++) {
        const row = tableGrid[i];
        const spans = tableGridSpans[i];
        const outRow = [];

        for (let j = 0; j < row.length; j++) {
           const isHeader = (i === 0 && hasHeader);
           let content = escapeLatex(row[j] || '');
           if (isHeader) content = `\\textbf{${content}}`;

           if (spans[j] > 1) {
              outRow.push(`\\multicolumn{${spans[j]}}{c|}{${content}}`);
              j += (spans[j] - 1); // skip spanned
           } else {
              outRow.push(content);
           }
        }
        latex += outRow.join(" & ") + " \\\\\n\\hline\n";
      }
      latex += "\\end{tabular}";
      allFormattedTablesOutput.push(latex);
    }
  }

  return {
    text: allFormattedTablesOutput.join("\n\n---\n\n"),
    confidence: overallConfidence,
    confidenceReasons: allConfidenceReasons
  };
};

/**
 * Parses a single CSV line respecting double-quoted fields (matching the quoting
 * style produced by formatTableFromItems' 'csv' branch, where every cell is
 * wrapped in double quotes and internal quotes are doubled).
 */
const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { cells.push(current); current = ''; }
      else { current += ch; }
    }
  }
  cells.push(current);
  return cells;
};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const wrapHtmlTable = (rowsHtml: string): string =>
  `<html><head><meta charset="utf-8"></head><body>` +
  `<table style="border-collapse:collapse;">\n${rowsHtml}</table>` +
  `</body></html>`;

const cellStyle = 'border:1px solid #000;padding:4px 8px;';

/**
 * Converts the (possibly user-edited) text currently shown for an extracted table —
 * in csv, markdown, latex, or html format — into a clean, styled HTML <table> string
 * suitable for writing to the clipboard's 'text/html' slot. Word, Google Docs, and
 * other rich-text editors read that clipboard format and paste a native, editable
 * table instead of literal source text.
 */
export const tableTextToClipboardHtml = (text: string, format: 'csv' | 'markdown' | 'latex' | 'html'): string => {
  const trimmed = text.trim();
  if (!trimmed) return wrapHtmlTable('');

  // Multiple tables may be separated by the '---' divider used elsewhere in this file.
  const blocks = trimmed.split(/\n\s*---\s*\n/).map(b => b.trim()).filter(Boolean);

  const blockToRowsHtml = (block: string): string => {
    if (format === 'html') {
      // Already HTML - just make sure it's wrapped in <table>...</table>.
      return /<table/i.test(block) ? block.replace(/<\/?table[^>]*>/gi, '') : block;
    }

    if (format === 'csv') {
      const lines = block.split('\n').filter(l => l.trim().length > 0);
      return lines.map((line, i) => {
        const cells = parseCsvLine(line);
        const tag = i === 0 ? 'th' : 'td';
        const cellsHtml = cells.map(c => `<${tag} style="${cellStyle}${i === 0 ? 'font-weight:bold;' : ''}">${escapeHtml(c)}</${tag}>`).join('');
        return `  <tr>${cellsHtml}</tr>\n`;
      }).join('');
    }

    if (format === 'markdown') {
      const lines = block.split('\n').filter(l => l.trim().length > 0 && l.includes('|'));
      // Drop the '---|---|---' alignment row if present.
      const dataLines = lines.filter(l => !/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l));
      return dataLines.map((line, i) => {
        const cells = line.split('|').map(c => c.trim()).filter((_, idx, arr) => !(idx === 0 && arr[0] === '') && !(idx === arr.length - 1 && arr[arr.length - 1] === ''));
        const tag = i === 0 ? 'th' : 'td';
        const cellsHtml = cells.map(c => `<${tag} style="${cellStyle}${i === 0 ? 'font-weight:bold;' : ''}">${escapeHtml(c)}</${tag}>`).join('');
        return `  <tr>${cellsHtml}</tr>\n`;
      }).join('');
    }

    // latex: best-effort parse of a \begin{tabular}...\end{tabular} block.
    const inner = block.replace(/\\begin\{tabular\}(\{[^}]*\})?/g, '').replace(/\\end\{tabular\}/g, '');
    const rowStrings = inner.split('\\\\').map(r => r.replace(/\\hline/g, '').trim()).filter(Boolean);
    return rowStrings.map((row, i) => {
      const rawCells = row.split('&').map(c => c.trim());
      const tag = i === 0 ? 'th' : 'td';
      const cellsHtml = rawCells.map(c => {
        const multi = c.match(/\\multicolumn\{(\d+)\}\{[^}]*\}\{(.*)\}/);
        const colspan = multi ? ` colspan="${multi[1]}"` : '';
        let content = multi ? multi[2] : c;
        content = content.replace(/\\textbf\{(.*?)\}/g, '$1')
          .replace(/\\textbackslash\{\}/g, '\\')
          .replace(/\\([&%$#_{}])/g, '$1')
          .replace(/\\textasciitilde\{\}/g, '~')
          .replace(/\\textasciicircum\{\}/g, '^');
        return `<${tag}${colspan} style="${cellStyle}${i === 0 ? 'font-weight:bold;' : ''}">${escapeHtml(content)}</${tag}>`;
      }).join('');
      return `  <tr>${cellsHtml}</tr>\n`;
    }).join('');
  };

  const tables = blocks.map(blockToRowsHtml);
  // If there were multiple selections, stack them as separate tables.
  if (tables.length > 1) {
    return `<html><head><meta charset="utf-8"></head><body>` +
      tables.map(t => `<table style="border-collapse:collapse;margin-bottom:12px;">\n${t}</table>`).join('\n') +
      `</body></html>`;
  }
  return wrapHtmlTable(tables[0] ?? '');
};

/**
 * Unified layout analysis function that returns JSON structure with optional native link extraction.
 * Handles OCR pre-processing automatically.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const analyzeLayoutLiteparse = async (bytes: Uint8Array, options: { extractLinks?: boolean } = {}): Promise<any> => {
  const processedBytes = await preprocessWithOcr(bytes);
  const engine = await getConfiguredLiteParse({
    outputFormat: "json",
    extractLinks: options.extractLinks
  });
  return await engine.parse(processedBytes);
};

export const extractImagesLiteparse = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const processedBytes = await preprocessWithOcr(bytes);
  const engine = await getConfiguredLiteParse({ outputFormat: 'json', extractImages: true });
  const result = await engine.parse(processedBytes);

  if (!result || !result.images || result.images.length === 0) {
    throw new Error("No images found in the document.");
  }

  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  for (let i = 0; i < result.images.length; i++) {
    const image = result.images[i];
    const imageBytes = new Uint8Array(image.bytes);
    const extension = image.format ? image.format.toLowerCase() : 'png';
    const imageName = image.name || `page${image.page}_img${i + 1}.${extension}`;
    zip.file(imageName, imageBytes);
  }

  return await zip.generateAsync({ type: "uint8array" });
};

export const extractAnnotationsLiteparse = async (bytes: Uint8Array): Promise<string> => {
  const processedBytes = await preprocessWithOcr(bytes);
  const engine = await getConfiguredLiteParse({ outputFormat: 'json', extractAnnotations: true });
  const result = await engine.parse(processedBytes);

  if (!result || !result.pages) return JSON.stringify([]);

  const allAnnotations: { page: number; type: string; content: string }[] = [];

  result.pages.forEach((page: any, pageIdx: number) => {
    if (page.annotations) {
      page.annotations.forEach((annot: any) => {
        allAnnotations.push({
          page: pageIdx + 1,
          type: annot.subtype || 'Unknown',
          content: annot.contents || annot.uri || ''
        });
      });
    }
  });

  return JSON.stringify(allAnnotations);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const extractLinksLiteparse = async (bytes: Uint8Array): Promise<any[]> => {
  const result = await analyzeLayoutLiteparse(bytes, { extractLinks: true });

  if (!result || !result.pages) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allLinks: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result.pages.forEach((page: any, pageIdx: number) => {
    if (page.textItems) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      page.textItems.forEach((item: any) => {
        if (item.url || item.link) {
          allLinks.push({
            ...item,
            pageNum: pageIdx
          });
        }
      });
    }
  });

  return allLinks;
};

export const renderTableRegionToImage = async (bytes: Uint8Array, pageNum: number, bounds: { minX: number; maxX: number; minY: number; maxY: number }): Promise<ImageData> => {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const loadingTask = pdfjsLib.getDocument(bytes.slice(0));
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNum);

  // Add some padding to bounds
  const pad = 10;
  const minX = Math.max(0, bounds.minX - pad);
  const minY = Math.max(0, bounds.minY - pad);
  const width = bounds.maxX - bounds.minX + pad * 2;
  const height = bounds.maxY - bounds.minY + pad * 2;

  const viewport = page.getViewport({ scale: 2, offsetX: -minX * 2, offsetY: -minY * 2 });
  const canvas = document.createElement('canvas');

  canvas.width = width * 2; // scale 2
  canvas.height = height * 2; // scale 2
  const ctx = canvas.getContext('2d')!;

  // @ts-ignore - type definitions can vary
  await page.render({ canvasContext: ctx, viewport }).promise;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Cleanup
  page.cleanup();
  await pdf.destroy();

  return imageData;
}

export const extractTablesLiteparse = async (bytes: Uint8Array, format: 'csv' | 'markdown' | 'latex' | 'html'): Promise<string> => {
  const processedBytes = await preprocessWithOcr(bytes);

  const engine = await getConfiguredLiteParse({
    outputFormat: "json",
    extractVectorGraphics: true,
    extractTextMetadata: true,
  });
  const result = await engine.parse(processedBytes);

  if (!result || !result.pages) return "";

  const allTablesOutput: string[] = [];

  for (const page of result.pages) {
    if (!page.textItems || page.textItems.length === 0) continue;

    const lines: LineItem[] = [];
    const vectorGraphics = page.vectorGraphics;
    if (vectorGraphics && vectorGraphics.lines) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vectorGraphics.lines.forEach((l: any) => {
        const x0 = Math.min(l.x1, l.x2);
        const y0 = Math.min(l.y1, l.y2);
        const x1 = Math.max(l.x1, l.x2);
        const y1 = Math.max(l.y1, l.y2);

        // Skip lines that aren't actually visible/structural
        const opacity = l.opacity ?? l.strokeAlpha ?? 1;
        const strokeWidth = l.strokeWidth ?? l.width ?? 1;
        const color = l.strokeColor ?? l.color;
        const isNearWhite = color && isBackgroundColor(color);

        if (opacity < 0.05 || isNearWhite) return; // don't add invisible lines

        if (Math.abs(y0 - y1) < 2) {
          lines.push({ x0, y0: (y0+y1)/2, x1, y1: (y0+y1)/2, type: 'horizontal', strokeWidth, opacity, color });
        } else if (Math.abs(x0 - x1) < 2) {
          lines.push({ x0: (x0+x1)/2, y0, x1: (x0+x1)/2, y1, type: 'vertical', strokeWidth, opacity, color });
        }
      });
    }

    const { text: tableStr } = formatTableFromItems(page.textItems, format, true, lines);
    if (tableStr) allTablesOutput.push(tableStr);
  }

  return allTablesOutput.join("\n\n---\n\n");
};

export const editBoxesLiteparse = async (
  bytes: Uint8Array,
  edits: { pageNum: number; x: number; y: number; width: number; height: number; newText: string; fontSize?: number; lineHeight?: number }[]
): Promise<Uint8Array> => {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;

  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  pdfDoc.registerFontkit(fontkit);

  let font;
  try {
    const fontUrl = new URL((typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL ? import.meta.env.BASE_URL : '/') + 'fonts/NotoSans-Regular.ttf', typeof window !== 'undefined' ? window.location.origin : (typeof import.meta !== 'undefined' ? import.meta.url : 'http://localhost')).href;
    const fontBytes = await fetch(fontUrl).then(res => {
      if (!res.ok) throw new Error(`Failed to fetch font: ${res.statusText}`);
      return res.arrayBuffer();
    });
    font = await pdfDoc.embedFont(fontBytes);
  } catch (e) {
    console.error('Failed to load custom font, falling back to Helvetica', e);
    const { StandardFonts } = await import('pdf-lib');
    font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  }

  const pages = pdfDoc.getPages();

  for (const edit of edits) {
    if (edit.pageNum < 0 || edit.pageNum >= pages.length) continue;
    const pdfPage = pages[edit.pageNum];
    const { height } = pdfPage.getSize();

    // LiteParse coordinates are usually top-left, but pdf-lib uses bottom-left.
    const pdfLibY = height - edit.y - edit.height;

    // Draw white rectangle to mask old text
    pdfPage.drawRectangle({
      x: edit.x,
      y: pdfLibY,
      width: edit.width,
      height: edit.height,
      color: rgb(1, 1, 1),
    });

    // Approximate a decent font size based on height if not provided
    let fontSize = edit.fontSize;
    if (!fontSize) {
      fontSize = Math.max(8, Math.min(edit.height * 0.8, 14));
    }

    pdfPage.drawText(edit.newText, {
      x: edit.x,
      y: pdfLibY + edit.height - fontSize, // Top align text for paragraphs
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
      maxWidth: edit.width + 4, // slight padding so it wraps properly if it reaches edge
      lineHeight: edit.lineHeight || fontSize * 1.2,
    });
  }

  return await pdfDoc.save();
};


export const redactBoxesLiteparse = async (
  bytes: Uint8Array,
  boxesToRedact: { pageNum: number; x: number; y: number; width: number; height: number }[]
): Promise<Uint8Array> => {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  for (const box of boxesToRedact) {
    if (box.pageNum < 0 || box.pageNum >= pages.length) continue;
    const pdfPage = pages[box.pageNum];
    const { height } = pdfPage.getSize();

    // LiteParse coordinates are usually top-left, but pdf-lib uses bottom-left.
    const pdfLibY = height - box.y - box.height;

    pdfPage.drawRectangle({
      x: box.x,
      y: pdfLibY,
      width: box.width,
      height: box.height,
      color: rgb(0, 0, 0),
    });
  }

  return await pdfDoc.save();
};


export const redactDocumentLiteparse = async (bytes: Uint8Array, redactions: string[]): Promise<Uint8Array> => {
  const engine = await getConfiguredLiteParse({ outputFormat: "json" });
  const result = await engine.parse(bytes);

  if (!result || !result.pages) return bytes;

  const { PDFDocument, rgb } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  for (let i = 0; i < result.pages.length; i++) {
    const page = result.pages[i];
    if (!page.textItems || page.textItems.length === 0) continue;
    const pdfPage = pages[i];
    const { height } = pdfPage.getSize();

    // Group text items by line
    let fullText = "";
    const itemStarts: number[] = [];
    for (const item of page.textItems) {
      itemStarts.push(fullText.length);
      fullText += item.text + " ";
    }

    for (const searchText of redactions) {
       let startIndex = fullText.indexOf(searchText);
       while(startIndex !== -1) {
          // find which items match
          let startItemIdx = -1;
          let endItemIdx = -1;
          for (let j = 0; j < itemStarts.length; j++) {
            if (itemStarts[j] <= startIndex && (j === itemStarts.length - 1 || itemStarts[j+1] > startIndex)) {
              startItemIdx = j;
            }
            if (itemStarts[j] <= startIndex + searchText.length && (j === itemStarts.length - 1 || itemStarts[j+1] > startIndex + searchText.length)) {
              endItemIdx = j;
            }
          }

          if (startItemIdx !== -1 && endItemIdx !== -1) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (let j = startItemIdx; j <= endItemIdx; j++) {
              const item = page.textItems[j];
              if (item.x < minX) minX = item.x;
              if (item.y < minY) minY = item.y;
              if (item.x + item.width > maxX) maxX = item.x + item.width;
              if (item.y + item.height > maxY) maxY = item.y + item.height;
            }
            const targetBox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };

            // LiteParse coordinates are usually top-left, but pdf-lib uses bottom-left.
            const pdfLibY = height - targetBox.y - targetBox.height;

            // draw black box
            pdfPage.drawRectangle({
              x: targetBox.x,
              y: pdfLibY,
              width: targetBox.width,
              height: targetBox.height,
              color: rgb(0, 0, 0),
            });
          }
          startIndex = fullText.indexOf(searchText, startIndex + 1);
       }
    }
  }

  return await pdfDoc.save();
};

import { diffWords } from 'diff';
import JSZip from 'jszip';

export const diffMergedHighlightPdfLiteparse = async (
  bytes1: Uint8Array,
  bytes2: Uint8Array
): Promise<Uint8Array> => {
  const engine1 = await getConfiguredLiteParse({ outputFormat: "json" });
  const result1 = await engine1.parse(bytes1);
  const engine2 = await getConfiguredLiteParse({ outputFormat: "json" });
  const result2 = await engine2.parse(bytes2);

  if (!result1 || !result2 || !result1.pages || !result2.pages) {
    throw new Error("Failed to parse PDFs with LiteParse");
  }

  const { PDFDocument, rgb } = await import('pdf-lib');
  const pdfDoc1 = await PDFDocument.load(bytes1, { ignoreEncryption: true });
  const pdfDoc2 = await PDFDocument.load(bytes2, { ignoreEncryption: true });

  const pages1 = pdfDoc1.getPages();
  const pages2 = pdfDoc2.getPages();

  interface Token {
    text: string;
    pageNum: number;
    box: { x: number; y: number; width: number; height: number; pageHeight: number };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extractTokens = (result: any, pages: any[]): Token[] => {
    const tokens: Token[] = [];
    for (let i = 0; i < result.pages.length; i++) {
      const page = result.pages[i];
      if (!page.textItems) continue;
      const pdfPageHeight = pages[i].getSize().height;

      for (const item of page.textItems) {
        if (!item.text.trim()) continue;
        tokens.push({
          text: item.text,
          pageNum: i,
          box: { x: item.x, y: item.y, width: item.width, height: item.height, pageHeight: pdfPageHeight }
        });
      }
    }
    return tokens;
  };

  const tokens1 = extractTokens(result1, pages1);
  const tokens2 = extractTokens(result2, pages2);

  const text1 = tokens1.map(t => t.text).join(' ');
  const text2 = tokens2.map(t => t.text).join(' ');

  const diffResult = diffWords(text1, text2);

  let tokenIdx1 = 0;
  let tokenIdx2 = 0;

  for (const part of diffResult) {
    // Diff gives us string chunks, we need to map back to our tokens.
    // A simple approximation: count the non-whitespace words in the diff part
    const numWords = part.value.trim().split(/\s+/).filter(w => w.length > 0).length;

    if (part.added) {
      // Highlight in Doc 2
      for (let i = 0; i < numWords; i++) {
        if (tokenIdx2 >= tokens2.length) break;
        const t = tokens2[tokenIdx2];
        const page = pages2[t.pageNum];
        page.drawRectangle({
          x: t.box.x,
          y: t.box.pageHeight - t.box.y - t.box.height, // Map to pdf-lib coords
          width: t.box.width,
          height: t.box.height,
          color: rgb(0.5, 1, 0.5), // Green
          opacity: 0.5
        });
        tokenIdx2++;
      }
    } else if (part.removed) {
      // Highlight in Doc 1
      for (let i = 0; i < numWords; i++) {
        if (tokenIdx1 >= tokens1.length) break;
        const t = tokens1[tokenIdx1];
        const page = pages1[t.pageNum];
        page.drawRectangle({
          x: t.box.x,
          y: t.box.pageHeight - t.box.y - t.box.height,
          width: t.box.width,
          height: t.box.height,
          color: rgb(1, 0.5, 0.5), // Red
          opacity: 0.5
        });
        tokenIdx1++;
      }
    } else {
      // Unchanged
      tokenIdx1 += numWords;
      tokenIdx2 += numWords;
    }
  }

  const outBytes1 = await pdfDoc1.save();
  const outBytes2 = await pdfDoc2.save();

  const zip = new JSZip();
  zip.file("original_removed.pdf", outBytes1);
  zip.file("updated_added.pdf", outBytes2);

  const zipBlob = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return zipBlob;
};

export const diffHighlightPdfLiteparse = async (
  bytes: Uint8Array,
  highlights: string[],
  color: [number, number, number]
): Promise<Uint8Array> => {
  const engine = await getConfiguredLiteParse({ outputFormat: "json" });
  const result = await engine.parse(bytes);

  if (!result || !result.pages) return bytes;

  const { PDFDocument, rgb } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  for (let i = 0; i < result.pages.length; i++) {
    const page = result.pages[i];
    if (!page.textItems || page.textItems.length === 0) continue;
    const pdfPage = pages[i];
    const { height } = pdfPage.getSize();

    let fullText = "";
    const itemStarts: number[] = [];
    for (const item of page.textItems) {
      itemStarts.push(fullText.length);
      fullText += item.text + " ";
    }

    for (const searchText of highlights) {
       let startIndex = fullText.indexOf(searchText);
       while(startIndex !== -1) {
          let startItemIdx = -1;
          let endItemIdx = -1;
          for (let j = 0; j < itemStarts.length; j++) {
            if (itemStarts[j] <= startIndex && (j === itemStarts.length - 1 || itemStarts[j+1] > startIndex)) {
              startItemIdx = j;
            }
            if (itemStarts[j] <= startIndex + searchText.length && (j === itemStarts.length - 1 || itemStarts[j+1] > startIndex + searchText.length)) {
              endItemIdx = j;
            }
          }

          if (startItemIdx !== -1 && endItemIdx !== -1) {
            for (let j = startItemIdx; j <= endItemIdx; j++) {
              const item = page.textItems[j];
              const pdfLibY = height - item.y - item.height;
              pdfPage.drawRectangle({
                x: item.x,
                y: pdfLibY,
                width: item.width,
                height: item.height,
                color: rgb(color[0], color[1], color[2]),
                opacity: 0.5
              });
            }
          }
          startIndex = fullText.indexOf(searchText, startIndex + 1);
       }
    }
  }

  return await pdfDoc.save();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const formatParagraphFromItems = (textItems: any[]): string => {
  if (!textItems || textItems.length === 0) return "";

  const rowTolerance = 5; // pixels
  const rows: { items: typeof textItems, y: number }[] = [];

  for (const item of textItems) {
    let foundRow = false;
    for (const row of rows) {
      if (Math.abs(row.y - item.y) < rowTolerance) {
        row.items.push(item);
        foundRow = true;
        break;
      }
    }
    if (!foundRow) {
      rows.push({ items: [item], y: item.y });
    }
  }

  // Sort rows by Y coordinate (top to bottom)
  rows.sort((a, b) => a.y - b.y);

  let finalString = "";

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Sort items in row by X coordinate (left to right)
    row.items.sort((a, b) => a.x - b.x);

    let rowString = "";
    for (let j = 0; j < row.items.length; j++) {
       rowString += row.items[j].text;
       if (j < row.items.length - 1) {
          // If there's a significant X gap, preserve it as a space
          if (row.items[j+1].x - (row.items[j].x + row.items[j].width) > 3) {
             rowString += " ";
          }
       }
    }

    finalString += rowString;

    // Check if we need to add a space or a newline after this row
    if (i < rows.length - 1) {
      const currentRowBottom = row.y + Math.max(...row.items.map(it => it.height));
      const nextRowTop = rows[i+1].y;

      // If the gap between this line and the next is larger than a standard line height,
      // treat it as a new paragraph (newline). Otherwise, it's just a word wrap (space).
      const averageHeight = row.items.reduce((acc, it) => acc + it.height, 0) / row.items.length;

      if ((nextRowTop - currentRowBottom) > (averageHeight * 0.5)) {
         finalString += "\n\n";
      } else {
         // Prevent double spacing if the row already ended with a space or hyphen
         if (!finalString.endsWith(" ") && !finalString.endsWith("-")) {
           finalString += " ";
         } else if (finalString.endsWith("-")) {
           // Remove hyphenation
           finalString = finalString.slice(0, -1);
         }
      }
    }
  }

  return finalString.trim();
};


export const autoRedactLayoutLiteparse = async (
  bytes: Uint8Array,
  layoutTypes: ('header' | 'footer' | 'largest-text')[]
): Promise<Uint8Array> => {
  const engine = await getConfiguredLiteParse({ outputFormat: "json" });
  const result = await engine.parse(bytes);

  if (!result || !result.pages) return bytes;

  const { PDFDocument, rgb } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  for (let i = 0; i < result.pages.length; i++) {
    const page = result.pages[i];
    if (!page.textItems || page.textItems.length === 0) continue;
    const pdfPage = pages[i];
    const { height } = pdfPage.getSize();

    const boxesToRedact: {x: number, y: number, width: number, height: number}[] = [];

    // Find layout bounds (we approximate top 10% and bottom 10% as headers/footers)
    const headerThreshold = height * 0.12;
    const footerThreshold = height * 0.88;

    // For largest text (often titles)
    let maxFontSize = 0;
    if (layoutTypes.includes('largest-text')) {
      for (const item of page.textItems) {
        if (item.fontSize && item.fontSize > maxFontSize) maxFontSize = item.fontSize;
      }
    }

    for (const item of page.textItems) {
      // PDF-Lib Y is bottom-up, LiteParse Y is usually top-down.
      // Let's rely on LiteParse's Y which typically starts 0 at top.
      const isHeader = item.y < headerThreshold;
      const isFooter = item.y > footerThreshold;
      const isLargest = layoutTypes.includes('largest-text') && item.fontSize !== undefined && (item.fontSize >= maxFontSize - 1);

      if ((layoutTypes.includes('header') && isHeader) ||
          (layoutTypes.includes('footer') && isFooter) ||
          (layoutTypes.includes('largest-text') && isLargest)) {

         boxesToRedact.push({
           x: item.x,
           y: item.y,
           width: item.width,
           height: item.height
         });
      }
    }

    // Merge intersecting or adjacent boxes on the same line to make clean redactions
    const mergedBoxes: typeof boxesToRedact = [];
    boxesToRedact.sort((a, b) => a.y - b.y);

    for (const box of boxesToRedact) {
      let merged = false;
      for (const mBox of mergedBoxes) {
        // If on same line and close horizontally
        if (Math.abs(mBox.y - box.y) < 10) {
           if (box.x <= mBox.x + mBox.width + 10 && box.x + box.width >= mBox.x - 10) {
             const newX = Math.min(mBox.x, box.x);
             const newY = Math.min(mBox.y, box.y);
             const newRight = Math.max(mBox.x + mBox.width, box.x + box.width);
             const newBottom = Math.max(mBox.y + mBox.height, box.y + box.height);

             mBox.x = newX;
             mBox.y = newY;
             mBox.width = newRight - newX;
             mBox.height = newBottom - newY;
             merged = true;
             break;
           }
        }
      }
      if (!merged) {
        mergedBoxes.push({ ...box });
      }
    }

    for (const box of mergedBoxes) {
      // Map LiteParse top-down to pdf-lib bottom-up
      const pdfLibY = height - box.y - box.height;
      pdfPage.drawRectangle({
        x: box.x - 2, // Slight padding
        y: pdfLibY - 2,
        width: box.width + 4,
        height: box.height + 4,
        color: rgb(0, 0, 0),
      });
    }
  }

  return await pdfDoc.save();
};

export const cropPdfLiteparse = async (
  bytes: Uint8Array,
  pageNum: number | 'all' | number[],
  cropBox: { x: number; y: number; width: number; height: number }
): Promise<Uint8Array> => {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyCrop = (pdfPage: any) => {
    const { height } = pdfPage.getSize();
    const pdfLibY = height - cropBox.y - cropBox.height;
    pdfPage.setCropBox(cropBox.x, pdfLibY, cropBox.width, cropBox.height);
  };

  if (pageNum === 'all') {
    for (const page of pages) {
      applyCrop(page);
    }
  } else if (Array.isArray(pageNum)) {
    for (const pNum of pageNum) {
      if (pNum >= 0 && pNum < pages.length) {
        applyCrop(pages[pNum]);
      }
    }
  } else {
    if (pageNum < 0 || pageNum >= pages.length) return bytes;
    applyCrop(pages[pageNum]);
  }

  return await pdfDoc.save();
};

export const highlightBoxesLiteparse = async (
  bytes: Uint8Array,
  boxesToHighlight: { pageNum: number; x: number; y: number; width: number; height: number; color: [number, number, number] }[]
): Promise<Uint8Array> => {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  for (const box of boxesToHighlight) {
    if (box.pageNum < 0 || box.pageNum >= pages.length) continue;
    const pdfPage = pages[box.pageNum];
    const { height } = pdfPage.getSize();

    // LiteParse coordinates are usually top-left, but pdf-lib uses bottom-left.
    const pdfLibY = height - box.y - box.height;

    pdfPage.drawRectangle({
      x: box.x,
      y: pdfLibY,
      width: box.width,
      height: box.height,
      color: rgb(box.color[0], box.color[1], box.color[2]),
      opacity: 0.5,
    });
  }

  return await pdfDoc.save();
};

export const autoLinkBoxesLiteparse = async (
  bytes: Uint8Array,
  linkBoxes: { pageNum: number, x: number, y: number, width: number, height: number, url: string }[]
): Promise<Uint8Array> => {
  const { PDFDocument, PDFString, PDFName } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(bytes);
  const pages = pdfDoc.getPages();

  for (const box of linkBoxes) {
    if (box.pageNum >= pages.length) continue;
    const page = pages[box.pageNum];
    const { height } = page.getSize();

    // Create link annotation
    const linkAnnotation = pdfDoc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [
        box.x,
        height - box.y - box.height, // PDF coordinate origin is bottom-left
        box.x + box.width,
        height - box.y
      ],
      Border: [0, 0, 0], // Invisible border
      A: {
        Type: 'Action',
        S: 'URI',
        URI: PDFString.of(box.url),
      },
    });

    // Add it to the page
    let annots = page.node.Annots();
    if (!annots) {
      annots = pdfDoc.context.obj([]);
      page.node.set(PDFName.of('Annots'), annots);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (annots as any).push(pdfDoc.context.register(linkAnnotation));
  }

  return await pdfDoc.save();
};



// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const formatMarkdownFromItems = (textItems: any[], explicitLines?: LineItem[], images?: any[], links?: any[], annotations?: any[]): string => {
  if ((!textItems || textItems.length === 0) && (!images || images.length === 0)) return "";

  // Deep clone text items to avoid mutating shared state
  const items = textItems.map(item => ({ ...item }));

  // Pre-process formatting (underlines and strikethroughs) based on lines
  if (explicitLines && explicitLines.length > 0) {
    const horizontalLines = explicitLines.filter(l => l.type === 'horizontal');
    for (const item of items) {
      const baselineY = item.y + (item.height || 12);
      const midY = item.y + (item.height || 12) / 2;

      let hasUnderline = false;
      let hasStrikethrough = false;


      for (const line of horizontalLines) {
        // Line spans the item horizontally (with 2px tolerance)
        const spansItem = line.x0 <= item.x + 2 && line.x1 >= item.x + item.width - 2;
        if (!spansItem) continue;

        // Check for underline (line near baseline)
        if (Math.abs(line.y0 - baselineY) <= 2.5) {
          hasUnderline = true;
        }

        // Check for strikethrough (line through the middle)
        if (Math.abs(line.y0 - midY) <= 2.5) {
          hasStrikethrough = true;
        }
      }

      if (hasStrikethrough) {
        item.text = `~~${item.text}~~`;
      } else if (hasUnderline) {
        item.text = `<u>${item.text}</u>`;
      }
    }
  }

  if (links && links.length > 0) {
     for (const item of items) {
        let linkUrl = null;
        for (const link of links) {
          const midX = item.x + item.width / 2;
          const midY = item.y + item.height / 2;
          if (midX >= link.x && midX <= link.x + link.width && midY >= link.y && midY <= link.y + link.height) {
            linkUrl = link.url;
            break;
          }
        }
        if (linkUrl) {
           item.text = `[${item.text}](${linkUrl})`;
        }
     }
  }

  // 1. Calculate median font size
  const fontSizes = items.map(it => it.fontSize || 12).sort((a, b) => a - b);
  const baseFontSize = fontSizes[Math.floor(fontSizes.length / 2)];

  // First, check if this is a table/grid layout overall.
  // We can do this by creating a quick row map and checking alignments.
  const tempRows: { items: any[], y: number }[] = [];
  const rowTolerance = 5;
  for (const item of items) {
    let foundRow = false;
    for (const row of tempRows) {
      if (Math.abs(row.y - item.y) < rowTolerance) {
        row.items.push(item);
        foundRow = true;
        break;
      }
    }
    if (!foundRow) {
      tempRows.push({ items: [item], y: item.y });
    }
  }

    // Improved Table Detection Heuristic:
  // We need to ensure we don't accidentally turn regular paragraphs into tables.
  // A table has multiple rows where the items strictly align into vertical columns.
  // We check if there are well-defined common X-coordinates (columns) shared across rows.
  const allXPositions = [];

  for (const row of tempRows) {
    if (row.items.length >= 2) {
      for (const item of row.items) {
          allXPositions.push(item.x);
      }
    }
  }

  // Cluster X positions to find distinct columns
  const columnsX = [];
  allXPositions.sort((a, b) => a - b);
  for (const x of allXPositions) {
     if (columnsX.length === 0 || Math.abs(x - columnsX[columnsX.length - 1]) > 10) {
         columnsX.push(x);
     }
  }

  // If we have at least 2 distinct aligned columns and most rows conform to these columns
  let alignedRowsCount = 0;
  if (columnsX.length >= 2) {
      for (const row of tempRows) {
         if (row.items.length >= 2) {
            let alignedItems = 0;
            for (const item of row.items) {
                if (columnsX.some(colX => Math.abs(item.x - colX) <= 15)) {
                   alignedItems++;
                }
            }
            if (alignedItems >= 2) {
               alignedRowsCount++;
            }
         }
      }
  }

  // A strict heuristic: Needs at least 2 distinct columns, at least 3 rows,
  // and the aligned rows must make up the majority of the multi-item rows.
  if (columnsX.length >= 2 && tempRows.length >= 3 && alignedRowsCount >= 2 && alignedRowsCount / tempRows.length >= 0.5) {
      const { text: tableMarkdown } = formatTableFromItems(items, 'markdown', true, explicitLines);
      if (tableMarkdown.trim()) {
        return tableMarkdown.trim();
      }
  }

  // Not a grid, or grid formatting failed. Proceed with column-aware reading order.
  // We identify true vertical gutters by computing the union of all horizontal intervals.
  const intervals = items.map(item => ({ start: item.x, end: item.x + item.width }));
  intervals.sort((a, b) => a.start - b.start);

  const mergedIntervals = [];
  let currentInterval = intervals[0];

  for (let i = 1; i < intervals.length; i++) {
     const nextInterval = intervals[i];
     // A GUTTER_THRESHOLD determines how large an empty gap must be to split a column.
     // If the gap is smaller than the threshold, we merge them into a single column interval.
     const GUTTER_THRESHOLD = 40;
     if (nextInterval.start - currentInterval.end <= GUTTER_THRESHOLD) {
         currentInterval.end = Math.max(currentInterval.end, nextInterval.end);
     } else {
         mergedIntervals.push(currentInterval);
         currentInterval = nextInterval;
     }
  }
  mergedIntervals.push(currentInterval);

  // Group items into the identified column intervals
  const columns: { items: any[], x: number, maxX: number }[] = mergedIntervals.map(inv => ({
      items: [],
      x: inv.start,
      maxX: inv.end
  }));

  for (const item of items) {
      const itemMidX = item.x + (item.width / 2);
      for (const col of columns) {
          if (itemMidX >= col.x - 5 && itemMidX <= col.maxX + 5) {
              col.items.push(item);
              break;
          }
      }
  }

  columns.sort((a, b) => a.x - b.x);

  const markdownLines: string[] = [];

  // We will process columns to generate blocks
  const processedColumns: { x: number, blocks: { text: string, y: number }[] }[] = [];

  for (const col of columns) {
    const currentProcessedCol = { x: col.x, blocks: [] as {text: string, y: number}[] };
    processedColumns.push(currentProcessedCol);
    // Group into rows WITHIN the column
    const colRows: { items: any[], y: number }[] = [];
    for (const item of col.items) {
      let foundRow = false;
      for (const row of colRows) {
        if (Math.abs(row.y - item.y) < rowTolerance) {
          row.items.push(item);
          foundRow = true;
          break;
        }
      }
      if (!foundRow) {
        colRows.push({ items: [item], y: item.y });
      }
    }

    colRows.sort((a, b) => a.y - b.y);

    // Create row strings
    const formattedRows = colRows.map((row) => {
      row.items.sort((a, b) => a.x - b.x);
      let rowString = "";
      let rowMaxFontSize = 0;
      let rowHasBold = false;

      for (let j = 0; j < row.items.length; j++) {
         const item = row.items[j];
         let itemText = item.text;
         const fontNameLower = item.fontName?.toLowerCase() || "";

         if (fontNameLower.includes("mono") || fontNameLower.includes("courier") || fontNameLower.includes("consolas") || fontNameLower.includes("typewriter")) {
            if (!itemText.includes("`") && !itemText.startsWith("~~") && !itemText.startsWith("<u>")) {
               if (itemText.startsWith("[")) {
                  itemText = itemText.replace(/\[(.*?)\]/, "[`$1`]");
               } else {
                  itemText = `\`${itemText}\``;
               }
            }
         } else if (fontNameLower.includes("italic") || fontNameLower.includes("oblique")) {
            if (!itemText.includes("*") && !itemText.startsWith("~~") && !itemText.startsWith("<u>")) {
               if (itemText.startsWith("[")) {
                  itemText = itemText.replace(/\[(.*?)\]/, "[*$1*]");
               } else {
                  itemText = `*${itemText}*`;
               }
            }
         }

         if (fontNameLower.includes("bold")) {
            rowHasBold = true;
            // Only wrap in bold if it isn't already wrapped in markdown links or other simple formatting at the start
            // To be safer, we could just wrap it, but it might interfere with link markdown.
            // A simple heuristic: if it's a link, we can make the inner text bold, but it's complex here.
            // Let's just allow it for now, except if it's already formatting.
            if (!itemText.includes("**") && !itemText.startsWith("~~") && !itemText.startsWith("<u>")) {
               if (itemText.startsWith("[")) {
                  // Link logic: [text](url) -> [**text**](url)
                  itemText = itemText.replace(/\[(.*?)\]/, "[**$1**]");
               } else {
                  itemText = `**${itemText}**`;
               }
            }
         }

         if (item.fillColor && item.fillColor !== "#000000" && item.fillColor !== "black") {
             itemText = `<span style="color: ${item.fillColor}">${itemText}</span>`;
         }

         rowString += itemText;

         if ((item.fontSize || 12) > rowMaxFontSize) {
           rowMaxFontSize = item.fontSize || 12;
         }

         if (j < row.items.length - 1) {
            if (row.items[j+1].x - (item.x + item.width) > 3) {
               rowString += " ";
            }
         }
      }

      return {
        text: rowString.trim(),
        maxFontSize: rowMaxFontSize,
        y: row.y,
        bottom: row.y + Math.max(...row.items.map(it => it.height || 12)),
        averageHeight: row.items.reduce((acc, it) => acc + (it.height || 12), 0) / row.items.length,
        isBold: rowHasBold
      };
    });

    // Group rows into blocks WITHIN the column
    const blocks: { rows: typeof formattedRows, maxFontSize: number }[] = [];
    let currentBlock: { rows: typeof formattedRows, maxFontSize: number } = { rows: [], maxFontSize: 0 };

    for (let i = 0; i < formattedRows.length; i++) {
      const row = formattedRows[i];

      currentBlock.rows.push(row);
      if (row.maxFontSize > currentBlock.maxFontSize) {
        currentBlock.maxFontSize = row.maxFontSize;
      }

      if (i < formattedRows.length - 1) {
        const nextRow = formattedRows[i + 1];
        const gap = nextRow.y - row.bottom;

        if (gap > row.averageHeight * 0.8) {
          blocks.push(currentBlock);
          currentBlock = { rows: [], maxFontSize: 0 };
        }
      } else {
        blocks.push(currentBlock);
      }
    }

    // Format each block
    for (const block of blocks) {
      if (block.rows.length === 0) continue;

      let blockText = "";
      for (let i = 0; i < block.rows.length; i++) {
         const row = block.rows[i];
         blockText += row.text;

         if (i < block.rows.length - 1) {
            if (!blockText.endsWith(" ") && !blockText.endsWith("-")) {
              blockText += " ";
            } else if (blockText.endsWith("-")) {
              blockText = blockText.slice(0, -1);
            }
         }
      }

      let isList = false;
      const listMatch = blockText.match(/^([•\-*o]|\d+\.)\s+/i);
      if (listMatch) {
         isList = true;
         const bullet = listMatch[1];
         if (['•', 'o'].includes(bullet)) {
            blockText = "- " + blockText.substring(listMatch[0].length);
         }
      } else if (blockText.match(/^[•\-*o]/)) {
         const bullet = blockText[0];
         if (['•', 'o', '-', '*'].includes(bullet)) {
            blockText = "- " + blockText.substring(1).trim();
            isList = true;
         }
      }

      if (isList) {
         currentProcessedCol.blocks.push({text: blockText, y: block.rows[0].y});
         continue;
      }

      const relativeSize = block.maxFontSize / baseFontSize;
      const sizeDiff = block.maxFontSize - baseFontSize;

      const isBold = block.rows.some(row => row.text.length > 0 && row.text.toUpperCase() === row.text) ||
                     block.rows.some(row => row.isBold);

      let finalText = blockText;
      if (block.rows.length <= 3) {
        if (relativeSize >= 1.5 || sizeDiff >= 6 || (block.maxFontSize >= 20)) {
          finalText = `# ${blockText}`;
        } else if (relativeSize >= 1.3 || sizeDiff >= 4 || (block.maxFontSize >= 16)) {
          finalText = `## ${blockText}`;
        } else if (relativeSize >= 1.15 || sizeDiff >= 2 || (block.maxFontSize >= 14 && isBold)) {
          finalText = `### ${blockText}`;
        } else if (isBold && block.rows.length === 1 && blockText.length < 60) {
          finalText = `#### ${blockText}`;
        }
      }
      currentProcessedCol.blocks.push({text: finalText, y: block.rows[0].y});
    }
  }

  if (annotations && annotations.length > 0) {
    for (const annot of annotations) {
      if (annot.contents) {
        const titleText = annot.title ? `**${annot.title}:** ` : '';
        const markdownQuote = `> ${titleText}${annot.contents}`;

        let targetX = annot.rect?.x ?? 0;
        let targetY = annot.rect?.y ?? 0;

        if (annot.quadpointRects && annot.quadpointRects.length > 0) {
           targetX = annot.quadpointRects[0].x;
           targetY = annot.quadpointRects[0].y;
        }

        let targetCol = processedColumns[0];
        for (const col of processedColumns) {
           if (targetX >= col.x - 50) {
               targetCol = col;
           } else {
               break;
           }
        }

        if (targetCol) {
           targetCol.blocks.push({ text: markdownQuote, y: targetY });
        } else {
           processedColumns.push({ x: targetX, blocks: [{ text: markdownQuote, y: targetY }] });
        }
      }
    }
  }

  if (images && images.length > 0) {
    for (const img of images) {
       let base64 = "";
       if (img.bytes) {
         try {
           const uint8Array = new Uint8Array(img.bytes);
           const chunkSize = 0x8000;
           for (let i = 0; i < uint8Array.length; i += chunkSize) {
             base64 += String.fromCharCode.apply(null, uint8Array.slice(i, i + chunkSize) as any);
           }
           base64 = btoa(base64);
         } catch (e) {
           console.error("Failed to convert image to base64", e);
         }
       }
       if (base64) {
         const imgFormat = img.format?.toLowerCase() || 'png';
         const markdownImg = `![Image](data:image/${imgFormat};base64,${base64})`;

         // Insert image into the correct column based on X, or just as a block in the first column
         // Actually, since images can span columns, we should probably insert them into the reading flow.
         // A simple heuristic: find the column where the image starts.
         let targetCol = processedColumns[0];
         for (const col of processedColumns) {
            if (img.x >= col.x - 50) {
                targetCol = col;
            } else {
                break;
            }
         }

         if (targetCol) {
            targetCol.blocks.push({ text: markdownImg, y: img.y });
         } else {
            processedColumns.push({ x: img.x, blocks: [{ text: markdownImg, y: img.y }] });
         }
       }
    }
  }

  // Now properly order reading order by column, then block y
  for (const col of processedColumns) {
    col.blocks.sort((a, b) => a.y - b.y);
    for (const b of col.blocks) {
      markdownLines.push(b.text);
    }
  }

  return markdownLines.join("\n\n").trim();
};
