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

  // Click on "Hover to Edit (~Instant)" which might be in a dropdown menu
  // First click Document Tools or whatever the dropdown is called
  const toolsDropdown = await page.$('button[title="Document Tools"]');
  if (toolsDropdown) {
    await toolsDropdown.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tools_menu.png' });

    const hoverEdit = await page.$('text="Hover to Edit"');
    if (hoverEdit) {
      await hoverEdit.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'modal_open.png' });
    }
  }

  await browser.close();
})();
