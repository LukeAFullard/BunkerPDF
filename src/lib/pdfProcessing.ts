import { PDFDocument } from 'pdf-lib';

export async function getPdfInfo(file: File): Promise<{ pageCount: number, isEncrypted: boolean }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    return {
      pageCount: pdfDoc.getPageCount(),
      isEncrypted: pdfDoc.isEncrypted
    };
  } catch (error: unknown) {
    console.error('Failed to parse PDF info:', error);
    // Explicitly throw a Corrupt error
    throw new Error('CORRUPT_PDF', { cause: error });
  }
}
