import { expect, test } from '@playwright/test';

test.skip(process.env.HIKARI_SOURCE_MODE !== 'fixture', 'Explicit fixture weather required');

test('subscription is centered, keeps its form and closes from the background', async ({ page }) => {
  await page.goto('/?place=geonames:1796236');
  const opener = page.locator('.subscription-pull');
  const reader = page.locator('#peer-reader');
  await expect(opener).toBeAttached();
  await page.evaluate(() => window.dispatchEvent(new Event('hikari:peer-dock')));
  await opener.click();
  await expect(reader).toHaveAttribute('data-phase', 'reading');
  await expect(reader.locator('.peer-toolbar')).toBeHidden();
  await expect(page.locator('#place')).toBeFocused();

  const paper = await page.locator('#subscription').boundingBox();
  const viewport = page.viewportSize()!;
  expect(paper).not.toBeNull();
  expect(Math.abs(paper!.x + paper!.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(paper!.y + paper!.height / 2 - viewport.height / 2)).toBeLessThan(2);
  expect(paper!.x).toBeGreaterThan(16);
  if (test.info().project.name === 'wide') expect(paper!.width).toBe(760);
  await page.screenshot({ path: `/tmp/hikari-subscription-${test.info().project.name}.png` });

  await page.locator('#place').fill('南昌');
  await page.locator('#subscription input[value="12:00"]').check();
  await page.locator('#subscription button[type="submit"]').click();
  await expect(page.locator('#registration')).toBeVisible();
  await expect(reader).toHaveAttribute('data-phase', 'reading');
  await reader.locator('.peer-surface').click({ position: { x: 5, y: 5 } });
  await expect(reader).not.toBeVisible();
  await expect(opener).toBeFocused();

  await opener.click();
  await expect(reader).toHaveAttribute('data-phase', 'reading');
  await expect(page.locator('#place')).toHaveValue('南昌');
  await expect(page.locator('#subscription input[value="12:00"]')).toBeChecked();
  await expect(page.locator('#registration')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(reader).not.toBeVisible();
  await expect(opener).toBeFocused();
});
