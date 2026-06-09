import { chromium } from 'playwright';
import path from 'path';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/BunkerPDF/');
  // Wait for the app to load
  await page.waitForTimeout(2000);

  // Upload a test PDF file
  const fileChooserPromise = page.waitForEvent('filechooser');
  // the dropzone is a div containing input[type="file"]
  await page.locator('input[type="file"]').setInputFiles('test.pdf');
  // Wait for it to process
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'uploaded.png' });

  // Now we want to open the "Hover to Edit" modal.
  // Click on the tools dropdown or however we access it.
  // Let's screenshot uploaded.png first.

  await browser.close();
})();
