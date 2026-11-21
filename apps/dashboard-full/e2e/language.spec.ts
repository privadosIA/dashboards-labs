import { expect, test } from '@playwright/test';

// No stored choice: the dashboard starts in English and the switch in the side menu changes it.
test.use({ storageState: { cookies: [], origins: [] } });

test('starts in English and switches to Spanish and back, on the same route', async ({ page }) => {
  await page.goto('/models');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('link', { name: 'Projects' })).toBeVisible();

  await page.getByTestId('lang-es').click();
  await expect(page).toHaveURL(/\/models$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('link', { name: 'Proyectos' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('link', { name: 'Proyectos' })).toBeVisible(); // remembered

  await page.getByTestId('lang-en').click();
  await expect(page.getByRole('link', { name: 'Projects' })).toBeVisible();
});
