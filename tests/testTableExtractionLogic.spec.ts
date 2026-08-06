import { expect, test } from 'vitest';
import { formatTableFromItems, LineItem } from '../src/lib/liteparseEngine';
import { useUIStore } from '../src/store/uiStore';

test('formatTableFromItems splits merged text items that straddle an explicit vertical line', () => {
    const syntheticItems = [
      { text: "Contribution 52.8", x: 10, y: 10, width: 100, height: 10, fontName: 'Arial' }
    ];
    const explicitLines: LineItem[] = [
      { x0: 0, x1: 0, y0: 0, y1: 20, type: 'vertical' },
      { x0: 60, x1: 60, y0: 0, y1: 20, type: 'vertical' },
      { x0: 120, x1: 120, y0: 0, y1: 20, type: 'vertical' },
      { x0: 0, x1: 120, y0: 5, y1: 5, type: 'horizontal' },
      { x0: 0, x1: 120, y0: 15, y1: 15, type: 'horizontal' }
    ];

    useUIStore.setState({ enableLineTracing: true });

    const result = formatTableFromItems(syntheticItems, 'markdown', true, explicitLines);
    expect(result.text).toContain("Contribution");
    expect(result.text).toContain("52.8");
    // the markdown should put them in separate cells, meaning a pipe separating them
    // something like: | Contribution | 52.8 |
    const lines = result.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    // find the line with the data
    const dataLine = lines.find(l => l.includes("Contribution") && !l.includes("---"));
    expect(dataLine).toBeDefined();
    if (dataLine) {
        // Because Markdown trims empty cells on the right if not full,
        // we might not get exactly `| Contribution | 52.8 |`.
        // We just need to ensure `Contribution` and `52.8` are in different cells.
        expect(dataLine).toMatch(/\|\s*Contribution\s*\|\s*52\.8\s*\|/);
    }
});
