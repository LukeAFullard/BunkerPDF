import { PDFDocument, PDFDict, PDFName, PDFRef } from 'pdf-lib';

export async function analyzeDocumentHealth(file: File): Promise<{
  needsOcr: boolean;
  hasSelectableText: boolean;
  hasForms: boolean;
}> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

    let hasSelectableText = false;
    let hasForms = false;

    // Check first 3 pages for fonts in their Resources dictionary
    const pages = pdfDoc.getPages();
    const pagesToCheck = Math.min(3, pages.length);

    for (let i = 0; i < pagesToCheck; i++) {
      const page = pages[i];

      // Page resources might be inherited, so we check the page node and its ancestors
      let resources = page.node.get(PDFName.of('Resources'));
      let parentRef = page.node.get(PDFName.of('Parent'));
      while (!resources && parentRef instanceof PDFRef) {
        const parentDict = pdfDoc.context.lookup(parentRef);
        if (parentDict instanceof PDFDict) {
          resources = parentDict.get(PDFName.of('Resources'));
          parentRef = parentDict.get(PDFName.of('Parent'));
        } else {
          break;
        }
      }

      if (resources) {
        let resDict = resources;
        if (resDict instanceof PDFRef) {
           resDict = pdfDoc.context.lookup(resDict) as PDFDict;
        }

        if (resDict instanceof PDFDict) {
          const fonts = resDict.get(PDFName.of('Font'));
          if (fonts) {
             let fontsDict = fonts;
             if (fontsDict instanceof PDFRef) {
                fontsDict = pdfDoc.context.lookup(fontsDict) as PDFDict;
             }
             if (fontsDict instanceof PDFDict && fontsDict.entries().length > 0) {
               hasSelectableText = true;
               break;
             }
          }
        }
      }
    }

    // Check for forms (AcroForm dictionary in Catalog)
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

    return {
      needsOcr: !hasSelectableText,
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
