# Automated Line Tracing Implementation Plan

This document outlines the proposed implementation for adding an **Automated Line Tracing** utility to the project. The goal is to detect explicit vector lines (and potentially rasterized lines) within PDF documents to drastically improve table detection, layout analysis, and text formatting extraction (like underlines).

## 1. Core Concept

Currently, the layout analysis relies on text bounding-box heuristics (spatial clustering via `liteparseEngine.ts`). By integrating explicit line tracing, we can feed geometric line and rectangle data into the layout engine.

PyMuPDF (running in our Pyodide WebWorker) provides excellent capabilities for extracting vector graphics (drawings). We will leverage `fitz.Page.get_drawings()` to extract explicitly drawn lines and rectangles, and pass this data to the frontend for hybrid layout analysis alongside LiteParse text items.

## 2. Architecture & Components

### A. The Extraction Layer (Pyodide WebWorker)
**File to modify:** `src/workers/pyodideWorker.ts`

PyMuPDF allows extracting vector paths. We need to expose a new command (e.g., `EXTRACT_LINES`) to the worker. Note that the worker already has an `EXTRACT_TABLES` action; `EXTRACT_LINES` is intended to be a separate, more primitive extraction pipeline that feeds raw geometric line data back to the frontend's layout engine (which can then run `formatTableFromItems`), rather than replacing the worker's native `EXTRACT_TABLES` command.

1.  **Add a new action type and response contract:**
    The worker request message should accept an `EXTRACT_LINES` command, and its corresponding response shape should return an array of `LineItem` objects.
    ```typescript
    // Request type (to be added to PyodideWorkerMessage)
    { type: 'EXTRACT_LINES'; pdfBytes: Uint8Array; pageNum: number }

    // Response contract (returned via PyodideWorkerResponse)
    { type: 'RESULT'; jobId: string; result: LineItem[] }
    ```

2.  **Implement the Python extraction logic:**
    Within the Pyodide worker, write a Python snippet that opens the document, goes to the specified page, and calls `page.get_drawings()`.

    **Curve/diagonal handling:** The `get_drawings()` function returns arcs, Bézier curves, and diagonal lines. For the purpose of table detection and layout analysis, all non-axis-aligned paths (curves, diagonals, complex shapes) must be filtered out and dropped entirely. The Python code should only extract the bounding boxes (`rect`) of horizontal and vertical straight lines or axis-aligned rectangles.

3.  **Failure mode:**
    If `get_drawings()` throws an error or times out on a malformed PDF, the worker must catch the exception and return a standard `ERROR` message. The frontend must be designed to gracefully fall back to spatial clustering (no UI crash) when this occurs.

### B. The Integration Layer (Layout Engine)
**File to modify:** `src/lib/liteparseEngine.ts`

Currently, `formatTableFromItems` and `analyzeLayoutLiteparse` rely purely on text gaps. We will update these to accept optional line data.

1.  **Result-consumption wiring & Caching:**
    Line extraction will be invoked on demand per page (e.g., requested by `analyzeLayoutLiteparse` when analyzing a full document, or by the Magic Copy tool for a specific region). To avoid redundant Pyodide round-trips, the returned `LineItem[]` must be cached per page alongside the existing extracted text and LiteParse items in a central store or module-level cache.

2.  **Define a `LineItem` interface:**
    ```typescript
    export interface LineItem {
        x0: number;
        y0: number;
        x1: number;
        y1: number;
        type: 'horizontal' | 'vertical';
    }
    ```

3.  **Pre-processing (Deduplication & Validation):**
    *   **Handle partial/broken rulings:** `get_drawings()` often returns messy paths (overlapping lines, segments split by merged cells). We must cluster near-duplicate lines. Concrete thresholds to use: a deduplication tolerance of `DEDUPE_THRESHOLD_PX = 2.0`, and a requirement that a line spans at least a minimum fraction of the table's bounding box (`MIN_RULE_FRACTION = 0.75`) before treating it as a hard grid boundary.
    *   **Coordinate transform ownership:** Before wiring into logic, ensure PyMuPDF coordinates (top-left) align perfectly with the LiteParse/pdf.js coordinate system (bottom-left). This coordinate mapping and transformation logic should be centralized and owned by `src/lib/liteparseEngine.ts`.

4.  **Update `formatTableFromItems` (Per-Axis Hybrid Mode):**
    Modify the table heuristic function to accept an array of `LineItem`s.
    Crucially, evaluate rows and columns **independently**:
    ```typescript
    rowBoundaries = horizontalLines.length ? fromLines(horizontalLines) : fromSpatialClustering(items);
    colBoundaries = verticalLines.length ? fromLines(verticalLines)   : fromOverlapClustering(items);
    ```
    This ensures tables with only vertical rules (or only horizontal rules) still benefit from geometry on the ruled axis, while falling back to spatial clustering for the unruled axis.
    *(Note: The existing row-merge heuristic for wrapped cells remains necessary and operates alongside this logic).*

5.  **Confidence, Fallback Signal & Feature Flag:**
    Compute both the geometric grid and the spatial-clustering grid where feasible. Log or flag if they disagree above a certain threshold to prevent false-positive "lines" (like decorative borders) from silently destroying table extraction.
    Additionally, implement a feature flag (e.g., `enableLineTracing` in `src/store/uiStore.ts`) to act as a kill switch. If line tracing regresses existing table extraction in production, this toggle allows users to disable the hybrid heuristic and fall back entirely to purely spatial clustering.

6.  **Enhance Text Formatting (Underlines & Strikethroughs):**
    Add a pre-processing pass in `extractMarkdownLiteparse` or `formatMarkdownFromItems`:
    *   Iterate through horizontal lines.
    *   If a line's `y` coordinate overlaps with a text item's baseline and spans its width, classify it as an underline.
    *   If a line's `y` coordinate intersects the middle of a text item's bounding box, classify it as a strikethrough.

### C. The UI / Trigger Layer
**Files to modify:** `src/components/pdf/DocumentCard.tsx`, `src/components/modals/InteractiveCopyModal.tsx`

1.  **Coordinate Debugging (Crucial First Step):**
    Build a visual debug overlay in `InteractiveCopyModal` *first*. Render the extracted lines as absolutely positioned `<div>`s or draw them on a `<canvas>` to visually verify coordinate mapping against real PDFs *before* touching extraction logic.

2.  **Performance Considerations:**
    Running Pyodide `get_drawings()` in parallel per page adds latency. Benchmark this on multi-page documents before enabling it by default on latency-sensitive interactive tools (like Magic Copy).

## 3. Test Plan

To ensure the robustness of the automated line tracing integration and prevent future regressions, the following testing strategies must be implemented:

1.  **Unit Tests (Deduplication & Clustering):**
    *   Write unit tests for the line clustering algorithm (`src/lib/liteparseEngine.ts`), providing mocked `LineItem` arrays with slight coordinate variations (within `DEDUPE_THRESHOLD_PX`) to verify they correctly merge into single unified boundaries.
    *   Verify that partial grid lines spanning less than `MIN_RULE_FRACTION` are correctly discarded or ignored.

2.  **Unit Tests (Formatting Classifiers):**
    *   Write tests for the underline and strikethrough classification logic, passing mocked LiteParse text bounding boxes and synthetic `LineItem` overlays.
    *   Test edge cases, such as lines that fall *just outside* the bounding box intersection logic.

3.  **Regression Tests (Table Extraction):**
    *   Add mocked table parsing tests where spatial clustering fails (e.g., due to dense or sparsely aligned text) but explicit geometric boundaries (provided via mocked PyMuPDF responses) correctly define the columns/rows.

## 4. Fallback for Scanned Documents (Raster Images)

The PyMuPDF approach works for native vector PDFs. For scanned documents, vector extraction will return nothing.

**Future enhancement (Deferred):**
If PyMuPDF returns no lines but OCR is triggered, we can utilize `opencv.js` (OpenCV for Web) to perform image processing on the extracted canvas data via Grayscale, Thresholding, and Hough Line Transforms.

## 5. Rollout Sequencing

To de-risk the feature, it should be shipped in this specific order:
1.  **[x] Borderless-table row-merge heuristic:** (Fix existing bugs cheaply using spatial text clustering).
2.  **[ ] `EXTRACT_LINES` + Visual Overlay:** (Validate PyMuPDF coordinates on the frontend; no extraction logic changes yet).
3.  **[ ] Per-axis Hybrid Boundary Logic:** (Implement the core geometry + spatial fallback in `formatTableFromItems`).
4.  **[ ] Text Formatting Pass:** (Extract underlines and strikethroughs).
5.  **[ ] Raster/Hough-line fallback:** (Deferred - highest effort, smallest near-term payoff).
