# Magic Table: Ground-Up Rebuild Spec

**Target repo:** `LukeAFullard/BunkerPDF`
**Primary file today:** `src/lib/liteparseEngine.ts` (`formatTableFromItems`, `extractTablesLiteparse`)
**Audience:** coding agent implementing this end-to-end
**Goal:** replace the current single-pass, position-only heuristic table
extractor with a layered, style-aware, confidence-scored pipeline that stays
100% local (no network calls), degrades gracefully, and never silently
ships a wrong answer.

This document is self-contained. Read all of it before writing code —
later steps depend on data structures introduced in earlier steps.

---

## 0. Why a rebuild, and why *not* a bigger rewrite than this

Three real documents each broke the current extractor in a different way:

1. **Noisy ruled lines → spurious empty columns.** Decorative/partial
   vertical rules produced extra column boundaries; the only cleanup pass
   for this was gated off whenever line-tracing was used.
2. **Spanning label rows → all columns collapse into one.** A single wide
   text item (e.g. a "Case 1 (natural)" section label) bridges multiple
   real columns' x-ranges; the column-interval builder merges transitively
   across all rows with no concept of "this row doesn't define columns."
3. **Colored header bands → merged into data rows, plus spurious blank
   rows.** Section headers rendered as filled background bands (no stroked
   line) get swallowed into the row below by the "wrapped line" merge
   heuristic, while unrelated small gaps get promoted into extra empty rows.

All three share a root cause: **structure is inferred purely from text x/y
position and gaps.** No color, font weight, or fill information is used,
even though it's already available (see §2). This spec fixes that by
splitting today's single 2000-line function into a real pipeline, and by
finally consuming the metadata that's already sitting unused in every
parsed page.

This is a full pipeline replacement for `formatTableFromItems`, but it is
**not** a rewrite of the surrounding app: PDF loading, LiteParse
integration, UI, and output formatting (Markdown/CSV/HTML string
generation) all stay. Build the new pipeline behind the same function
signature so it's a drop-in replacement.

---

## 1. Package Inventory — what's already available and its role

| Package | Already used for | Role in the new pipeline |
|---|---|---|
| `@llamaindex/liteparse-wasm` | The actual PDF parser (`LiteParse` class, `engine.parse(bytes)`) — **not raw pdfjs-dist**. Returns text items, and optionally vector graphics + text metadata. | **Primary primitive source.** Extended to request text metadata for tables (currently *not* requested — see §2.1) and audited for fill/rect support (§2.2). |
| `pdfjs-dist` | PDF loading/rendering elsewhere in the app (viewer, page thumbnails). | Used only for **rendering a table's bounding box to a canvas image** when Tier 2 (vision fallback) is needed — see §6. |
| `@huggingface/transformers` (Xenova/transformers.js) | Already running ONNX models fully client-side in workers: TrOCR (`handwritingWorker.ts`), BERT-NER (`nerWorker.ts`), MiniLM embeddings (`searchWorker.ts`). | **Tier 2 fallback engine.** New `tableStructureWorker.ts` loads `Xenova/table-transformer-structure-recognition` (Microsoft's Table Transformer, pre-converted to ONNX, ~30 MB quantized, MIT licensed — confirmed compatible, see §6.1) the same way the existing workers load theirs. |
| `tesseract.js` | OCR pre-processing for scanned PDFs (`ocrEngine.ts`), already wired into `preprocessWithOcr()` before LiteParse runs. | Unchanged. Scanned tables still go through OCR first, then the same pipeline below. |
| `zustand` | App state (`useUIStore`). | New: store a `tableExtractionSettings` slice (Tier 2 enable/disable, confidence threshold) — see §7. |
| *(none — new)* | — | No new dependency is required for Tier 1. Tier 2 needs one ONNX table-structure model added to the existing transformers.js model set (see §6.1). |

**Key implication:** this rebuild needs **zero new packages** for the
biggest wins (Tier 1). Tier 2 needs exactly one new ONNX model file, loaded
through infrastructure you already have.

---

## 2. Step 1 — Stop throwing away metadata LiteParse already computes

### 2.1 Enable text metadata for the table extraction path

`extractTablesLiteparse()` currently requests vector graphics but **not**
text metadata:

```ts
// CURRENT — src/lib/liteparseEngine.ts, extractTablesLiteparse()
const engine = await getConfiguredLiteParse({ outputFormat: "json", extractVectorGraphics: true });
```

Elsewhere in the same file (the general Markdown formatter), `extractTextMetadata: true`
is requested, and text items come back with `item.fillColor` (text color)
and `item.fontName` (already used to sniff bold/italic/mono via substring
checks). None of that reaches the table path today because the flag is
never set there.

**Fix — request both together for tables:**

```ts
// NEW
const engine = await getConfiguredLiteParse({
  outputFormat: "json",
  extractVectorGraphics: true,
  extractTextMetadata: true,
});
```

This is a one-line change and immediately makes `item.fillColor` and
`item.fontName` available to every text item passed into the table
pipeline — no new parsing work required.

### 2.2 Audit whether LiteParse exposes filled rectangles, not just stroked lines

The current vector-graphics mapping only reads `vectorGraphics.lines`:

```ts
// CURRENT
const vectorGraphics = page.vectorGraphics;
if (vectorGraphics && vectorGraphics.lines) {
  vectorGraphics.lines.forEach((l: any) => { /* map strokes only */ });
}
```

Colored header bands (like "Standard Charges" / "Other Permits" in the
sample PDFs) are **filled rectangles**, not stroked lines. Before writing
any header-band detection logic, confirm what LiteParse's JSON actually
contains.

**Action — run this once against each of the 3 known problem PDFs and log
the result:**

```ts
const engine = await getConfiguredLiteParse({
  outputFormat: "json",
  extractVectorGraphics: true,
  extractTextMetadata: true,
});
const result = await engine.parse(bytes);
for (const page of result.pages) {
  console.log("vectorGraphics keys:", Object.keys(page.vectorGraphics ?? {}));
  console.log("sample line:", page.vectorGraphics?.lines?.[0]);
  console.log("sample rect/fill (if present):", page.vectorGraphics?.rects?.[0] ?? page.vectorGraphics?.fills?.[0]);
  console.log("sample textItem:", page.textItems?.[0]);
}
```

- **If a `rects`/`fills` array with fill color exists:** use it directly for
  header-band detection in §4.2 — this is the strongest possible signal
  (exact bounding box + exact fill color).
- **If it does not exist:** fall back to inferring bands from `item.fillColor`
  on the text itself (light/white text color is a strong proxy for "sits on
  a dark fill") — see the fallback branch in §4.2. Either way, do not block
  the rest of this spec on this — implement the fallback branch regardless,
  and swap in the stronger signal later if it's available.

---

## 3. New Type Definitions

Create `src/lib/tableTypes.ts`:

```ts
export interface StyledTextItem {
  text: string;
  x: number; y: number; width: number; height: number;
  fontSize?: number;
  fontName?: string;
  fillColor?: string;      // text color, from LiteParse extractTextMetadata
  isBold: boolean;         // derived from fontName
  isItalic: boolean;       // derived from fontName
}

export interface StyledLine {
  x0: number; y0: number; x1: number; y1: number;
  type: 'horizontal' | 'vertical';
  strokeWidth?: number;
  opacity?: number;
  color?: string;
}

export interface StyledRect {
  x: number; y: number; width: number; height: number;
  fillColor?: string;
  opacity?: number;
}

export interface TablePrimitives {
  textItems: StyledTextItem[];
  lines: StyledLine[];
  rects: StyledRect[];       // may be empty if LiteParse doesn't expose fills (see §2.2)
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export interface TableRow {
  items: StyledTextItem[];
  y: number;
  isHeaderBand: boolean;    // protected — never merge/split like normal data rows
}

export interface TableGridCell {
  text: string;
  colSpan: number;
  rowSpan: number;
}

export interface RecognizedTable {
  grid: TableGridCell[][];
  confidence: number;        // 0–1, see §5
  confidenceReasons: string[]; // human-readable, surfaced in UI
  source: 'geometry' | 'vision-fallback';
}
```

---

## 4. Step 2 — Tier 1: Style-Aware Geometric Structure Recognition

Restructure `formatTableFromItems` into discrete functions, each doing one
job. Keep the final grid→string formatting code (Markdown/CSV/HTML/LaTeX)
completely unchanged — only the part that builds `grid` changes.

### 4.1 Build primitives (replaces ad-hoc destructuring at the top of the old function)

```ts
function buildPrimitives(
  rawTextItems: any[],
  rawVectorGraphics: any
): TablePrimitives {
  const textItems: StyledTextItem[] = rawTextItems.map(it => {
    const fontNameLower = (it.fontName ?? "").toLowerCase();
    return {
      text: it.text,
      x: it.x, y: it.y, width: it.width, height: it.height,
      fontSize: it.fontSize,
      fontName: it.fontName,
      fillColor: it.fillColor,
      isBold: fontNameLower.includes("bold"),
      isItalic: fontNameLower.includes("italic") || fontNameLower.includes("oblique"),
    };
  });

  const lines: StyledLine[] = (rawVectorGraphics?.lines ?? [])
    .map((l: any) => {
      const x0 = Math.min(l.x1, l.x2), x1 = Math.max(l.x1, l.x2);
      const y0 = Math.min(l.y1, l.y2), y1 = Math.max(l.y1, l.y2);
      const color = l.strokeColor ?? l.color;
      const opacity = l.opacity ?? l.strokeAlpha ?? 1;
      if (opacity < 0.05 || isBackgroundColor(color)) return null;
      if (Math.abs(y0 - y1) < 2) return { x0, y0: (y0+y1)/2, x1, y1: (y0+y1)/2, type: 'horizontal' as const, color, opacity };
      if (Math.abs(x0 - x1) < 2) return { x0: (x0+x1)/2, y0, x1: (x0+x1)/2, y1, type: 'vertical' as const, color, opacity };
      return null;
    })
    .filter((l): l is StyledLine => l !== null);

  // See §2.2 — map real fills if available, else leave empty (fallback
  // branch in §4.2 covers this case using text fillColor instead).
  const rects: StyledRect[] = (rawVectorGraphics?.rects ?? rawVectorGraphics?.fills ?? [])
    .map((r: any) => ({ x: r.x, y: r.y, width: r.width, height: r.height, fillColor: r.fillColor ?? r.color, opacity: r.opacity }))
    .filter((r: StyledRect) => !isBackgroundColor(r.fillColor));

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const it of textItems) {
    minX = Math.min(minX, it.x); maxX = Math.max(maxX, it.x + it.width);
    minY = Math.min(minY, it.y); maxY = Math.max(maxY, it.y + it.height);
  }

  return { textItems, lines, rects, bounds: { minX, maxX, minY, maxY } };
}
```

### 4.2 Classify header/band rows BEFORE row-boundary or merge logic runs

This is the fix for Bug #3 (colored bands merged into data rows / spurious
blank rows). Header-band rows are identified up front and marked
`isHeaderBand: true` — every later step (wrapped-line merge, row-boundary
fallback insertion) must check this flag and refuse to merge or split
across a header-band row.

```ts
const HEADER_BAND_WIDTH_FRACTION = 0.8; // rect/text spans >=80% of table width

function classifyHeaderBands(
  rows: { items: StyledTextItem[]; y: number }[],
  rects: StyledRect[],
  bounds: TablePrimitives['bounds']
): TableRow[] {
  const tableWidth = bounds.maxX - bounds.minX;

  return rows.map(row => {
    // Strong signal: a fill rect behind this row spans most of the table width.
    const rowTop = row.y;
    const rowBottom = row.y + Math.max(...row.items.map(it => it.height), 12);
    const coveringRect = rects.find(r =>
      r.y <= rowTop + 2 && (r.y + r.height) >= rowBottom - 2 &&
      r.width / tableWidth >= HEADER_BAND_WIDTH_FRACTION
    );

    // Fallback signal (used when no rects are available — see §2.2):
    // a single wide, bold and/or light-colored text item spanning most
    // of the table width, with no other items in the row.
    const widest = Math.max(...row.items.map(it => it.width));
    const isWideSingleItem = row.items.length === 1 && widest / tableWidth >= HEADER_BAND_WIDTH_FRACTION;
    const looksLikeHeaderStyle = row.items.some(it => it.isBold) ||
      row.items.some(it => it.fillColor && isLightColor(it.fillColor));

    const isHeaderBand = !!coveringRect || (isWideSingleItem && looksLikeHeaderStyle);

    return { ...row, isHeaderBand };
  });
}

// Inverse of the existing isBackgroundColor() — true for light/white-ish colors,
// used as a proxy for "this text sits on a dark filled band".
function isLightColor(color: string): boolean {
  return isBackgroundColor(color); // reuse existing helper, name it what it's used for here
}
```

### 4.3 Row boundary detection — protect header bands, stop over-inserting blank rows

Keep the existing line-traced + spatial-fallback logic, but add two guards:

```ts
function mergeWrappedRows(rows: TableRow[], explicitLines: StyledLine[], useLines: boolean): TableRow[] {
  const gaps: number[] = [];
  for (let i = 0; i < rows.length - 1; i++) gaps.push(rows[i+1].y - rows[i].y);
  gaps.sort((a,b) => a-b);
  const medianGap = gaps.length > 0 ? gaps[Math.floor(gaps.length/2)] : 20;

  let mergedAny = true;
  while (mergedAny) {
    mergedAny = false;
    for (let i = 0; i < rows.length - 1; i++) {
      const rowA = rows[i], rowB = rows[i+1];

      // GUARD (new): never merge across a header-band row in either direction.
      if (rowA.isHeaderBand || rowB.isHeaderBand) continue;

      const gap = rowB.y - rowA.y;
      let hasSeparatingLine = false;
      if (useLines) {
        const midY = (rowA.y + rowB.y) / 2;
        hasSeparatingLine = explicitLines.some(l => l.type === 'horizontal' && Math.abs(l.y0 - midY) < gap/2 + 5);
      }
      if (hasSeparatingLine || !(gap < medianGap * 0.8 || gap <= 15)) continue;

      // GUARD (new): a spanning row (single wide item) should not absorb,
      // or be absorbed by, a genuinely multi-column row — that's the
      // signature of a section label bridging real columns, not a wrapped
      // continuation of the same cell. Wrapped continuations should have
      // a SIMILAR item count/structure to the row they're merging into.
      const isSpanningRow = (r: TableRow) => r.items.length === 1 && (r.items[0].width / (r.items[0].width)) ; // see note below
      const structurallyCompatible = Math.abs(rowA.items.length - rowB.items.length) <= 1;

      let allSubset = true;
      for (const itemB of rowB.items) {
        const overlaps = rowA.items.some(itemA =>
          itemB.x <= itemA.x + itemA.width + 5 && itemB.x + itemB.width >= itemA.x - 5
        );
        if (!overlaps) { allSubset = false; break; }
      }

      if (allSubset && structurallyCompatible) {
        rowA.items.push(...rowB.items);
        rows.splice(i + 1, 1);
        mergedAny = true;
        break;
      }
    }
  }
  return rows;
}
```

> **Note on `isSpanningRow` above:** the point isn't the specific
> expression — it's the principle that a wrapped-line merge must check
> "are these two rows structurally similar (roughly the same column
> count)?" in addition to x-overlap, not x-overlap alone. A 1-item wide
> label/header row merging into a 2-item data row is exactly the failure
> mode described in §0 (bug #3); require comparable item counts
> (`structurallyCompatible`) before allowing the merge.

For the "spurious blank row" half of Bug #3: the local-fallback boundary
insertion (existing `nearGeometric` check) should require **some minimum
text evidence** before inserting a boundary, not just "no traced line
nearby":

```ts
// In the existing fallback-boundary insertion loop, add a minimum-gap check:
const MIN_MEANINGFUL_GAP = 8; // px — gaps smaller than this are noise, not row breaks
if (!nearGeometric && (nextTop - currentBottom) >= MIN_MEANINGFUL_GAP) {
    mergedBoundaries.push(midY);
}
```

### 4.4 Column boundary detection — dense-row inference (fixes Bug #2)

```ts
const SPAN_WIDTH_FRACTION = 0.6;

function inferColumnsFromDenseRows(rows: TableRow[], bounds: TablePrimitives['bounds']) {
  const tableWidth = bounds.maxX - bounds.minX;

  const isSpanningCandidate = (row: TableRow) => {
    if (row.isHeaderBand) return true;
    if (row.items.length <= 1) return true;
    const widest = Math.max(...row.items.map(it => it.width));
    return tableWidth > 0 && widest / tableWidth > SPAN_WIDTH_FRACTION;
  };

  let denseRows = rows.filter(r => !isSpanningCandidate(r));
  if (denseRows.length === 0) denseRows = rows; // pathological fallback

  const intervals = denseRows
    .flatMap(row => row.items.map(it => ({ start: it.x, end: it.x + it.width })))
    .sort((a, b) => a.start - b.start);

  const columns: { start: number; end: number }[] = [];
  if (intervals.length > 0) {
    let current = { ...intervals[0] };
    for (let i = 1; i < intervals.length; i++) {
      const next = intervals[i];
      if (next.start <= current.end + 5) {
        current.end = Math.max(current.end, next.end);
      } else {
        columns.push(current);
        current = { ...next };
      }
    }
    columns.push(current);
  }
  return columns;
}
```

(Item-to-column assignment, including multi-column span detection for
header-band rows, reuses the existing loop in `formatTableFromItems`
unchanged — it already computes `span = (endIndex - startIndex) + 1`
correctly once real columns exist to span across.)

### 4.5 Unconditional empty-column cleanup (fixes Bug #1)

Run after the grid is built, for **both** line-traced and spatial paths:

```ts
function dropWhollyEmptyColumns(grid: TableGridCell[][]): TableGridCell[][] {
  if (grid.length === 0 || grid[0].length <= 1) return grid;
  const numCols = grid[0].length;
  const emptyCols = [];
  for (let c = 0; c < numCols; c++) {
    if (grid.every(row => row[c].text === '')) emptyCols.push(c);
  }
  const toRemove = emptyCols.slice(0, numCols - 1); // always keep >=1 column
  for (let i = toRemove.length - 1; i >= 0; i--) {
    const c = toRemove[i];
    grid.forEach(row => row.splice(c, 1));
  }
  return grid;
}
```

---

## 5. Step 3 — Confidence Scoring

After Tier 1 produces a grid, score it before deciding whether to trust it:

```ts
function scoreConfidence(grid: TableGridCell[][], rows: TableRow[]): { confidence: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 1.0;

  if (grid.length === 0) return { confidence: 0, reasons: ["No rows detected"] };

  const colCounts = grid.map(row => row.filter(c => c.text !== '').length);
  const mean = colCounts.reduce((a,b) => a+b, 0) / colCounts.length;
  const variance = colCounts.reduce((a,b) => a + (b-mean)**2, 0) / colCounts.length;
  if (variance > mean) { score -= 0.3; reasons.push("High variance in populated cells per row"); }

  const totalCells = grid.length * grid[0].length;
  const emptyCells = grid.flat().filter(c => c.text === '').length;
  const emptyRatio = emptyCells / totalCells;
  if (emptyRatio > 0.5) { score -= 0.3; reasons.push(`${Math.round(emptyRatio*100)}% of cells are empty`); }

  const singleColRows = rows.filter(r => !r.isHeaderBand && r.items.length === 1).length;
  if (singleColRows / rows.length > 0.3) { score -= 0.2; reasons.push("Many rows have only one detected column"); }

  return { confidence: Math.max(0, score), reasons };
}
```

Suggested threshold: **confidence < 0.6 → escalate to Tier 2** (§6).

---

## 6. Step 4 — Tier 2: Local Vision Fallback for Low-Confidence Tables

### 6.1 Model — confirmed compatible, no conversion work needed

Microsoft's **Table Transformer (TATR)** is the right model for this, and
it is already available as a ready-to-use, pre-converted ONNX build for
Transformers.js — no model conversion step required.

**Base model:**
[`microsoft/table-transformer-structure-recognition`](https://huggingface.co/microsoft/table-transformer-structure-recognition)
- DETR-based object-detection architecture, 28.8M parameters.
- Trained on **PubTables-1M**, described in the paper
  [*PubTables-1M: Towards Comprehensive Table Extraction From Unstructured Documents*](https://arxiv.org/abs/2110.00061)
  (Smock, Pesala, Abraham — Microsoft Research, 2021).
- **License: MIT** — safe for commercial/local redistribution.
- Detects table structure elements as object-detection boxes: table,
  column, row, column header, projected row header, and **spanning cell**
  — the spanning-cell class is a direct, model-native equivalent of the
  header-band/spanning-row problem this whole rebuild is targeting.

**Browser-ready ONNX build (use this one directly):**
[`Xenova/table-transformer-structure-recognition`](https://huggingface.co/Xenova/table-transformer-structure-recognition)
- Pre-converted ONNX weights structured exactly the way Transformers.js
  expects (`onnx/` subfolder, `config.json`, `preprocessor_config.json`) —
  confirmed current: the repo was updated for **Transformers.js v3**
  compatibility.
- Ships multiple precision variants; pick based on size/accuracy tradeoff
  (confirmed file sizes as of this writing):

  | Variant | File | Size |
  |---|---|---|
  | fp32 (full precision) | `model.onnx` | 116 MB |
  | fp16 | `model_fp16.onnx` | 58.3 MB |
  | q4 | `model_q4.onnx` | 56.9 MB |
  | bnb4 | `model_bnb4.onnx` | 55.8 MB |
  | q4f16 | `model_q4f16.onnx` | 33 MB |
  | **quantized (int8, recommended)** | `model_quantized.onnx` | **30.2 MB** |
  | uint8 | `model_uint8.onnx` | 29.7 MB |

  Recommend starting with `model_quantized.onnx` (~30 MB) — same order of
  magnitude as the models already shipped in this app's other workers, and
  Transformers.js's `pipeline()` picks the quantized variant by default
  unless told otherwise.
- Used directly via the standard `pipeline('object-detection', ...)` task,
  identical calling convention to the `image-to-text` pipeline already used
  in `handwritingWorker.ts` — this is a drop-in fit for the existing
  worker pattern, not a new integration approach.
- There is also a
  [`Xenova/table-transformer-structure-recognition-v1.1-all`](https://huggingface.co/Xenova/table-transformer-structure-recognition-v1.1-all)
  variant (fine-tuned on a broader/updated table dataset) — worth
  benchmarking against the base model on your fixture set (§8) once both
  are wired up, and keeping whichever scores better.

**Compatibility conclusion:** yes, fully compatible, zero conversion work,
same library and worker pattern already used elsewhere in this codebase,
MIT-licensed, and small enough (~30 MB quantized) to fetch and cache
client-side the same way the existing TrOCR/BERT/MiniLM models already
are.

### 6.2 New worker — `src/workers/tableStructureWorker.ts`

Mirror the structure of `handwritingWorker.ts`, swapping the task and
model. The `object-detection` pipeline returns an array of
`{ label, score, box: { xmin, ymin, xmax, ymax } }` objects. TATR's label
set (from its PubTables-1M training) is: `table`, `table column`,
`table row`, `table column header`, `table projected row header`, and
`table spanning cell` — that last label is a direct model-native detector
for the exact header-band/spanning-row pattern that caused bug #3 in §0.

```ts
import { pipeline } from '@huggingface/transformers';

let tableModelPromise: Promise<any> | null = null;

async function getTableModel() {
  if (!tableModelPromise) {
    // model_quantized.onnx (~30MB) is used by default; pass
    // { dtype: 'fp32' } etc. to select a different variant from §6.1's table.
    tableModelPromise = pipeline('object-detection', 'Xenova/table-transformer-structure-recognition');
  }
  return tableModelPromise;
}

self.onmessage = async (e: MessageEvent) => {
  const { imageData, requestId } = e.data;
  const model = await getTableModel();
  const detections = await model(imageData, { threshold: 0.7 });
  // detections: { label: 'table row' | 'table column' | 'table spanning cell' | ..., score, box }[]
  self.postMessage({ requestId, detections });
};
```

### 6.3 Rendering the table crop

Use `pdfjs-dist` (already a dependency, already used for page rendering
elsewhere in the app) to render just the table's bounding box to a canvas,
then pass that image to the worker above:

```ts
async function renderTableRegionToImage(page: PDFPageProxy, bounds: TablePrimitives['bounds']): Promise<ImageData> {
  const viewport = page.getViewport({ scale: 2 }); // upscale for model accuracy
  const canvas = document.createElement('canvas');
  canvas.width = bounds.maxX - bounds.minX;
  canvas.height = bounds.maxY - bounds.minY;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport, /* clip to bounds */ }).promise;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
```

### 6.4 Orchestration

```ts
async function recognizeTableStructure(
  primitives: TablePrimitives,
  page: PDFPageProxy,
  settings: { tier2Enabled: boolean; confidenceThreshold: number }
): Promise<RecognizedTable> {
  const tier1 = runTier1Pipeline(primitives); // §4 + §5, returns grid + confidence

  if (tier1.confidence >= settings.confidenceThreshold || !settings.tier2Enabled) {
    return { grid: tier1.grid, confidence: tier1.confidence, confidenceReasons: tier1.reasons, source: 'geometry' };
  }

  const image = await renderTableRegionToImage(page, primitives.bounds);
  const { detections } = await runInWorker('tableStructureWorker', { imageData: image });
  // Build row/column bands from the 'table row' / 'table column' boxes,
  // treat 'table spanning cell' boxes as protected multi-column cells
  // (equivalent to isHeaderBand in §4.2), then place the EXISTING
  // LiteParse text items (never re-OCR'd) into the resulting grid using
  // the same x/y-overlap assignment logic as §4.4.
  const grid = mapVisionStructureToGrid(detections, primitives.textItems);

  return { grid, confidence: 0.85, confidenceReasons: ["Resolved via local vision fallback"], source: 'vision-fallback' };
}
```

`tier2Enabled` must default to a sensible value and be user-controllable —
see §7. Tier 2 still never leaves the browser (ONNX runs client-side via
transformers.js/WASM/WebGPU), so it doesn't violate the app's local-first
model — but it is heavier compute, so make it opt-out-able for
low-power devices.

---

## 7. Step 5 — Surface Confidence in the UI, Never Ship a Silent Wrong Answer

In `InteractiveTableModal.tsx`, thread `RecognizedTable.confidence` and
`.confidenceReasons` through to the display:

- `confidence >= 0.85`: no indicator, extraction shown normally.
- `0.6 <= confidence < 0.85`: subtle "auto-resolved, please verify" badge.
- `confidence < 0.6` and Tier 2 disabled/unavailable: visible warning badge
  with the specific `confidenceReasons`, and the existing manual-correction
  UI opened by default instead of collapsed.

Add to `useUIStore`:

```ts
interface TableExtractionSettings {
  tier2Enabled: boolean;          // default true; user can disable for perf/battery
  confidenceThreshold: number;    // default 0.6
}
```

---

## 8. Step 6 — Regression Test Fixtures

Create `test-fixtures/tables/` with (at minimum) the three documents that
exposed these bugs, plus a plain well-formed table as a control:

```
test-fixtures/tables/
  01-noisy-lines-fee-schedule.pdf       # Bug #1: empty columns
  01-noisy-lines-fee-schedule.expected.md
  02-spanning-rows-water-temp.pdf       # Bug #2: column collapse
  02-spanning-rows-water-temp.expected.md
  03-colored-header-bands.pdf           # Bug #3: row merge/split
  03-colored-header-bands.expected.md
  04-plain-control-table.pdf            # regression control
  04-plain-control-table.expected.md
```

Add a script (`scripts/testTableExtraction.ts`) that runs
`extractTablesLiteparse()` against each fixture and diffs output against
the `.expected.md` file. Wire it into CI (or at minimum, run manually
before merging any change to `liteparseEngine.ts`). Every future bug
report becomes a new fixture — this suite is what prevents structural
regressions from recurring silently, which is what allowed the same class
of bug (structure inferred from position alone, with no protection for
edge cases) to resurface three times in slightly different forms.

---

## 9. Implementation Order

Do these in order — each stage is independently shippable and de-risks the
next:

1. [x] **§2.1** — one-line fix, enable `extractTextMetadata` for tables. Ship
   immediately, zero risk.
2. [x] **§2.2** — schema audit (no code change, just logging). Determines
   whether §4.2 uses real fill rects or the text-color fallback. *(Audit completed: `vectorGraphics` contains `shapes` and `lines` but no `rects` or `fills`, so we must use the text-color fallback for §4.2).*
3. **§4.5** — unconditional empty-column cleanup. Small, additive, fixes
   Bug #1 alone.
4. **§4.4** — dense-row column inference. Fixes Bug #2 alone.
5. [x] **§4.2 + §4.3** — header-band classification and merge/split guards.
   Fixes Bug #3. Do this after 3–4 since it's the most involved change.
6. **§5** — confidence scoring. Needed before §6 has anything to trigger on.
7. **§8** — build the fixture suite now, using the fixes above as the first
   passing cases, before starting Tier 2.
8. **§6 + §7** — Tier 2 vision fallback and UI surfacing. Largest, riskiest
   piece; do it last, once Tier 1 is solid and has a safety net (fixtures)
   to catch regressions.

---

## 10. Summary Table

| Bug | Fixed by | Section |
|---|---|---|
| Empty columns from noisy traced lines | Unconditional wholly-empty-column removal | §4.5 |
| Columns collapse from spanning label rows | Column boundaries inferred from dense (multi-item) rows only | §4.4 |
| Colored header bands merged into / splitting data rows | Header-band classification using fill rects or text-color fallback; merge guards respect it | §4.2, §4.3 |
| No safety net for genuinely ambiguous layouts | Confidence scoring + local ONNX vision fallback | §5, §6 |
| Low-confidence tables shipped silently wrong | UI confidence badges, default-open manual correction | §7 |
| Regressions from future edge cases | Fixture-based regression suite | §8 |
