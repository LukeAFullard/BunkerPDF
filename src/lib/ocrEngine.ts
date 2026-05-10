import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';

// We must specify the worker source for pdfjs-dist.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

export async function ocrPdf(file: File, updateStage?: (stage: string) => void): Promise<File> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  if (updateStage) updateStage(`Initializing OCR engine...`);
  const worker = await createWorker('eng');

  const pdfDataList = [];

  for (let i = 1; i <= numPages; i++) {
    if (updateStage) updateStage(`Processing page ${i} of ${numPages}...`);
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
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

    const result = await worker.recognize(dataUrl, {pdfTitle: file.name}, {pdf: true});
    pdfDataList.push(result.data.pdf);
  }

  if (updateStage) updateStage(`Merging generated PDFs...`);

  const { PDFDocument } = await import('pdf-lib');
  const mergedPdf = await PDFDocument.create();

  for (const pdfData of pdfDataList) {
    if(!pdfData) continue;
    const pdfDoc = await PDFDocument.load(new Uint8Array(pdfData));
    const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  const mergedPdfBytes = await mergedPdf.save();
  await worker.terminate();
  await pdf.destroy();

  const standardBuffer = new Uint8Array(mergedPdfBytes.length);
  standardBuffer.set(mergedPdfBytes);

  return new File([standardBuffer], file.name, { type: 'application/pdf' });
}
