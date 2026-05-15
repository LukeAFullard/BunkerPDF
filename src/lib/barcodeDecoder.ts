import { BrowserMultiFormatReader, BinaryBitmap, HybridBinarizer, HTMLCanvasElementLuminanceSource } from '@zxing/library';
import * as pdfjsLib from 'pdfjs-dist';
import { cleanupPdfResources } from './pdfCleanup';

export async function decodeBarcodesFromPdf(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const reader = new BrowserMultiFormatReader();
  const results: Set<string> = new Set();

  try {
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); // 2x scale to be more efficient

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) continue;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const renderContext: any = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;

      // Now decode directly from the canvas
      try {
        const luminanceSource = new HTMLCanvasElementLuminanceSource(canvas);
        const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
        const result = reader.decodeBitmap(binaryBitmap);
        if (result) {
          results.add(result.getText());
        }
      } catch {
        // NotFoundException is thrown if no code is found, which is normal
      }
    }
  } finally {
    // Cleanup pdf memory
    await cleanupPdfResources(pdf);
  }

  return Array.from(results);
}
