import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';

// We must specify the worker source for pdfjs-dist.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

export async function ocrPdf(file: File, updateStage?: (stage: string) => void, abortSignal?: AbortSignal, pageRange?: string): Promise<File> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  const targetPages = new Set<number>();
  if (pageRange) {
    const parts = pageRange.split(',');
    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(s => parseInt(s.trim()));
        if (!isNaN(start) && !isNaN(end)) {
          for (let p = start; p <= end; p++) {
            if (p >= 1 && p <= numPages) targetPages.add(p);
          }
        }
      } else {
        const p = parseInt(part.trim());
        if (!isNaN(p) && p >= 1 && p <= numPages) targetPages.add(p);
      }
    }
  } else {
    for (let p = 1; p <= numPages; p++) targetPages.add(p);
  }

  if (updateStage) updateStage(`Initializing OCR engine...`);
  const worker = await createWorker('eng');

  try {
    if (abortSignal?.aborted) {
      throw new Error('OCR Cancelled');
    }

    const { PDFDocument } = await import('pdf-lib');
    const mergedPdf = await PDFDocument.create();

    const originalPdfDoc = await PDFDocument.load(new Uint8Array(arrayBuffer), { ignoreEncryption: true });

    for (let i = 1; i <= numPages; i++) {
      if (abortSignal?.aborted) {
        throw new Error('OCR Cancelled');
      }

      if (!targetPages.has(i)) {
        if (updateStage) updateStage(`Skipping page ${i}...`);
        const copiedPages = await mergedPdf.copyPages(originalPdfDoc, [i - 1]);
        mergedPdf.addPage(copiedPages[0]);
        continue;
      }

      if (updateStage) updateStage(`Processing page ${i} of ${numPages}...`);
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });

      const canvas = document.createElement('canvas');
      let context = canvas.getContext('2d');
      if (!context) continue;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      context.fillStyle = 'white';
      context.fillRect(0, 0, canvas.width, canvas.height);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const renderContext: any = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;

      const dataUrl = canvas.toDataURL('image/png');

      // Cleanup canvas memory
      canvas.width = 0;
      canvas.height = 0;
      context = null;
      canvas.remove();

      const result = await worker.recognize(dataUrl, {pdfTitle: file.name}, {pdf: true});

      if (result.data.pdf) {
        const pdfDoc = await PDFDocument.load(new Uint8Array(result.data.pdf));
        const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }
    }

    const mergedPdfBytes = await mergedPdf.save();

    const standardBuffer = new Uint8Array(mergedPdfBytes.length);
    standardBuffer.set(mergedPdfBytes);

    return new File([standardBuffer], file.name, { type: 'application/pdf' });
  } finally {
    await worker.terminate();
    try {
      await pdf.cleanup();
      await pdf.destroy();
    } catch (e) {
      console.warn('PDF cleanup failed:', e);
    }
  }
}
