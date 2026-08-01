import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

test('analyzeDocumentHealth recognizes text', async ({ page }) => {
  // Generate a dummy PDF with selectable text
  const pdfDoc = await PDFDocument.create();
  const pdfPage = pdfDoc.addPage([600, 400]);
  pdfPage.drawText('This is some selectable text.', {
    x: 50,
    y: 350,
    size: 24,
  });
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync('dummy_text.pdf', pdfBytes);

  // Load the app
  await page.goto('/BunkerPDF/');

  // Upload the PDF
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.click('text=Drop a PDF, DOCX, or Image here to begin');
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles('dummy_text.pdf');

  // Check if OCR tag is NOT present
  // Wait a moment for health check to complete
  await page.waitForTimeout(2000);

  const ocrTag = page.locator('text=Needs OCR');
  expect(await ocrTag.count()).toBe(0);

  fs.unlinkSync('dummy_text.pdf');
});
