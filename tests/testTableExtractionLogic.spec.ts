import { expect, test } from 'vitest';
import { formatTableFromItems, LineItem } from '../src/lib/liteparseEngine';
import { useUIStore } from '../src/store/uiStore';

test('formatTableFromItems splits merged text items that straddle an explicit vertical line', () => {
    const syntheticItems = [
      { text: "Contribution 52.8", x: 10, y: 10, width: 100, height: 10, fontName: 'Arial' },
      // Add another item so row.items.length > 1, bypassing the isSpanningRow check
      { text: "100.0", x: 130, y: 10, width: 30, height: 10, fontName: 'Arial' }
    ];
    const explicitLines: LineItem[] = [
      { x0: 0, x1: 0, y0: 0, y1: 20, type: 'vertical' },
      { x0: 60, x1: 60, y0: 0, y1: 20, type: 'vertical' },
      { x0: 120, x1: 120, y0: 0, y1: 20, type: 'vertical' },
      { x0: 180, x1: 180, y0: 0, y1: 20, type: 'vertical' },
      { x0: 0, x1: 180, y0: 5, y1: 5, type: 'horizontal' },
      { x0: 0, x1: 180, y0: 15, y1: 15, type: 'horizontal' }
    ];

    useUIStore.setState({ enableLineTracing: true });

    const result = formatTableFromItems(syntheticItems, 'csv', true, explicitLines);
    // the output should be "Contribution","52.8","100.0"
    expect(result.text).toContain("Contribution");
    expect(result.text).toContain("52.8");
    const lines = result.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const dataLine = lines.find(l => l.includes("Contribution"));
    expect(dataLine).toBeDefined();
    if (dataLine) {
        expect(dataLine).toMatch(/"Contribution"\s*,\s*"52\.8"/);
    }
});

test('formatTableFromItems boundary-touch prevents double-matching', () => {
    const syntheticItems = [
      { text: "Contribution", x: 10, y: 10, width: 50, height: 10, fontName: 'Arial' },
      { text: "52.8", x: 60, y: 10, width: 50, height: 10, fontName: 'Arial' }
    ];
    // x=60 is exactly on the column line
    const explicitLines: LineItem[] = [
      { x0: 0, x1: 0, y0: 0, y1: 20, type: 'vertical' },
      { x0: 60, x1: 60, y0: 0, y1: 20, type: 'vertical' },
      { x0: 120, x1: 120, y0: 0, y1: 20, type: 'vertical' },
      { x0: 0, x1: 120, y0: 5, y1: 5, type: 'horizontal' },
      { x0: 0, x1: 120, y0: 15, y1: 15, type: 'horizontal' }
    ];

    useUIStore.setState({ enableLineTracing: true });

    const result = formatTableFromItems(syntheticItems, 'csv', true, explicitLines);
    expect(result.text).toContain("Contribution");
    expect(result.text).toContain("52.8");
    const lines = result.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const dataLine = lines.find(l => l.includes("Contribution"));
    expect(dataLine).toBeDefined();
    if (dataLine) {
        expect(dataLine).toMatch(/"Contribution"\s*,\s*"52\.8"/);
    }
});

test('formatTableFromItems caption with crossing line does not split', () => {
    // Caption text spans the whole table, with a space near x=60
    // "Table 1. Accumulated contribution of each frequency"
    const syntheticItems = [
      { text: "Table 1. Accumulated contribution of each frequency", x: 10, y: 10, width: 100, height: 10, fontName: 'Arial-BoldMT' }
    ];
    // Line crosses near "Table 1."
    const explicitLines: LineItem[] = [
      { x0: 0, x1: 0, y0: 0, y1: 20, type: 'vertical' },
      { x0: 60, x1: 60, y0: 0, y1: 20, type: 'vertical' },
      { x0: 120, x1: 120, y0: 0, y1: 20, type: 'vertical' },
      { x0: 0, x1: 120, y0: 5, y1: 5, type: 'horizontal' },
      { x0: 0, x1: 120, y0: 15, y1: 15, type: 'horizontal' }
    ];

    useUIStore.setState({ enableLineTracing: true });

    const result = formatTableFromItems(syntheticItems, 'csv', true, explicitLines);
    const lines = result.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const dataLine = lines.find(l => l.includes("Table 1."));
    expect(dataLine).toBeDefined();
    if (dataLine) {
        // It shouldn't be split. If it wasn't split, it would be `"Table 1. ..."`
        expect(dataLine).not.toMatch(/"Table"\s*,\s*"1\./);
    }
});

test('formatTableFromItems three-way split', () => {
    const syntheticItems = [
      { text: "One 2 3", x: 10, y: 10, width: 100, height: 10, fontName: 'Arial' },
      { text: "4", x: 130, y: 10, width: 30, height: 10, fontName: 'Arial' }
    ];
    const explicitLines: LineItem[] = [
      { x0: 0, x1: 0, y0: 0, y1: 20, type: 'vertical' },
      { x0: 40, x1: 40, y0: 0, y1: 20, type: 'vertical' },
      { x0: 80, x1: 80, y0: 0, y1: 20, type: 'vertical' },
      { x0: 120, x1: 120, y0: 0, y1: 20, type: 'vertical' },
      { x0: 160, x1: 160, y0: 0, y1: 20, type: 'vertical' },
      { x0: 0, x1: 160, y0: 5, y1: 5, type: 'horizontal' },
      { x0: 0, x1: 160, y0: 15, y1: 15, type: 'horizontal' }
    ];

    useUIStore.setState({ enableLineTracing: true });

    const result = formatTableFromItems(syntheticItems, 'csv', true, explicitLines);
    expect(result.text).toContain("One");
    expect(result.text).toContain("2");
    expect(result.text).toContain("3");

    const lines = result.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const dataLine = lines.find(l => l.includes("One"));
    expect(dataLine).toBeDefined();
    if (dataLine) {
        expect(dataLine).toMatch(/"One"\s*,\s*"2"\s*,\s*"3"/);
    }
});

test('formatTableFromItems splits fused items on borderless tables using inferred columns', () => {
    // Spatial extraction test (no explicit lines passed in)
    // Create rows to force columns to be inferred:
    // col 1: x ~10
    // col 2: x ~60
    // col 3: x ~120
    const syntheticItems = [
      // Multiple dense rows to set up unambiguous columns without overlap
      { text: "HeaderA", x: 10, y: 10, width: 30, height: 10, fontName: 'Arial' },
      { text: "HeaderB", x: 60, y: 10, width: 30, height: 10, fontName: 'Arial' },
      { text: "HeaderC", x: 120, y: 10, width: 30, height: 10, fontName: 'Arial' },

      { text: "DataA", x: 10, y: 25, width: 30, height: 10, fontName: 'Arial' },
      { text: "DataB", x: 60, y: 25, width: 30, height: 10, fontName: 'Arial' },
      { text: "DataC", x: 120, y: 25, width: 30, height: 10, fontName: 'Arial' },

      // Row 3 has a fused item spanning column 1 and 2.
      // To ensure it gets classified as a spanning row and excluded from interval logic,
      // its width must be > 60% of table width. Table width is 150 - 10 = 140.
      // 140 * 0.6 = 84. The width of "Fused 99.9" needs to be at least 85.
      { text: "Fused 99.9", x: 10, y: 40, width: 90, height: 10, fontName: 'Arial' },
      { text: "Valid", x: 120, y: 40, width: 30, height: 10, fontName: 'Arial' }
    ];

    // Ensure line tracing is false to trigger borderless table inference
    useUIStore.setState({ enableLineTracing: false });

    // The third parameter is `requiresMultipleColumns`. The useLines flag in `formatTableFromItems` is based on
    // `useUIStore.getState().enableLineTracing && explicitLines && explicitLines.length > 0`
    const result = formatTableFromItems(syntheticItems, 'csv', true, []);

    const lines = result.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const fusedLine = lines.find(l => l.includes("Fused"));

    expect(fusedLine).toBeDefined();
    if (fusedLine) {
        // It should have split it so that Fused and 99.9 are in different columns
        expect(fusedLine).toMatch(/"Fused"\s*,\s*"99\.9"\s*,\s*"Valid"/);
    }
});
