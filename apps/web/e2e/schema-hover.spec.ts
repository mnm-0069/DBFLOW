import { test, expect } from '@playwright/test';

test.describe('Schema Designer Delayed Column Details Interaction', () => {
  test('respects hover delay, dismisses promptly, and prevents accidental popovers', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(600);

    // 1. Navigate to Schema Designer
    await page.getByRole('button', { name: 'Schema designer' }).click();
    await page.waitForTimeout(800);

    const tableNodes = page.locator('.table-node');
    await expect(tableNodes.first()).toBeVisible();

    const firstTable = tableNodes.first();
    const columns = firstTable.locator('.node-column');
    const col0 = columns.nth(0);
    const col1 = columns.nth(1);
    const col0Name = (await col0.locator('.column-name').innerText()).trim();
    const col1Name = (await col1.locator('.column-name').innerText()).trim();

    const popover = page.locator('.column-detail-popover');

    // Scenario 1: Rapid cursor movement across columns (<200ms) — no popover
    await col0.hover();
    await page.waitForTimeout(100);
    await col1.hover();
    await page.waitForTimeout(100);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(650);
    await expect(popover).toHaveCount(0);

    // Scenario 2: Brief hover for 200ms (<600ms threshold) — no popover
    await col0.hover();
    await page.waitForTimeout(200);
    await expect(popover).toHaveCount(0);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(650);

    // Scenario 3: Sustained hover for 700ms (>600ms threshold) — popover appears
    await col0.hover();
    await page.waitForTimeout(700);
    await expect(popover).toHaveCount(1);
    await expect(popover.locator('.column-detail-heading strong')).toHaveText(col0Name);

    // Scenario 4: Move from Col 0 directly to Col 1 — immediate dismissal, delay for new column
    await col1.hover();
    // Col 0 popover dismisses immediately
    await expect(popover).toHaveCount(0);
    // After 650ms, Col 1 popover appears
    await page.waitForTimeout(650);
    await expect(popover).toHaveCount(1);
    await expect(popover.locator('.column-detail-heading strong')).toHaveText(col1Name);

    // Scenario 5: Move from column into table header — dismisses
    const tableHead = firstTable.locator('.table-node-head');
    await tableHead.hover();
    await page.waitForTimeout(100);
    await expect(popover).toHaveCount(0);

    // Scenario 6: Move outside table — no stale popover remains
    await col0.hover();
    await page.waitForTimeout(700);
    await expect(popover).toHaveCount(1);
    await page.mouse.move(10, 10);
    await page.waitForTimeout(250);
    await expect(popover).toHaveCount(0);
  });
});
