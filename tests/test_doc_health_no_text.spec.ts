import { test, expect } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';

test('analyzeDocumentHealth recognizes lack of text', async ({ page }) => {
  const pdfDoc = await PDFDocument.create();
  const pdfPage = pdfDoc.addPage([600, 400]);
  pdfPage.drawRectangle({
    x: 50, y: 50, width: 100, height: 100, color: rgb(1, 0, 0)
  });
  const pdfBytes = await pdfDoc.save();

  await page.goto('/BunkerPDF/');

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.click('text=Drop a PDF, DOCX, or Image here to begin');
  const fileChooser = await fileChooserPromise;

  await fileChooser.setFiles({
    name: 'dummy_no_text.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(pdfBytes)
  });

  const ocrTag = page.locator('text=Run OCR');

  await expect(page.locator('text=Document Health')).toBeVisible();
  await expect(ocrTag).not.toHaveCount(0);
});
