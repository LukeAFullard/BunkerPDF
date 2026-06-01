import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`CONSOLE ERROR: ${msg.text()}`);
    else console.log(`CONSOLE: ${msg.text()}`);
  });
  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));
  page.on('requestfailed', request => errors.push(`REQUEST FAILED: ${request.url()} - ${request.failure()?.errorText}`));

  try {
    await page.goto('http://localhost:4178/BunkerPDF/');
    await page.waitForTimeout(3000);

    if (errors.length > 0) {
      console.log('\n--- ERRORS FOUND ---');
      errors.forEach(e => console.log(e));
    } else {
      console.log('\nNo errors found.');
    }
  } catch (e) {
    console.error('Test error:', e);
  } finally {
    await browser.close();
    process.exit(0);
  }
})();
