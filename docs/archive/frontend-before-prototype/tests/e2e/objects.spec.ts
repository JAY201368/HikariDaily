import { hourDial, selectHour, openHourDetails } from "./instrument-helpers";
import { expect, test } from "@playwright/test";
const place = "geonames:1796236";
const fixtureOnly = () => test.skip(process.env.HIKARI_SOURCE_MODE !== "fixture", "Explicit artificial fixture and location preload required");
test("T09 objects, hour dial, dialog focus and native handbook remain readable", async ({ page }, info) => {
    fixtureOnly();
    const calls: string[] = [];
    page.on("request", r => { if (new URL(r.url()).pathname === "/api/briefing")
        calls.push(r.url()); });
    await page.goto(`/?place=${place}`);
    await expect(page.getByRole("note")).toContainText("人工合成");
    const dial = page.getByRole("slider", { name: "拨针选择小时，北京时间" });
    await expect(dial).toHaveAttribute("aria-valuetext", "尚未选择小时");
    await page.locator('#newspaper').screenshot({ path: info.outputPath('T09-newspaper.png') });
    await page.getByRole("link", { name: "02 皮包", exact: true }).click();
    await dial.focus();
    await page.keyboard.press("End");
    await expect(hourDial(page)).toHaveAttribute("aria-valuenow", "23");
    await page.keyboard.press("Home");
    await expect(hourDial(page)).toHaveAttribute("aria-valuenow", "0");
    await page.keyboard.press("ArrowRight");
    await expect(hourDial(page)).toHaveAttribute("aria-valuenow", "1");
    await page.getByRole('button', { name: '表盘后一小时', exact: true }).click();
    await expect(hourDial(page)).toHaveAttribute("aria-valuenow", "2");
    await page.getByRole('button', { name: '表盘前一小时', exact: true }).click();
    await expect(hourDial(page)).toHaveAttribute("aria-valuenow", "1");
    const rect = await dial.boundingBox();
    if (!rect)
        throw Error('dial missing');
    if (info.project.name === 'narrow')
        await page.touchscreen.tap(rect.x + rect.width * .85, rect.y + rect.height * .5);
    else
        await page.mouse.click(rect.x + rect.width * .85, rect.y + rect.height * .5);
    await expect(hourDial(page)).toHaveAttribute("aria-valuenow", "6");
    await selectHour(page, 16);
    await page.locator('[data-bag]').screenshot({ path: info.outputPath('T09-bag.png') });
    const lcdChecks = await page.locator('[data-instrument-art] [class*="Lcd"]').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return [...node.children].every(child => { const b = child.getBoundingClientRect(); return b.left >= r.left - 1 && b.right <= r.right + 1 && b.top >= r.top - 1 && b.bottom <= r.bottom + 1; }); }));
    expect(lcdChecks.length).toBeGreaterThanOrEqual(3);
    expect(lcdChecks.every(Boolean)).toBe(true);
    for (const name of ['风温湿仪', '太阳方位仪', '经典测光表 · 光照解释', '气象记录卡']) {
        const opener = page.getByRole('button', { name: `${name}，打开说明`, exact: true });
        await opener.click();
        await expect(page.getByRole('dialog')).toBeVisible();
        if (name === '太阳方位仪') {
            await expect(page.getByRole('dialog')).toContainText('16:30');
            await expect(page.getByRole('dialog')).toContainText('不是设备朝向');
            await page.getByRole('dialog').screenshot({ path: info.outputPath('T09-direction-detail.png') });
        }
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).not.toBeVisible();
        await expect(opener).toBeFocused();
    }
    await page.getByRole('link', { name: '03 手册', exact: true }).click();
    await page.getByRole('button', { name: '下一题材', exact: true }).click();
    await expect(page.locator('#advice-portrait')).toBeVisible();
    await expect(page).toHaveURL(/genre=portrait/);
    if (info.project.name !== 'wide') {
        await page.locator('[data-genre="portrait"]').evaluate(el => el.parentElement!.scrollTo({ left: el.parentElement!.clientWidth * 2, behavior: 'instant' }));
        await expect(page.locator('#advice-street')).toBeVisible();
    }
    else {
        await page.getByRole('navigation', { name: '摄影题材' }).getByRole('button', { name: '街拍', exact: true }).click();
    }
    // A tall element screenshot temporarily resizes a mobile viewport and can reset native scroll snap. Capture the actual viewport without altering its geometry.
    await page.locator('#advice-street').scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('T09-handbook-street.png') });
    await expect(page.locator('#advice-street')).toBeVisible();
    await expect(page).toHaveURL(/genre=street/);
    await expect(page.locator('#handbook')).toContainText('不保存订阅设置');
    await expect(page.locator('#handbook input')).toHaveCount(0);
    await page.getByRole('button', { name: '简化阅读', exact: true }).click();
    await expect(page.locator('[data-bag]')).toBeVisible();
    await expect(page.getByRole('button', { name: '风温湿仪，打开说明', exact: true })).toBeVisible();
    expect(calls).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("T09 long place, missing readings and source failure keep full text and nulls", async ({ page, request }, info) => {
    fixtureOnly();
    const result = await (await request.get(`/api/briefing?place=${place}`)).json();
    const longName = '人工长地点名称·同名地区行政上下文完整保留·不能截断核心文字';
    result.data.location.name = longName;
    result.data.state = 'partial';
    result.data.sources[0].status = 'failed';
    result.data.warnings.push('人工故障：主源不可用，逐字段保留缺失与回退语境。');
    for (const metric of Object.values(result.data.hours[16].weather) as {
        value: number | null;
        state: string;
        notes: string[];
        sourceIds: string[];
    }[]) {
        metric.value = null;
        metric.state = 'missing';
        metric.notes = ['人工缺失，非零值'];
        metric.sourceIds = [];
    }
    result.data.hours[16].light = { phase: 'unknown', character: 'unknown', altitude: null, azimuth: null, description: '暂无光照判断，天气与太阳位置缺失。', reasons: [], limitations: ['人工缺失'], sourceIds: [] };
    await page.route('**/api/briefing?*', r => r.fulfill({ json: result }));
    await page.goto(`/?place=${place}`);
    await page.getByRole('button', { name: '刷新 / 重试简报' }).click();
    await expect(page.locator('#overview-heading').locator('..')).toContainText(longName);
    await openHourDetails(page, 16);
    await expect(page.locator('#hour-16').locator('..')).toContainText('暂无光照判断');
    await page.locator('#hour-16').locator('..').locator('summary').click();
    await expect(page.locator('#hour-16').locator('..')).toContainText('人工缺失，非零值');
    await page.keyboard.press('Escape');
    await page.locator('[data-bag]').screenshot({ path: info.outputPath('T09-missing-bag.png') });
    await page.getByRole('link', { name: '01 日报', exact: true }).click();
    await page.locator('#newspaper').screenshot({ path: info.outputPath('T09-long-place.png') });
    await page.getByRole('link', { name: '02 皮包', exact: true }).click();
    await page.getByRole('button', { name: '风温湿仪，打开说明', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('小时最大阵风 暂无');
    await page.getByRole('dialog').screenshot({ path: info.outputPath('T09-missing-detail.png') });
    await page.keyboard.press('Escape');
    await expect(page.locator('#sources-heading').locator('..')).toContainText('失败');
    await expect(page.locator('#sources-heading').locator('..')).toContainText('人工故障');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("T09 content does not wait for decorative downloads", async ({ page }) => { fixtureOnly(); await page.route('**/objects/**', route => route.abort()); await page.route('**/textures/**', route => route.abort()); await page.goto(`/?place=${place}`); await expect(page.locator('#overview-heading')).toBeVisible(); await selectHour(page, 12); await expect(hourDial(page)).toHaveAttribute("aria-valuenow", "12"); await page.locator('#advice-landscape').scrollIntoViewIfNeeded(); await expect(page.locator('#advice-landscape')).toBeVisible(); });
