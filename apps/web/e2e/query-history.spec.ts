import { expect, test } from '@playwright/test';

test('demo SQL runs are saved and can be reused without sending them again', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'SQL workspace', exact: true }).click();
  const history = page.getByRole('complementary', { name: 'Recent queries' });
  await expect(history).toContainText('Queries you run in this tab appear here');

  await page.getByRole('button', { name: 'Preview demo rows' }).click();
  await expect(page.getByText('Demo sample rows · SQL was not sent')).toBeVisible();
  await expect(history.getByRole('button', { name: /Reuse query: SELECT \* FROM orders/i })).toBeVisible();
  await expect(history).toContainText('8 demo rows');

  await page.getByRole('button', { name: 'Open a sample query' }).click();
  await expect(page.getByText('Query output appears here')).toBeVisible();
  await history.getByRole('button', { name: /Reuse query: SELECT \* FROM orders/i }).click();
  await expect(history.getByRole('button', { name: /Reuse query: SELECT \* FROM orders/i })).toHaveAttribute('aria-current', 'true');

  await page.getByRole('button', { name: 'Clear query history' }).click();
  await expect(history).toContainText('Queries you run in this tab appear here');
});
