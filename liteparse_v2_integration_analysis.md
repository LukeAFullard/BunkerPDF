# LiteParse 2.1 Integration Analysis & Recommendations

## Overview
LiteParse 2.1 (and the current version 2.3.0 in our project) introduced several significant improvements over earlier versions, moving towards a "model-free, pdf-to-markdown pipeline" that achieves top scores on standard benchmarks like `ParseBench` and `opendataloader-bench`.

## Key Findings from Diagnostic & Code Review

### 1. Native Markdown & Table Detection
*   **Current State**: `extractMarkdownLiteparse` already uses `outputFormat: 'markdown'`. However, `extractTablesLiteparse` uses a custom `formatTableFromItems` heuristic which manually groups `textItems` into grids based on coordinate tolerances.
*   **Observation**: Diagnostic tests show that LiteParse's native Markdown engine is highly accurate at identifying tabular structures and headers natively from the PDF stream using its "Grid Projection Algorithm".
*   **Recommendation**: We should update table-specific extraction to leverage the native Markdown engine's output for higher fidelity, especially for complex layouts that our current `rowTolerance` approach might miss.

### 2. Native Link Extraction
*   **Current State**: `InteractiveAutoLinkerModal` uses a client-side regex (`/(https?:\/\/[^\s]+|...)/i`) to find links within the extracted text items.
*   **Observation**: LiteParse now supports an `extractLinks: true` configuration which natively extracts PDF URI/Link annotations. While it may not catch every plain-text URL (which regex does), it provides "true" document links that are guaranteed to be correct and often have better bounding boxes.
*   **Recommendation**: Integrate native link extraction into `InteractiveAutoLinkerModal` as a primary source of links, using regex only as a fallback for plain text.

### 3. Regional "Magic Copy"
*   **Current State**: "Magic Copy" uses `formatParagraphFromItems` and `formatMarkdownFromItems`. These are custom implementations that attempt to recreate LiteParse's internal logic for small regions.
*   **Observation**: While LiteParse parses whole documents, its native Markdown output is the "Gold Standard" for how text should be flowed. Our custom heuristics are good but can sometimes misidentify header levels or list bullets that the native engine handles correctly.
*   **Recommendation**: Keep the custom regional heuristics for "Magic Copy" (as LiteParse doesn't offer a sub-region parse API yet), but update them to more closely align with the "Grid Projection" logic described in the LiteParse 2.1 blog post.

## Integration Recommendations

### I. Update `liteparseEngine.ts`
*   **Table Extraction**: Modify `extractTablesLiteparse` to optionally use the native Markdown engine's output instead of the manual grid builder when the user requests Markdown format.
*   **Link Data**: Expose a new function `extractLinksLiteparse` that returns native PDF link annotations extracted by the engine.

### II. Enhance `InteractiveAutoLinkerModal`
*   **Hybrid Detection**: Change the linker to first use the native link extraction data from LiteParse. This will improve accuracy for documents with embedded links.
*   **Bounding Box Accuracy**: Use the native engine's bounding boxes for links to ensure perfectly aligned clickable overlays.

### III. Refine Custom Heuristics
*   **Header Detection**: Update `formatMarkdownFromItems` to use a more sophisticated header detection logic that accounts for relative font sizes more similar to LiteParse's native engine.

## Conclusion
Integrating these LiteParse 2.1 additions will significantly improve the accuracy of our document analysis tools, particularly for tables and links. By relying more on the upstream engine's native capabilities, we also reduce the maintenance burden of our custom heuristics.

**Proposed Action**: Proceed with a PR to integrate native link extraction and refine table extraction logic.
