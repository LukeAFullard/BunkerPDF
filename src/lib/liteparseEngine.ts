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
