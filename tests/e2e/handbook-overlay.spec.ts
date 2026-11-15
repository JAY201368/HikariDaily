import { expect, test } from '@playwright/test';

test.skip(process.env.HIKARI_SOURCE_MODE !== 'fixture', 'Explicit fixture weather required');

test('handbook fills the reading layer and closes from its background', async ({ page }) => {
  await page.goto('/?place=geonames:1796236');
  await page.locator('#newspaper [data-nav="book"]').click();

  const reader = page.locator('#peer-reader');
  await expect(reader).toHaveAttribute('data-phase', 'reading');
  await expect(reader.locator('.peer-toolbar')).toBeHidden();
  await expect(page.locator('#book-nav [aria-current]')).toBeFocused();

  if (test.info().project.name === 'wide') {
    const book = await page.locator('#spreads').boundingBox();
    const navigation = await page.locator('#book-nav').boundingBox();
    expect(book).not.toBeNull();
    expect(navigation).not.toBeNull();
    expect(book!.width).toBeGreaterThan(1000);
    expect(book!.y).toBeGreaterThan(80);
    expect(navigation!.y + navigation!.height).toBeLessThan(950);
  }

  await page.locator('.peer-surface').click({ position: { x: 5, y: 5 } });
  await expect(reader).not.toBeVisible();
  await expect(page.locator('#newspaper [data-nav="book"]')).toBeFocused();
});

test('closing carries the selected left page and paper stack with the cover', async ({ page }) => {
  test.skip(test.info().project.name !== 'wide', 'Double-page closing motion');
  await page.goto('/?place=geonames:1796236');
  const reader = page.locator('#peer-reader');
  for (const genre of [0, 1, 2]) {
    await page.locator('#newspaper [data-nav="book"]').click();
    await expect(reader).toHaveAttribute('data-phase', 'reading');
    await page.locator(`#book-nav [data-genre="${genre}"]`).click();
    await expect(page.locator('#turn-leaf')).toBeHidden();
    const heading = await page.locator(`#spreads > .spread[data-genre="${genre}"] .genre-heading`).textContent();
    await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('[data-close-peer]')!.click();
      for (const selector of ['#book-cover', '.shell-left', '.paper-stack-left']) {
        const animation = document.querySelector(selector)!.getAnimations()[0];
        animation.pause();
        animation.currentTime = 60;
      }
    });
    await expect(page.locator('.cover-back .genre-heading')).toHaveText(heading!);
    await expect(page.locator('#spreads')).toHaveCSS('clip-path', 'inset(0px 0px 0px 50%)');
    const motion = await page.evaluate(() => ['#book-cover', '.shell-left', '.paper-stack-left'].map(selector => {
      const node = document.querySelector(selector)!;
      return { transform: getComputedStyle(node).transform, time: node.getAnimations()[0].currentTime };
    }));
    expect(motion.every(item => item.time === 60)).toBe(true);
    expect(motion[1].transform).toBe(motion[2].transform);
    expect(motion[0].transform).not.toBe('matrix(1, 0, 0, 1, 0, 0)');
    if (genre === 2) await page.screenshot({ path: '/tmp/hikari-handbook-closing.png' });
    await page.evaluate(() => {
      for (const selector of ['#book-cover', '.shell-left', '.paper-stack-left']) {
        document.querySelector(selector)!.getAnimations()[0].finish();
      }
    });
    await expect(reader).not.toBeVisible();
    await expect(page.locator('#handbook')).toHaveAttribute('data-phase', 'docked');
  }
});
