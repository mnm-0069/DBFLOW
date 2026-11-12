// apps/web/e2e/copilot.spec.ts
// E2E verification of DBFlow Copilot AI Database Consultant and Health Audit

import { expect, test } from '@playwright/test';

test('DBFlow Copilot renders, displays sub-tabs, and allows interactive chat and query intelligence', async ({ page }) => {
  await page.goto('/');

  // 1. Navigate to DBFlow Copilot
  await page.getByRole('button', { name: /DBFlow Copilot/i }).click();

  // 2. Verify master header and sub-tabs
  await expect(page.getByRole('heading', { name: 'DBFlow Copilot' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Health Overview & Score/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /AI Consultant Chat/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Actionable Recommendations/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /SQL Query Intelligence/i })).toBeVisible();

  // 3. Switch to AI Consultant Chat
  await page.getByRole('button', { name: /AI Consultant Chat/i }).click();
  await expect(page.getByText('Hello! I am DBFlow Copilot')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Analyse my entire database.' })).toBeVisible();

  // 4. Verify conversation management (New Chat, Switching, Deletion)
  await page.getByRole('button', { name: 'New Chat' }).click();
  await expect(page.getByText('Demo Database Consultation')).toBeVisible();

  // Create another conversation to verify switching
  await page.getByRole('button', { name: 'New Chat' }).click();
  const convItems = page.locator('.conv-item');
  await expect(convItems).toHaveCount(2);

  // Switch between conversations
  await convItems.first().click();
  await expect(convItems.first()).toHaveClass(/active/);

  // Delete conversation
  const deleteBtn = convItems.first().locator('.conv-del-btn');
  await deleteBtn.click();
  await expect(page.locator('.conv-item')).toHaveCount(1);

  // 5. Switch to SQL Query Intelligence
  await page.getByRole('button', { name: /SQL Query Intelligence/i }).click();
  await expect(page.getByText('Natural Language to SQL Generator')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explain & Analyze Plan' })).toBeVisible();

  // 6. Switch to Recommendations Hub
  await page.getByRole('button', { name: /Actionable Recommendations/i }).click();
  await expect(page.getByRole('heading', { name: 'Actionable Optimization & Constraint Proposals' })).toBeVisible();
});
