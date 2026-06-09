import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('http://localhost:5173/BunkerPDF/');
  await page.waitForTimeout(2000);

  // Fallback to evaluating drop event to ensure dropzone picks it up
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'injected-file-input';
    document.body.appendChild(input);
  });
  await page.locator('#injected-file-input').setInputFiles('test.pdf');
  await page.evaluate(() => {
    const input = document.getElementById('injected-file-input');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(input.files[0]);
    const dropzone = document.querySelector('div[role="presentation"]');
    if (dropzone) {
      const dropEvent = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer });
      dropzone.dispatchEvent(dropEvent);
    }
  });

  await page.waitForTimeout(3000);

  // We know the label is "Hover to Edit (~Instant)"
  // Let's print out all text containing "Hover"
  const texts = await page.evaluate(() => {
     return Array.from(document.querySelectorAll('*'))
       .map(el => el.textContent)
       .filter(t => t.includes('Hover'));
  });
  console.log(texts);

  // Find the button inside the dropdown or just click it
  // Actually, wait, "More Tools" is not working because it's rendering differently or something.
  // We can just call window.postMessage or dispatch an event if there's a global method.

  // Let's screenshot to see if the file is loaded
  await page.screenshot({ path: 'loaded.png' });

  await browser.close();
})();
