import init, { LiteParse } from "@llamaindex/liteparse-wasm";

let engineInstance: LiteParse | null = null;
let initPromise: Promise<LiteParse> | null = null;

export const initLiteParse = async (): Promise<LiteParse> => {
  if (engineInstance) return engineInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await init();
      const engine = new LiteParse({});
      engineInstance = engine;
      return engine;
    } catch (error) {
      console.error("Failed to initialize LiteParse:", error);
      throw error;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
};

export const extractTextLiteparse = async (bytes: Uint8Array): Promise<string> => {
  const engine = await initLiteParse();
  const result = await engine.parse(bytes);
  return result.text || "";
};


export const extractMarkdownLiteparse = async (bytes: Uint8Array): Promise<string> => {
  // Use LiteParse's JSON output for spatial/layout data.
  // We recreate a new engine here just for JSON output since the default one might be initialized for default parsing.
  // Actually, we can just init() the module and create one with specific options.
  await initLiteParse();
  const engine = new LiteParse({ outputFormat: "json", ocrEnabled: false });
  const result = await engine.parse(bytes);

  if (!result || !result.pages) return "";

  const markdownLines: string[] = [];

  for (const page of result.pages) {
    if (!page.textItems || page.textItems.length === 0) continue;

    // Group text items by roughly their Y coordinate to form lines
    // and then blocks. For a simple approximation matching the PyMuPDF heuristic:
    // We'll iterate through items, if Y differs by a significant amount, it's a new line.
    // If it differs by a lot, it's a new block.

    let currentBlock: { texts: string[], maxFontSize: number } = { texts: [], maxFontSize: 0 };
    let lastY = page.textItems[0].y;

    for (const item of page.textItems) {
      const text = item.text.trim();
      if (!text) continue;

      const fontSize = item.fontSize || 12;
      const yDiff = Math.abs(item.y - lastY);

      // If Y difference is large (e.g. > fontSize * 1.5), consider it a new block/paragraph
      if (yDiff > fontSize * 1.5 && currentBlock.texts.length > 0) {
        const combinedText = currentBlock.texts.join(" ").trim();
        if (currentBlock.maxFontSize > 20) {
           markdownLines.push(`# ${combinedText}`);
        } else if (currentBlock.maxFontSize > 16) {
           markdownLines.push(`## ${combinedText}`);
        } else if (currentBlock.maxFontSize > 14) {
           markdownLines.push(`### ${combinedText}`);
        } else {
           markdownLines.push(combinedText);
        }
        markdownLines.push("");
        currentBlock = { texts: [], maxFontSize: 0 };
      }

      currentBlock.texts.push(text);
      if (fontSize > currentBlock.maxFontSize) {
        currentBlock.maxFontSize = fontSize;
      }
      lastY = item.y;
    }

    // Process the final block
    if (currentBlock.texts.length > 0) {
      const combinedText = currentBlock.texts.join(" ").trim();
      if (currentBlock.maxFontSize > 20) {
         markdownLines.push(`# ${combinedText}`);
      } else if (currentBlock.maxFontSize > 16) {
         markdownLines.push(`## ${combinedText}`);
      } else if (currentBlock.maxFontSize > 14) {
         markdownLines.push(`### ${combinedText}`);
      } else {
         markdownLines.push(combinedText);
      }
      markdownLines.push("");
    }
  }

  return markdownLines.join("\n");
};

export const extractHtmlLiteparse = async (bytes: Uint8Array): Promise<string> => {
  await initLiteParse();
  const engine = new LiteParse({ outputFormat: "json", ocrEnabled: false });
  const result = await engine.parse(bytes);

  if (!result || !result.pages) return "";

  const htmlLines: string[] = [];

  for (let i = 0; i < result.pages.length; i++) {
    const page = result.pages[i];

    htmlLines.push(`<div id="page-${i + 1}" style="position: relative; width: ${page.width}px; height: ${page.height}px; background-color: white; margin-bottom: 20px; overflow: hidden;">`);

    if (page.textItems) {
      for (const item of page.textItems) {
        const text = item.text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

        const fontSize = item.fontSize || 12;
        const fontName = item.fontName || 'sans-serif';
        // HTML elements need bottom Y mapped to top Y if LiteParse gives bottom,
        // but LiteParse y is usually top or baseline. We'll use y as top.
        // If it's baseline, we might need to adjust. We'll stick to a direct style mapping.

        htmlLines.push(`<span style="position: absolute; left: ${item.x}px; top: ${item.y}px; font-size: ${fontSize}px; font-family: '${fontName}', sans-serif; white-space: nowrap;">${text}</span>`);
      }
    }

    htmlLines.push(`</div>`);
  }

  return htmlLines.join("\n<hr>\n");
};

export const editParagraphLiteparse = async (bytes: Uint8Array, searchText: string, replacementText: string): Promise<Uint8Array> => {
  await initLiteParse();
  const engine = new LiteParse({ outputFormat: "json", ocrEnabled: false });
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

  if (!targetBox) return bytes;

  // Use pdf-lib to overwrite
  const { PDFDocument, rgb } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
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
    color: rgb(0, 0, 0),
    maxWidth: targetBox.width,
    lineHeight: targetFontSize * 1.2
  });

  return await pdfDoc.save();
};
