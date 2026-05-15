import * as pdfjsLib from 'pdfjs-dist';

export async function analyzeDocumentHealth(file: File): Promise<{
  needsOcr: boolean;
  hasSelectableText: boolean;
  hasForms: boolean;
}> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let hasSelectableText = false;
    let hasForms = false;

    // Check first 3 pages for text
    const pagesToCheck = Math.min(3, pdf.numPages);
    for (let i = 1; i <= pagesToCheck; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      if (textContent.items.length > 10) {
        hasSelectableText = true;
        break;
      }
    }

    // Check for forms (simplified)
    try {
      const page = await pdf.getPage(1);
      const annotations = await page.getAnnotations();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hasForms = annotations.some((a: any) => a.subtype === 'Widget');
    } catch {
      // Ignore annotation errors
    }

    await pdf.destroy();

    return {
      needsOcr: !hasSelectableText,
      hasSelectableText,
      hasForms
    };
  } catch {
    return {
      needsOcr: false,
      hasSelectableText: true,
      hasForms: false
    };
  }
}
