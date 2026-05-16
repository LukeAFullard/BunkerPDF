import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';

// We must specify the worker source for pdfjs-dist.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

export async function ocrPdf(
  file: File,
  updateStage?: (stage: string) => void,
  abortSignal?: AbortSignal,
  targetPages?: number[]
): Promise<File> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  // If targetPages is undefined (e.g. user entered 'all'), process all pages.
  // Otherwise, filter to valid pages within range.
  const pagesToProcess = targetPages
    ? targetPages.filter(p => p >= 1 && p <= numPages)
    : Array.from({ length: numPages }, (_, i) => i + 1);

  if (updateStage) updateStage(`Initializing OCR engine...`);
  const worker = await createWorker('eng');

  try {
    if (abortSignal?.aborted) {
      throw new Error('OCR Cancelled');
    }

    const { PDFDocument } = await import('pdf-lib');

    // We want to return a new PDF that combines the OCR'd pages (if processed)
    // and original pages (if not processed). Wait, let's look at the original code.
    // The original code merged ALL pages into a new PDF using the OCR output.
    // Let's modify it to either OCR the specific page or copy the original page.
    const originalPdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const mergedPdf = await PDFDocument.create();

    for (let i = 1; i <= numPages; i++) {
      if (abortSignal?.aborted) {
        throw new Error('OCR Cancelled');
      }

      if (!pagesToProcess.includes(i)) {
        // Copy original page
        const [copiedPage] = await mergedPdf.copyPages(originalPdfDoc, [i - 1]);
        mergedPdf.addPage(copiedPage);
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
