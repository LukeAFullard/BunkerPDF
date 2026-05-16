# Feature Enhancements and UX Analysis

Based on a review of the codebase (specifically `DocumentCard.tsx`, `App.tsx`, and the underlying logic structure), here is an analysis classifying the features, evaluating their user-friendliness, and suggesting improvements. The classifications are based on common architectural pain points in browser-based PDF processing (like memory limits with Pyodide/WASM) and the UX patterns present in the code.

## 📥 Extract & Export Features

### 1. Extract / Split
*   **Working Status:** Likely Working (but prone to memory crashes on huge files if it loads the whole PDF into memory).
*   **User-Friendly:** Yes. It's accessible via both a button and context menu.
*   **Improvements:** Provide a preview of the pages before splitting. Allow splitting by specific page ranges (e.g., 1-5, 8-10) rather than just "bursting" the whole document.

### 2. Extract Tables (Excel)
*   **Working Status:** Potentially Fragile. Table extraction via WASM/Python in the browser is notoriously resource-intensive and inaccurate depending on the PDF structure.
*   **User-Friendly:** Moderate. It's hidden on mobile (which is smart for performance), but users might not understand why it's missing if they switch devices.
*   **Improvements:** Add a confidence score or preview of the extracted data before downloading. Provide options to select specific pages for table extraction to save memory.

### 3. Extract Notes (Markdown) / Extract Web (HTML)
*   **Working Status:** Likely Working. PyMuPDF handles text extraction well.
*   **User-Friendly:** Yes, straightforward.
*   **Improvements:** Show a preview modal of the extracted Markdown/HTML before forcing a download.

### 4. Export DOCX / Export True Dark
*   **Working Status:** Moderate. DOCX conversion in browser via Pyodide can be very slow and lose complex formatting. True Dark might invert images incorrectly despite the code attempting to handle it.
*   **User-Friendly:** Moderate. The processing time can be long ("~10s" noted in the context menu), which might feel unresponsive if the loading state isn't prominent enough.
*   **Improvements:** Implement a robust progress bar (e.g., "Processing page 1 of 10") rather than a generic spinner. Allow users to cancel long-running WASM tasks safely.

### 5. Extract Images / Links / Annotations
*   **Working Status:** Likely Working.
*   **User-Friendly:** Yes.
*   **Improvements:** For image extraction, offer a choice of output format (ZIP of PNGs vs JPEGs) or resolution scaling.

---

## 🛠️ Modify & Secure Features

### 6. Flatten / Sanitize
*   **Working Status:** Likely Working.
*   **User-Friendly:** Moderate. "Sanitize" is vague. Users might not know exactly what metadata or hidden elements are being removed.
*   **Improvements:** Show a summary of *what* will be sanitized before executing (e.g., "Found 3 hidden layers and Author metadata. Remove?").

### 7. Highlight Text / Sign Document
*   **Working Status:** Likely Working.
*   **User-Friendly:** Low to Moderate. These usually require user interaction (selecting text, drawing a signature), but the code suggests they might be automated or basic implementations.
*   **Improvements:** If interactive, ensure the UI overlay for drawing/selecting is responsive. If automated, clarify the behavior. Provide a "preview mode".

### 8. Resize / Optimize (Compress)
*   **Working Status:** Likely Working, but "Optimize" might degrade quality noticeably depending on the library's defaults.
*   **User-Friendly:** Moderate.
*   **Improvements:** Provide compression levels (Low, Medium, High) with estimated output size. Allow users to choose standard sizes (A4, Letter) dynamically when clicking "Resize".

### 9. Audit / Verify Signatures
*   **Working Status:** Likely Working.
*   **User-Friendly:** Low. The output might be too technical for average users.
*   **Improvements:** Translate technical cryptographic output into simple terms (e.g., "Signature is Valid and matches [Name]").

### 10. Protect (Password) / Unlock
*   **Working Status:** Likely Working (the codebase mentions a dual-engine approach for unlock, which is robust).
*   **User-Friendly:** Yes.
*   **Improvements:** Add an eye icon to reveal the password while typing. Add a password strength indicator.

---

## 🧠 Analyze (AI) & Others

### 11. Scan PII / Redact
*   **Working Status:** Potentially Fragile. In-browser AI for PII detection might miss custom formats or struggle with complex layouts.
*   **User-Friendly:** Good. The UI shows a sidebar with checkboxes for detected entities, which is a great pattern.
*   **Improvements:** Allow users to manually add custom regex patterns or keywords to the PII scanner. Allow manual box-drawing for redaction to catch what the AI misses.

### 12. Scan Codes (Barcodes/QR)
*   **Working Status:** Likely Working.
*   **User-Friendly:** Good. The sidebar UI is clean.
*   **Improvements:** Highlight the location of the detected code on the PDF thumbnail so the user knows which one was read.

### 13. OCR / Read Aloud (TTS)
*   **Working Status:** Potentially Fragile. In-browser OCR (likely Tesseract.js) is heavy and can crash the tab. TTS might sound robotic or struggle with columns.
*   **User-Friendly:** Low. "~15s/pg" for Read Aloud is extremely slow.
*   **Improvements:** For OCR, process only the currently viewed page by default. For TTS, highlight the text currently being read and allow pausing/skipping.

---

## 🌟 Global UI/UX Architecture Improvements

1.  **Declutter the Interface:** Currently, features are duplicated in a massive right-click Context Menu and nested inside `<details>` accordion tags on the card.
    *   *Suggestion:* Move primary actions (Download, Remove, Split) to the card's surface. Group the rest under a clean, single "Tools" dropdown or a dedicated modal/sidebar when a document is selected, rather than crowding the individual document card.
2.  **Batch Actions Visibility:** Batch actions are hidden under a "Batch Actions" dropdown at the top of the workspace.
    *   *Suggestion:* If a user selects multiple documents, dynamically change the main toolbar to highlight batch actions.
3.  **Operation Feedback:** The `isProcessing` state disables buttons, which is good.
    *   *Suggestion:* Add granular progress indicators for multi-page documents (e.g., processing via chunks) to prevent the user from thinking the tab has frozen during heavy WASM tasks. Use WebWorkers to keep the UI thread completely unblocked.
4.  **Error Handling:** The generic `ErrorModal` is okay, but contextual errors are better.
    *   *Suggestion:* If extraction fails because the PDF is a scanned image, the error should explicitly suggest using the OCR tool first, rather than just failing.
