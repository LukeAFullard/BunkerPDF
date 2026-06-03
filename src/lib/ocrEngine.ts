import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';

// We must specify the worker source for pdfjs-dist.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

export async function ocrPdf(
  file: File,
  pagesToProcess?: number[],
  updateStage?: (stage: string) => void,
  abortSignal?: AbortSignal,
  onProgressiveUpdate?: (file: File) => void
): Promise<File> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const pages = pagesToProcess && pagesToProcess.length > 0 ? pagesToProcess.filter(p => p > 0 && p <= numPages) : Array.from({length: numPages}, (_, i) => i + 1);

  if (updateStage) updateStage(`Initializing OCR engine...`);
  const worker = await createWorker('eng');

  try {
    if (abortSignal?.aborted) {
      throw new Error('OCR Cancelled');
    }

    const { PDFDocument } = await import('pdf-lib');
    const mergedPdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

    for (const i of pages) {
      if (abortSignal?.aborted) {
        throw new Error('OCR Cancelled');
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
        // Tesseract output is usually a single page PDF
        const [copiedPage] = await mergedPdf.copyPages(pdfDoc, [0]);

        const pageIndex = i - 1;
        mergedPdf.removePage(pageIndex);
        mergedPdf.insertPage(pageIndex, copiedPage);

        if (onProgressiveUpdate) {
          const intermediateBytes = await mergedPdf.save();
          const standardBuffer = new Uint8Array(intermediateBytes.length);
          standardBuffer.set(intermediateBytes);
          const intermediateFile = new File([standardBuffer], file.name, { type: 'application/pdf' });
          onProgressiveUpdate(intermediateFile);
        }
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
