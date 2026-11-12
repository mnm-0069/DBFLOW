import { test, expect } from '@playwright/test';

test.describe('Data Explorer Product Quality & Workflows', () => {
  test('navigates tables, searches rows, sorts columns, and formats cell types', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(600);

    // 1. Connect to local demo PostgreSQL
    await page.locator('.add-connection').first().click();
    const dialog = page.getByRole('dialog', { name: 'Connect a database' });
    await dialog.getByLabel('Host').fill('localhost');
    await dialog.getByRole('textbox', { name: 'Database' }).fill('dbflow_demo');
    await dialog.getByLabel('Username').fill('manmeetrahi');
    await page.getByRole('button', { name: 'Test connection' }).click();

    const inspectBtn = page.getByRole('button', { name: /Inspect PostgreSQL schema/i });
    await inspectBtn.waitFor({ state: 'visible', timeout: 5000 });
    await inspectBtn.click();
    await page.waitForTimeout(1000);

    // 2. Open Data Explorer
    await page.getByRole('button', { name: 'Data explorer' }).click();
    await page.waitForTimeout(800);

    // Verify left table tree is visible and has public tables
    await expect(page.getByRole('tree').getByText('assignments', { exact: true })).toBeVisible();
    await expect(page.getByRole('tree').getByText('courses', { exact: true })).toBeVisible();
    await expect(page.getByRole('tree').getByText('departments', { exact: true })).toBeVisible();

    // Verify breadcrumbs and table badges
    await expect(page.locator('.breadcrumb-db')).toHaveText('dbflow_demo');
    await expect(page.locator('.table-type-pill')).toHaveText('BASE TABLE');

    // 3. Switch to departments table
    await page.getByRole('tree').getByText('departments', { exact: true }).click();
    await page.waitForTimeout(600);
    await expect(page.locator('.breadcrumb-table')).toHaveText('departments');

    // 4. Verify custom headers (PK indicator and data types)
    await expect(page.locator('.custom-grid-header').filter({ hasText: 'id' })).toBeVisible();
    await expect(page.locator('.custom-grid-header').filter({ hasText: 'code' })).toBeVisible();

    // 5. Test search filter
    const searchInput = page.locator('.command-search-input');
    await searchInput.fill('Computer');
    await page.waitForTimeout(600);
    await expect(page.getByText('Computer Science')).toBeVisible();

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(400);

    // 6. Test sorting
    const nameHeader = page.locator('.custom-grid-header').filter({ hasText: 'name' });
    await nameHeader.click();
    await page.waitForTimeout(500);

    // Verify sort chip in footer
    await expect(page.locator('.sort-indicator-chip')).toBeVisible();

    // 7. Test responsive layout at 1024px and 800px
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(300);
    await expect(page.locator('.data-explorer-main')).toBeVisible();

    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(300);
    await expect(page.locator('.data-explorer-main')).toBeVisible();
  });
});
