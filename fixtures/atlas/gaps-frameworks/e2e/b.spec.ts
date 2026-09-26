import { expect, test } from '@playwright/test';

test('opens', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/frameworks/);
});
