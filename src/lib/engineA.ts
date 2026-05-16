import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';

export async function convertImagesToPdf(files: File[], fitMode: 'fit' | 'original' | 'a4' = 'a4'): Promise<Uint8Array> {
  const { PageSizes } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();

  for (const file of files) {
    let imageBytes = new Uint8Array(await file.arrayBuffer());
    let embedder;

    // We can embed jpg or png directly.
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
      embedder = await pdfDoc.embedJpg(imageBytes);
    } else if (file.type === 'image/png') {
      embedder = await pdfDoc.embedPng(imageBytes);
    } else {
      // Transcode other formats to PNG via canvas
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');
      ctx.drawImage(bitmap, 0, 0);

      const pngBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png');
      });

      if (!pngBlob) throw new Error('Failed to transcode image to PNG');
      imageBytes = new Uint8Array(await pngBlob.arrayBuffer());
      embedder = await pdfDoc.embedPng(imageBytes);
    }

    const { width: imgW, height: imgH } = embedder.scale(1);
    let pageW, pageH;

    if (fitMode === 'original') {
      pageW = imgW;
      pageH = imgH;
    } else {
      // both fit and a4 use A4 boundaries, but A4 mode enforces the page size
      pageW = PageSizes.A4[0];
      pageH = PageSizes.A4[1];
    }

    // calculate dimensions
    const scale = fitMode === 'original' ? 1 : Math.min(pageW / imgW, pageH / imgH);
    const scaledW = imgW * scale;
    const scaledH = imgH * scale;

    let page;
    if (fitMode === 'fit') {
      // Fit to page means the page is exactly the size of the scaled image
      page = pdfDoc.addPage([scaledW, scaledH]);
      page.drawImage(embedder, { x: 0, y: 0, width: scaledW, height: scaledH });
    } else if (fitMode === 'a4') {
      // A4 means page is A4 and image is centered
      page = pdfDoc.addPage(PageSizes.A4);
      const x = (pageW - scaledW) / 2;
      const y = (pageH - scaledH) / 2;
      page.drawImage(embedder, { x, y, width: scaledW, height: scaledH });
    } else {
      // Original means page is exactly the image size
      page = pdfDoc.addPage([pageW, pageH]);
      page.drawImage(embedder, { x: 0, y: 0, width: scaledW, height: scaledH });
    }
  }

  return await pdfDoc.save();
}

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

export async function splitPdf(file: File, rangesStr?: string): Promise<{bytes: Uint8Array, pageCount: number}[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const numPages = pdfDoc.getPageCount();

  const splitPdfs: {bytes: Uint8Array, pageCount: number}[] = [];

  const resultChunks: number[][] = [];
  if (!rangesStr || rangesStr.trim() === '') {
    // Burst mode: return an array of single-page arrays
    for (let i = 0; i < numPages; i++) {
      resultChunks.push([i]);
    }
  } else {
    const chunks = rangesStr.split(',').map(s => s.trim()).filter(Boolean);
    for (const chunk of chunks) {
      const indices: number[] = [];
      if (chunk.includes('-')) {
        const [startStr, endStr] = chunk.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          for (let i = start; i <= end; i++) {
            if (i >= 1 && i <= numPages) {
              indices.push(i - 1); // 0-indexed
            }
          }
        }
      } else {
        const num = parseInt(chunk, 10);
        if (!isNaN(num) && num >= 1 && num <= numPages) {
           indices.push(num - 1);
        }
      }
      if (indices.length > 0) {
        resultChunks.push(indices);
      }
    }
  }

  for (const chunk of resultChunks) {
    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(pdfDoc, chunk);
    copiedPages.forEach(page => newPdf.addPage(page));
    const savedBytes = await newPdf.save();
    splitPdfs.push({bytes: savedBytes, pageCount: chunk.length});
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

export async function addBatesNumbers(file: File, prefix: string = '', startNumber: number = 1, padding: number = 6, position: string = 'bottom-right'): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    const currentNumber = (startNumber + i).toString().padStart(padding, '0');
    const text = `${prefix}${currentNumber}`;

    const fontSize = 12;
    const textWidth = font.widthOfTextAtSize(text, fontSize);

    let x;
    let y;
    const margin = 30;

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
      default:
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

export async function resizePages(file: File, targetSizeStr: string = 'A4'): Promise<Uint8Array> {
  const { PageSizes } = await import('pdf-lib');
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  const targetSize = targetSizeStr.toUpperCase() === 'LETTER' ? PageSizes.Letter : PageSizes.A4;
  const [targetWidth, targetHeight] = targetSize;

  const pages = pdfDoc.getPages();
  for (const page of pages) {
    const { width, height } = page.getSize();

    // Calculate scaling factor to fit content within the new size while maintaining aspect ratio
    const scale = Math.min(targetWidth / width, targetHeight / height);

    // Scale the content
    page.scaleContent(scale, scale);

    const scaledWidth = width * scale;
    const scaledHeight = height * scale;

    // Set the new page size
    page.setSize(targetWidth, targetHeight);

    // Center the content on the new page
    const tx = (targetWidth - scaledWidth) / 2;
    const ty = (targetHeight - scaledHeight) / 2;
    page.translateContent(tx, ty);
  }

  return await pdfDoc.save();
}

export async function crossDocumentReorderPages(
  originalFiles: Record<string, File>,
  newStructures: Record<string, { docId: string; originalPageNumber: number }[]>
): Promise<Record<string, Uint8Array>> {
  const result: Record<string, Uint8Array> = {};
  const loadedDocs: Record<string, PDFDocument> = {};

  // Load all necessary original documents
  for (const docId of Object.keys(originalFiles)) {
    const arrayBuffer = await originalFiles[docId].arrayBuffer();
    loadedDocs[docId] = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  }

// Build new documents based on new structures
  for (const docId of Object.keys(newStructures)) {
    const pagesInfo = newStructures[docId];
    if (pagesInfo.length === 0) continue; // Skip if no pages are left in this doc

    const newDoc = await PDFDocument.create();

    // Group page indices by source document to optimize copyPages
    const sourceDocToIndices: Record<string, number[]> = {};
    for (const pageInfo of pagesInfo) {
      if (!sourceDocToIndices[pageInfo.docId]) {
        sourceDocToIndices[pageInfo.docId] = [];
      }
      const index = pageInfo.originalPageNumber - 1;
      // We must copy the page each time it is used to avoid identical reference issues in pdf-lib
      sourceDocToIndices[pageInfo.docId].push(index);
    }

    // Perform batched copy for each source document
    const copiedPagesMap: Record<string, Record<number, any[]>> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const sourceDocId of Object.keys(sourceDocToIndices)) {
      const sourceDoc = loadedDocs[sourceDocId];
      const indicesToCopy = sourceDocToIndices[sourceDocId];
      if (sourceDoc && indicesToCopy.length > 0) {
        const copiedPages = await newDoc.copyPages(sourceDoc, indicesToCopy);
        copiedPagesMap[sourceDocId] = {};
        for (let i = 0; i < indicesToCopy.length; i++) {
           const index = indicesToCopy[i];
           if (!copiedPagesMap[sourceDocId][index]) {
             copiedPagesMap[sourceDocId][index] = [];
           }
           copiedPagesMap[sourceDocId][index].push(copiedPages[i]);
        }
      }
    }

    // Insert the copied pages into the new document in the exact requested order
    for (const pageInfo of pagesInfo) {
      const sourceDocId = pageInfo.docId;
      const index = pageInfo.originalPageNumber - 1;

      if (copiedPagesMap[sourceDocId] && copiedPagesMap[sourceDocId][index] && copiedPagesMap[sourceDocId][index].length > 0) {
         newDoc.addPage(copiedPagesMap[sourceDocId][index].shift());
      }
    }

    result[docId] = await newDoc.save();
  }

  return result;
}
