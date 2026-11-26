import { expect, test } from '@playwright/test';

test('renders scene, aperture, debug overlay within draw-call budget', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?intro=0');
  await expect(page.getByText(/educational use only/i)).toBeVisible();
  await expect(page.getByTestId('aperture')).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();

  await expect(page.getByTestId('debug-fps')).not.toHaveText(/^0 fps/, { timeout: 15_000 });
  const calls = Number((await page.getByTestId('debug-calls').innerText()).split(' ')[0]);
  expect(calls).toBeGreaterThan(0);
  expect(calls).toBeLessThan(150);

  test.info().annotations.push({ type: 'fps', description: await page.getByTestId('debug-fps').innerText() });
  await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel', { deltaY: -600, cancelable: true })));
  await expect(page.getByTestId('aperture')).not.toHaveAttribute('data-zoom', '1');

  await expect(page.getByTestId('step-positioning_craniotomy')).toHaveAttribute('data-state', 'current');
  await expect(page.getByTestId('mentor')).toContainText('pterional craniotomy');

  await expect(page.getByTestId('debug-ml')).toHaveText(/^ML [\d.]+ ms/, { timeout: 60_000 });

  await page.keyboard.press('3');
  await expect(page.getByTestId('tool-microscissors')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('0');
  await expect(page.getByTestId('doppler')).toBeVisible();

  await expect(page.getByTestId('vitals')).toBeVisible();
  await page.getByTestId('rupture-btn').click();
  await expect(page.getByTestId('mentor')).toContainText('ruptured');
  await expect(page.getByTestId('blood-loss')).not.toContainText('~0 mL', { timeout: 30_000 });

  await page.getByTestId('focus-slider').fill('0.9');
  await expect(page.getByTestId('focus-slider')).toHaveValue('0.9');
  expect(errors).toEqual([]);
});

test('settings, anatomy variants and emergency mode', async ({ page }) => {
  await page.goto('/?intro=0');
  await page.getByTestId('settings-btn').click();
  await page.getByTestId('setting-colorblind').check();
  await expect(page.locator('html')).toHaveAttribute('data-cb', '1');
  await page.getByTestId('anatomy-select').selectOption('2');
  await page.getByLabel('Mode').selectOption('emergency');
  await expect(page.getByTestId('mentor')).toContainText(/rupture|bleed|suction/i, { timeout: 30_000 });
  await expect(page.getByTestId('step-dural_opening')).toHaveAttribute('data-state', 'current');
});

test('intro can be skipped and the references page opens', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('intro')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('intro')).toBeHidden();
  await page.goto('/?intro=0#/references');
  await expect(page.getByTestId('references')).toContainText('Educational use only');
});
