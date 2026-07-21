import { test, expect } from '@playwright/test';


test('Multi-PDF Search Initialization', async ({ page }) => {
  await page.goto('/BunkerPDF/');

  // Wait for the app to load
  await page.waitForSelector('text=The Zero-Trust Document Suite', { timeout: 10000 });

  // Upload dummy.pdf
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles('dummy.pdf');

  // Ensure document is loaded
  await expect(page.locator('text=dummy.pdf').first()).toBeVisible({ timeout: 10000 });

  // Wait a bit
  await page.waitForTimeout(1000);

  // Click on the Index button
  await page.locator('button[title="Index all documents for search"]').click();

  // The modal for Search will open up
  await expect(page.locator('h2', { hasText: 'Multi-PDF Search' })).toBeVisible({ timeout: 30000 });

  // It should show Indexing Required
  await expect(page.locator('h3', { hasText: 'Indexing Required' })).toBeVisible({ timeout: 5000 });

  // Click Index Documents Now
  await page.locator('button:has-text("Index Documents Now")').click();

  // Wait for the search input to be visible (meaning indexing is done)
  await expect(page.locator('input[placeholder="Search across all open documents..."]')).toBeVisible({ timeout: 30000 });

  // Search something
  await page.locator('input[placeholder="Search across all open documents..."]').fill('dummy');
  await page.locator('button[type="submit"]:has-text("Search")').click();

  // Wait for results or empty state indicating search completed
  await expect(page.locator('button[type="submit"]:has-text("Search")')).not.toBeDisabled({ timeout: 15000 });

  // And there should be no error text in the results
  await expect(page.locator('text=Pipeline not initialized')).not.toBeVisible();
});
