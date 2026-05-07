# Master Project Plan: BunkerPDF - The Zero-Trust Edge-Native PDF Toolkit

This document outlines the end-to-end architecture, development roadmap, and feature specifications for a completely client-side, WASM-powered document processing application. The overarching goal is to build a high-utility, secure product with a modern UX that can comfortably replace server-dependent commodity tools over a 24-month commercialization horizon.

---

## 1. Product Vision & Core Tenets

**The Pitch:** A professional-grade, browser-based document suite for legal, scientific, and administrative workflows.
**The Differentiator:** 100% Edge-native processing. Zero server uploads. Total data privacy.

*   **Trust as a Feature:** Users must feel and see that their data never leaves their machine.
*   **Speed Over Everything:** Basic tasks must be instant. Heavy AI tasks must have beautiful loading states.
*   **Scientific Accuracy:** Table extraction and diffing must be robust enough for data professionals.
*   **App-Like Feel:** It is not a website; it is an offline-capable desktop app that happens to live in a browser.

---

## 2. The Hybrid Edge Architecture

To balance raw processing power with immediate load times, the application will use a tri-engine architecture.

### Engine A: The Instant Layer (JavaScript)
Used for immediate UI feedback and basic manipulations. Zero initialization time.
*   **`pdf.js` (Mozilla):** Rendering the visual previews and exporting to standard images.
*   **`pdf-lib`:** Handling the commodity features instantly (Split, Merge, Rotate, Password Protect, Form Filling, Metadata Scrubbing).

### Engine B: The AI & NLP Layer (`transformers.js`)
Used for intelligent text processing using WebGL/WebGPU acceleration directly in the browser, avoiding the need to boot a full Python environment for specific ML tasks. *Note: Safari falls back to WebGL which is slower, requiring early testing.*
*   **Named Entity Recognition (NER):** Powering the Automated PII Scanner to find names, organizations, and ID numbers. *Must default to a distilled, quantized model (~40MB) for fast first load to avoid shocking non-tech users with massive downloads, with heavier models (e.g., ~400MB) available as opt-in.*
*   **Semantic Search:** Running lightweight embeddings for the Multi-PDF Local Search feature.

### Engine C: The Heavy Compute Layer (WASM / Pyodide)
Used for complex layout parsing, data extraction, and format conversions where Python’s ecosystem is unmatched.
*   **`pdfplumber`:** For high-fidelity table extraction to CSV/DataFrames and text with positions.
*   **`pymupdf` (fitz):** For true redaction, rendering, general extraction, and pairing with OCR.
*   **`python-docx`:** For DOCX generation.
*   **`pdf2docx`:** (Requires early validation/spike in Phase 1 as Pyodide compatibility is uncertain; explicit fallback plan: use `pymupdf` + `python-docx` to reconstruct DOCX manually from text blocks).
*   *Note:* This engine is lazy-loaded. It only initializes in a Web Worker when a user requests a "Heavy" task.

### Engine D: Browser WASM (Not Pyodide)
*   **`tesseract.js`:** For OCR on scanned PDFs.

### Persistent Caching Layer (IDBFS)
Pyodide runs on an ephemeral virtual filesystem (MEMFS) by default. To solve the cold-start problem, we use IDBFS to mount IndexedDB as a persistent layer.
*   **Pip Cache:** Syncs pip packages to IndexedDB, saving ~50MB of re-downloads on every visit after the first load.
*   **User Persistence:** Stores user files and output documents across sessions.
*   **Model Weights:** Caches `transformers.js` weights to prevent repeated downloads.

---

## 3. Phased 24-Month Development Roadmap

This timeline is structured to build a working foundation rapidly, layer on the "killer" features to build a user base, and polish the product into a standalone business asset.

### Phase 1: Foundation & "The Dropzone" (Months 1–3)
**Objective:** Build the UI shell, establish the JavaScript processing pipeline, and launch the basic utilities.
*   **Core UI:** Develop the Vite/React frontend (simpler and faster to ship than Next.js for a client-only app). Implement the "Massive Dropzone" welcome page, dark/light mode, and Zustand state management for handling files in memory.
*   **Commodity Features:** Hook up `pdf-lib` for Combine, Split, Rotate, Reorder, Add Pages, Delete Pages, **Stamp / Watermark**, and **PDF compression/optimization** (metadata stripping + recompression using ghostscript via Pyodide or JS-native deflate pass).
*   **Annotations & Signatures:** Basic highlight/draw tools and signature capture/placement.
*   **Undo/Redo System:** Implement a robust undo/redo stack (Cmd+Z) early on to prevent data loss on accidental page deletes or edits.
*   **Sharing:** Implement **WebRTC/P2P sharing** (or Base64 URLs capped at tiny sizes < 20KB) for zero-server instant sharing.
*   **Early Features:** Implement **Viewer Dark Mode** (CSS filter) and **QR & Barcode Decoder** (`@zxing/library`).
*   **Basic Polish:** Implement standard metadata cleaning and password encryption.
*   **Early Spikes:** Validate `pymupdf` + `pdf2docx` in Pyodide.
*   **Outcome:** A lightning-fast, ad-free alternative to generic online PDF splitters.

### Phase 2: The Intelligent Security Hub (Months 4–9)
**Objective:** Deploy the core differentiator—the Redaction Suite—using edge-native AI.
*   **Transformers.js Integration:** Implement a lightweight NER model in the browser (target <50MB budget for first load).
*   **Automated PII Scanner:** Build the UI to scan a document, flag sensitive entities (SSNs, names, emails), and present them in a sidebar for one-click redaction.
*   **True Redaction Engine:** Ensure the redaction actually removes the underlying text paths using `pymupdf`, which outperforms `pdf-lib` for this.
*   **Redaction Reversal / Audit Tool:** Build a parser that scans incoming PDFs for "fake" redactions (hidden text layers under shapes) and alerts the user.
*   **OCR Foundation:** Integrate `tesseract.js` for scanned PDFs, a table-stakes feature.
*   **Accessibility:** Add offline **Read Aloud (TTS)** using `transformers.js` (e.g., Kitten TTS `onnx-community/kitten-tts-nano-0.1-ONNX`).
*   **Flatten Forms:** Add ability to remove interactive fields and burn content in.
*   **PDF to Structured Notes:** Turn PDFs into Markdown/Obsidian files with heading hierarchy and annotations.

### Phase 3: Data Extraction & Conversion (Months 10–16)
**Objective:** Bring in the Pyodide/WASM engine to attract data workers, researchers, and administrators.
*   **Monetization Strategy:** Define monetization model before releasing Phase 3 features (freemium/pro tier/enterprise).
*   **Pyodide Web Worker:** Set up the background thread to load the Python environment without freezing the UI.
*   **Table Extractor:** Implement `pdfplumber`. Build a UI where users can draw bounding boxes over tables in the `pdf.js` viewer, and output clean CSV or **Excel/XLSX**.
*   **High-Value Utilities:** Add **Bookmark/Outline Editor**, **Image Extractor** (ZIP download), **Hyperlink Extractor**, **Crop/Resize Pages** (e.g., to A4/Letter), **Custom Page Numbering**, and **"Fast Web View" linearization**.
*   **Legal Utilities:** Implement **Bates Numbering** for legal professionals.
*   **HTML/Markdown Export:** Extract raw text and headers into developer-friendly formats.
*   **The Office Bridge:** Implement local PDF to DOCX and DOCX to PDF conversion (using fallback to `pymupdf` + `python-docx` if needed based on Phase 1 spike).
*   **Batch Operations:** Allow users to process a folder of PDFs at once (split all, redact all, etc).
*   **Digital Signature Verification:** Enable checking signature validity, critical for legal/enterprise workflows.
*   **True Dark PDF Export:** Use `pymupdf` to rewrite PDFs with a dark background and recolored text, while preserving images.

### Phase 4: Professional Workflows & Scale (Months 17–24)
**Objective:** Finalize the enterprise-tier features that ensure high retention.
*   **Context-Aware Diff (Track Changes):** Build the semantic comparison tool for two PDF versions.
*   **Multi-PDF Search:** Allow users to drop an entire folder of PDFs into the browser. Use `transformers.js` to create local embeddings, making the folder instantly searchable.
*   **Reviewer Portal:** Extract annotations, comments, and highlights into an actionable checklist.
*   **PDF/A Conversion:** Enable conversion to PDF/A for archival compliance.
*   **Offline Mode:** Wrap the application in a Progressive Web App (PWA) manifest so users can install it locally and use it without an internet connection.

---

## 4. Deep-Dive: UI/UX & The Welcome Page

The interface must convey trust and premium quality. It should operate on a "Quiet UI" principle—tools only appear when they are contextually relevant.

### The Welcome Page Structure
1.  **The Hero:** Bold statement: *"The Zero-Trust Document Suite."*
2.  **The Dropzone / Open File:** A massive, central dashed area. *Includes a 3-step onboarding tooltip tour on first load ("Drop a file → Choose a tool → Download your result") for non-tech users.*
    *   *Visual Cue:* When a file is dropped, a brief "Processing locally..." animation plays, reinforcing the edge-native architecture.
3.  **The Trust Badges:** Interactive "Trust Badges" leading with plain language ("Your files never leave this device"). Features a *collapsed-by-default* live network monitor panel (via `performance.getEntriesByType('resource')`) to visually demonstrate zero outbound requests when expanded by curious users.
4.  **The Feature Grid:** Categorized cards (Security, Data, Edit) using plain-language, task-oriented descriptions (e.g., "Extract Tables → Download as Excel" instead of "pdfplumber CSV export"). Clicking one without a file highlights the dropzone.
5.  **Recent Files:** Store filenames + thumbnails in IndexedDB for returning users to quickly resume work.

### Pyodide Loading UX Spec
Since loading Pyodide + dependencies is heavy (~60-100MB initial load):
*   **Engine Status Pill:** Display a persistent corner indicator using human language (e.g., "Getting powerful tools ready…", "Preparing advanced features (first time only)") so users know the current capability state.
*   **Background Pre-warming:** Start loading Pyodide in the background immediately upon first user interaction (like file drop), rather than waiting for a specific tool selection.
*   **Caching via Service Worker + IDBFS:** Ensure all subsequent visits load instantly without re-downloading environments.

### The Working Interface & Progressive Complexity Modes
To prevent feature bloat as capabilities expand, the UI will employ Progressive Complexity Modes, switchable via a primary toggle:
*   **Simple Mode:** Focuses entirely on commodity features (Merge, Split, Rotate, Compress, Stamp, Share). The interface is stripped down to large, friendly buttons.
*   **Enhanced Mode:** Introduces the AI and Data workflows. Surrounds the canvas with the Document Health Panel, Redaction Scanner, OCR tools, and Structured Notes export.
*   **Super User Mode:** Exposes complex legal/academic utilities (Bates Numbering, Regex-based extraction, PDF/A conversion, Context-Aware Diff).

Once a document is loaded, the foundational layout is:
*   **Left Sidebar:** Page thumbnails (rendered via `pdf.js`) for quick reordering and deletion.
*   **Main Canvas:** The document viewer. *All major transformations should feature a Split-pane preview (before/after) to build trust.*
*   **Right Sidebar (Contextual):**
    *   **Document Health Panel:** A persistent panel showing page count, file size, OCR requirement (scanned PDF?), live text presence, AES encryption status, and hidden layers. This surfaces relevant tools automatically.
    *   If the user clicks "Redact," this panel shows the PII Scanner results.
    *   If the user clicks "Extract Data," this panel shows CSV/XLSX preview options.
*   **Floating Action Bar:** Common actions (Save, Export, Print) pinned to the bottom.

**Critical UX Safeguards & Usability:**
*   **Destructive Action Confirmation:** Persistent "Working copy" indicator. Confirmation modals for irreversible operations (deleting pages, redactions, flattening forms).
*   **Large File Warnings:** Before processing >100MB files, show a warning: *"This is a large file. Processing may take a moment and requires ~XMB of browser memory."*
*   **Keyboard Shortcuts & Undo/Redo:** Power users expect shortcuts; tooltips will help discoverability. A comprehensive Undo/Redo stack (Cmd+Z) is essential to recover from accidental changes.

### Mobile Strategy
While a drag-and-drop desktop paradigm is primary, mobile cannot be ignored:
*   The primary CTA on mobile should be a large **"Open File"** button rather than a dashed drop area, as the dropzone pattern breaks on mobile.
*   Ensure the UI layout adapts to smaller screens, even if advanced features (like side-by-side diffs) are simplified or deferred.

---

## 5. Academic / Research Tools Feasibility

For academic, scientific, and research users, the following tools have been evaluated for feasibility within the edge-native architecture:

*   **Citation & Reference Extractor (Moderate - 7/10):** Uses regex to handle structured bibliographies (APA, MLA, Vancouver). `transformers.js` NER assists with author/journal disambiguation. Output to BibTeX/RIS is highly feasible once parsed.
*   **Multi-column Reflow (Hard - 5/10 general, 7/10 standard 2-column):** `pdfplumber` and `pymupdf` expose text block X-coordinates, allowing column clustering. Works reliably for dominant IEEE/Elsevier formats, but degrades when figures span columns or layouts are highly unusual.
*   **PDF Timeline (Moderate - 7/10):** Date regex combined with NER. Context windowing is required to disambiguate referenced dates from event dates.

---

## 6. Detailed Feature Plans

### 6.1 Dark Mode PDF
**Goal:** Produce a genuinely readable dark-mode PDF, not a naive CSS invert that turns photos negative.

*   **Tier 1 — Viewer Dark Mode (Phase 1):** Instant preview using a CSS canvas filter (`invert(1) hue-rotate(180deg)`) applied to `pdf.js` render output. Zero processing overhead.
*   **Tier 2 — True Dark PDF Export (Phase 3):** Uses `pymupdf` (Engine C) to rewrite the document. It paints a dark background, recolors text blocks (inverting black/dark text to near-white), and importantly, applies a brightness/contrast gamma correction to images rather than color-inverting them.
*   **UX:** A toggle in the viewer toolbar (Sun ↔ Moon icon). An "Export Dark PDF" button for the true rewrite, featuring a split-screen before/after preview.

### 6.2 PDF to Structured Notes
**Goal:** Turn any PDF into a clean Markdown/Obsidian `.md` file with proper heading hierarchy and extracted annotations.

*   **Processing Pipeline:** `pymupdf` extracts text blocks with font metadata (size, weight). A Heading Detector ranks font sizes to classify H1/H2/H3. `pdf.js` extracts highlights and sticky notes. Everything is assembled into Markdown with YAML frontmatter.
*   **Obsidian Mode:** Adds `[[wikilinks]]` for proper nouns (via `transformers.js` NER), `#tags`, and a References section.
*   **AI Summary (Optional):** Integration with an external API (like Claude) to generate per-section TL;DR summaries inserted as blockquotes. Opt-in only to preserve the privacy-first brand.
*   **UX:** Live split-pane preview (PDF vs. Markdown). Options to toggle annotations, summaries, and Obsidian mode. Deep-link integration for Obsidian users.

### 6.3 QR & Barcode Decoder
**Goal:** Detect and decode every QR code and barcode on every page of a PDF.

*   **Implementation:** Pure Engine A functionality using `@zxing/library` (supports QR, Data Matrix, PDF417, UPC, etc.).
*   **Processing Pipeline:** `pdf.js` renders pages to canvas at 3x scale. The canvas image data is passed to ZXing. Pages are processed in parallel batches.
*   **Smart Results:** The UI interprets results in a right sidebar (e.g., URLs get an "Open" button, ISBNs get a lookup link, vCards offer to save the contact).
*   **UX:** A "Scan for Codes" toolbar button triggers an automatic scan of all pages, drawing bounding boxes over detected codes on thumbnails.

---

## 7. Next Strategic Steps

To begin executing this plan, the immediate priority is validating the foundational technology stack to ensure the UX vision is possible.

1.  **Repository Setup:** Initialize the frontend framework (e.g., Next.js) and configure the Webpack/Vite bundler to handle WASM files correctly.
2.  **Proof of Concept 1 (The Fast Lane):** Implement a simple drag-and-drop zone that uses `pdf-lib` to instantly merge two PDFs and trigger a local download.
3.  **Proof of Concept 2 (The AI Lane):** Instantiate `transformers.js` in a Web Worker, pass it a hardcoded string of text containing a name and an email, and log the NER extraction results to the console.

By isolating the JS-native manipulation from the WebGPU-accelerated AI early on, you secure the two main pillars of the application before tackling the heavy Pyodide integrations.

---

## 8. Critical Technical Considerations & Risks

While the tri-engine edge architecture provides massive privacy and cost benefits, it introduces browser-specific constraints that must be actively managed.

*   **WASM Memory Limits (OOM Risk):** WebAssembly instances typically have a hard memory ceiling (historically 2GB, scaling towards 4GB in modern browsers). Loading, decoding, and processing massive PDFs (e.g., 500MB+ scanned documents) entirely in memory via Pyodide will crash the browser tab. The application must implement streaming where possible, or chunking strategies, and gracefully handle Out-Of-Memory (OOM) errors by warning users before processing large files.
*   **Storage API Migration (OPFS vs. IDBFS):** While IDBFS (IndexedDB) is a functional starting point for caching Python wheels, it is relatively slow for heavy read/write operations (such as dumping hundreds of extracted high-res images). The architecture should plan a migration path to the **Origin Private File System (OPFS)**, which provides highly performant, synchronous file access within Web Workers, mimicking a native file system much more closely.
*   **Cross-Origin Isolation (COOP/COEP):** To achieve maximum performance in Web Workers—specifically if the architecture eventually requires `SharedArrayBuffer` for multi-threading or rapid memory sharing between JS and WASM—the application must be served with strict Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers. This makes loading external third-party resources (like remote fonts or external scripts) significantly more complex.
*   **Content Security Policy (CSP):** Running Pyodide and dynamically compiling WASM requires specific CSP directives (such as `'wasm-unsafe-eval'`). Security policies must be carefully crafted to allow the engines to function without exposing the application to XSS vulnerabilities.