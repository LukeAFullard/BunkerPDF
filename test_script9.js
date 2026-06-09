import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('http://localhost:5173/BunkerPDF/');
  await page.waitForTimeout(2000);

  // Upload test pdf via injected input
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

  await page.waitForTimeout(3000);

  // Take screenshot of the document card to see what it looks like
  await page.screenshot({ path: 'doc_card.png' });

  await browser.close();
})();
