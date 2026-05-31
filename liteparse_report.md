# LiteParse Functionality Report

## What has been integrated

Currently, LiteParse (`@llamaindex/liteparse-wasm`) is integrated into the application via `src/lib/liteparseEngine.ts` and allows users to optionally toggle "Preserves Layout (LiteParse)" as the text extraction engine within `src/components/ui/SettingsDropdown.tsx`.

When LiteParse is selected, it powers the following three text-based extraction functions (replacing their `PyMuPDF`/`pyodide` equivalents):

1. **Text Extraction (`extractTextLiteparse`)**:
   Uses the default LiteParse WASM engine to project PDF coordinates into text lines, utilizing the "Grid Projection" algorithm to natively preserve spacing and multi-column formatting in plain text outputs.

2. **Markdown Extraction (`extractMarkdownLiteparse`)**:
   Initializes LiteParse with `{ outputFormat: "json" }` to retrieve detailed spatial data (`x`, `y`, `fontSize`) for every parsed text element. It heuristically groups elements by their Y-coordinates to form lines and blocks, utilizing the `maxFontSize` of a block to estimate and apply Markdown headers (`#`, `##`, `###`) against standard text.

3. **HTML Extraction (`extractHtmlLiteparse`)**:
   Also utilizes `{ outputFormat: "json" }` to recreate the layout using absolute CSS positioning. Each page is rendered as a distinct HTML `<div>` with specified width and height, and every text item is injected as an absolutely positioned `<span>` at its exact `x` and `y` coordinates to visually mirror the original PDF's spatial layout.

## What else could be ported

Currently, several actions still exclusively rely on `pyodideWorker.ts` and PyMuPDF. Based on LiteParse's JSON output (which yields exact text content, spatial coordinates, dimensions, and font properties), the following features could optionally be ported to run on LiteParse:

1. **Table Extraction (to CSV/Excel)**:
   - *Current Implementation*: PyMuPDF's `find_tables()` converts natively detected tables to Pandas DataFrames and subsequently exports to Excel within Pyodide.
   - *LiteParse Portability*: While LiteParse does not have a native `find_tables()` equivalent, its Grid Projection algorithm perfectly preserves alignment anchors (e.g., left/right bounds of tabular columns). A script could interpret the `json` output's horizontally aligned items and heuristically build a table/CSV matrix, offering a significantly faster, Python-free table extraction alternative.

2. **Text Redaction / Sanitization targeting text blocks**:
   - *Current Implementation*: Depends on PyMuPDF bounds matching.
   - *LiteParse Portability*: We can locate precise PII bounding boxes natively in JS via LiteParse's item-level bounding boxes and dimensions (`x, y, width, height`), and pass these coordinates back to a lighter redaction engine (e.g., `pdf-lib` instead of PyMuPDF).

3. **In-browser OCR for text-sparse PDFs**:
   - *Current Implementation*: OCR is handled separately via Tesseract.js in a worker `ocrWorker.ts` or similar, rendering canvas blocks.
   - *LiteParse Portability*: LiteParse-WASM exposes an `ocrEnabled` parameter and allows passing a custom `ocrEngine` block containing a `recognize` callback. We could directly attach our existing `tesseract.js` worker into LiteParse's native engine flow, allowing LiteParse to seamlessly weave OCR-derived text directly into its spatial layout grids for mixed image/text PDFs, returning a single, unified structure.

4. **Document Search / Diff Highlighting**:
   - *Current Implementation*: The `DiffModal` uses PyMuPDF (`page.get_text("words")`) to match tokens to exact bounding boxes and overlay highlights.
   - *LiteParse Portability*: LiteParse's `json` output provides identically granular bounding boxes (`x, y, width, height`) for text items. The Diff or Search features could use LiteParse to map text indices to spatial regions within a pure Javascript environment and apply annotations directly via `pdf-lib`, eliminating the need to spin up the Pyodide WebWorker for search mapping.

### Note on limitations:
LiteParse focuses purely on spatial **text extraction**. Tasks like image extraction (`EXTRACT_IMAGES`), encryption/unlocking, bookmark (TOC) editing, metadata manipulation, or DOCX conversions are outside its scope and must continue utilizing PyMuPDF or `pdf-lib`.

5. **Paragraph Editing / Replacement**:
   - *Current Implementation*: The app currently does not support inline PDF text editing natively, as PDF structure makes reflowing text notoriously difficult.
   - *LiteParse Portability*: LiteParse extracts exact coordinates (`x, y, width, height`), fonts (`fontName`, `fontSize`), and groups items heuristically into lines. We could leverage this layout data to identify the bounding box of an entire paragraph. Using a lighter manipulation library like `pdf-lib`, we could theoretically "white out" or mask that specific region, and then draw new, modified text over it using the exact font size and coordinates extracted by LiteParse. This would provide a form of "destructive" text editing that preserves the visual layout of the document.
