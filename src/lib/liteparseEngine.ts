import init, { LiteParse } from "@llamaindex/liteparse-wasm";
import { useUIStore } from '../store/uiStore';
import { ocrPdf } from './ocrEngine';

let initPromise: Promise<void> | null = null;
let hasInit = false;

let cachedEngineJson: LiteParse | null = null;
let cachedEngineText: LiteParse | null = null;
let cachedEngineMarkdown: LiteParse | null = null;
let lastOcrEnabled: boolean | null = null;


export const getConfiguredLiteParse = async (options: { outputFormat?: 'json' | 'text' | 'markdown', extractLinks?: boolean } = {}): Promise<LiteParse> => {
  await initLiteParse();
  const ocrEnabled = useUIStore.getState().liteparseOcrEnabled;
  const format = options.outputFormat || 'json';
  const extractLinks = options.extractLinks ?? false;

  // We only cache basic engines without extra flags for now to avoid complexity.
  // If extractLinks is requested, we create a fresh one or we could add more caching layers.
  if (!extractLinks) {
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
    extractLinks: extractLinks,
  });

  if (!extractLinks) {
    if (format === 'json') cachedEngineJson = engine;
    if (format === 'text') cachedEngineText = engine;
    if (format === 'markdown') cachedEngineMarkdown = engine;
  }

  return engine;
};

export const initLiteParse = async (): Promise<void> => {
  if (hasInit) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await init();
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
  // Use the new native LiteParse markdown engine
  const engine = await getConfiguredLiteParse({ outputFormat: "markdown" });
  const result = await engine.parse(processedBytes);

  return result.text || "";
};

export const extractHtmlLiteparse = async (bytes: Uint8Array): Promise<string> => {
  const processedBytes = await preprocessWithOcr(bytes);

  // Use the native markdown engine which creates semantic structure
  const engine = await getConfiguredLiteParse({ outputFormat: "markdown" });
  const result = await engine.parse(processedBytes);

  if (!result || !result.text) return "";

  const { marked } = await import('marked');
  const DOMPurify = (await import('dompurify')).default;

  // Parse the semantic markdown into HTML
  const rawHtml = await marked.parse(result.text);

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const formatTableFromItems = (textItems: any[], format: 'csv' | 'markdown' | 'latex', requiresMultipleColumns = true): string => {
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

  // Sort rows by Y coordinate
  rows.sort((a, b) => a.y - b.y);

  const tables: { rows: typeof rows }[] = [];
  let currentTable: typeof rows = [];

  for (const row of rows) {
    if (!requiresMultipleColumns || row.items.length >= 2) {
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

  const allTablesOutput: string[] = [];

  for (const table of tables) {
    // Find all unique X coordinates to establish columns
    const xPositions: number[] = [];
    for (const row of table.rows) {
      for (const item of row.items) {
        if (!xPositions.some(x => Math.abs(x - item.x) < 10)) {
          xPositions.push(item.x);
        }
      }
    }
    xPositions.sort((a, b) => a - b);

    const tableGrid: string[][] = [];

    for (const row of table.rows) {
      const gridRow: string[] = Array(xPositions.length).fill('');
      for (const item of row.items) {
        // Find closest column
        let minDiff = Infinity;
        let colIndex = 0;
        for (let i = 0; i < xPositions.length; i++) {
          const diff = Math.abs(xPositions[i] - item.x);
          if (diff < minDiff) {
            minDiff = diff;
            colIndex = i;
          }
        }
        gridRow[colIndex] = item.text.replace(/(\r\n|\n|\r)/gm, " ");
      }
      tableGrid.push(gridRow);
    }

    if (format === 'csv') {
      const csvRows = tableGrid.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','));
      allTablesOutput.push(csvRows.join('\n'));
    } else if (format === 'markdown') {
      let md = "";
      for (let i = 0; i < tableGrid.length; i++) {
        const row = tableGrid[i];
        md += "| " + row.join(" | ") + " |\n";
        if (i === 0) {
          md += "|" + row.map(() => "---").join("|") + "|\n";
        }
      }
      allTablesOutput.push(md);
    } else if (format === 'latex') {
      const colCount = xPositions.length;
      let latex = "\\begin{tabular}{|" + "c|".repeat(colCount) + "}\n\\hline\n";
      for (const row of tableGrid) {
        latex += row.join(" & ") + " \\\\\n\\hline\n";
      }
      latex += "\\end{tabular}";
      allTablesOutput.push(latex);
    }
  }

  return allTablesOutput.join("\n\n---\n\n");
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

export const extractTablesLiteparse = async (bytes: Uint8Array, format: 'csv' | 'markdown' | 'latex'): Promise<string> => {
  const processedBytes = await preprocessWithOcr(bytes);

  // For Markdown, we use the superior native LiteParse markdown engine which uses
  // the Grid Projection Algorithm to identify tables with much higher accuracy.
  if (format === 'markdown') {
    const engine = await getConfiguredLiteParse({ outputFormat: "markdown" });
    const result = await engine.parse(processedBytes);
    const md = result.text || "";

    // Extract only the table portions from the full markdown if possible,
    // or just return the markdown. For now, since this tool is specifically for tables,
    // we'll try to find the table blocks.
    const tableBlocks = md.match(/\|(.+)\|(\r?\n)\|[ \-|]+\|(\r?\n)(\|(.+)\|(\r?\n?))+/g);
    if (tableBlocks) {
      return tableBlocks.join("\n\n---\n\n");
    }
    // Fallback if no markdown tables found natively
  }

  const engine = await getConfiguredLiteParse({ outputFormat: "json" });
  const result = await engine.parse(processedBytes);

  if (!result || !result.pages) return "";

  const allTablesOutput: string[] = [];

  for (const page of result.pages) {
    if (!page.textItems || page.textItems.length === 0) continue;
    const tableStr = formatTableFromItems(page.textItems, format, true);
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        if (item.fontSize > maxFontSize) maxFontSize = item.fontSize;
      }
    }

    for (const item of page.textItems) {
      // PDF-Lib Y is bottom-up, LiteParse Y is usually top-down.
      // Let's rely on LiteParse's Y which typically starts 0 at top.
      const isHeader = item.y < headerThreshold;
      const isFooter = item.y > footerThreshold;
      const isLargest = layoutTypes.includes('largest-text') && (item.fontSize >= maxFontSize - 1);

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

export const normalizeFontsLiteparse = async (
  bytes: Uint8Array,
  edits: { pageNum: number; x: number; y: number; width: number; height: number; newText: string }[],
  targetFontSize: number
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

  const editsByPage = edits.reduce((acc, edit) => {
    if (!acc[edit.pageNum]) acc[edit.pageNum] = [];
    acc[edit.pageNum].push(edit);
    return acc;
  }, {} as Record<number, typeof edits>);

  for (const [pageNumStr, pageEdits] of Object.entries(editsByPage)) {
    const pageNum = parseInt(pageNumStr);
    const pages = pdfDoc.getPages();

    // Check if pageNum is within valid range (1-indexed)
    if (pageNum < 1 || pageNum > pages.length) {
      console.warn(`Skipping edits for invalid page number: ${pageNum}`);
      continue;
    }

    const page = pages[pageNum - 1];
    const { height } = page.getSize();

    for (const edit of pageEdits) {
      // pdf-lib uses bottom-left origin, liteparse uses top-left origin
      const pdfLibY = height - edit.y - edit.height;

      // Draw white rectangle to mask old text
      page.drawRectangle({
        x: edit.x,
        y: pdfLibY,
        width: edit.width,
        height: edit.height,
        color: rgb(1, 1, 1),
      });

      // Draw new text over the mask with the normalized font size
      page.drawText(edit.newText, {
        x: edit.x,
        y: pdfLibY + (edit.height - targetFontSize) / 2 + 2, // Approximate centering
        size: targetFontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
    }
  }

  return await pdfDoc.save();
};


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const formatMarkdownFromItems = (textItems: any[]): string => {
  if (!textItems || textItems.length === 0) return "";

  // 1. Calculate median font size
  const fontSizes = textItems.map(it => it.fontSize || 12).sort((a, b) => a - b);
  const baseFontSize = fontSizes[Math.floor(fontSizes.length / 2)];

  // First, check if this is a table/grid layout overall.
  // We can do this by creating a quick row map and checking alignments.
  const tempRows: { items: any[], y: number }[] = [];
  const rowTolerance = 5;
  for (const item of textItems) {
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
  let multiItemRowCount = 0;
  const allXPositions = [];

  for (const row of tempRows) {
    if (row.items.length >= 2) {
      multiItemRowCount++;
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
      const tableMarkdown = formatTableFromItems(textItems, 'markdown', true);
      if (tableMarkdown.trim()) {
        return tableMarkdown.trim();
      }
  }

  // Not a grid, or grid formatting failed. Proceed with column-aware reading order.
  // We identify true vertical gutters by computing the union of all horizontal intervals.
  const intervals = textItems.map(item => ({ start: item.x, end: item.x + item.width }));
  intervals.sort((a, b) => a.start - b.start);

  const mergedIntervals = [];
  let currentInterval = intervals[0];

  for (let i = 1; i < intervals.length; i++) {
     const nextInterval = intervals[i];
     // A GUTTER_THRESHOLD determines how large an empty gap must be to split a column.
     // If the gap is smaller than the threshold, we merge them into a single column interval.
     const GUTTER_THRESHOLD = 20;
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

  for (const item of textItems) {
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

  for (const col of columns) {
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
         rowString += item.text;
         if ((item.fontSize || 12) > rowMaxFontSize) {
           rowMaxFontSize = item.fontSize || 12;
         }
         if (item.fontName?.toLowerCase().includes("bold")) {
           rowHasBold = true;
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

        if (gap > row.averageHeight * 0.5) {
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
         markdownLines.push(blockText);
         continue;
      }

      const relativeSize = block.maxFontSize / baseFontSize;
      const sizeDiff = block.maxFontSize - baseFontSize;

      const isBold = block.rows.some(row => row.text.length > 0 && row.text.toUpperCase() === row.text) ||
                     block.rows.some(row => row.isBold);

      if (block.rows.length <= 3) {
        if (relativeSize >= 1.5 || sizeDiff >= 6 || (block.maxFontSize >= 20)) {
          markdownLines.push(`# ${blockText}`);
        } else if (relativeSize >= 1.3 || sizeDiff >= 4 || (block.maxFontSize >= 16)) {
          markdownLines.push(`## ${blockText}`);
        } else if (relativeSize >= 1.15 || sizeDiff >= 2 || (block.maxFontSize >= 14 && isBold)) {
          markdownLines.push(`### ${blockText}`);
        } else if (isBold && block.rows.length === 1 && blockText.length < 60) {
          markdownLines.push(`#### ${blockText}`);
        } else {
          markdownLines.push(blockText);
        }
      } else {
        markdownLines.push(blockText);
      }
    }
  }

  return markdownLines.join("\n\n").trim();
};
