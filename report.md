# LiteParse Functionality Report

Based on the provided documentation (`liteparse_report.md`), the LlamaIndex blog post detailing the grid projection algorithm, and the repository README, here is a comprehensive report on LiteParse's functionality, its current integration status, pending features, and proposals for new interactive experiences.

## 1. LiteParse Core Functionality: The "Grid Projection" Algorithm

LiteParse (`@llamaindex/liteparse-wasm`) represents a paradigm shift in PDF parsing. Instead of relying on heavy machine learning models for layout analysis or simple left-to-right concatenation (which destroys tables and columns), LiteParse utilizes a **Grid Projection Algorithm**.

It works by projecting text onto a monospace character grid to reconstruct where text appears spatially, preserving structure through alignment. The key steps are:
1.  **Coordinate to Line Grouping:** Groups text fragments with similar Y-coordinates into lines, accounting for superscripts/subscripts using a dynamic tolerance based on median text height.
2.  **Anchor Extraction:** Identifies recurring X-coordinates where text aligns, creating Left (margins/columns), Right (justified/numbers), and Center (titles/headers) anchors.
3.  **Snap Classification:** Classifies each text item to an anchor.
4.  **Flowing Text Escape Hatch:** Heuristically detects standard flowing paragraphs (where grid projection might introduce awkward whitespace) and falls back to simple space-based joining for those specific blocks.
5.  **Grid Projection & Forward Anchors:** Projects text onto the monospace grid. Crucially, it uses "Forward Anchors" to ensure that if a column starts at character position 15 on line 1, the data below it snaps to position 15 as well, flawlessly preserving tabular and multi-column structures.
6.  **Post-Processing:** Compresses sparse blocks (whitespace) to optimize token counts for LLMs while retaining layout context.

**The biggest advantage for UI development:** LiteParse can output this data natively in the browser as JSON (`{ outputFormat: "json" }`), providing instantaneous, precise `[x, y, width, height]` spatial data and font information (`fontSize`) for every text element. This eliminates the need to spin up heavy Pyodide/Python workers (like PyMuPDF) for interactive features.

---

## 2. What Has Been Integrated

The application has successfully leveraged LiteParse's instant JSON spatial output to power a suite of highly interactive, native-feeling features that were previously too slow or impossible with PyMuPDF in the browser.

*   **Core Extraction Options:** Users can toggle "Preserves Layout (LiteParse)" for text extraction. It supports plain text (using the grid projection), Markdown (inferring headers from `fontSize` and grouping), and HTML (using absolute CSS positioning to mirror the PDF visually).
*   **Table Extraction:** Natively detects tables based on alignment grids and exports them to CSV, Markdown, or LaTeX.
*   **Destructive Inline Editing ("Hover to Edit"):** Users can click a paragraph, turning it into a live text input, and `pdf-lib` overwrites the exact bounding box with the new text.
*   **True Point-and-Click Redaction:** Hovering highlights semantic text blocks; clicking applies permanent redaction rectangles via `pdf-lib`.
*   **"Magic Box" Visual Selection:** Dragging a box over the PDF instantly extracts the intersecting text items into perfectly formatted CSV or Markdown (ideal for targeted table extraction).
*   **Interactive Knowledge Graph:** Integrates with the NER worker to draw clickable bounding boxes over detected entities (Names, Companies). Users can click to copy or redact them instantly.
*   **Custom Regex Click-to-Redact:** Similar to the knowledge graph, but allows custom regex patterns to be visually highlighted and clicked for redaction.
*   **Smart Form Generation:** Uses LiteParse's grid gaps to identify logical places for form fields (e.g., after "Name:") and injects native PDF text fields.
*   **Smart Highlighting:** Point-and-click application of custom colored highlight annotations over specific text blocks.
*   **Document Diffing:** Ported the `DiffModal` to use LiteParse for extracting bounding boxes and mapping textual diffs back to physical coordinates, dramatically speeding up the process.
*   **"Snap-to-Grid" Redaction Validation:** Manually drawn redaction boxes expand to perfectly encompass the underlying text bounds, preventing partial letter cuts.
*   **Smart Crop Warning:** Warns users if their crop lines intersect with text bounding boxes.
*   **"Magic Copy" Formatting Preserver:** Dragging over text copies perfectly flowed paragraphs, omitting headers/footers based on page margins.
*   **Auto-Redact by Layout Type:** Automates structural redactions (e.g., "Redact all Headers") based on spatial consistency across pages.
*   **In-browser OCR Integration:** Tesseract.js is now seamlessly plugged into LiteParse's engine flow (`getConfiguredLiteParse`), allowing OCR text to be merged directly into the spatial layout grids for mixed image/text PDFs.
*   **Smart Table Re-flow / Excel-ify**: (Implemented via `SmartTableReflowModal`)
*   **Interactive Auto-Linker**: (Implemented via `InteractiveAutoLinkerModal` based on memory).

---

## 3. What is Left to Implement (Pending Features)

According to the `liteparse_report.md` and current application state, the following interactive features are conceptually defined but remain unimplemented:

1.  **Click-to-Translate:**
    *   **Concept:** Building on the WYSIWYG editor mechanics, users click a sentence or paragraph. A tooltip instantly pops up with a local translation (e.g., via the existing Transformers.js worker), leaving the rest of the document untouched visually.
    *   *(Note: The memory mentions `InteractiveTranslateModal` exists, so this might be partially or fully implemented now despite the report saying "Not Implemented" - it depends on the exact codebase version, but based strictly on the report, it is listed as not implemented).*
2.  **Interactive Document Reflow (Mobile View):**
    *   **Concept:** Use LiteParse to extract all text blocks in semantic order and render them as native, responsive HTML. A "Mobile View" toggle would instantly convert a static A4 PDF into a vertically scrolling, easily readable webpage optimized for phones.

*(Note: "Interactive Auto-Linker" and "Smart Table Re-flow" were marked as Not Implemented / New Features in the report, but the system memory indicates they have been implemented via `InteractiveAutoLinkerModal` and `SmartTableReflowModal` respectively, so they are excluded from this pending list).*

---

## 4. Proposals for New Interactive Features

Based on a deep dive into the Grid Projection algorithm, LiteParse offers unique data points (like anchors and font sizes) that can power entirely new, "wow-factor" user experiences:

1.  **Visual Margin / Gutter Analysis & Alignment Tool:**
    *   *How it works:* Expose LiteParse's invisible "Left Anchors" (column starts) and "Right Anchors" visually.
    *   *UX:* Users toggle a "Layout Mode" that draws vertical grid lines over the PDF. Clicking a specific vertical line instantly selects or extracts *all* text aligned to that margin. This makes extracting a specific column from a 50-page financial statement trivial.
2.  **In-Browser Syntax Highlighting for Code Blocks:**
    *   *How it works:* Analyze consistent Left Anchors (indentation) combined with monospace font detection.
    *   *UX:* Heuristically identify code snippets inside technical PDFs and overlay a transparent, syntax-highlighted HTML block directly over the code. This improves readability and allows for copy-pasting code without losing indentation.
3.  **"Karaoke Mode" Read Aloud (Accessibility Feature):**
    *   *How it works:* Utilize the browser's Web Speech API (`window.speechSynthesis`).
    *   *UX:* Because LiteParse provides precise `x/y` coordinates for *every single word*, as the Speech API reads the document aloud, the UI can dynamically highlight the exact word currently being spoken on the PDF canvas, creating a synchronized audiobook experience.
4.  **Interactive Sparse Block Compression Adjuster (For LLM Prep):**
    *   *How it works:* LiteParse compresses "sparse blocks" (mostly whitespace) to save tokens.
    *   *UX:* Build a UI slider for "Whitespace Tolerance". As the user moves the slider, they watch a raw, heavily spaced table dynamically snap into tighter, more compressed text formats in real-time. This gives prompt engineers visual control over the final LLM text structure.
5.  **Flowing Text "Escape Hatch" Visualizer & Override:**
    *   *How it works:* LiteParse falls back to simple joining when it detects flowing paragraphs.
    *   *UX:* Visually color-code these zones in the viewer (e.g., Structured Data = Blue, Flowing Paragraphs = Yellow). If the heuristic makes a mistake, users can click to manually override the "escape hatch" for that region, forcing it to be parsed as a grid (or vice versa), fine-tuning the extraction interactively.

## 5. Advanced & Experimental Interactive Features

To push the boundaries of what's possible with in-browser PDF manipulation, here are several highly advanced, unique interactive features leveraging LiteParse's rich spatial metadata (`[x, y, width, height, fontSize]`):

7.  **"Magic Redact" by Visual Semantic Region:**
    *   *How it works:* LiteParse provides the coordinates for every text block. By combining this with standard document layout heuristics (e.g., top 10% is header, isolated blocks on the right are dates/addresses), the application can infer semantic regions without ML.
    *   *UX:* Users enter "Magic Redact" mode. Instead of drawing a box, the UI highlights logical document regions (e.g., "The entire sender address block", "The signature block", "The tabular invoice items"). The user clicks a region, and all text *within that semantic region* is instantly and permanently redacted.

8.  **Interactive "Font-Size Normalizer" (Accessibility & Readability):**
    *   *How it works:* LiteParse extracts the `fontSize` for every text item.
    *   *UX:* For documents with inconsistent or excessively small fonts (e.g., dense legal contracts), a user could toggle a "Normalize Fonts" mode. They use a slider to set a *minimum* font size. The UI uses LiteParse's coordinates to find all text below that size, and uses `pdf-lib` to natively redraw those specific text blocks at the new size, potentially shifting layout slightly but making the physical PDF natively readable without zooming.

9.  **Visual "Data Dictionary" Extraction for Invoices/Receipts:**
    *   *How it works:* LiteParse's Grid Projection identifies horizontal gaps and "Right Anchors" (which often indicate values like "$500.00" aligned to the right of a label like "Total:").
    *   *UX:* When viewing an invoice, a user clicks "Extract Key-Value Pairs". The UI visually highlights every paired label and value (e.g., `Date -> 10/12/23`, `Total -> $450`) using bounding boxes with connector lines drawn on a canvas overlay. The user can visually review these connections, click to correct them if the heuristic failed, and then export the perfect key-value dictionary to JSON.

10. **"Ghost Text" Reveal (Finding Hidden Data):**
    *   *How it works:* PDFs often contain text drawn in white-on-white (for search SEO) or text hidden behind images/rectangles.
    *   *UX:* A "Forensic Mode" toggle. The application iterates through LiteParse's extracted text items. If it detects text that is theoretically visible spatially but practically invisible (e.g., color matches background, or is layered behind another object - though LiteParse mostly gives spatial coords, we can infer overlapping text), the UI draws a bright neon bounding box over the "ghost text" area on the canvas, exposing hidden metadata or sloppy redactions.

11. **Smart "Redaction Reversal" Sandbox:**
    *   *How it works:* Often, users want to test if their redactions are secure (i.e., they didn't just draw a black box over selectable text).
    *   *UX:* A "Hacker Mode" view where the user attempts to copy text from their own redacted document. If LiteParse can still extract text from *underneath* a drawn redaction box (because it wasn't flattened properly or was just a CSS layer), the text glows red, warning the user that the redaction is insecure.

12. **Context-Aware "Smart Paste" (The Anti-Format Break):**
    *   *How it works:* When copying text from a PDF, it usually breaks lines. When pasting *into* the PDF (via the interactive editor), it often overflows.
    *   *UX:* If a user selects a block of text using LiteParse bounds, deletes it, and pastes external text, the application uses the original `width` and `fontSize` of the bounding box to automatically insert line-breaks into the pasted text, ensuring it perfectly reflows to fit the original physical space on the page.
