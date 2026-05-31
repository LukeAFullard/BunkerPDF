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
   An experimental feature that uses LiteParse to locate the exact spatial bounding box coordinates of a searched text string. It then leverages `pdf-lib` to overlay a white masking rectangle and draw new replacement text over it, providing a form of "destructive" text editing that preserves layout.

## What else could be ported

Currently, several actions still exclusively rely on `pyodideWorker.ts`, PyMuPDF, or separate WebWorkers. Based on LiteParse's JSON output (which yields exact text content, spatial coordinates, dimensions, and font properties), the following features could optionally be ported to run on LiteParse:

1. **Text Redaction / Sanitization targeting text blocks**:
   - *Current Implementation*: Depends on PyMuPDF bounds matching (`REDACT_DOCUMENT` in `pyodideWorker.ts`).
   - *LiteParse Portability*: We can locate precise PII bounding boxes natively in JS via LiteParse's item-level bounding boxes and dimensions (`x, y, width, height`), and pass these coordinates back to a lighter redaction engine (e.g., `pdf-lib` instead of PyMuPDF).

2. **In-browser OCR for text-sparse PDFs**:
   - *Current Implementation*: OCR is handled separately via `tesseract.js` in `src/lib/ocrEngine.ts`, which renders canvas blocks and merges a new PDF document.
   - *LiteParse Portability*: LiteParse-WASM exposes an `ocrEnabled` parameter and allows passing a custom `ocrEngine` block containing a `recognize` callback. We could directly attach our existing `tesseract.js` worker into LiteParse's native engine flow, allowing LiteParse to seamlessly weave OCR-derived text directly into its spatial layout grids for mixed image/text PDFs, returning a single, unified structure.

3. **Document Search / Diff Highlighting**:
   - *Current Implementation*: The `DiffModal` uses PyMuPDF (`DIFF_MERGED_HIGHLIGHT_DOCUMENT` in `pyodideWorker.ts`) to extract words, group them, perform sequence matching, and map opcodes directly back to the physical bounding boxes to avoid expensive re-searching passes before applying annotations.
   - *LiteParse Portability*: LiteParse's `json` output provides identically granular bounding boxes (`x, y, width, height`) for text items. The Diff or Search features could use LiteParse to map text indices to spatial regions within a pure Javascript environment and apply annotations directly via `pdf-lib`, eliminating the need to spin up the Pyodide WebWorker for search mapping.

### Note on limitations:
LiteParse focuses purely on spatial **text extraction**. Tasks like image extraction (`EXTRACT_IMAGES`), encryption/unlocking, bookmark (TOC) editing, metadata manipulation, or DOCX conversions are outside its scope and must continue utilizing PyMuPDF or `pdf-lib`.
