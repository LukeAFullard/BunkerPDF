import { loadPdfDocument } from "./pdfHelper";

export async function analyzeDocumentHealth(file: File): Promise<{
  needsOcr: boolean;
  hasSelectableText: boolean;
  hasForms: boolean;
}> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await loadPdfDocument(arrayBuffer).promise;

    let hasSelectableText = false;
    let hasForms = false;

    // Check first 3 pages for text
    const pagesToCheck = Math.min(3, pdf.numPages);
    let totalTextLength = 0;

    for (let i = 1; i <= pagesToCheck; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      totalTextLength += textContent.items.reduce((sum, item) =>
        // @ts-expect-error - Item could be TextItem or TextMarkedContent
        sum + (item.str?.length || 0), 0
      );
    }

    // More than 50 chars per page on average = has text
    hasSelectableText = (totalTextLength / pagesToCheck) > 50;

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
