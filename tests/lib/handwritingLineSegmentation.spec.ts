import { describe, it, expect } from 'vitest';
import { segmentHandwritingLines } from '../../src/lib/handwritingLineSegmentation';

describe('segmentHandwritingLines', () => {
  it('should split a clean two-line image with a true blank gap', () => {
    const width = 10;
    const height = 40;
    const data = new Uint8ClampedArray(width * height * 4);

    // Fill with white background (255, 255, 255, 255)
    for (let i = 0; i < data.length; i++) {
        data[i] = 255;
    }

    // Add line 1 ink at y=10..17 (height = 8 > minLineHeightPx=6)
    for (let y = 10; y <= 17; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            data[idx] = 0; // R
            data[idx + 1] = 0; // G
            data[idx + 2] = 0; // B
        }
    }

    // Add line 2 ink at y=30..37 (height = 8 > minLineHeightPx=6)
    for (let y = 30; y <= 37; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            data[idx] = 0; // R
            data[idx + 1] = 0; // G
            data[idx + 2] = 0; // B
        }
    }

    const lines = segmentHandwritingLines({ data, width, height });

    expect(lines.length).toBe(2);
    expect(lines[0].y0).toBeLessThan(10);
    expect(lines[0].y1).toBeGreaterThan(17);
    expect(lines[1].y0).toBeLessThan(30);
    expect(lines[1].y1).toBeGreaterThan(37);
  });

  it('should correctly segment a simulated two-line image with noisy background and bridging strokes', () => {
    const width = 20;
    const height = 60; // Larger median height to trigger the blur fallback
    const data = new Uint8ClampedArray(width * height * 4);

    // Fill with noisy background (e.g., 230-240) - consistent noise for reproducible dynamic range
    for (let y = 0; y < height; y++) {
       for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            // use a fixed pseudo-random pattern based on x and y
            const noise = 230 + ((x * y) % 10);
            data[idx] = noise;
            data[idx + 1] = noise;
            data[idx + 2] = noise;
            data[idx + 3] = 255;
       }
    }

    // Line 1: y=10..20
    for (let y = 10; y <= 20; y++) {
        for (let x = 0; x < width; x++) {
             const idx = (y * width + x) * 4;
             data[idx] = 50; data[idx+1] = 50; data[idx+2] = 50;
        }
    }

    // Line 2: y=40..50
    for (let y = 40; y <= 50; y++) {
         for (let x = 0; x < width; x++) {
              const idx = (y * width + x) * 4;
              data[idx] = 50; data[idx+1] = 50; data[idx+2] = 50;
         }
    }

    // Bridging strokes (descenders/ascenders) in the gap y=21..39
    // Make sure we have some ink but less than the main lines, simulating a connected stroke
    for (let y = 21; y <= 39; y++) {
         const idx = (y * width + 10) * 4; // Single column bridging
         data[idx] = 100; data[idx+1] = 100; data[idx+2] = 100;
    }

    const lines = segmentHandwritingLines({ data, width, height });

    // Without the fallback, the bridging stroke would merge lines 1 and 2 into a single large band.
    // The fallback should correctly identify this single large band and split it into 2.
    expect(lines.length).toBe(2);

    // Check if the split occurred correctly
    // One line should cover 10-20, another 40-50
    const hasLine1 = lines.some(l => l.y0 <= 10 && l.y1 >= 20 && l.y1 < 40);
    const hasLine2 = lines.some(l => l.y0 > 20 && l.y1 >= 50);

    expect(hasLine1).toBe(true);
    expect(hasLine2).toBe(true);
  });

  it('should not split a genuinely single line image', () => {
    const width = 10;
    const height = 40;
    const data = new Uint8ClampedArray(width * height * 4);

    // Fill with white background
    for (let i = 0; i < data.length; i++) {
        data[i] = 255;
    }

    // Add line ink at y=15..25
    for (let y = 15; y <= 25; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            data[idx] = 0; data[idx+1] = 0; data[idx+2] = 0;
        }
    }

    const lines = segmentHandwritingLines({ data, width, height });

    expect(lines.length).toBe(1);
    expect(lines[0].y0).toBeLessThan(15);
    expect(lines[0].y1).toBeGreaterThan(25);
  });
});
