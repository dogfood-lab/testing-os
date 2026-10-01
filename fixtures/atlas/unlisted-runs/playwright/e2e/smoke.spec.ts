import { expect, test } from '@playwright/test';

test('loads the page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/cockpit/);
});
