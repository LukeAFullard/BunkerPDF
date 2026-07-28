import type { LineItem } from './liteparseEngine';

export const DEDUPE_THRESHOLD_PX = 2.0;
export const MIN_RULE_FRACTION = 0.75;

export function filterAndDeduplicateLines(lines: LineItem[], type: 'horizontal' | 'vertical', boxSpan: { start: number, end: number } | null): LineItem[] {
  // Filter by type
  const typedLines = lines.filter(l => l.type === type);

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

      const lineSpan = maxSpan - minSpan;

      if (boxSpan) {
          const totalBoxSpan = boxSpan.end - boxSpan.start;
          if (totalBoxSpan > 0 && (lineSpan / totalBoxSpan) < MIN_RULE_FRACTION) {
              // Ignore this line, it's too short relative to the table box
              continue;
          }
      }

      const mergedLine: LineItem = type === 'horizontal'
          ? { x0: minSpan, x1: maxSpan, y0: repCoord, y1: repCoord, type }
          : { x0: repCoord, x1: repCoord, y0: minSpan, y1: maxSpan, type };

      result.push(mergedLine);
  }

  return result;
}

export function fromLines(lines: LineItem[], type: 'horizontal' | 'vertical', boxSpan: { start: number, end: number } | null): number[] {
   const deduplicated = filterAndDeduplicateLines(lines, type, boxSpan);
   const coords = deduplicated.map(l => type === 'horizontal' ? l.y0 : l.x0);
   coords.sort((a, b) => a - b);
   return coords;
}
