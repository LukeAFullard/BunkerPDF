import { describe, it, expect } from 'vitest';
import { formatTableFromItems } from '../../src/lib/liteparseEngine';

describe('formatTableFromItems (Borderless-table row-merge heuristic)', () => {
  it('merges wrapped lines that overlap horizontally and are close vertically', () => {
    const textItems = [
      { x: 10, y: 100, width: 20, height: 10, text: 'Cell' },
      { x: 100, y: 100, width: 30, height: 10, text: 'Data' }, // Row 1
      { x: 100, y: 112, width: 30, height: 10, text: 'More' }, // Row 2 (wrapped part of Row 1)
      { x: 10, y: 150, width: 20, height: 10, text: 'Next' },
      { x: 100, y: 150, width: 30, height: 10, text: 'Row' }
    ];

    const { text: markdown } = formatTableFromItems(textItems, 'markdown');

    // Check if the output has properly merged the wrapped lines.
    // Given the logic, the second row with 'More' should be merged into the first row 'Data'.
    expect(markdown).toContain('Data More');
  });

  it('does not merge rows if gap is large', () => {
    const textItems = [
        { x: 10, y: 100, width: 20, height: 10, text: 'Cell' },
        { x: 100, y: 100, width: 30, height: 10, text: 'Data' }, // Row 1
        { x: 10, y: 150, width: 20, height: 10, text: 'Next' },
        { x: 100, y: 150, width: 30, height: 10, text: 'Row' }
    ];
    const { text: markdown } = formatTableFromItems(textItems, 'markdown');
    expect(markdown).toContain('Data');
    expect(markdown).toContain('Next');
    expect(markdown).not.toContain('Data Next');
  });

  it('does not merge if no horizontal overlap', () => {
     const textItems = [
      { x: 10, y: 100, width: 20, height: 10, text: 'Cell' },
      { x: 100, y: 100, width: 30, height: 10, text: 'Data' }, // Row 1
      { x: 150, y: 112, width: 30, height: 10, text: 'More' }, // Row 2 (no horizontal overlap with row above items)
      { x: 10, y: 150, width: 20, height: 10, text: 'Next' },
      { x: 100, y: 150, width: 30, height: 10, text: 'Row' }
    ];

    const { text: markdown } = formatTableFromItems(textItems, 'markdown');
    expect(markdown).not.toContain('Data More');
  });

  it('merges wrapped lines correctly when items are out of X order', () => {
    const textItems = [
      { x: 10, y: 100, width: 20, height: 10, text: 'Cell' },
      { x: 100, y: 100, width: 10, height: 10, text: 'Part1' }, // Row 1
      { x: 110, y: 100, width: 10, height: 10, text: 'Part2' }, // Row 1
      { x: 100, y: 112, width: 30, height: 10, text: 'More' }, // Row 2
    ];
    // Shuffle the items
    const shuffled = [textItems[0], textItems[2], textItems[1], textItems[3]];
    const { text: markdown } = formatTableFromItems(shuffled, 'markdown');

    // It should merge Part1 and Part2 in the correct X order
    expect(markdown).toContain('Part1 More Part2');
  });
});
