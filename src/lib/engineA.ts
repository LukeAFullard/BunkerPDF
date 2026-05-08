import { PDFDocument } from 'pdf-lib';

export async function mergePdfs(files: File[]): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  return await mergedPdf.save();
}

export async function splitPdf(file: File): Promise<Uint8Array[]> {
  // Simple split logic: ranges like "1,3,5-7" -> creates an array of PDFs
  // For Phase 1 simple utility, let's just split into individual pages for now,
  // or split based on a midpoint if requested.
  // Let's implement a 'burst' split (every page becomes a new document) for MVP simplicity.
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const numPages = pdfDoc.getPageCount();

  const splitPdfs: Uint8Array[] = [];

  for (let i = 0; i < numPages; i++) {
    const newPdf = await PDFDocument.create();
    const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
    newPdf.addPage(copiedPage);
    splitPdfs.push(await newPdf.save());
  }

  return splitPdfs;
}