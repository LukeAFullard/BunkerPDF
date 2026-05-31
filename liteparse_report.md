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

## High-Impact Interactive Feature Opportunities

LiteParse's most significant advantage over previous methods is its ability to output **precise `[x, y, width, height]` spatial data for every single text element, natively and instantly within the browser's JavaScript environment**. Previously, obtaining accurate coordinates required spinning up a heavy Pyodide (WebAssembly Python) worker running `PyMuPDF`, which was too slow for real-time UI interactivity.

By leveraging LiteParse's instant JSON spatial output, we can build highly interactive, native-feeling features that provide significant "wow-factor" and user value:

### 1. "Magic Box" Selection (Visual Table & Column Extraction)
*   **The Experience:** Instead of extracting an entire document to a spreadsheet or text file, the user clicks and drags a rectangle over a specific table or column directly on the PDF preview. The application instantly pops up a perfectly formatted CSV or Markdown table.
*   **How LiteParse Enables It:** We can instantly filter LiteParse's JSON output for any text items whose coordinates intersect with the user's drawn box. The grid layout algorithm is then applied *only* to that specific bounded area, drastically improving accuracy for complex, mixed-layout pages.

### 2. True Point-and-Click Redaction (Semantic Redaction)
*   **The Experience:** The user enters a "Redact Mode." As they move their mouse over the PDF, entire sentences, lines, or blocks of text highlight dynamically. They simply click the text, and it's instantly and permanently blacked out.
*   **How LiteParse Enables It:** LiteParse heuristically groups text into lines and blocks with known coordinates. We can map these coordinates to invisible HTML `<div>` overlays directly on top of the PDF canvas, making the document feel like an interactive webpage rather than a static image.

### 3. WYSIWYG "Hover to Edit" (In-Place PDF Editing)
*   **The Experience:** Expanding on the point-and-click concept, a user hovers over a paragraph, clicks it, and it transforms into a live text input box. They edit the text, press Enter, and the PDF updates seamlessly in place.
*   **How LiteParse Enables It:** The experimental `editParagraphLiteparse` function currently relies on clunky text-search prompts. By mapping LiteParse's bounding boxes to an interactive front-end, we bypass text matching entirely and provide a direct, visually-driven editing experience.

### 4. Interactive Knowledge Graph (Clickable Entities)
*   **The Experience:** The PII/NER worker (which finds Names, Companies, Emails) runs in the background. Instead of simply listing extracted entities in a sidebar, the application uses LiteParse to find exactly where those words live on the page and draws interactive highlights over them. Users can click an email to copy it, or click a name to redact every instance of it instantly.
*   **How LiteParse Enables It:** Natively and rapidly matching regular expressions or NER output to exact physical page coordinates directly in JavaScript.

### 5. Smart Form Generation
*   **The Experience:** LiteParse's "Grid Projection" algorithm excels at identifying anchors and horizontal gaps (e.g., "Name: ____________"). The UI could automatically highlight these empty spaces and allow users to click them, instantly injecting native, fillable PDF text field annotations at those exact coordinates.
