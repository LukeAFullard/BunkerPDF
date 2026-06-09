import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/BunkerPDF/');
  // Wait for the app to load
  await page.waitForTimeout(2000);
  // Find a way to open the Interactive Edit Modal
  // It's in the side by side or some menu?
  // Let's just screenshot the main page first
  await page.screenshot({ path: 'main.png' });
  await browser.close();
})();
