import { test, expect } from '@playwright/test';

async function range(page, id, value) {
  await page.locator(`#${id}`).evaluate((input, next) => {
    input.value = next;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, String(value));
}

test('renders every style, reveals exact counts, and responds to camera and playback controls', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  const stage = page.locator('#canvas-container');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#render-error')).toBeHidden();
  await expect(page.locator('#total-points')).toHaveText('512');
  await page.screenshot({ path: testInfo.outputPath('wireframe.png'), fullPage: true });
  await range(page, 'order', 2);
  await expect(page.locator('#total-points')).toHaveText('64');
  for (const mode of ['wireframe', 'shaded', 'textured', 'dots']) {
    await page.locator(`[data-mode="${mode}"]`).click();
    await expect(stage).toHaveAttribute('data-mode', mode);
    for (const count of [0, 1, 32, 64]) {
      await range(page, 'reveal', count);
      await expect(stage).toHaveAttribute('data-revealed', String(count));
      await expect(page.locator('#revealed-number')).toHaveValue(String(count));
    }
    await page.screenshot({ path: testInfo.outputPath(`${mode}.png`), fullPage: true });
  }
  await page.locator('#palette').selectOption('ember');
  await range(page, 'point-size', 15);
  await range(page, 'pulse', 0);
  await expect(page.locator('#point-size-value')).toHaveText('15 px');
  await page.locator('[data-view="top"]').click();
  await range(page, 'zoom', 150);
  await expect(page.locator('#zoom-value')).toHaveText('150%');
  await page.locator('summary').click();
  await range(page, 'rotate-x', 90);
  await page.locator('#auto-rotate').check();
  await page.locator('#reset').click();
  await expect(page.locator('#rotate-x')).toHaveValue('0');
  await expect(page.locator('#auto-rotate')).not.toBeChecked();
  await expect(page.locator('#zoom-value')).toHaveText('100%');
  await page.locator('#revealed-number').fill('99999');
  await page.locator('#revealed-number').blur();
  await expect(page.locator('#revealed-number')).toHaveValue('64');
  await page.locator('#loop').uncheck();
  await page.locator('#duration').selectOption('5');
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveAttribute('aria-pressed', 'true');
  await expect(stage).toHaveAttribute('data-revealed', '64', { timeout: 15000 });
  await expect(page.locator('#play')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('[data-mode="wireframe"]').click();
  await range(page, 'order', 6);
  await expect(page.locator('#total-points')).toHaveText('262,144');
  await expect(stage).toHaveAttribute('data-revealed', '262144');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#snapshot').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('hilbert-order-6-wireframe.png');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});
