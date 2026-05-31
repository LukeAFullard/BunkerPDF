# LiteParse Functionality Report

## What has been integrated

Currently, LiteParse (`@llamaindex/liteparse-wasm`) is integrated into the application via `src/lib/liteparseEngine.ts` and allows users to optionally toggle "Preserves Layout (LiteParse)" as the text extraction engine within `src/components/ui/SettingsDropdown.tsx`.

When LiteParse is selected, it powers several key extraction and editing functions (replacing their `PyMuPDF`/`pyodide` equivalents):

1. **Text Extraction (`extractTextLiteparse`)**:
   Uses the default LiteParse WASM engine to project PDF coordinates into text lines, utilizing the "Grid Projection" algorithm to natively preserve spacing and multi-column formatting in plain text outputs.

2. **Markdown Extraction (`extractMarkdownLiteparse`)**:
   Initializes LiteParse with `{ outputFormat: "json" }` to retrieve detailed spatial data (`x`, `y`, `fontSize`) for every parsed text element. It heuristically groups elements by their Y-coordinates to form lines and blocks, utilizing the `maxFontSize` of a block to estimate and apply Markdown headers (`#`, `##`, `###`) against standard text.

3. **HTML Extraction (`extractHtmlLiteparse`)**:
   Also utilizes `{ outputFormat: "json" }` to recreate the layout using absolute CSS positioning. Each page is rendered as a distinct HTML `<div>` with specified width and height, and every text item is injected as an absolutely positioned `<span>` at its exact `x` and `y` coordinates to visually mirror the original PDF's spatial layout.

4. **Table Extraction (`extractTablesLiteparse`)**:
   Uses the JSON output's horizontal alignments to extract grids. It groups text by Y coordinates into rows, then sorts by X coordinates to establish columns. It can export these natively detected tables directly into CSV, Markdown, or LaTeX formats.

5. **Paragraph Editing / Replacement (`editParagraphLiteparse`)**:
   An experimental feature that uses LiteParse to locate the exact spatial bounding box coordinates of a given search text string. It then leverages `pdf-lib` to overlay a white masking rectangle and draw new replacement text over it, providing a form of "destructive" text editing that preserves layout.

6. **Text Redaction / Sanitization (`redactDocumentLiteparse`)**:
   Now utilizes LiteParse to locate precise bounding boxes natively in JavaScript via the JSON spatial output. These coordinates are then passed to `pdf-lib` to draw exact redaction rectangles over sensitive text blocks, bypassing the heavier PyMuPDF worker.

7. **Document Search / Diff Highlighting (`diffMergedHighlightPdfLiteparse`)**:
   The `DiffModal` logic has been successfully ported to utilize LiteParse. It natively extracts bounding boxes for all words across both documents, performs a textual diff using the `diff` npm package, and maps the resulting insertions and deletions back to their physical coordinates. Highlighting is applied visually via `pdf-lib` before exporting the results as a zip archive, drastically speeding up processing compared to spinning up Pyodide.

## What else could be ported

Currently, a few actions still exclusively rely on `pyodideWorker.ts` or separate WebWorkers. Based on LiteParse's JSON output, the following feature could optionally be ported next to run on LiteParse:

1. **In-browser OCR for text-sparse PDFs**:
   - *Current Implementation*: OCR is handled separately via `tesseract.js` in `src/lib/ocrEngine.ts`, which renders canvas blocks and merges a new PDF document.
   - *LiteParse Portability*: LiteParse-WASM exposes an `ocrEnabled` parameter and allows passing a custom `ocrEngine` block containing a `recognize` callback. We could directly attach our existing `tesseract.js` worker into LiteParse's native engine flow, allowing LiteParse to seamlessly weave OCR-derived text directly into its spatial layout grids for mixed image/text PDFs, returning a single, unified structure.
   - *Status:* **Implemented**. The `SettingsDropdown` now includes an option to enable in-browser OCR specifically when the LiteParse extraction engine is active. This connects `tesseract.js` directly to `LiteParse` text projection via `getConfiguredLiteParse` in `liteparseEngine.ts`.

### Note on limitations:
LiteParse focuses purely on spatial **text extraction**. Tasks like image extraction (`EXTRACT_IMAGES`), encryption/unlocking, bookmark (TOC) editing, metadata manipulation, or DOCX conversions are outside its scope and must continue utilizing PyMuPDF or `pdf-lib`.
