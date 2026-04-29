// Import required modules
import { test, expect } from '@playwright/test';

// Define test suite
test.describe('Search Products', () => {
  // Define test case for happy path
  test('Happy Path: Search for products using keywords', async ({ page }) => {
    // Navigate to the search page
    await page.goto('https://example.com/search');

    // Enter a valid keyword
    await page.fill('input[name="search"]', 'product');

    // Click the search button
    await page.click('button[type="submit"]');

    // Verify search results are displayed
    await expect(page.locator('.search-results')).toBeVisible();

    // Verify partial match works
    await page.fill('input[name="search"]', 'prod');
    await page.click('button[type="submit"]');
    await expect(page.locator('.search-results')).toBeVisible();
  });

  // Define test case for no results
  test('Negative: No results message displayed if nothing found', async ({ page }) => {
    // Navigate to the search page
    await page.goto('https://example.com/search');

    // Enter an invalid keyword
    await page.fill('input[name="search"]', 'invalidkeyword');

    // Click the search button
    await page.click('button[type="submit"]');

    // Verify no results message is displayed
    await expect(page.locator('.no-results')).toBeVisible();
    await expect(page.locator('.no-results')).toContainText('No results found');
  });

  // Define test case for search suggestions
  test('Edge Case: Search suggestions appear while typing', async ({ page }) => {
    // Navigate to the search page
    await page.goto('https://example.com/search');

    // Enter a keyword and wait for suggestions
    await page.fill('input[name="search"]', 'prod');
    await page.waitForTimeout(1000);

    // Verify search suggestions are displayed
    await expect(page.locator('.search-suggestions')).toBeVisible();

    // Verify suggestions are updated as user types
    await page.fill('input[name="search"]', 'product');
    await page.waitForTimeout(1000);
    await expect(page.locator('.search-suggestions')).toBeVisible();
  });

  // Define test case for empty search input
  test('Edge Case: Empty search input', async ({ page }) => {
    // Navigate to the search page
    await page.goto('https://example.com/search');

    // Click the search button without entering a keyword
    await page.click('button[type="submit"]');

    // Verify no results message is displayed
    await expect(page.locator('.no-results')).toBeVisible();
    await expect(page.locator('.no-results')).toContainText('Please enter a keyword');
  });

  // Define test case for special characters in search input
  test('Edge Case: Special characters in search input', async ({ page }) => {
    // Navigate to the search page
    await page.goto('https://example.com/search');

    // Enter a keyword with special characters
    await page.fill('input[name="search"]', 'prod!@#');

    // Click the search button
    await page.click('button[type="submit"]');

    // Verify search results are displayed or no results message is displayed
    await expect(page.locator('.search-results')).toBeVisible() || await expect(page.locator('.no-results')).toBeVisible();
  });
});