import * as pdfjsLib from 'pdfjs-dist';

export const cleanupPdfResources = async (pdf: pdfjsLib.PDFDocumentProxy) => {
  try {
    await pdf.cleanup();
    await pdf.destroy();
  } catch (e) {
    console.warn('PDF cleanup failed:', e);
  }
};
