import { PDFDocument } from 'pdf-lib';

export async function getPdfInfo(file: File): Promise<{ pageCount: number }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    return {
      pageCount: pdfDoc.getPageCount()
    };
  } catch (error) {
    console.error('Failed to parse PDF info:', error);
    throw new Error('Could not read PDF file. It might be corrupted or heavily encrypted.');
  }
}