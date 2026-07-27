# Automated Line Tracing Implementation Plan

This document outlines the proposed implementation for adding an **Automated Line Tracing** utility to the project. The goal is to detect explicit vector lines (and potentially rasterized lines) within PDF documents to drastically improve table detection, layout analysis, and text formatting extraction (like underlines).

## 1. Core Concept

Currently, the layout analysis relies on text bounding-box heuristics (spatial clustering via `liteparseEngine.ts`). By integrating explicit line tracing, we can feed geometric line and rectangle data into the layout engine.

PyMuPDF (running in our Pyodide WebWorker) provides excellent capabilities for extracting vector graphics (drawings). We will leverage `fitz.Page.get_drawings()` to extract explicitly drawn lines and rectangles, and pass this data to the frontend for hybrid layout analysis alongside LiteParse text items.

## 2. Architecture & Components

### A. The Extraction Layer (Pyodide WebWorker)
**File to modify:** `src/workers/pyodideWorker.ts`

PyMuPDF allows extracting vector paths. We need to expose a new command (e.g., `EXTRACT_LINES`) to the worker.

1.  **Add a new action type:**
    ```typescript
    export type PyodideWorkerAction =
      | { type: 'EXTRACT_IMAGES'; file: ArrayBuffer; pageNumber: number }
      | { type: 'EXTRACT_LINES'; file: ArrayBuffer; pageNumber: number }; // NEW
    ```

2.  **Implement the Python extraction logic:**
    Within the Pyodide worker, write a Python snippet that opens the document, goes to the specified page, and calls `page.get_drawings()`.

    The Python code should filter the drawings for horizontal and vertical lines/rectangles, extracting their bounding boxes (`rect`).
    ```python
    import fitz
    import json

    def extract_lines(doc_bytes, page_number):
        doc = fitz.open(stream=doc_bytes, filetype="pdf")
        page = doc[page_number - 1]
        paths = page.get_drawings()

        lines = []
        for path in paths:
            # Look at bounding boxes of paths
            rect = path["rect"]
            # Basic filtering for horizontal/vertical lines or thin rectangles
            is_horizontal = rect.height < 5 and rect.width > 20
            is_vertical = rect.width < 5 and rect.height > 20

            if is_horizontal or is_vertical:
                lines.append({
                    "x0": rect.x0, "y0": rect.y0,
                    "x1": rect.x1, "y1": rect.y1,
                    "type": "horizontal" if is_horizontal else "vertical"
                })
        return json.dumps(lines)
    ```

3.  **Return the parsed geometric data** to the main thread.

### B. The Integration Layer (Layout Engine)
**File to modify:** `src/lib/liteparseEngine.ts`

Currently, `formatTableFromItems` and `analyzeLayoutLiteparse` rely purely on text gaps. We will update these to accept optional line data.

1.  **Define a `LineItem` interface:**
    ```typescript
    export interface LineItem {
        x0: number;
        y0: number;
        x1: number;
        y1: number;
        type: 'horizontal' | 'vertical';
    }
    ```

2.  **Update `formatTableFromItems`:**
    Modify the table heuristic function to accept an array of `LineItem`s.
    If `LineItem`s are provided:
    *   Use horizontal lines to definitively mark row boundaries.
    *   Use vertical lines to definitively mark column boundaries.
    *   Snap text items into the resulting grid explicitly, falling back to spatial clustering only for areas without drawn borders (borderless tables).

3.  **Enhance Text Formatting (Underlines & Strikethroughs):**
    Add a pre-processing pass in `extractMarkdownLiteparse` or `formatMarkdownFromItems`:
    *   Iterate through horizontal lines.
    *   If a line's `y` coordinate overlaps with a text item's baseline and spans its width, classify it as an underline.
    *   If a line's `y` coordinate intersects the middle of a text item's bounding box, classify it as a strikethrough.
    *   Wrap the respective text item's content in `<u>` or `<s>` before processing the markdown.

### C. The UI / Trigger Layer
**Files to modify:** `src/components/workspace/DocumentCard.tsx`, `src/components/modals/InteractiveCopyModal.tsx` (and potentially others)

1.  **State Management:**
    When initiating a table extraction or markdown extraction that requires high accuracy, the UI should dispatch both a LiteParse text extraction request AND a Pyodide line extraction request in parallel.

2.  **Interactive Overlays:**
    For debugging and user interaction (e.g., in `InteractiveCopyModal`), we can render the detected lines as absolutely positioned `<div>`s or draw them onto a transparent `<canvas>` over the PDF page. This allows users to see the structure the engine has detected.

## 3. Fallback for Scanned Documents (Raster Images)

The PyMuPDF approach works for native vector PDFs. For scanned documents (where lines are part of the image pixels), vector extraction will return nothing.

**Future enhancement:**
If PyMuPDF returns no lines but OCR is triggered, we can utilize `opencv.js` (OpenCV for Web) to perform image processing on the extracted canvas data.
1.  Apply Grayscale & Thresholding.
2.  Use a Hough Line Transform (`cv.HoughLinesP`) to detect line segments in the raster image.
3.  Map these pixel coordinates back to PDF points and pass them to `liteparseEngine.ts` in the exact same `LineItem` format.

## 4. Summary of Work

1.  **Pyodide Worker Update:** Add `EXTRACT_LINES` action using `fitz.Page.get_drawings()`.
2.  **Data Models:** Create `LineItem` types.
3.  **Layout Engine Update:** Refactor `liteparseEngine.ts` to utilize line intersections for tables and text formatting.
4.  **UI Coordination:** Ensure front-end components orchestrate the dual data fetching (Text + Lines) before invoking the formatting logic.
