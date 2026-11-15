import { openHourDetails } from "./instrument-helpers";
import { expect, test } from "@playwright/test";

test("invalid place stays readable and exposes a stable error without fake weather", async ({ page }) => {
  await page.goto("/?place=not-a-location&genre=invalid");
  await expect(page.getByRole("alert", { name: "简报暂不可用" })).toContainText("INVALID_LOCATION");
  await expect(page.getByRole("heading", { name: "简报暂不可用" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "24 小时天气与光照" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("link", { name: "返回地点入口" }).click();
  await expect(page.getByRole("heading", { name: "尚未选择地点" })).toBeVisible();
});

test("explicit synthetic SSR document is readable through all sections and matches same-origin API", async ({ page, request }, testInfo) => {
  test.skip(process.env.HIKARI_SOURCE_MODE !== "fixture", "Requires explicit non-production source mode and test-only location preload; no live fallback");
  const clientExternal: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (req) => { if (new URL(req.url()).origin !== "http://127.0.0.1:3100") clientExternal.push(req.url()); });
  await page.goto("/?place=geonames:1796236&genre=invalid");
  await expect(page.getByRole("note")).toContainText("演示数据：人工合成");
  await expect(page.getByRole("heading", { name: "当天概览" })).toBeVisible();
  await expect(page.locator("article")).toContainText("人工合成上海浏览器样例");
  await expect(page.locator("article")).toContainText("当前题材：风光");
  const response = await request.get("/api/briefing?place=geonames:1796236");
  expect(response.status()).toBe(200); expect(response.headers()["cache-control"]).toBe("no-store");
  const { data, error } = await response.json();
  expect(error).toBeNull(); expect(data.hours).toHaveLength(24);
  await expect(page.locator("article")).toContainText(data.summary.headline);
  const sections = ["当天概览", "晚霞 / 火烧云机会 · 启发式推断", "太阳时段 · 天文计算", "24 小时天气与光照", "三题材摄影建议", "来源、更新时间与缺失说明"];
  let previousY = -1;
  for (const name of sections) {
    const heading = page.getByRole("heading", { name, exact: true });
    if (name === "24 小时天气与光照") await page.getByRole("link", {name:"02 皮包",exact:true}).click();
    if (name === "三题材摄影建议") await page.getByRole("link", {name:"03 手册",exact:true}).click();
    // Newspaper is a complete natural document; inspect its ordered headings before folding.
    if (!name.includes("太阳") && !name.includes("晚霞")) await heading.scrollIntoViewIfNeeded();
    await expect(heading).toBeVisible();
    const y = await heading.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    if (!name.includes("太阳") && !name.includes("晚霞")) { expect(y).toBeGreaterThan(previousY); previousY = y; }
  }
  await openHourDetails(page, 12);
  await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(24);
  await expect(page.locator('h3[id^="hour-"]')).toHaveCount(1);
  await expect(page.locator("article")).toContainText("参考每小时中点（:30）");
  await expect(page.locator("article")).toContainText("US_EPA");
  await expect(page.locator("article")).toContainText("含插值");
  await expect(page.locator("article")).toContainText("抓取：");
  await expect(page.locator("article")).toContainText("发布：");
  const details = page.locator("#hour-12").locator("..").locator("details");
  await details.locator("summary").click();
  await expect(details.getByText("PM2.5", { exact: true })).toBeVisible();
  await expect(details.getByText("能见度", { exact: true })).toBeVisible();
  await details.getByText("温度", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("hour-reading.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("link", {name:"03 手册",exact:true}).click();
  await page.getByRole("heading", { name: "三题材摄影建议", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("advice-reading.png") });
  await page.getByRole("heading", { name: "来源、更新时间与缺失说明", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("source-reading.png") });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("overview-reading.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(clientExternal).toEqual([]); expect(pageErrors).toEqual([]);
});
