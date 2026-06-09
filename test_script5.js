import { chromium } from 'playwright';
import path from 'path';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/BunkerPDF/');
  await page.waitForTimeout(2000);

  const fileInput = await page.$('input[type="file"]');
  await fileInput.setInputFiles('test.pdf');
  await page.waitForTimeout(3000);

  // Click on "More Tools"
  await page.click('text="More Tools"');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'more_tools.png' });

  // Click on "Hover to Edit"
  await page.click('text="Hover to Edit"');
  await page.waitForTimeout(3000); // wait for modal
  await page.screenshot({ path: 'hoveredit_modal.png' });

  // get coordinates of some text and click it
  // Actually, we can just click in the middle of the canvas
  await page.mouse.click(400, 400);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'hoveredit_clicked.png' });

  await browser.close();
})();
