import { chromium } from 'playwright';
import path from 'path';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/BunkerPDF/');
  await page.waitForTimeout(2000);

  // Directly set input files on the hidden input
  const fileInput = await page.$('input[type="file"]');
  await fileInput.setInputFiles('test.pdf');

  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'uploaded4.png' });

  // Click on the document tools menu
  const toolsButton = await page.$('button[title="Document Tools"]');
  if (toolsButton) {
     await toolsButton.click();
     await page.waitForTimeout(1000);
     await page.screenshot({ path: 'menu.png' });
  } else {
     // Search for "Hover to Edit"
     const hoverEdit = await page.$('text="Hover to Edit"');
     if (hoverEdit) {
       await hoverEdit.click();
       await page.waitForTimeout(2000);
       await page.screenshot({ path: 'hoveredit.png' });
     } else {
       console.log("Could not find tools");

       // print text content of body
       const text = await page.evaluate(() => document.body.innerText);
       console.log(text.substring(0, 500));
     }
  }

  await browser.close();
})();
