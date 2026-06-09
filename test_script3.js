import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/BunkerPDF/');
  // Wait for the app to load
  await page.waitForTimeout(2000);

  // Upload a test PDF file
  // Get the dropzone and dispatch events
  const fileContent = fs.readFileSync('test.pdf');
  const fileName = 'test.pdf';
  const fileType = 'application/pdf';

  // Inject file input for reliable upload in react-dropzone
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'injected-file-input';
    document.body.appendChild(input);
  });

  await page.locator('#injected-file-input').setInputFiles('test.pdf');

  await page.evaluate((file) => {
    const input = document.getElementById('injected-file-input');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(input.files[0]);

    // Find the dropzone
    const dropzone = document.querySelector('div[role="presentation"]');
    if (dropzone) {
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer
      });
      dropzone.dispatchEvent(dropEvent);
    }
  });

  // Wait for processing
  await page.waitForTimeout(3000);

  await page.screenshot({ path: 'uploaded.png' });

  // Try to click "Hover to Edit"
  // It should be under some menu.
  // We can just call handleInteractiveEdit on the document directly? No we can't.
  // Look for text "Hover to Edit" or just "Edit"
  // The app might have a button for this.

  await browser.close();
})();
