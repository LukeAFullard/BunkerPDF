# BunkerPDF: The Privacy-First Professional PDF Workspace

[... omitted for brevity ...]

## 3. Implementation Roadmap

### Phase 1: The Core Foundation & True Redaction (MVP - Months 1-3)
**Objective:** Prove the technical viability of the edge architecture with the highest-impact, highest-trust feature: True Redaction.
* [x] **Core UI & The Dropzone:** Develop the Vite/React frontend. Implement the "Massive Dropzone" welcome page and Zustand state management for handling files in memory.
* [x] **Core Commodity Features:** Hook up `pdf-lib` for Combine, Split, Rotate.
* [x] **Automated PII Scanner & True Redaction (MVP Scope):** Implement a lightweight NER model in the browser (target <50MB budget for first load). Build the UI to scan a document, flag sensitive entities (SSNs, names, emails), and present them in a sidebar for one-click redaction. Ensure redaction removes underlying text paths using `pymupdf`.
* [x] **Pyodide Cold-Start Strategy:** Implement a concrete strategy: either pre-warm Pyodide silently in the background immediately on page load, or explicitly gate heavy features (like True Redaction) behind an "Enable advanced tools" step with clear expectation-setting to prevent abandonment on a 60–100MB download. (*Pre-warming strategy has been implemented.*)
* [x] **Early Spikes:** Validate `pymupdf` + `pdf2docx` in Pyodide. (*Note: `pdf2docx` failed due to a missing pure Python wheel for `opencv-python-headless`. The fallback strategy of using `pymupdf` + `python-docx` has been validated.*)

### Phase 1.5: UI Polish & Commodity Features (Months 4–6)
**Objective:** Layer on necessary UI improvements and common commodity features delayed from MVP.
* [ ] **UX/UI Priorities:** 3-step onboarding tooltip tour, explicit error states (OOM, corrupt files, passwords), human-readable loading stages with cancel buttons, thumbnail context menus (right-click to extract/delete), smart output file naming (`[original-name]-[action]-[timestamp]`), and multi-file tab bar.
* [ ] **Accessibility Foundation:** Focus rings, keyboard operability, and ARIA live regions for engine status.
* [ ] **Expanded Commodity Features:** Add Reorder, Add Pages, Delete Pages, **Stamp / Watermark**, and **PDF compression/optimization** (metadata stripping + recompression).
* [ ] **Undo/Redo System:** Implement a robust undo/redo stack (Cmd+Z).
* [ ] **Mobile Scope (Lightweight Utility Mode):** Mobile is strictly a lightweight utility mode (Merge/Split), NOT full workstation parity. Due to RAM, thermal throttling, and Safari WASM limits, heavy processing (Pyodide, OCR, Large PDFs) is too risky for MVP mobile.
* [ ] **Basic Polish:** Implement standard metadata cleaning and password encryption.
* [ ] **Annotations & Signatures:** Basic highlight/draw tools and signature capture/placement.
* [ ] **Sharing:** Implement **WebRTC/P2P sharing** or Base64 URL sharing.
* [ ] **Early Features:** Implement **Viewer Dark Mode** (CSS filter) and **QR & Barcode Decoder** (`@zxing/library`).

[... omitted for brevity ...]
