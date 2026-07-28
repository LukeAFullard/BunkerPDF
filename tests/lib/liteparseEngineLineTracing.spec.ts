import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatTableFromItems, formatMarkdownFromItems } from '../../src/lib/liteparseEngine';
import type { LineItem } from '../../src/lib/liteparseEngine';
import { useUIStore } from '../../src/store/uiStore';

// Mock UI store for line tracing flag
vi.mock('../../src/store/uiStore', () => ({
  useUIStore: {
    getState: vi.fn(() => ({ enableLineTracing: true }))
  }
}));

describe('formatTableFromItems - Line Tracing Hybrid', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should fall back to spatial clustering if lines are not provided', () => {
        const items = [
            { text: "A", x: 10, y: 10, width: 10, height: 10 },
            { text: "B", x: 30, y: 10, width: 10, height: 10 },
            { text: "C", x: 10, y: 30, width: 10, height: 10 },
            { text: "D", x: 30, y: 30, width: 10, height: 10 }
        ];

        const md = formatTableFromItems(items, 'markdown', true, []);
        expect(md).toContain("| A | B |");
        expect(md).toContain("| C | D |");
    });

    it('should split columns using explicit vertical lines', () => {
        const items = [
            { text: "Col1", x: 10, y: 10, width: 20, height: 10 },
            // This is visually close, without line it might be merged depending on intervals
            { text: "Col2", x: 35, y: 10, width: 20, height: 10 },
        ];

        // Explicit vertical line splitting the two items
        const lines: LineItem[] = [
            { x0: 32, x1: 32, y0: 0, y1: 50, type: 'vertical' }
        ];

        const md = formatTableFromItems(items, 'markdown', true, lines);
        expect(md).toContain("| Col1 | Col2 |");
    });

    it('should split rows using explicit horizontal lines even if text Y is messy', () => {
        const items = [
            { text: "Row1", x: 10, y: 10, width: 20, height: 10 },
            { text: "Cell1", x: 40, y: 18, width: 20, height: 10 }, // Just over threshold
            { text: "Row2", x: 10, y: 30, width: 20, height: 10 },
        ];

        // Force split between the first two items which are messy
        const lines: LineItem[] = [
            { x0: 0, x1: 100, y0: 15, y1: 15, type: 'horizontal' }
        ];

        const md = formatTableFromItems(items, 'markdown', false, lines);
        expect(md).toContain("| Row1 |");
        expect(md).toContain("| Cell1 |");
    });
});

describe('formatMarkdownFromItems - Line Tracing Hybrid', () => {
    it('should correctly format text items intersecting with horizontal lines', () => {
        const items = [
            { text: "Underlined", x: 10, y: 10, width: 50, height: 12 },
            { text: "Strikethrough", x: 10, y: 30, width: 80, height: 12 },
            { text: "Normal", x: 10, y: 50, width: 40, height: 12 }
        ];

        const lines: LineItem[] = [
            { x0: 5, x1: 70, y0: 22, y1: 22, type: 'horizontal' }, // underline
            { x0: 5, x1: 100, y0: 36, y1: 36, type: 'horizontal' }, // strikethrough
        ];

        const md = formatMarkdownFromItems(items, lines);
        expect(md).toContain("<u>Underlined</u>");
        expect(md).toContain("~~Strikethrough~~");
        expect(md).toContain("Normal");
        expect(md).not.toContain("<u>Normal</u>");
        expect(md).not.toContain("~~Normal~~");
    });
});
