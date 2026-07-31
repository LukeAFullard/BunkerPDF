# LiteParse v2 New Functionality & Improvement Report

The recent upgrade to `@llamaindex/liteparse-wasm` v2 (specifically incorporating PR #374 capabilities) has significantly expanded our text and layout extraction horizons. By bypassing heavy Pyodide dependencies, we can now build faster, fully native client-side features. This report outlines the newly unlocked capabilities and proposes specific architectures to improve table extraction and document format conversion (Markdown & HTML).

## 1. Newly Enabled Functionality & Features

With the advanced extraction flags now supported by `liteparseEngine.ts`, we can build the following high-impact features:

### Form-Aware OCR (`renderFormFields`)
*   **The Problem:** Previously, running OCR or rasterizing a PDF with filled-in AcroForm fields would result in the filled text disappearing from the rasterized output.
*   **The Solution:** By passing `renderFormFields: true`, LiteParse can execute document open actions, JavaScript, and field appearance stream generation (FPDF_FFLDraw) *before* rasterization. This enables OCR to natively "see" and extract user-filled data from forms, making our OCR processing completely form-aware.

### Accessibility & Semantic Parsing (`extractStructureTree`)
*   **The Problem:** Deriving reading order purely from spatial heuristics (Grid Projection) can fail on complex, multi-column layouts or nested articles.
*   **The Solution:** Tagged PDFs contain an explicit logical structure tree. By utilizing `extractStructureTree`, we can extract the exact author-intended reading order. This allows us to build a **flawless "Read Aloud" (Karaoke Mode)** and highly accessible screen-reader-compliant exports that perfectly navigate articles, sidebars, and captions.

### "Smart Crop" & Margin Analysis (`extractContentBounds`)
*   **The Problem:** Calculating the true bounding box of a page's content required iterating over every extracted text item and image, which was slow and error-prone for vector-heavy documents.
*   **The Solution:** LiteParse natively provides the union bounding box of all visible content per page via `extractContentBounds`. This makes building instant "Auto-Crop to Content" features and "Smart Crop Warnings" trivial and highly performant.

### Interactive Font & Styling Tools (`extractTextMetadata`)
*   **The Problem:** We previously lacked deep knowledge about text styling beyond basic `fontSize`.
*   **The Solution:** LiteParse now returns rich text metadata, including fill/stroke colors, font weight/metrics, and Marked Content IDs (MCID). We can use this to build:
    *   **In-browser Syntax Highlighting:** Detect exact monospace font changes to instantly highlight code blocks.
    *   **Interactive Font-Size Normalizer:** Find densely packed, tiny text in legal contracts and use `pdf-lib` to redraw it larger for readability.

### Form Field & XFA Parsing (`extractFormFields`, `extractXfaPackets`)
*   **The Problem:** Reading AcroForm data or complex XML-based XFA forms required separate scripts and often failed on orphaned widgets.
*   **The Solution:** LiteParse now extracts complete form field widget data (including state, options, and geometry) and raw XFA XML packets natively. We can build an "Export Form to JSON" feature instantly, replacing slow `pdf-lib` form traversals.

### Vector Line Tracing Replacement (`extractVectorGraphics`)
*   **The Problem:** We rely on a complex PyMuPDF Python script to extract geometric lines for table detection.
*   **The Solution:** LiteParse's native `vectorGraphics` output provides deduplicated, merged horizontal and vertical line segments directly in WASM. We can completely sunset the PyMuPDF line extractor, drastically speeding up table detection.

### Hyperlink Preservation (`extractLinks`)
*   **The Problem:** Basic text extraction often loses embedded URLs.
*   **The Solution:** By utilizing `extractLinks`, we can accurately map bounding boxes to URLs and dynamically inject `[text](url)` into Markdown and `<a href="url">text</a>` into HTML, preserving document interconnectivity.

### Annotation & Comment Injection (`extractAnnotations`)
*   **The Problem:** PDFs often contain rich review data (highlights, sticky notes) that are ignored during text extraction.
*   **The Solution:** We can use `extractAnnotations` to extract these and inject them as Markdown blockquotes (e.g., `> Reviewer Comment: ...`) or HTML sidebars/tooltips.

### Header / Footer Suppression & De-duplication (`extractContentBounds` & Heuristics)
*   **The Problem:** Page numbers, headers, and footers pollute the reading flow in continuous Markdown/HTML.
*   **The Solution:** We can analyze bounding boxes across multiple pages—if elements at the exact top/bottom margins repeat across pages, we can intelligently exclude them from the Markdown/HTML export.

### Advanced Text Styling & Code Block Detection (`extractTextMetadata`)
*   **The Problem:** Standard text extraction fails to capture semantic meaning derived from font families and colors.
*   **The Solution:** Beyond just bold/italic, we can use font family metadata to detect monospace fonts and automatically wrap them in Markdown ` \`\`\` ` code blocks or HTML `<pre><code>`. We can also extract text color (`fill color`) to retain emphasis in HTML via `<span style="color: ...">`.

### Native Underline & Strikethrough (`extractVectorGraphics`)
*   **The Problem:** We lack a reliable way to detect underline and strikethrough formatting.
*   **The Solution:** We can overlay the extracted horizontal lines from `vectorGraphics` onto the text item baselines and midlines. This allows us to definitively detect Underline (`<u>`) and Strikethrough (`~~`) formats natively, directly within the WASM data without PyMuPDF.

---

## 2. Improving the Handling of Table Extraction

Currently, our table extraction (`formatTableFromItems`) relies on a hybrid approach: spatial Grid Projection (text gaps) combined with explicit geometric lines (from PyMuPDF). With LiteParse v2, we can significantly improve this process:

### A. Fully Deprecate PyMuPDF for Line Tracing
*   **Action:** Update the 'Magic Box Table' and global table extractors to consume `liteparseData.pages[x].vectorGraphics` instead of making a round-trip to `pyodideWorker.ts`.
*   **Benefit:** Table extraction becomes instantaneous and zero-dependency, running entirely within the WASM sandbox.

### B. Leverage White-Fill Suppression Heuristics
*   **Context:** LiteParse v2 introduces a "white-fill heuristic" that prevents solid-white background fills from being falsely detected as table borders.
*   **Action:** Ensure our table grid detection algorithm fully respects this filtered output, reducing false-positive column splits caused by decorative background boxes.

### C. Advanced Merged-Cell Detection
*   **Action:** Use LiteParse's improved alignment anchors to detect cells that span multiple columns. If a text block's bounding box intersects multiple detected column boundaries, we can output proper `colspan` attributes in HTML or merged syntax in LaTeX, rather than randomly assigning the text to the leftmost column.

### D. Proper `colspan` and `rowspan` Inference
*   **Action:** By intersecting text bounding boxes directly with the definitive grid lines provided by `extractVectorGraphics`, we can identify exactly how many grid cells a text block spans and output true `colspan="2"` or merged Markdown cells.

### E. Header Row Detection via Metadata
*   **Action:** Analyze the `extractTextMetadata` of the first row of a detected table. If it's structurally different (e.g., bolded, center-aligned, or overlaying a gray shaded rectangle from `vectorGraphics`), we can confidently mark it as the Table Header, improving screen-reader accessibility and styling.

### F. Partial Border / Borderless Table Handling
*   **Action:** By combining `vectorGraphics` (for explicitly drawn lines) with our Grid Projection algorithm (for spatial gaps), we can detect "partially ruled" tables (e.g., lines only under the header or between rows, but no vertical lines) with much higher confidence.

---

## 3. Improving Conversion to Markdown and HTML

Currently, our Markdown extraction (`extractMarkdownLiteparse`) relies purely on LiteParse's native output, bypassing our custom line-tracing heuristics. HTML extraction is either purely positional (PyMuPDF) or a basic compilation of the Markdown. We can heavily upgrade these formats:

### A. Rich, Self-Contained Markdown Export
*   **Image Embedding:** With `extractImages`, we can base64 encode extracted images and embed them directly into the Markdown output using data URIs (`![Image](data:image/png;base64,...)`).
*   **Table Injection:** Instead of relying on LiteParse's default Markdown table formatter (which might miss complex grids), we can intercept the Markdown generation, run our enhanced `formatTableFromItems` on detected table regions, and inject highly accurate Markdown tables back into the document stream.
*   **Rich Formatting:** Utilize `extractTextMetadata` to detect bold and italic text based on font metrics, injecting exact `**bold**` and `*italic*` markdown tags instead of relying on unreliable font name strings.

### B. Semantic & Visual HTML Export
*   **Semantic Structure from Tagged PDFs:** If `extractStructureTree` is available, we should generate HTML that mirrors the logical DOM (`<article>`, `<section>`, `<aside>`, `<h1>`), rather than a flat list of `<div>` tags.
*   **Inline Vector Graphics:** We can extract `vectorGraphics` and render them as inline SVG elements behind the text. This would preserve the visual fidelity of borders and lines in the HTML export without resorting to absolute positioning of every single character (like the PyMuPDF approach).
*   **Form Field Interactivity:** Using `extractFormFields`, we can map PDF form widgets directly to HTML `<input>`, `<select>`, and `<textarea>` elements, allowing the exported HTML to function as a live, fillable web form.

### C. Custom Spatial-to-Markdown Compiler
*   **Context:** Currently, `extractMarkdownLiteparse` relies on LiteParse's native Markdown output, which might miss complex tables or inline images.
*   **Action:** Request the `json` output from LiteParse, which gives us everything (`textItems`, `vectorGraphics`, `images`, `metadata`), and build a **custom Markdown renderer** in TypeScript. This gives us absolute control: we can inject our superior `formatTableFromItems` logic for tables, base64 data URIs for `extractImages` exactly where they appear vertically, and format text using precise `extractTextMetadata` tags.

### D. CSS Grid / Absolute Hybrid HTML Export
*   **Context:** When a Tagged PDF lacks a semantic structure tree (`extractStructureTree`), translating standard PDF layouts to HTML often ruins multi-column articles.
*   **Action:** Use the `json` output's exact X/Y coordinates to generate HTML that utilizes **CSS Grid** or relative-absolute positioning to maintain high visual fidelity to the original PDF, while embedding `extractVectorGraphics` as an underlying `<svg>` layer for perfect borders and visual dividers.