import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';

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

export async function rotatePdf(file: File, degreesToRotate: number = 90): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  const pages = pdfDoc.getPages();
  for (const page of pages) {
    const currentRotation = page.getRotation().angle;
    page.setRotation(degrees(currentRotation + degreesToRotate));
  }

  return await pdfDoc.save();
}

export async function watermarkPdf(file: File, text: string): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  const pages = pdfDoc.getPages();
  for (const page of pages) {
    const { width, height } = page.getSize();
    page.drawText(text, {
      x: width / 4,
      y: height / 2,
      size: 50,
      color: rgb(0.5, 0.5, 0.5),
      opacity: 0.5,
      rotate: degrees(45),
    });
  }

  return await pdfDoc.save();
}

export async function optimizePdf(file: File): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  // Basic metadata stripping
  pdfDoc.setTitle('');
  pdfDoc.setAuthor('');
  pdfDoc.setSubject('');
  pdfDoc.setKeywords([]);
  pdfDoc.setProducer('');
  pdfDoc.setCreator('');

  // Recompressing by saving without adding any new stuff. Not true compression but strips metadata.
  return await pdfDoc.save({ useObjectStreams: false });
}

export async function deletePages(file: File, pageIndices: number[]): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  // Sort descending so indices don't shift when we delete
  const sortedIndices = [...pageIndices].sort((a, b) => b - a);

  for (const idx of sortedIndices) {
    if (idx >= 0 && idx < pdfDoc.getPageCount()) {
      pdfDoc.removePage(idx);
    }
  }

  return await pdfDoc.save();
}

export async function reorderPages(file: File, newOrderIndices: number[]): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const originalDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const newDoc = await PDFDocument.create();

  // Validate indices
  const validIndices = newOrderIndices.filter(idx => idx >= 0 && idx < originalDoc.getPageCount());

  if (validIndices.length > 0) {
    const copiedPages = await newDoc.copyPages(originalDoc, validIndices);
    copiedPages.forEach(page => newDoc.addPage(page));
  } else {
    // If empty or invalid, return original
    return await originalDoc.save();
  }

  return await newDoc.save();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function encryptPdf(_file: File, _password: string): Promise<Uint8Array> {
  // For basic polish without extra dependencies (pdf-lib 1.17 doesn't support writing encrypted files natively out of the box),
  // we will use the pyodide engine instead, so we throw an error here to signal it should be handled via the heavy compute layer.
  throw new Error('Encryption is handled by the Python engine. Please ensure advanced tools are loaded.');
}

export async function signPdf(file: File, signatureImageBytes: Uint8Array): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  const signatureImage = await pdfDoc.embedPng(signatureImageBytes);
  const signatureDims = signatureImage.scale(0.5);

  const pages = pdfDoc.getPages();
  // Add signature to the first page for MVP simplicity
  const firstPage = pages[0];

  firstPage.drawImage(signatureImage, {
    x: 50,
    y: 50,
    width: signatureDims.width,
    height: signatureDims.height,
  });

  return await pdfDoc.save();
}

export async function flattenForms(file: File): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  const form = pdfDoc.getForm();
  form.flatten();

  return await pdfDoc.save();
}

export async function addPageNumbers(file: File, position: string = 'bottom-right', startNumber: number = 1, format: string = '{n}'): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica); // Try to embed helvetica

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    const pageNumber = startNumber + i;
    const text = format.replaceAll('{n}', pageNumber.toString()).replaceAll('{total}', pages.length.toString());

    // Default to 12 pt font size
    const fontSize = 12;
    // Calculate approximate text width (simplistic for standard ascii)
    const textWidth = font.widthOfTextAtSize(text, fontSize);

    let x;
    let y;
    const margin = 30; // 30 pt margin from edge

    switch (position) {
      case 'bottom-right':
        x = width - textWidth - margin;
        y = margin;
        break;
      case 'bottom-center':
        x = (width / 2) - (textWidth / 2);
        y = margin;
        break;
      case 'bottom-left':
        x = margin;
        y = margin;
        break;
      case 'top-right':
        x = width - textWidth - margin;
        y = height - margin - fontSize;
        break;
      case 'top-center':
        x = (width / 2) - (textWidth / 2);
        y = height - margin - fontSize;
        break;
      case 'top-left':
        x = margin;
        y = height - margin - fontSize;
        break;
      default: // bottom-right fallback
        x = width - textWidth - margin;
        y = margin;
    }

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0),
    });
  }

  return await pdfDoc.save();
}
