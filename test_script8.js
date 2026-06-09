import { chromium } from 'playwright';
import path from 'path';

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

  // Find all buttons and click the one that has "More" or dropdown icon
  const buttons = await page.$$('button');
  for (let btn of buttons) {
    const text = await btn.textContent();
    console.log("Button text:", text);
  }

  // Click on any element containing text "Hover to Edit"
  // It might be hidden, so we need to click "More Tools" on the DocumentCard
  // The label is "More Tools ▼" in the text dump earlier, let's look for that
  const moreTools = await page.$('button:has-text("More Tools")');
  if (moreTools) {
      await moreTools.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'more_tools_clicked.png' });

      const hoverEdit = await page.$('text="Hover to Edit"');
      if (hoverEdit) {
        await hoverEdit.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'modal_open.png' });
      } else {
        console.log("Hover to Edit not found after clicking More Tools");
      }
  } else {
      console.log("More Tools not found");
  }

  await browser.close();
})();
