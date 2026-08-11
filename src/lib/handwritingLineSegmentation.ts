export const segmentHandwritingLines = (
  imageData: { data: Uint8ClampedArray | Uint8Array; width: number; height: number }
): { x0: number; y0: number; x1: number; y1: number }[] => {
  const { width, height, data } = imageData;
  if (width === 0 || height === 0) return [];

  const rowDarkness = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x++) {
      sum += 255 - data[rowStart + x * 4]; // grayscale, R=G=B
    }
    rowDarkness[y] = sum / width;
  }

  // 1. Calculate adaptive background floor
  const sortedDarkness = new Float32Array(rowDarkness).sort();
  const backgroundFloor = sortedDarkness[Math.floor(height * 0.1)]; // 10th percentile

  // 2. Set dynamic threshold
  const maxDarkness = sortedDarkness[height - 1];
  const dynamicRange = Math.max(0, maxDarkness - backgroundFloor);
  const inkThreshold = backgroundFloor + dynamicRange * 0.05;

  const minGapPx = Math.max(4, Math.round(height * 0.012));
  const minLineHeightPx = Math.max(6, Math.round(height * 0.02));

  let bands: { start: number; end: number }[] = [];
  let curStart = -1;
  let gapRun = 0;
  for (let y = 0; y < height; y++) {
    if (rowDarkness[y] > inkThreshold) {
      if (curStart === -1) curStart = y;
      gapRun = 0;
    } else if (curStart !== -1) {
      gapRun++;
      if (gapRun > minGapPx) {
        bands.push({ start: curStart, end: y - gapRun });
        curStart = -1;
        gapRun = 0;
      }
    }
  }
  if (curStart !== -1) bands.push({ start: curStart, end: height - 1 });

  bands = bands.filter((b) => b.end - b.start >= minLineHeightPx);

  // 3. Fallback for under-segmentation (merged lines)
  if (bands.length > 0) {
    // If we only have 1 or 2 bands, medianHeight is just the height of the largest band,
    // which breaks the h > medianHeight * 1.6 check.
    // Instead, estimate single-line height dynamically based on the width or absolute limits if we don't have enough bands.
    const bandHeights = bands.map(b => b.end - b.start).sort((a, b) => a - b);
    let referenceHeight = bandHeights[Math.floor(bandHeights.length / 2)];
    if (bands.length < 3) {
       // Since the image is pre-scaled so min dim is 384px, a single full-width line crop
       // could be up to ~384px tall. A tight 2-line crop would have lines around ~190px tall.
       // We cap the reference height based on the canvas dimensions rather than an absolute pixel count.
       // E.g. assume a line shouldn't be taller than 60% of the entire crop height.
       referenceHeight = Math.min(referenceHeight, height * 0.6);
    }

    const newBands: typeof bands = [];
    for (const band of bands) {
      const h = band.end - band.start;
      if (h > referenceHeight * 1.6 && h > Math.round(height * 0.05)) {
        // Apply box blur to row profile inside this band
        const blurRadius = Math.max(1, Math.round(h * 0.05));
        const smoothed = new Float32Array(h);
        for (let i = 0; i < h; i++) {
          let sum = 0, count = 0;
          for (let j = Math.max(0, i - blurRadius); j <= Math.min(h - 1, i + blurRadius); j++) {
            sum += rowDarkness[band.start + j];
            count++;
          }
          smoothed[i] = sum / count;
        }

        // Find prominent local minima
        const minima = [];
        for (let i = blurRadius; i < h - blurRadius; i++) {
          if (smoothed[i] < smoothed[i - 1] && smoothed[i] <= smoothed[i + 1]) {
            // Check prominence
            let leftPeak = smoothed[i];
            for (let j = i - 1; j >= 0; j--) {
              if (smoothed[j] > leftPeak) leftPeak = smoothed[j];
              else if (smoothed[j] < leftPeak * 0.95) break; // Allow small noise fluctuations
            }
            let rightPeak = smoothed[i];
            for (let j = i + 1; j < h; j++) {
              if (smoothed[j] > rightPeak) rightPeak = smoothed[j];
              else if (smoothed[j] < rightPeak * 0.95) break; // Allow small noise fluctuations
            }

            const peakMin = Math.min(leftPeak, rightPeak);
            if (peakMin - smoothed[i] > dynamicRange * 0.1) {
              minima.push(i);
            }
          }
        }

        // Split on most prominent minimum if any, otherwise keep original
        if (minima.length > 0) {
            let lastSplit = 0;
            for (const minIdx of minima) {
                newBands.push({ start: band.start + lastSplit, end: band.start + minIdx });
                lastSplit = minIdx;
            }
            newBands.push({ start: band.start + lastSplit, end: band.end });
        } else {
             newBands.push(band);
        }

      } else {
        newBands.push(band);
      }
    }
    bands = newBands;
  }

  // Re-filter after potential splits
  bands = bands.filter((b) => b.end - b.start >= minLineHeightPx);

  const pad = Math.max(3, Math.round(height * 0.01));
  const lines = bands.map((b) => ({
    x0: 0,
    y0: Math.max(0, b.start - pad),
    x1: width,
    y1: Math.min(height, b.end + pad),
  }));

  return lines.length > 0 ? lines : [{ x0: 0, y0: 0, x1: width, y1: height }];
};