import { describe, it, expect } from 'vitest';
import { filterAndDeduplicateLines, fromLines } from '../../src/lib/lineTracingMath';
import type { LineItem } from '../../src/lib/liteparseEngine';

describe('lineTracingMath', () => {
    it('should deduplicate close lines', () => {
        const lines: LineItem[] = [
            { x0: 0, x1: 100, y0: 10, y1: 10, type: 'horizontal' },
            { x0: 0, x1: 100, y0: 11, y1: 11, type: 'horizontal' }, // within threshold
            { x0: 0, x1: 100, y0: 20, y1: 20, type: 'horizontal' } // new group
        ];

        const result = filterAndDeduplicateLines(lines, 'horizontal');
        expect(result.length).toBe(2);

        // Coordinates should be the coordinate of the first one in the group (y0=10, 20)
        expect(result[0].y0).toBe(10);
        expect(result[1].y0).toBe(20);

        const boundaries = fromLines(lines, 'horizontal');
        expect(boundaries).toEqual([10, 20]);
    });

    it('should work for vertical lines', () => {
        const lines: LineItem[] = [
            { x0: 10, x1: 10, y0: 0, y1: 100, type: 'vertical' },
            { x0: 11.5, x1: 11.5, y0: 0, y1: 100, type: 'vertical' },
            { x0: 20, x1: 20, y0: 0, y1: 100, type: 'vertical' },
        ];

        const result = fromLines(lines, 'vertical');
        expect(result).toEqual([10, 20]);
    });
});
