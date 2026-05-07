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
Used for intelligent text processing using WebGL/WebGPU acceleration directly in the browser, avoiding the need to boot a full Python environment for specific ML tasks.
*   **Named Entity Recognition (NER):** Powering the Automated PII Scanner to find names, organizations, and ID numbers.
*   **Semantic Search:** Running lightweight embeddings for the Multi-PDF Local Search feature.

### Engine C: The Heavy Compute Layer (WASM / Pyodide)
Used for complex layout parsing, data extraction, and format conversions where Python’s ecosystem is unmatched.
*   **`pdfplumber` / `tabula-py`:** For high-fidelity table extraction to CSV/DataFrames.
*   **`pdf2docx` / `python-docx`:** For bidirectional Word/PDF conversions.
*   *Note:* This engine is lazy-loaded. It only initializes in a Web Worker when a user requests a "Heavy" task.

---

## 3. Phased 24-Month Development Roadmap

This timeline is structured to build a working foundation rapidly, layer on the "killer" features to build a user base, and polish the product into a standalone business asset.

### Phase 1: Foundation & "The Dropzone" (Months 1–3)
**Objective:** Build the UI shell, establish the JavaScript processing pipeline, and launch the basic utilities.
*   **Core UI:** Develop the Next.js/React frontend. Implement the "Massive Dropzone" welcome page, dark/light mode, and Zustand state management for handling files in memory.
*   **Commodity Features:** Hook up `pdf-lib` for Combine, Split, Rotate, Reorder, Add Pages, and Delete Pages.
*   **Basic Polish:** Implement standard metadata cleaning and password encryption.
*   **Outcome:** A lightning-fast, ad-free alternative to generic online PDF splitters.

### Phase 2: The Intelligent Security Hub (Months 4–9)
**Objective:** Deploy the core differentiator—the Redaction Suite—using edge-native AI.
*   **Transformers.js Integration:** Implement a lightweight NER model in the browser.
*   **Automated PII Scanner:** Build the UI to scan a document, flag sensitive entities (SSNs, names, emails), and present them in a sidebar for one-click redaction.
*   **True Redaction Engine:** Ensure the redaction actually removes the underlying text paths using `pdf-lib`, rather than just drawing black rectangles.
*   **Redaction Reversal / Audit Tool:** Build a parser that scans incoming PDFs for "fake" redactions (hidden text layers under shapes) and alerts the user.

### Phase 3: Data Extraction & Conversion (Months 10–16)
**Objective:** Bring in the Pyodide/WASM engine to attract data workers, researchers, and administrators.
*   **Pyodide Web Worker:** Set up the background thread to load the Python environment without freezing the UI.
*   **Table Extractor:** Implement `pdfplumber`. Build a UI where users can draw bounding boxes over tables in the `pdf.js` viewer, and output clean CSV or Markdown.
*   **HTML/Markdown Export:** Extract raw text and headers into developer-friendly formats.
*   **The Office Bridge:** Implement local PDF to DOCX and DOCX to PDF conversion.

### Phase 4: Professional Workflows & Scale (Months 17–24)
**Objective:** Finalize the enterprise-tier features that ensure high retention.
*   **Context-Aware Diff (Track Changes):** Build the semantic comparison tool for two PDF versions.
*   **Multi-PDF Search:** Allow users to drop an entire folder of PDFs into the browser. Use `transformers.js` to create local embeddings, making the folder instantly searchable.
*   **Reviewer Portal:** Extract annotations, comments, and highlights into an actionable checklist.
*   **Offline Mode:** Wrap the application in a Progressive Web App (PWA) manifest so users can install it locally and use it without an internet connection.

---

## 4. Deep-Dive: UI/UX & The Welcome Page

The interface must convey trust and premium quality. It should operate on a "Quiet UI" principle—tools only appear when they are contextually relevant.

### The Welcome Page Structure
1.  **The Hero:** Bold statement: *"The Zero-Trust Document Suite."*
2.  **The Dropzone:** A massive, central dashed area.
    *   *Visual Cue:* When a file is dropped, a brief "Processing locally..." animation plays, reinforcing the edge-native architecture.
3.  **The Trust Badges:** Prominent icons stating "No Servers," "100% Browser-Based," and "WebGPU Accelerated."
4.  **The Feature Grid:** Categorized cards (Security, Data, Edit) that users can browse. Clicking one without a file highlights the dropzone.

### The Working Interface
Once a document is loaded, the UI shifts:
*   **Left Sidebar:** Page thumbnails (rendered via `pdf.js`) for quick reordering and deletion.
*   **Main Canvas:** The document viewer.
*   **Right Sidebar (Contextual):**
    *   If the user clicks "Redact," this panel shows the PII Scanner results.
    *   If the user clicks "Extract Data," this panel shows CSV preview options.
*   **Floating Action Bar:** Common actions (Save, Export to DOCX, Print) pinned to the bottom.

---

## 5. Next Strategic Steps

To begin executing this plan, the immediate priority is validating the foundational technology stack to ensure the UX vision is possible.

1.  **Repository Setup:** Initialize the frontend framework (e.g., Next.js) and configure the Webpack/Vite bundler to handle WASM files correctly.
2.  **Proof of Concept 1 (The Fast Lane):** Implement a simple drag-and-drop zone that uses `pdf-lib` to instantly merge two PDFs and trigger a local download.
3.  **Proof of Concept 2 (The AI Lane):** Instantiate `transformers.js` in a Web Worker, pass it a hardcoded string of text containing a name and an email, and log the NER extraction results to the console.

By isolating the JS-native manipulation from the WebGPU-accelerated AI early on, you secure the two main pillars of the application before tackling the heavy Pyodide integrations.