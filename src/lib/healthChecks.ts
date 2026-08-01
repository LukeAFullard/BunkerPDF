import { PDFDocument, PDFDict, PDFName, PDFRef } from 'pdf-lib';
import { getConfiguredLiteParse } from './liteparseEngine';

export async function analyzeDocumentHealth(file: File): Promise<{
  needsOcr: boolean;
  hasSelectableText: boolean;
  hasForms: boolean;
}> {
  try {
    const arrayBuffer = await file.arrayBuffer();

    let hasSelectableText = false;

    // Check complexity using LiteParse engine
    const engine = await getConfiguredLiteParse({});
    const stats = await engine.isComplex(new Uint8Array(arrayBuffer));

    for (const pageStat of stats) {
      if (pageStat.textLength > 0) {
        hasSelectableText = true;
        break; // If we find text on any page, we consider it to have selectable text
      }
    }

    const needsOcr = !hasSelectableText;
    let hasForms = false;

    // Check for forms (AcroForm dictionary in Catalog) using pdf-lib
    // Only parse if the file is a PDF, otherwise pdf-lib will throw an error
    if (file.type === 'application/pdf') {
      const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

      const acroForm = pdfDoc.catalog.get(PDFName.of('AcroForm'));
      if (acroForm) {
         let formDict = acroForm;
         if (formDict instanceof PDFRef) {
            formDict = pdfDoc.context.lookup(formDict) as PDFDict;
         }
         if (formDict instanceof PDFDict) {
           const fields = formDict.get(PDFName.of('Fields'));
           hasForms = !!fields;
         }
      }
    }

    return {
      needsOcr,
      hasSelectableText,
      hasForms
    };
  } catch (error) {
    console.error("Health check failed:", error);
    return {
      needsOcr: false,
      hasSelectableText: true,
      hasForms: false
    };
  }
}
