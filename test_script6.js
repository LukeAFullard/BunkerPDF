import { chromium } from 'playwright';
import path from 'path';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Expose a function to capture console logs
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));

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

  // click More Tools
  const moreTools = await page.$('text="More Tools"');
  if (moreTools) {
    await moreTools.click();
    await page.waitForTimeout(1000);
  }

  // click Hover to Edit
  const hoverEdit = await page.$('text="Hover to Edit"');
  if (hoverEdit) {
    await hoverEdit.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'modal_open.png' });

    // Evaluate blocks in the dom
    const blocksCount = await page.evaluate(() => {
      // Find all absolute position divs that might be text items
      return document.querySelectorAll('.absolute.cursor-pointer.rounded-sm.border').length;
    });
    console.log("Found text blocks:", blocksCount);
  } else {
    console.log("Could not find Hover to Edit");
  }

  await browser.close();
})();
