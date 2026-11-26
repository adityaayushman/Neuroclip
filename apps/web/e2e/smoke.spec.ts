import { expect, test } from '@playwright/test';

test('renders disclaimer, aperture and canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/educational use only/i)).toBeVisible();
  await expect(page.getByTestId('aperture')).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
});
