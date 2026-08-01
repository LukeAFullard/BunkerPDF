import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

test('analyzeDocumentHealth recognizes text', async ({ page }) => {
  const pdfDoc = await PDFDocument.create();
  const pdfPage = pdfDoc.addPage([600, 400]);
  pdfPage.drawText('This is some selectable text.', { x: 50, y: 350, size: 24 });
  const pdfBytes = await pdfDoc.save();

  await page.goto('/BunkerPDF/');

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.click('text=Drop a PDF, DOCX, or Image here to begin');
  const fileChooser = await fileChooserPromise;

  await fileChooser.setFiles({
    name: 'dummy_text.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(pdfBytes)
  });

  const ocrTag = page.locator('text=Run OCR');

  await expect(page.locator('text=Document Health')).toBeVisible();
  await expect(ocrTag).toHaveCount(0);
});
