import type { LineItem } from './liteparseEngine';

export const DEDUPE_THRESHOLD_PX = 2.0;
export function filterAndDeduplicateLines(lines: LineItem[], type: 'horizontal' | 'vertical'): LineItem[] {
  // Filter by type and ignore disabled lines
  const typedLines = lines.filter(l => l.type === type && !l.disabled);

  // Group lines by coordinate (y for horizontal, x for vertical)
  const groupedLines: LineItem[][] = [];

  // Sort lines by coordinate first
  const sortedLines = [...typedLines].sort((a, b) => {
    if (type === 'horizontal') return a.y0 - b.y0;
    return a.x0 - b.x0;
  });

  for (const line of sortedLines) {
    let placed = false;
    for (const group of groupedLines) {
       const rep = group[0];
       const repCoord = type === 'horizontal' ? rep.y0 : rep.x0;
       const lineCoord = type === 'horizontal' ? line.y0 : line.x0;

       if (Math.abs(repCoord - lineCoord) <= DEDUPE_THRESHOLD_PX) {
           group.push(line);
           placed = true;
           break;
       }
    }
    if (!placed) {
       groupedLines.push([line]);
    }
  }

  const result: LineItem[] = [];

  // Merge each group into a single line
  for (const group of groupedLines) {
      if (group.length === 0) continue;

      const repCoord = type === 'horizontal' ? group[0].y0 : group[0].x0;

      // Calculate union of the line segment spans
      let minSpan = Infinity;
      let maxSpan = -Infinity;

      for (const line of group) {
          const start = type === 'horizontal' ? Math.min(line.x0, line.x1) : Math.min(line.y0, line.y1);
          const end = type === 'horizontal' ? Math.max(line.x0, line.x1) : Math.max(line.y0, line.y1);
          if (start < minSpan) minSpan = start;
          if (end > maxSpan) maxSpan = end;
      }

      const mergedLine: LineItem = type === 'horizontal'
          ? { x0: minSpan, x1: maxSpan, y0: repCoord, y1: repCoord, type }
          : { x0: repCoord, x1: repCoord, y0: minSpan, y1: maxSpan, type };

      result.push(mergedLine);
  }

  return result;
}

export function fromLines(lines: LineItem[], type: 'horizontal' | 'vertical'): number[] {
   const deduplicated = filterAndDeduplicateLines(lines, type);
   const coords = deduplicated.map(l => type === 'horizontal' ? l.y0 : l.x0);
   coords.sort((a, b) => a - b);
   return coords;
}

export const MIN_RULE_FRACTION_LOCAL = 0.75;

export function buildGridFromIntersections(
  hLines: LineItem[],
  rowYs: number[],
  colXs: { start: number; end: number }[],
  tableYStart: number
): number[][] {
  const rowSpans: number[][] = [];

  // Note: rowYs are the *boundaries* (usually the bottom/top of a row depending on sort order).
  // In `formatTableFromItems`, rowBoundaries are Y coordinates where the row *ends* (items below it go to next row).
  // The first row is bounded by tableYStart and rowYs[0].

  // Actually, wait, `formatTableFromItems` currently has `rowBoundaries` where
  // items with `y` < `rowBoundaries[i]` fall into row `i`.
  // Wait, let me check how `rowBoundaries` is used in `formatTableFromItems`.

  for (let r = 0; r < rowYs.length; r++) {
    rowSpans[r] = [];
    for (let c = 0; c < colXs.length; c++) {
      const y = rowYs[r];
      const xStart = colXs[c].start;
      const xEnd = colXs[c].end;
      const colWidth = xEnd - xStart;

      // Does a horizontal line actually exist spanning [xStart, xEnd] at y?
      // It must span at least MIN_RULE_FRACTION_LOCAL of the column width
      const edgeExists = hLines.some(l => {
        if (Math.abs(l.y0 - y) > 2) return false;

        // Calculate intersection length
        const intersectStart = Math.max(l.x0, xStart - 2);
        const intersectEnd = Math.min(l.x1, xEnd + 2);
        const intersectLength = intersectEnd - intersectStart;

        return intersectLength > 0 && (intersectLength / colWidth) >= MIN_RULE_FRACTION_LOCAL;
      });

      rowSpans[r][c] = edgeExists ? 1 : 0; // 0 => merge downward/upward based on how rowSpans is used
    }
  }
  return rowSpans;
}
