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
*   **Core UI & File Session Model:** Develop the Vite/React frontend. Implement the "Massive Dropzone" welcome page, dark/light mode, and Zustand state management for handling files in memory. Implement the multi-file tab bar to manage multiple open documents.
*   **UX/UI Priorities:** 3-step onboarding tooltip tour, explicit error states (OOM, corrupt files, passwords), human-readable loading stages with cancel buttons, thumbnail context menus (right-click to extract/delete), and smart output file naming (`[original-name]-[action]-[timestamp]`).
*   **Accessibility Foundation:** Focus rings, keyboard operability, and ARIA live regions for engine status.
*   **Commodity Features:** Hook up `pdf-lib` for Combine, Split, Rotate, Reorder, Add Pages, Delete Pages, **Stamp / Watermark**, and **PDF compression/optimization** (metadata stripping + recompression using ghostscript via Pyodide or JS-native deflate pass).
*   **Annotations & Signatures:** Basic highlight/draw tools and signature capture/placement.
*   **Undo/Redo System:** Implement a robust undo/redo stack (Cmd+Z) early on to prevent data loss on accidental page deletes or edits.
*   **Sharing:** Implement **WebRTC/P2P sharing** (or Base64 URLs capped at tiny sizes < 20KB) for zero-server instant sharing.
*   **Early Features:** Implement **Viewer Dark Mode** (CSS filter) and **QR & Barcode Decoder** (`@zxing/library`).
*   **Mobile Foundation:** Tap-to-open file inputs properly formatted with `accept="application/pdf"` for iOS.
*   **Basic Polish:** Implement standard metadata cleaning and password encryption.
*   **Early Spikes:** Validate `pymupdf` + `pdf2docx` in Pyodide.
*   **Outcome:** A lightning-fast, ad-free alternative to generic online PDF splitters.

### Phase 2: The Intelligent Security Hub (Months 4–9)
**Objective:** Deploy the core differentiator—the Redaction Suite—using edge-native AI.
*   **Transformers.js Integration:** Implement a lightweight NER model in the browser (target <50MB budget for first load).
*   **Automated PII Scanner:** Build the UI to scan a document, flag sensitive entities (SSNs, names, emails), and present them in a sidebar for one-click redaction.
*   **True Redaction Engine:** Ensure the redaction actually removes the underlying text paths using `pymupdf`, which outperforms `pdf-lib` for this.
*   **Redaction Reversal / Audit Tool:** Build a parser that scans incoming PDFs for "fake" redactions (hidden text layers under shapes) and alerts the user.
*   **Sanitize & Send:** A one-click action that strips all metadata (author, history), removes hidden text/scripts, flattens forms/annotations, and verifies no fake redactions exist. On completion, it displays a dismissible, non-exportable in-app checklist of findings to build confidence without implying a legal guarantee.
*   **OCR Foundation:** Integrate `tesseract.js` for scanned PDFs, a table-stakes feature.
*   **Accessibility:** Add offline **Read Aloud (TTS)** using `transformers.js` (e.g., Kitten TTS `onnx-community/kitten-tts-nano-0.1-ONNX`).
*   **Retention & Trust Features:** Add session continuity (resume unsaved work), Privacy Audit Log (timestamped history of local actions), contextual Progressive Mode promotion (e.g., suggest "Professional" mode if OCR is needed), per-tool time estimates, and dismissible in-workflow trust badges ("Processing in your browser").
*   **Flatten Forms:** Add ability to remove interactive fields and burn content in.
*   **PDF to Structured Notes:** Turn PDFs into Markdown/Obsidian files with heading hierarchy and annotations.

### Phase 3: Data Extraction & Conversion (Months 10–16)
**Objective:** Bring in the Pyodide/WASM engine to attract data workers, researchers, and administrators.
*   **Monetization Strategy:** Define monetization model before releasing Phase 3 features (freemium/pro tier/enterprise).
*   **Pyodide Web Worker:** Set up the background thread to load the Python environment without freezing the UI.
*   **Table Extraction (Sequential Fallback):** Default to `pdfplumber`. If the user is unsatisfied, provide a "Try the other engine" button to re-run with `pymupdf`. If automated extraction fails entirely, surface a manual bounding-box UI in the `pdf.js` viewer as the final fallback. Outputs to clean CSV or **Excel/XLSX**.
*   **High-Value Utilities:** Add **Bookmark/Outline Editor**, **Image Extractor** (ZIP download), **Hyperlink Extractor**, **Crop/Resize Pages** (e.g., to A4/Letter), **Custom Page Numbering**, and **"Fast Web View" linearization**.
*   **Cross-Document Page Reordering:** When multiple files are open, display thumbnail rails side-by-side to allow dragging pages directly between documents.
*   **Workflow Recipes:** Allow users to save tool sequences (e.g., "OCR → Extract tables → Redact PII → Compress") locally to IndexedDB. One click applies a recipe. Exportable as JSON or shareable via URL to drive organic growth.
*   **Legal Utilities:** Implement **Bates Numbering** for legal professionals.
*   **Growth & Engagement UX:** Add deep-link shareable tool URLs (`/#tool=redact`), output quality feedback prompts (👍/👎 post-download), and early PWA install prompts for offline usage.
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
*   **Browser Extension:** Develop a Chrome/Firefox extension that adds "Open in BunkerPDF" to the right-click context menu on any PDF link, acting purely as a discovery launcher without requiring intrusive permissions.
*   **Offline Mode:** Wrap the application in a Progressive Web App (PWA) manifest so users can install it locally and use it without an internet connection.

---

## 4. Deep-Dive: UI/UX & The Welcome Page

The interface must convey trust and premium quality. It should operate on a "Quiet UI" principle—tools only appear when they are contextually relevant.

### First-Run & The Welcome Page Structure
1.  **Onboarding:** A 3-step dismissible tooltip tour on first load ("Drop a file → Pick what to do → Download your result") stored in `localStorage`.
2.  **The Hero:** Bold statement: *"The Zero-Trust Document Suite."*
3.  **The Dropzone:** A massive, central dashed area.
    *   *Visual Cue:* A visual pulse/glow on hover to clearly indicate the drop target.
    *   *Trust Microcopy:* On file drop, a brief animation plays with the text: *"Your file never leaves this device — all processing happens in your browser."* (Shown once on first drop).
    *   *Size Warning:* Pre-process check. If >80MB, show an immediate warning before attempting to load.
4.  **The Trust Badges:** Two-tier layout. Lead with a plain-language headline (*"Nothing leaves your device"*), followed by a "See proof →" disclosure that expands a live network monitor panel to satisfy power users without confusing non-tech users.
5.  **The Feature Grid:** Categorized cards (Security, Data, Edit) with color-coded headers.
    *   *Microcopy:* Intentional empty states with descriptive microcopy (e.g., "Split PDF → Drag the divider between pages") beneath each action.
    *   *Time Estimates:* Each card explicitly states processing time (e.g., "Instant", "~5 sec", "First use: ~30 sec, then instant").
6.  **Competitor Comparison Table:** A simple table near the bottom directly contrasting BunkerPDF with the three dominant alternatives: Server-based tools (privacy risks), subscription cloud tools (expensive), and desktop software (installation required, OS dependencies).
7.  **Returning User Surface:** When returning, show 3–5 recent file thumbnails with filenames and last action taken (stored in IndexedDB). One click to reload the file.

### The File Session Model
The application must handle the reality that users work across multiple documents and iterative steps.
*   **Multi-File Tab Bar:** Dropping a second file opens it in a new tab (capped at ~8) rather than replacing the current document. Tabs display the thumbnail + filename.
*   **Unsaved Work Warning:** If the file has a "dirty" state (edits applied) and the user attempts to close it or open a new file, prompt before discarding.
*   **Smart Output Naming:** Output files use a convention like `[original-name]-[action]-[timestamp].pdf` instead of a generic "download.pdf".
*   **Undo/Redo Stack:** A dedicated 10+ step history (Cmd+Z, plus visible buttons) for page deletions, reorders, redactions, and annotations.

### Pyodide Loading UX Spec & Feedback States
Since loading Pyodide + dependencies is heavy (~60-100MB initial load):
*   **Engine Status Pill:** Display persistent, human-readable states:
    *   "Ready" (previously "Instant ✅")
    *   "Preparing smart tools…" (previously "AI Loading…")
    *   "Loading advanced features (first time only)" (previously "Heavy Loading…")
    *   "All features ready"
*   **Progress Bars:** For the Pyodide first-load, use an *inline progress bar with stages* ("Downloading tools (48MB)... Setting up... Ready.") rather than an ambiguous spinner.
*   **Multi-Page Operations:** Operations like batch OCR need a page counter ("Processing 12 of 200"), an ETA, and crucially, a **Cancel button** so users are never trapped.

### Error States
Every significant error needs a designed response, not a browser default:
*   **OOM / File Too Large:** "This file is too large to process entirely in your browser. Try splitting it into smaller sections first." with a direct "Split first" button.
*   **Corrupt PDF:** "We couldn't read this file. It may be damaged or in an unsupported format." with an offer to try OCR as fallback.
*   **Password-Protected PDF:** Prompt for the password inline within the health panel—do not fail silently.
*   **Pyodide Initialization Failure:** Gracefully degrade with a banner: "Advanced features couldn't load. Basic tools are still available."
*   **OCR Failure:** "No readable text was detected. The document may already be text-based or the quality may be too low."

### The Working Interface & Progressive Complexity Modes
To prevent feature bloat, the UI will employ Progressive Complexity Modes ("Simple", "Enhanced", "**Professional**"), switchable via a primary toggle:
*   **Mode Promotion:** Contextually smart toggles. If a user opens a scanned PDF in Simple mode, the health panel suggests switching to Enhanced mode for OCR. Switching modes reveals new tools without resetting active work.

Once a document is loaded, the foundational layout is:
*   **Left Sidebar:** Page thumbnails. **Crucially, include a Context Menu** (Right-click / long-press): Delete page, Duplicate page, Extract as new file, Move to position.
*   **Main Canvas:** The document viewer. *All major transformations should feature a Split-pane preview (before/after) to build trust.*
*   **Right Sidebar (Contextual):**
    *   *Top:* Persistent document metadata.
    *   *Middle:* Active tool output (replaces when tool changes).
    *   *Bottom:* Persistent "what else can I do?" suggestions.
    *   **Document Health Panel:** Health flags link directly to their fix as 1-click actions (e.g., clicking "OCR required" triggers the OCR tool).
*   **Floating Action Bar (Bottom):** Common actions. Must include:
    *   Undo/Redo buttons with keystroke hints.
    *   **Processing Chain Indicator:** A breadcrumb of applied actions (e.g., Redact + Compress) so the user can audit output before downloading.
    *   Distinct **Save to session** vs **Download** buttons.

### Trust & Retention UX
*   **In-workflow Trust Signals:** Briefly surface "Processing in your browser — not sent to any server" near the progress indicator during tool execution (dismissible after 3 uses).
*   **Privacy Audit Log:** A timestamped list of every operation performed (explicitly stating no data was transmitted), accessible from the footer.
*   **Session Continuity & Memory:** Save in-progress work to IndexedDB ("Welcome back — you were working on Contract.pdf. Continue?"). Additionally, match returning files by filename and size hash to prompt with past actions (e.g., "You split this document in March. Split again?").
*   **Shareable Tool Links:** Deep links (`/#tool=redact`) that pre-select a tool when a file is dropped.
*   **PWA Install Prompt:** After a user's 3rd visit, surface a subtle prompt to install the app locally.
*   **Output Quality Feedback:** A simple post-download prompt ("Did the output look right? 👍/👎").

### Mobile Strategy
While a drag-and-drop desktop paradigm is primary, mobile cannot be ignored:
*   **Layout:** Full-screen viewer → bottom sheet for tools (swipe up to reveal). The right sidebar becomes a bottom drawer. The thumbnail rail moves to a horizontal strip below the viewer.
*   **Interaction:** Primary CTA is a large **"Open File"** button. `input type="file"` must use `accept="application/pdf"`.
*   **Touch Targets:** All interactive elements must be a minimum of 44×44px.
*   **Batch Operations:** Reordering pages requires a designed long-press → drag interaction.

### Accessibility Scope
*   All interactive elements need focus rings and keyboard operability (`Tab`, `Enter`, `Escape`).
*   The PDF viewer must expose page number and zoom level to screen readers.
*   Drag-and-drop must have a keyboard-accessible alternative (file picker button).
*   Color cannot be the only differentiator (e.g., for Document Health Panel status indicators).
*   The Engine Status Pill needs an `aria-live` region so screen readers announce state changes.

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