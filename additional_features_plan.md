# BunkerPDF — New Feature Implementation Plan

**Document scope:** Implementation details for features identified as missing from the current roadmap via competitive analysis against iLovePDF, Smallpdf, ChatPDF, Canva, and CutePDF. Features are grouped by delivery wave and sorted within each wave by implementation effort. Each entry covers the engine(s) involved, specific libraries, UX considerations, acceptance criteria, and risks.

---

## Wave 0 — Quick wins (1–2 sprints, no architecture changes)

These features require no new engines, no new dependencies, and no significant backend work. They close obvious commodity gaps and should ship before any Wave 1 work begins. Good first step.

---

### [x] 0.1 Images → PDF

**Feasibility Note:** Highly feasible. `pdf-lib` is already integrated. Canvas API can handle image formats and `pdf-lib` can embed JPG/PNG natively.

**What:** Convert one or more JPG, PNG, TIFF, WebP, or BMP files into a single PDF. Each image becomes one page. Users can reorder images before conversion.

**Engine:** A (pdf-lib, pure JS)

**Implementation steps:**

1. Accept `input[type="file" multiple accept="image/*"]` alongside the existing PDF dropzone. Handle drag-and-drop of mixed image arrays.
2. For each image file, use the browser's `createImageBitmap()` API to decode the image, then draw it to an offscreen `<canvas>` to obtain raw pixel data or a base64 data URL.
3. Embed each image into a new `pdf-lib` `PDFDocument` using `pdfDoc.embedJpg()` or `pdfDoc.embedPng()`. For TIFF/BMP/WebP, transcode to PNG via canvas first (`canvas.toBlob('image/png')`).
4. For each page, set the page dimensions to match the image's natural aspect ratio (defaulting to A4 width, scaling height proportionally). Provide a UI toggle: "Fit to page" vs "Original size" vs "A4/Letter".
5. Build a thumbnail reorder rail (reuse the existing page-reorder component) so users can drag images into the correct sequence before generating the PDF.
6. Output filename: `[first-image-name]-combined-[timestamp].pdf`.

**UX notes:**
- Show a count badge on the dropzone: "3 images selected — reorder below, then convert."
- Display file size warnings if the total uncompressed image data exceeds 80MB.
- Processing is instant for typical photo collections; no loading state needed for fewer than 20 images.

**Dependencies:** None beyond existing pdf-lib integration.

**Acceptance criteria:**
- JPG, PNG, WebP, and BMP files all produce valid output PDFs.
- Image order in output matches the order shown in the thumbnail rail.
- A4 fit and original size modes both produce correct page dimensions.
- Output is downloadable within 2 seconds for a 10-image, ~5MB batch.

**Risk:** Low. TIFF is the only edge case; transcode via canvas reliably.

---

### [ ] 0.2 Unlock / remove PDF password

**Feasibility Note:** Highly feasible. `pdf-lib` can handle standard RC4 decryption. For AES-256, PyMuPDF via Pyodide is fully capable.

**What:** Given a password-protected PDF and the correct password, produce an unlocked copy with no password required to open.

**Engine:** A (pdf-lib) with Engine C fallback (pymupdf) for AES-256 encrypted files

**Implementation steps:**

1. When pdf-lib's `PDFDocument.load()` throws a `PasswordException`, surface an inline password prompt in the Document Health Panel rather than failing silently. This behaviour may already exist from the plan's Phase 1 error states — confirm and extend it.
2. After the user provides the correct password, call `PDFDocument.load(fileBytes, { password })` to decrypt the document in memory.
3. Re-save with `pdfDoc.save()` — pdf-lib strips encryption when re-serialising an already-decrypted document. No further action needed.
4. For files encrypted with AES-256 (which pdf-lib cannot handle), fall back to pymupdf in Engine C: `fitz.open(stream=bytes, filetype="pdf")` with `doc.authenticate(password)`, then `doc.save(output, encryption=fitz.PDF_ENCRYPT_NONE)`.
5. Output filename: `[original-name]-unlocked.pdf`.

**UX notes:**
- Privacy microcopy: "Your password is used only in your browser — it is never transmitted anywhere."
- Do not retain the password in state after unlocking. Clear it immediately after `load()` succeeds.
- If the password is incorrect, show an inline error ("Incorrect password — please try again") rather than resetting the entire flow.
- Distinguish clearly between "wrong password" and "encryption type not supported".

**Dependencies:** pymupdf already planned for Engine C.

**Acceptance criteria:**
- Standard 128-bit RC4 and 40-bit RC4 PDFs unlock via pdf-lib.
- AES-256 PDFs unlock via pymupdf fallback.
- Output PDF opens without a password prompt in all major viewers.
- Password is not persisted anywhere after the operation completes.

**Risk:** Low. Only edge case is owner-password-only files (print/copy restrictions without open password); pymupdf handles these.

---

### [ ] 0.3 Document integrity / provenance hash

**Feasibility Note:** Highly feasible. The Web Crypto API (`window.crypto.subtle`) is universally supported and requires no external dependencies.

**What:** Generate a cryptographic SHA-256 fingerprint of a document at a specific point in time. Produce a downloadable "certificate" JSON that can later be used to verify the document has not been altered.

**Engine:** A (Web Crypto API — `window.crypto.subtle`, pure JS, no dependencies)

**Implementation steps:**

1. Implement a `hashDocument(fileBytes: Uint8Array): Promise<string>` utility using `crypto.subtle.digest('SHA-256', fileBytes)`, converting the resulting ArrayBuffer to a lowercase hex string.
2. Expose this as a persistent action in the Document Health Panel: "Generate integrity certificate."
3. On click, hash the current in-memory document bytes (the state at that moment — before or after edits as the user chooses) and produce a certificate object:

```json
{
  "tool": "BunkerPDF",
  "version": "1.x.x",
  "filename": "contract-v3.pdf",
  "filesize_bytes": 204800,
  "sha256": "e3b0c44298fc1c149afb...",
  "timestamp_utc": "2025-09-14T10:32:00Z",
  "note": "Hash generated entirely in-browser. No data was transmitted."
}
```

4. Offer two downloads: the certificate as `.json` and a human-readable `.txt` version.
5. Expose a "Verify document" tool: drag in a PDF + its certificate JSON, recompute the hash, and compare. Display a clear pass/fail result with the original timestamp.

**UX notes:**
- Place a "Generate certificate" button in the persistent Document Health Panel footer, visible at all times.
- After generating, show the first 16 characters of the hash inline with a copy button so users can embed it in emails or documents.
- The verify flow should be accessible without loading a PDF for editing — it is a distinct, lightweight action.

**Dependencies:** None. `window.crypto.subtle` is universally available.

**Acceptance criteria:**
- SHA-256 output matches reference values from `sha256sum` command-line tool.
- Certificate JSON downloads successfully.
- Verify tool correctly identifies matching and non-matching documents.
- Entire flow completes in under 500ms for a 50MB PDF.

**Risk:** Negligible. This is one of the lowest-risk features in the entire roadmap.

---

### [ ] 0.4 Privacy risk score dashboard

**Feasibility Note:** Feasible. Metadata inspection via `pdf-lib` and NER via `transformers.js` are well within current capabilities. Fake redaction checking can be complex but is achievable using pdf.js layer inspection.

**What:** When a document loads, automatically run a suite of lightweight checks and display a single 0–100 "Privacy Score" alongside a list of specific findings. Each finding links directly to the tool that remediates it.

**Engine:** A and B (NER for PII; metadata inspection via pdf-lib; fake-redaction check via pdf.js layer inspection — all before Pyodide initialises)

**Scoring model:**

| Check | Points deducted if found |
|---|---|
| Metadata present (author, creator, producer) | −10 |
| More than 5 PII entities detected (NER) | −20 |
| More than 20 PII entities detected | −35 |
| Fake redactions detected (text under shapes) | −30 |
| Embedded JavaScript | −15 |
| Embedded files or attachments | −10 |
| Hidden text layers (not yet OCR'd) | −5 |

**Implementation steps:**

1. Trigger the scoring pipeline automatically on every file load, running checks in parallel where possible.
2. Metadata inspection: use pdf-lib's `getTitle()`, `getAuthor()`, `getCreationDate()` etc. — instant, no Pyodide.
3. PII scan: run the lightweight NER model (Engine B, transformers.js) on the first 2,000 words of extracted text. This is a sampling heuristic for the score, not a full document scan. Full scan is a separate action.
4. Fake redaction check: use pdf.js to enumerate annotation layers and check for opaque shapes overlaying selectable text (existing planned feature — wire its output into the score).
5. JavaScript detection: pdf-lib can enumerate PDF actions and form fields for JS payloads.
6. Compute the total score and display a colour-coded badge: 80–100 green ("Low risk"), 50–79 amber ("Review recommended"), 0–49 red ("High risk").
7. Each finding in the list is a button, not just text: "Fix: Strip metadata →" triggers the metadata scrubber; "Fix: Full PII scan →" triggers the redaction workflow.

**UX notes:**
- Display the score in the Document Health Panel within 3 seconds of file load (before Pyodide is ready).
- Animate the score counting up from 0 to the final value to draw attention to it.
- Include a "Share your score" button that generates a privacy-sanitised summary (no document content — only the score and finding categories) as a sharable image or tweet-sized snippet.
- Add a tooltip explaining the score methodology so users understand it is a heuristic, not a legal certification.

**Dependencies:** Requires NER model from transformers.js (already planned). Other checks are Engine A only.

**Acceptance criteria:**
- Score appears within 3 seconds for documents up to 50MB.
- Each finding's "Fix" button correctly launches the associated tool with the document pre-loaded.
- Score is recalculated after a remediation action completes.
- "Share score" output contains no document content.

**Risk:** Low for the score itself. NER sampling may produce false positives; copy must set appropriate expectations ("heuristic scan of first 2,000 words").

---

## Wave 1 — Engine C additions (1–2 months, requires Pyodide to be stable)

These features build on the Pyodide layer and should land once Phase 3's Web Worker + chunking architecture is solid.

---

### [ ] 1.1 PDF → Excel (XLSX) — dedicated UX entry point

**Feasibility Note:** Feasible with an adjustment. *Memory Note:* `pdfplumber` cannot be installed in Pyodide because `pypdfium2` lacks a pure Python wheel. Table extraction should use `pymupdf` combined with `pandas` and `openpyxl`.

**What:** A named "PDF to Excel" tool that extracts all tables from a document and writes them to a properly formatted `.xlsx` file, with one worksheet per table or per page.

**Engine:** C (pdfplumber + openpyxl in Pyodide)

**Context:** The plan already includes table extraction to CSV in Phase 3. This feature is primarily a UX and output-format addition rather than a new technical capability. The gap is that users searching for "PDF to Excel" will not find it if it is buried inside a generic "Table Extraction" panel.

**Implementation steps:**

1. Add "PDF to Excel" as a named entry point in the Export category of the icon rail and in the Command Palette (synonyms: "excel", "xlsx", "spreadsheet", "tables").
2. In the Pyodide worker, run the existing pdfplumber table extraction pipeline. For each table found, record its page number, bounding box, and extracted rows.
3. Use `openpyxl` (available in Pyodide) to build the XLSX output:
   - One worksheet per table, named "Page 3 — Table 2" etc.
   - Auto-fit column widths based on content length.
   - Apply a header row style (bold, light background fill) if the first row appears to be a header (heuristic: all cells are strings, no numeric values).
   - Include a "Summary" sheet listing each table's page number and row count.
4. If pdfplumber finds no tables, surface the manual bounding-box UI (already planned as a Phase 3 fallback).
5. Output filename: `[original-name]-tables-[timestamp].xlsx`.

**UX notes:**
- Show a preview of detected tables in the right sidebar before the user commits to download, so they can confirm extraction quality.
- Allow users to deselect individual tables they don't want included.
- Include a "Try other engine" button (pymupdf fallback) consistent with the Phase 3 plan.

**Dependencies:** openpyxl must be validated in the Pyodide environment during Phase 3 setup. It is pure Python and should work without issues.

**Acceptance criteria:**
- Output XLSX opens correctly in Excel, Google Sheets, and LibreOffice Calc.
- Multi-table documents produce correctly separated worksheets.
- Header detection heuristic correctly identifies headers in at least 80% of standard tabular data.
- Processing completes within 30 seconds for a 100-page document.

**Risk:** Low. openpyxl is pure Python with no C dependencies.

---

### [ ] 1.2 PDF → PowerPoint (PPTX) — image-based

**Feasibility Note:** Feasible, provided `python-pptx` is pure Python and installs in Pyodide. Image rendering via PyMuPDF works, but strict memory chunking will be required to prevent WASM Out-Of-Memory (OOM) errors.

**What:** Convert each page of a PDF to a high-resolution image and insert it as a full-slide image in a `.pptx` file. The result is not an editable presentation but a faithful, lossless page-by-page representation.

**Engine:** C (pymupdf for rendering + python-pptx)

**Implementation steps:**

1. In the Pyodide worker, open the PDF with pymupdf and render each page to a PNG at 150 DPI (sufficient for a 1920×1080 presentation; 300 DPI as a user-selectable "high quality" option for printing).
2. Use `python-pptx` to create a new presentation with the Widescreen (16:9) layout. For each rendered page image:
   - Add a slide with a blank layout.
   - Insert the PNG image using `slide.shapes.add_picture()`, filling the full slide area.
   - Set the slide title (in the notes pane, not the visible slide) to "Page N" for accessibility.
3. For documents with a PDF outline/bookmarks, map bookmark titles to slide notes for navigation context.
4. Output filename: `[original-name]-slides-[timestamp].pptx`.

**UX notes:**
- Display clear copy: "Each PDF page becomes one slide image. The text will not be editable in PowerPoint." Set expectations before the user starts.
- Offer a DPI selector: "Standard (150 DPI — smaller file)" vs "High quality (300 DPI — for printing)".
- Show a per-page progress indicator with a cancel button for long documents.

**Dependencies:** python-pptx must be validated in Pyodide. It is pure Python but has a moderate dependency tree — verify during Phase 3 spike.

**Acceptance criteria:**
- Output PPTX opens correctly in PowerPoint, Google Slides, and LibreOffice Impress.
- All pages of a 50-page PDF are rendered without OOM errors (implement chunked rendering: render 10 pages at a time, write to IDBFS, continue).
- 150 DPI output file is no more than 3× the source PDF size.

**Risk:** Medium. python-pptx's Pyodide compatibility needs validation. The chunked rendering strategy is essential for large documents.

---

### [ ] 1.3 Repair / recover PDF

**Feasibility Note:** Highly feasible. PyMuPDF is very resilient and its `garbage=4` save flag is an effective way to reconstruct broken xref tables.

**What:** Attempt to open, recover, and re-save a corrupt or truncated PDF. Surface what was recovered and what was lost.

**Engine:** C (pymupdf with lenient open flags)

**Implementation steps:**

1. When a file fails to open in Engines A or B (pdf-lib throws, pdf.js fails), present the user with a "Try to repair" button rather than a dead-end error.
2. In the Pyodide worker, attempt to open the file with pymupdf using lenient recovery:
   ```python
   doc = fitz.open(stream=file_bytes, filetype="pdf")
   # pymupdf attempts internal repair on corrupt xref tables automatically
   ```
3. Report recovery findings to the UI: number of pages recovered, any pages that failed to load, embedded objects that could not be parsed.
4. Re-save the recovered document: `doc.save(output, garbage=4, deflate=True)` — the `garbage=4` flag rebuilds the cross-reference table from scratch.
5. Display a dismissible findings panel listing what was recovered and what could not be salvaged.
6. Output filename: `[original-name]-repaired-[timestamp].pdf`.

**UX notes:**
- Frame as "recovery attempt" rather than a guaranteed fix: "We were able to recover 14 of 16 pages. Pages 3 and 7 could not be read."
- Offer to run OCR on recovered pages if their text content is missing (forward to the OCR tool with the recovered file pre-loaded).
- Do not offer repair as a first-run action — only surface it after a failed open attempt.

**Dependencies:** pymupdf (already planned).

**Acceptance criteria:**
- Truncated PDFs (cut off mid-byte) recover at least the pages before the truncation point.
- PDFs with corrupt xref tables recover all readable pages.
- Recovery findings panel accurately reflects which pages loaded and which did not.
- Recovered output passes pdf-lib's `PDFDocument.load()` without errors.

**Risk:** Medium. Recovery success is highly dependent on the nature of the corruption — set UX expectations accordingly. Never promise a result before attempting.

---

### [ ] 1.4 TXT / Markdown → PDF

**Feasibility Note:** Feasible. Pure text is easy. Markdown requires an HTML parser (e.g. `marked`) and manually calculating layout/coordinates with `pdf-lib` can be tedious but definitely possible.

**What:** Convert plain text or Markdown files to a clean, typeset PDF. This is the achievable subset of "Office formats → PDF" that does not require LibreOffice.

**Engine:** A (pdf-lib for basic TXT) + C (pymupdf for Markdown with layout)

**Implementation steps:**

1. For plain `.txt` files: use pdf-lib (Engine A). Split text into lines, wrap at the page margin, paginate automatically, and embed in a new PDF with a clean monospace or sans-serif font. This is entirely instant, no Pyodide required.
2. For `.md` Markdown files: parse the Markdown in JS using `marked` or `micromark` to an HTML AST. Apply CSS styling (heading sizes, bold, italic, code blocks, blockquotes). Use pdf-lib's text layout primitives to render the styled result. Alternatively, render to a hidden `<div>` and use the browser's print-to-PDF pipeline as a fallback.
3. Expose font and page size options: font family (sans-serif / serif / monospace), font size (10/11/12pt), page size (A4/Letter), margin size (Normal/Narrow/Wide).
4. Provide a live split-pane preview: Markdown source on the left, rendered PDF on the right.
5. Accept drag-and-drop of `.txt` and `.md` files directly onto the main dropzone.

**UX notes:**
- This is an Engine A operation — it should appear instant. Do not involve Pyodide.
- Include a "Copy PDF text back" round-trip sanity check in tests to verify the embedded text is selectable and accurate.

**Dependencies:** `marked` (~10KB minified) for Markdown parsing, if not already in the bundle.

**Acceptance criteria:**
- Plain text files of up to 1MB convert in under 1 second.
- Markdown headings (H1–H3), bold, italic, inline code, and code blocks all render visually correctly.
- Output PDF text is selectable (not an image).
- Page numbering is applied automatically.

**Risk:** Low for TXT. Markdown layout fidelity depends on the complexity of the CSS mapping — set scope to "common Markdown elements only" for v1.

---

## Wave 2 — AI layer features (2–3 months, requires transformers.js to be stable from Phase 2)

These features build on Engine B and involve running or extending language models in the browser. They are the most strategically differentiated features in this plan.

---

### [ ] 2.1 Local AI chat with PDF ("ChatPDF but private")

**Feasibility Note:** Moderately feasible but high risk. A 2GB model via WebLLM is pushing the absolute boundaries of browser WASM memory limits (typically 2GB-4GB). A strong cloud fallback and strict memory checks are mandatory.

**What:** A conversational interface allowing users to ask natural-language questions about the currently loaded document and receive cited, grounded answers — entirely in the browser, with no data transmitted to any server.

**Engine:** B (transformers.js for embeddings) + local LLM (WebLLM or wllama)

**Architecture:**

The approach uses Retrieval-Augmented Generation (RAG) with a local embedding model and a local language model:

1. **Chunking:** Extract the full document text using pymupdf (Engine C) or pdf.js (Engine A for already-text PDFs). Split into overlapping chunks of ~300 tokens with a 50-token overlap.
2. **Embedding:** Pass each chunk through a local embedding model (`Xenova/all-MiniLM-L6-v2` at ~22MB — already planned for Multi-PDF Search in Phase 4). Store chunk embeddings in a flat in-memory index (no vector DB needed for single-document use).
3. **Retrieval:** On each user question, embed the query using the same model and retrieve the top-5 chunks by cosine similarity.
4. **Generation:** Pass the retrieved chunks + the user question to a local language model. Recommended models in ascending capability/size order:
   - `Phi-3.5-mini-instruct` (3.8B, ~2.2GB quantised) via WebLLM — strong reasoning, good citation following.
   - `Llama-3.2-3B-Instruct` (3B, ~1.8GB quantised) — faster on lower-end hardware.
   - Fallback: Cloud Assist Mode (routes to the Anthropic API or another provider) with a mandatory, visually prominent opt-in confirmation.
5. **Citations:** Structure the generation prompt to require the model to cite the chunk index it is drawing from. Map chunk indices back to page numbers and display inline source references (e.g., "According to page 4...").

**Implementation steps:**

1. Add a "Chat" panel toggle in the right sidebar, distinct from the existing annotation tools.
2. On first open, check available memory. If estimated RAM headroom is less than 2.5GB, surface the model size warning and default to Cloud Assist Mode.
3. Stream the LLM's response token-by-token into the chat UI using the WebLLM streaming API. Do not wait for full generation.
4. After each response, display source page references as clickable chips that scroll the viewer to that page.
5. Persist the conversation in the session (IndexedDB) so users can return to a chat after navigating away. Clear on explicit user action or session end.
6. The Cloud Assist Mode toggle must be a visually distinct, permanent element of the chat panel — never hidden, never auto-enabled. Match the "AI Summary strict opt-in" design specified in section 7.2 of the existing plan.

**UX notes:**
- First-load copy: "Preparing your private AI assistant… (downloading ~2GB model, one-time only)." With a precise progress bar and estimated time.
- After first load, model weights are cached to IndexedDB — subsequent loads are instant.
- Suggested starter questions appear as chips below the input field, generated from the document's headings: "What are the key obligations?", "Summarise section 3."
- Include a "Clear chat" button that removes the conversation but keeps the model loaded.

**Dependencies:** WebLLM (`@mlc-ai/web-llm`) or wllama. Both require COOP/COEP headers for SharedArrayBuffer — validate against existing Cross-Origin Isolation headers (noted as a risk in Section 9 of the existing plan). This is the most significant infrastructure dependency of any Wave 2 feature.

**Memory budget:** Phi-3.5-mini at ~2.2GB quantised + Pyodide at ~200MB + pdf.js at ~100MB = ~2.5GB. Close to the 2GB WASM ceiling in some browsers. Test extensively on Chrome (4GB limit in 64-bit) and explicitly block on Firefox if limits are hit. Display a graceful downgrade to Cloud Assist Mode if the model fails to load.

**Acceptance criteria:**
- Answers to factual questions about document content are accurate and include page citations.
- Response streaming begins within 3 seconds of the user pressing send.
- Cloud Assist Mode toggle is never automatically engaged without user confirmation.
- The chat panel does not cause the tab to OOM on a 16GB RAM machine with a 50-page PDF.

**Risk:** High — this is the most technically complex feature in the entire plan. The memory budget is tight. Treat the first release as an explicit beta with a memory-check gate. Do not ship without a functional Cloud Assist fallback.

---

### [ ] 2.2 PDF translate

**Feasibility Note:** Feasible but layout preservation is complex. `transformers.js` can run translation models, but dynamically resizing text to fit original bounding boxes without breaking layout will have edge cases.

**What:** Translate the text content of a PDF into another language while preserving the original layout, and produce a new PDF with the translated text in place.

**Engine:** B (Helsinki-NLP translation models via transformers.js) + C (pymupdf for text block layout)

**Implementation steps:**

1. Use pymupdf to extract the document's text blocks with their bounding-box coordinates, font metadata, and page numbers. This preserves the structural relationship between text regions.
2. Identify the source language automatically using a lightweight `langdetect` heuristic (a simple frequency-based character n-gram model, ~100KB) or `transformers.js` language detection.
3. Load the appropriate Helsinki-NLP translation model from transformers.js:
   - English ↔ Spanish, French, German, Portuguese: `Helsinki-NLP/opus-mt-en-es` etc. (~50MB each)
   - For other language pairs, fall back to Cloud Assist Mode with explicit consent.
4. Translate text blocks in parallel batches of ~50 tokens. Respect sentence boundaries — do not split mid-sentence.
5. Reconstruct the PDF using pymupdf: for each text block, remove the original text using redaction, then write the translated text in the same position using the same approximate font size. For text that expands significantly (e.g. English → German often expands by 20–30%), apply a font-size reduction heuristic to keep text within its original bounding box.
6. Images, tables, and vector graphics pass through unchanged.
7. Output filename: `[original-name]-[target-lang]-[timestamp].pdf`.

**UX notes:**
- Language selector: dropdown with the 10 most common language pairs first, a search input, and a "Requires cloud" label on pairs outside the local model roster.
- Split-pane before/after preview (original on left, translated on right) before the user downloads.
- A warning when text expansion is detected: "Some text was resized to fit. You may want to review pages 3, 7, and 12."
- Processing time estimate displayed before starting: "~45 seconds for this document (120 pages)."

**Dependencies:** Helsinki-NLP ONNX models via transformers.js. Models are cached to IndexedDB after first download.

**Acceptance criteria:**
- English → Spanish/French/German translation produces grammatically correct output for standard prose.
- Translated PDF opens without errors in all major viewers.
- Images, diagrams, and page numbers are preserved in their original positions.
- Text that overflows its bounding box due to expansion is resized, not clipped.

**Risk:** Medium. Layout reconstruction fidelity is the main risk — PDFs with complex multi-column or flowing text layouts will produce imperfect results. Set UX expectations: "Best results with single-column text documents." Complex layouts may need manual review.

---

### [ ] 2.3 AI summariser — dedicated tool surface

**Feasibility Note:** Feasible. Local summarization via `transformers.js` works well, but input chunking/hierarchical summarization is necessary to fit within the model's context window.

**What:** A standalone "Summarise" tool that produces a structured, length-configurable summary of the document with section-level breakdowns. Distinct from the Structured Notes tool.

**Engine:** B (transformers.js summarisation model) with Cloud Assist Mode for long documents

**Implementation steps:**

1. Add "Summarise" as a named tool in the Extract category and the Command Palette (synonyms: "summary", "tldr", "abstract", "overview").
2. For documents under ~5,000 words: run a local summarisation model (`Xenova/distilbart-cnn-12-6` at ~600MB or a quantised equivalent). Feed the full text in one pass.
3. For longer documents: implement a hierarchical summarisation strategy — summarise each section independently, then summarise the section summaries. This runs iteratively in the Pyodide worker without hitting context window limits.
4. Output levels (user-selectable):
   - **One-paragraph:** 3–5 sentence executive summary.
   - **Key points:** Bulleted list of 5–10 main findings or arguments.
   - **Section-by-section:** One paragraph per detected heading level.
5. Display the summary in the right sidebar with a copy button and a "Download as .txt" option.
6. Include page references alongside section summaries: "Section 3 (pp. 14–19): …"

**UX notes:**
- Show a word count and estimated processing time before the user starts: "This document has 12,400 words. Local summarisation: ~2 min. Use Cloud Assist for instant results."
- The summary panel should not replace the document viewer — display it in the right sidebar, not as a modal.

**Dependencies:** Summarisation model (~600MB). Cache to IndexedDB. For users who have already downloaded the chat model, a summarisation prompt sent to the local LLM is a zero-download alternative.

**Acceptance criteria:**
- One-paragraph summary of a 20-page document is produced in under 90 seconds locally.
- Section-by-section output correctly maps to document headings detected by pymupdf.
- Cloud Assist Mode is opt-in and clearly labelled.

**Risk:** Low to medium. Summarisation model quality on technical/legal/medical documents varies — set expectations as "AI-assisted draft, not a replacement for reading."

---

### [ ] 2.4 AI flashcard / quiz generator

**Feasibility Note:** Feasible. Prompting local LLMs for structured data is achievable. Exporting to Anki `.apkg` using `sql.js` and `JSZip` is a pure JS solution that avoids backend requirements.

**What:** Extract key concepts, definitions, and relationships from a PDF and produce a set of question-and-answer flashcards, exportable to Anki (`.apkg`) or CSV.

**Engine:** B (local LLM or transformers.js) + A (Anki .apkg generation via JS)

**Implementation steps:**

1. Extract document text (pymupdf or pdf.js). Identify the 20–50 most "concept-dense" passages using a simple TF-IDF heuristic to prioritise definitions, numbered lists, and heading-adjacent paragraphs.
2. Pass each passage to the local LLM (or Cloud Assist) with a structured prompt:
   ```
   Extract flashcard Q&A pairs from the following text. 
   Return JSON: [{"front": "question", "back": "answer", "page": N}]
   ```
3. Deduplicate and sort the generated cards. Display them in a review UI where users can delete, edit, or merge cards before export.
4. Generate Anki `.apkg` output: the `.apkg` format is a SQLite database inside a zip file. Use `sql.js` (SQLite compiled to WASM, already available via CDN) to build the database in-memory, then `JSZip` to produce the `.apkg` file — no server required.
5. Also offer CSV export (front, back, page) for import into Quizlet, Notion, or other tools.

**UX notes:**
- Show cards as flippable card UI elements in the preview, not just a flat list.
- Indicate the source page for each card — clicking it scrolls the viewer to that page.
- For textbooks and academic papers, offer a "Definitions only" mode that focuses specifically on term-definition patterns.

**Dependencies:** `sql.js` (~1.5MB) and `JSZip` (~100KB) for .apkg generation. Both are small and can be loaded lazily.

**Acceptance criteria:**
- A 50-page textbook chapter produces at least 20 flashcard pairs of usable quality.
- `.apkg` file imports correctly into Anki Desktop and Anki Mobile.
- CSV output imports correctly into Quizlet.
- Card review UI allows full editing before export.

**Risk:** Low for export mechanics. Card quality depends entirely on the LLM — frame as a starting point requiring user review, not a finished product.

---

### [ ] 2.5 Local AI content / AI-text detector

**Feasibility Note:** Feasible. A lightweight BERT classifier model running via `transformers.js` can process chunks of text extracted locally without too much overhead.

**What:** Scan a PDF for passages that are likely to have been generated by an AI language model. Display a per-passage probability score and a document-level estimate.

**Engine:** B (transformers.js binary classifier)

**Implementation steps:**

1. Use a fine-tuned BERT-class binary classifier for AI text detection. Suitable models: `Hello-SimpleAI/chatgpt-detector-roberta` or equivalent quantised ONNX model (~100–300MB).
2. Extract text from the document (pdf.js for Engine A path, or pymupdf for full fidelity). Chunk into ~200-word passages with 20-word overlap.
3. Run each chunk through the classifier. Return a probability score (0.0 = human, 1.0 = AI) for each chunk.
4. Aggregate to a document-level estimate: weighted average by chunk length.
5. Highlight passages above a configurable threshold (default 0.8) in the pdf.js viewer using the existing annotation highlight infrastructure.
6. Right sidebar: a list of flagged passages with their scores, clickable to navigate to the page.

**UX notes:**
- Prominently disclaim: "AI detection is probabilistic. Results should not be used as sole evidence in academic or legal proceedings."
- Allow threshold adjustment: a slider from 0.5 to 0.95, with live update of highlighted passages.
- The privacy story is the key differentiator vs cloud-based detectors: "Your document is never sent anywhere."

**Dependencies:** ONNX classifier model via transformers.js.

**Acceptance criteria:**
- GPT-4-generated text on standard topics scores above 0.8 in at least 75% of tested chunks.
- Human-written text from varied sources scores below 0.5 in at least 80% of tested chunks.
- The disclaimer is visible at all times while the tool is active — it must never be hidden or dismissable.

**Risk:** Medium. AI detection is an inherently imperfect task and false positives are real. The disclaimer is non-negotiable. Monitor for model drift as LLMs evolve.

---

## Wave 3 — Niche high-value tools (ongoing, post-Phase 3)

These features have a more specific audience but high conversion value within that audience. They can be built incrementally and are largely self-contained.

---

### [ ] 3.1 HIPAA / GDPR compliance checker

**Feasibility Note:** Highly feasible. Relies on Regex and NER (already planned via `transformers.js`). Main risk is legal/accuracy, not technical implementation.

**What:** Scan a document for data patterns that match the identifiers listed in HIPAA's Safe Harbor standard or GDPR's categories of personal data. Produce a compliance findings report with specific remediation steps.

**Engine:** A and B (regex + NER, no Pyodide required)

**HIPAA Safe Harbor identifiers to detect (18 types):**
Names, geographic data smaller than state, dates other than year, phone numbers, fax numbers, email addresses, SSNs, medical record numbers, health plan beneficiary numbers, account numbers, certificate/license numbers, VINs, device identifiers, URLs, IP addresses, biometric identifiers, full-face photographs, any unique identifying number.

**Implementation steps:**

1. Build a regex ruleset for pattern-detectable identifiers: SSN (`\d{3}-\d{2}-\d{4}`), US phone numbers, email addresses, IP addresses, US dates, URLs.
2. Use the existing NER model (Engine B) for entity-class detection: PERSON, ORG, DATE, LOCATION.
3. Map detected entities to HIPAA/GDPR categories. A PERSON entity near a DATE entity near a medical keyword ("diagnosis", "prescription", "patient") is a compound finding with higher severity.
4. Output a structured report:
   - Document-level verdict: "42 potential HIPAA identifiers found across 8 pages."
   - Per-identifier-type counts with page references.
   - Recommended action: "Redact all 42 instances before transmitting." with a one-click "Redact all" action that pre-populates the redaction tool.
5. Export the report as a PDF or JSON for compliance records.

**UX notes:**
- Prominent legal disclaimer: "This tool assists with compliance review but does not constitute legal advice. Consult a qualified attorney for compliance certification."
- In the Progressive Complexity Mode system, this tool is Professional mode only — do not surface it in Simple or Enhanced mode.

**Dependencies:** Existing NER model, no new dependencies.

**Acceptance criteria:**
- All 18 HIPAA Safe Harbor identifier types have at least one detection mechanism (regex or NER).
- False positive rate for SSN detection is below 5% on a test corpus of non-medical documents.
- "Redact all" action correctly pre-selects all flagged instances in the redaction tool.

**Risk:** Low technically. The legal disclaimer is critical — invest in clear, reviewed copy before shipping.

---

### [ ] 3.2 Contract / legal clause highlighter

**Feasibility Note:** Highly feasible. Extends the NER pattern matching pipeline used in other features. UI integration with pdf.js highlights is straightforward.

**What:** Automatically detect and label common legal clause types in contracts, flagging high-risk provisions for user review.

**Engine:** B (NER + pattern matching via transformers.js)

**Clause types to detect:**

| Clause type | Risk level | Detection approach |
|---|---|---|
| Indemnification | High | Keyword: "indemnify", "hold harmless" + surrounding context |
| Liability cap | High | Keyword: "liability shall not exceed" + currency pattern |
| IP assignment | High | Keyword: "assigns", "work for hire", "intellectual property" |
| Non-compete | High | Keyword: "non-compete", "competing business", "restraint of trade" |
| Auto-renewal | Medium | Keyword: "automatically renew", "unless terminated" |
| Termination for convenience | Medium | Keyword: "terminate for convenience", "without cause" |
| Governing law | Low | Keyword: "governed by the laws of" |
| Dispute resolution | Low | Keyword: "arbitration", "mediation", "jurisdiction" |

**Implementation steps:**

1. Extract text with positional data (pymupdf or pdf.js). Preserve paragraph boundaries.
2. Apply a multi-pass pattern matcher: keyword scan first (Engine A regex), then NER for contextual disambiguation (is "assign" used in the IP sense or a general sense?).
3. For each detected clause, annotate the source paragraph with a colour-coded highlight in the pdf.js viewer: red for High, amber for Medium, green for Low.
4. Right sidebar: a clause register listing every detection by type, with a short plain-English explanation of what that clause type typically means and why it matters.
5. Export the clause register as a CSV or JSON for legal review workflows.

**Dependencies:** Existing NER model.

**Acceptance criteria:**
- Indemnification and IP assignment clauses are correctly detected in 90%+ of standard US contract templates.
- False positive rate below 10% on general non-contract documents (the tool should not flag irrelevant documents as contract-like).
- Plain-English explanations are reviewed by a non-lawyer for clarity before shipping.

**Risk:** Low technically. Legal accuracy risk is managed by framing the tool as "clause finder" not "legal reviewer."

---

### [ ] 3.3 PDF → Anki export (standalone, without chat)

**Feasibility Note:** Highly feasible. Pure client-side JS implementation using `sql.js` and `JSZip`. Doesn't require heavy Pyodide/WASM compute.

**What:** A lightweight path to Anki export that does not require the full AI flashcard generator — useful for users who have already highlighted passages and want to export their highlights as cards.

**Engine:** A (pure JS — sql.js + JSZip)

**Implementation steps:**

1. Read existing highlights and annotations from the document (via pdf.js annotation layer).
2. For each highlight: the highlighted text becomes the card "back" (answer). The user is prompted to enter the "front" (question) or the tool auto-generates a cloze deletion by blanking a key term.
3. Build the `.apkg` using sql.js and JSZip as described in section 2.4.

**This is a 1–2 day implementation once the .apkg generation utility from 2.4 is built.**

---

## Implementation sequencing summary

| Feature | Wave | Engine | Effort | Strategic priority |
|---|---|---|---|---|
| Images → PDF | 0 | A | 1 day | High |
| Unlock PDF password | 0 | A/C | 1 day | High |
| Document integrity hash | 0 | A | 0.5 days | High |
| Privacy risk score | 0 | A/B | 3 days | Very high |
| PDF → Excel UX | 1 | C | 2 days | High |
| PDF → PPTX | 1 | C | 3 days | Medium |
| Repair PDF | 1 | C | 2 days | Medium |
| TXT/Markdown → PDF | 1 | A | 2 days | Medium |
| AI chat with PDF | 2 | B + LLM | 3–4 weeks | Very high |
| PDF translate | 2 | B + C | 2 weeks | High |
| AI summariser | 2 | B | 1 week | High |
| AI flashcard generator | 2 | B + A | 1 week | Medium |
| AI content detector | 2 | B | 1 week | Medium |
| HIPAA/GDPR checker | 3 | A + B | 2 weeks | High (enterprise) |
| Contract clause highlighter | 3 | B | 2 weeks | High (legal) |
| Anki export (standalone) | 3 | A | 1 day | Low |

---

## Cross-cutting concerns

**Memory budget for Wave 2:** Running the chat LLM (~2.2GB), embedding model (~22MB), and Pyodide (~200MB) simultaneously will push close to or beyond available WASM memory on some machines. Implement an explicit memory budget check before loading any Wave 2 model: query `navigator.deviceMemory` and display a warning if the device reports less than 8GB RAM. Provide a clearly labelled Cloud Assist fallback for every AI feature — this is non-negotiable.

**IndexedDB model cache management:** By the end of Wave 2, the cached model weights in IndexedDB could total 3–4GB across the chat model, embedding model, summarisation model, and translation models. The Storage Transparency Model (Section 2 of the existing plan) must be extended to list each cached model individually with its size, last-used date, and a delete button. Users on constrained devices must be able to clear individual models without wiping all local data.

**Cloud Assist Mode governance:** Every AI feature in Wave 2 and Wave 3 that has a Cloud Assist fallback must conform to the strict opt-in protocol defined in section 7.2 of the existing plan. The visual distinction between local and cloud processing must be maintained consistently across all tools — this is a trust and brand requirement, not just a UX nicety. Consider a shared `<CloudAssistBanner>` component that is required (not optional) for any feature that can route to a remote API.

**Legal disclaimers:** The HIPAA checker, contract clause highlighter, and AI content detector each require explicitly reviewed legal disclaimers before shipping. Engage a legal reviewer for the copy on these three features specifically. Do not ship them with placeholder disclaimer text.

---

*Last updated: implementation plan v1.0 — based on competitive analysis against iLovePDF, Smallpdf, ChatPDF, Canva, and CutePDF.*
