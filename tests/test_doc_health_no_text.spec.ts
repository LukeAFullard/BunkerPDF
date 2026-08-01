import { test, expect } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs';

test('analyzeDocumentHealth recognizes lack of text', async ({ page }) => {
  // Generate a dummy PDF with no text, just shapes
  const pdfDoc = await PDFDocument.create();
  const pdfPage = pdfDoc.addPage([600, 400]);
  pdfPage.drawRectangle({
    x: 50,
    y: 50,
    width: 100,
    height: 100,
    color: rgb(1, 0, 0)
  });
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync('dummy_no_text.pdf', pdfBytes);

  // Load the app
  await page.goto('/BunkerPDF/');

  // Upload the PDF
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.click('text=Drop a PDF, DOCX, or Image here to begin');
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles('dummy_no_text.pdf');

  // Check if OCR tag IS present
  // Wait a moment for health check to complete
  await page.waitForTimeout(2000);

  const ocrTag = page.locator('text=Run OCR');
  expect(await ocrTag.count()).toBeGreaterThan(0);

  fs.unlinkSync('dummy_no_text.pdf');
});
