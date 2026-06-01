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

8. **True Point-and-Click Redaction (Semantic Redaction)**:
   Users can enter a "Redact Mode" where hovering their mouse over the PDF dynamically highlights text blocks natively identified by LiteParse. Clicking the text instantly and permanently blacks it out using `pdf-lib`, making the document feel like an interactive webpage rather than a static image.

9. **WYSIWYG "Hover to Edit" (In-Place PDF Editing)**:
   Expanding on the point-and-click concept, a user can hover over a paragraph, click it, and it transforms into a live text input box. They edit the text and the PDF updates seamlessly in place, overriding the old text with precision coordinate masking.

10. **"Magic Box" Selection (Visual Table & Column Extraction)**:
    Instead of extracting an entire document to a spreadsheet or text file, the user clicks and drags a rectangle over a specific table or column directly on the PDF preview. The application filters LiteParse's JSON output for intersecting text items and instantly generates a perfectly formatted CSV or Markdown table for the selected area.

11. **Interactive Knowledge Graph (Clickable Entities)**:
    The PII/NER worker (which finds Names, Companies, Emails) runs in the background. The application uses LiteParse to find exactly where those words live on the page and draws interactive highlights over them. Users can click an entity to copy it, or click to instantly redact it via precise coordinate masking.

12. **Smart Form Generation**:
    LiteParse's "Grid Projection" algorithm excels at identifying anchors and horizontal gaps (e.g., labels ending in colons like "Name:", or continuous underscores). The UI automatically highlights these empty spaces and allows users to click them, instantly injecting native, fillable PDF text field annotations at those exact coordinates using `pdf-lib`.

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

By leveraging LiteParse's instant JSON spatial output, we have successfully built highly interactive, native-feeling features that provide significant "wow-factor" and user value, with most text-based opportunities now fully realized.

### 1. "Magic Copy" Formatting Preserver
*   **Idea**: Standard PDF copy-pasting often breaks line breaks (splitting sentences arbitrarily). We could introduce an "Intelligent Selection Mode" where dragging over text leverages LiteParse's line-grouping heuristics to copy perfectly flowed paragraphs, automatically omitting headers, footers, or margin artifacts.

### 2. Auto-Redact by Layout Type
*   **Idea**: Instead of searching for specific sensitive words, users could specify structural elements to remove, such as "Redact all Headers" or "Redact the Footer on every page." By utilizing LiteParse's spatial awareness (e.g., text consistently at the top/bottom margins, or text matching the maximum font size), the application can automate structural redactions perfectly.

### 3. Click-to-Translate
*   **Idea**: Building on the WYSIWYG editor's underlying mechanics, a user could click a specific sentence or paragraph they don't understand. A tooltip instantly pops up with the translation, leaving the rest of the document visually untouched.

### 4. Interactive Document Reflow (Mobile View)
*   **Idea**: Reading A4 PDFs on mobile devices requires excessive panning. We could use LiteParse to extract all text blocks in semantic order and render them as native, responsive HTML. Users could click a "Mobile View" toggle to instantly convert the static PDF into a readable, vertically scrolling webpage.

### 5. Smart Crop Warning
*   **Idea**: When a user selects an area to crop on a single page or across multiple pages, the application can use LiteParse's spatial output to detect if any text blocks intersect with the crop boundaries. If a text bounding box spans across the crop line, the UI can immediately display a warning that text will be cut off.
*   **Limitation Note**: Because LiteParse focuses purely on *text*, it cannot natively detect if an *image* or graphical chart will be cut off by the crop line. It can, however, accurately warn about textual content and tabular text grids being severed.

### 6. Smart Highlighting/Annotation
*   **Idea**: Similar to the redaction tool, allow users to point-and-click to permanently highlight or underline text blocks natively based on LiteParse bounds, rather than just extracting text.

### 7. Interactive Auto-Linker
*   **Idea**: Scan the document for plain text URLs, emails, or references (like "See Figure 1"), find their bounding boxes with LiteParse, and inject clickable native PDF hyperlink annotations over them.

### 8. Custom Regex Click-to-Redact
*   **Idea**: Expand the Knowledge Graph feature so users can input a custom regex (e.g., social security numbers or custom ID formats). LiteParse would find all occurrences visually and let the user click to redact them.
