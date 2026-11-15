import { hourDial, selectHour, openHourDetails } from "./instrument-helpers";
import { expect, test, type Page } from "@playwright/test";
const first = "geonames:1796236", second = "geonames:1816670";
const fixtureOnly = () => test.skip(process.env.HIKARI_SOURCE_MODE !== "fixture", "Explicit non-production fixture + artificial location preload required");
async function select(page: Page, query: string, name: RegExp) {
  await page.getByRole("searchbox", { name: "中国大陆城市或区县" }).fill(query);
  await page.getByRole("list", { name: "地点搜索结果" }).getByRole("button", { name }).click();
}

test("search debounce, context, local memory, URL priority, hours and genre operate without weather refetch", async ({ page }, testInfo) => {
  fixtureOnly();
  const searches: string[] = [], briefings: string[] = [];
  page.on("request", (request) => { const url = new URL(request.url()); if (url.pathname === "/api/locations") searches.push(url.searchParams.get("q")!); if (url.pathname === "/api/briefing") briefings.push(request.url()); });
  await page.goto("/");
  const clockStart = Date.now();
  await page.clock.install({ time: new Date(clockStart) });
  await page.clock.pauseAt(clockStart + 1000);
  const input = page.getByRole("searchbox", { name: "中国大陆城市或区县" });
  await input.fill("上"); await page.clock.runFor(500); expect(searches).toEqual([]);
  await input.fill("上海"); await page.clock.runFor(299); expect(searches).toEqual([]);
  await page.clock.runFor(1); await expect(page.getByRole("list", { name: "地点搜索结果" })).toContainText("人工上海行政上下文");
  expect(searches).toEqual(["上海"]);
  await input.fill("无结果"); await page.clock.runFor(300);
  await expect(page.getByRole("status").filter({ hasText: "没有找到城市或区县" })).toBeVisible();
  await input.fill("同名"); await page.clock.runFor(300);
  const results = page.getByRole("list", { name: "地点搜索结果" });
  await expect(results.getByRole("button")).toHaveCount(2); await expect(results).toContainText("人工北京行政上下文"); await expect(results).toContainText("区县级");
  await results.getByRole("button", { name: /人工合成上海/ }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "当天概览", exact: true })).toBeVisible();
  expect(briefings).toHaveLength(1); await expect(page).toHaveURL(/place=geonames%3A1796236/);
  const headline = await page.locator("#overview-heading").locator("..").textContent();
  await selectHour(page,0); await hourDial(page).focus(); await page.keyboard.press("ArrowRight");
  await expect(hourDial(page)).toBeFocused();
  await expect(hourDial(page)).toHaveAttribute("aria-valuenow", "1"); await page.keyboard.press("End"); await expect(hourDial(page)).toHaveAttribute("aria-valuenow", "23");
  await page.keyboard.press("Home"); await expect(hourDial(page)).toHaveAttribute("aria-valuenow", "0");
  await page.getByRole("button", { name: "表盘后一小时", exact: true }).click(); await expect(hourDial(page)).toHaveAttribute("aria-valuenow", "1");
  await page.getByRole("link", { name: "03 手册", exact: true }).click();
  const portrait = page.getByRole("navigation", { name: "摄影题材" }).getByRole("button", { name: "人像", exact: true });
  if (testInfo.project.name === "narrow") await portrait.tap(); else await portrait.click();
  await expect(page.locator("#advice-portrait")).toBeVisible(); await expect(page.locator("#advice-landscape")).toHaveCount(0);
  await expect(page).toHaveURL(/genre=portrait/); expect(briefings).toHaveLength(1);
  expect(await page.locator("#overview-heading").locator("..").textContent()).toBe(headline);
  await page.goBack(); await expect(page.locator("#advice-landscape")).toBeVisible(); expect(briefings).toHaveLength(1);
  await page.goForward(); await expect(page.locator("#advice-portrait")).toBeVisible();
  await page.reload(); await expect(page.locator("#advice-portrait")).toBeVisible(); expect(briefings).toHaveLength(1);
  await page.goto("/"); await expect(page.getByRole("heading", { name: "当天概览", exact: true })).toBeVisible(); await expect(page).toHaveURL(/genre=portrait/);
  await page.goto(`/?place=${second}&genre=invalid`); await expect(page.locator("#overview-heading").locator("..")).toContainText("人工合成北京区域");
  await expect(page.locator("#advice-landscape")).toBeVisible(); await expect(page).toHaveURL(/genre=landscape/);
  await openHourDetails(page,12);
  await page.locator("#hour-12").locator("..").locator("details summary").click();
  await expect(page.locator("#hour-12").locator("..")).toContainText("参考 12:30");
  await page.locator("#hour-12").scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath("selected-hour.png") });
  await page.keyboard.press("Escape");
  await page.locator("#sources-heading").scrollIntoViewIfNeeded();
  await expect(page.locator("#sources-heading").locator("..")).toContainText("规则推断");
  await expect(page.locator("#sources-heading").locator("..")).toContainText("US_EPA");
  await page.screenshot({ path: testInfo.outputPath("source-context.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("late place response cannot replace a newer selection; loading clears hours and errors never fabricate data", async ({ page, request }, testInfo) => {
  fixtureOnly();
  const a = await (await request.get(`/api/briefing?place=${first}`)).json();
  const b = await (await request.get(`/api/briefing?place=${second}`)).json();
  let release!: () => void;
  const held = new Promise<void>((done) => { release = done; });
  let oldStarted = false;
  await page.route("**/api/briefing?*", async (route) => {
    const place = new URL(route.request().url()).searchParams.get("place");
    if (place === second) { oldStarted = true; await held; await route.fulfill({ json: b }).catch(() => {}); }
    else await route.fulfill({ json: a });
  });
  await page.goto(`/?place=${first}`); await selectHour(page, 9);
  await select(page, "北京", /人工合成北京/); await expect.poll(() => oldStarted).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: "正在加载所选地点" })).toBeVisible();
  await expect(page.locator("article")).toHaveCount(0);
  await select(page, "上海", /人工合成上海/);
  await expect(page.locator("#overview-heading").locator("..")).toContainText("人工合成上海");
  await expect(hourDial(page)).toHaveAttribute("aria-valuetext", "尚未选择小时");
  release(); await page.clock.install(); await page.clock.runFor(500);
  await expect(page.locator("article")).not.toContainText("人工合成北京区域"); await expect(hourDial(page)).toHaveAttribute("aria-valuetext", "尚未选择小时");
  await page.unroute("**/api/briefing?*");
  await page.route("**/api/briefing?*", (route) => route.fulfill({ contentType: "application/json", body: "{bad-json" }));
  await page.getByRole("button", { name: "刷新 / 重试简报" }).click();
  await expect(page.getByRole("alert", { name: "简报暂不可用" })).toContainText("BRIEFING_UNAVAILABLE");
  await expect(page.locator("article")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("stable-failure.png") });
  await page.unroute("**/api/briefing?*");
  await page.route("**/api/briefing?*", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "刷新 / 重试简报" }).click();
  await expect(page.getByRole("alert", { name: "简报暂不可用" })).toContainText("BRIEFING_UNAVAILABLE"); await expect(page.locator("article")).toHaveCount(0);
});

test("browser timer pauses on injected visibility, resumes on age, and replaces the day at Beijing midnight", async ({ page, request }) => {
  fixtureOnly();
  const fixture = await (await request.get(`/api/briefing?place=${first}`)).json();
  let calls = 0;
  await page.clock.install({ time: new Date(fixture.data.generatedAt) });
  await page.route("**/api/briefing?*", async (route) => {
    calls++;
    const now = await page.evaluate(() => Date.now());
    const day = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
    const data = structuredClone(fixture.data);
    data.generatedAt = new Date(now).toISOString(); data.localDate = day;
    data.solar = { sunrise: null, sunset: null, morningBlue: null, morningGolden: null, eveningGolden: null, eveningBlue: null, notes: ["人工跨日浏览器样例，未重新计算星历"] };
    const from = Date.parse(`${day}T00:00:00+08:00`);
    data.hours.forEach((hour: { start: string; end: string }, i: number) => { hour.start = new Date(from + i * 3600000).toISOString(); hour.end = new Date(from + (i + 1) * 3600000).toISOString(); });
    await route.fulfill({ json: { data, error: null } });
  });
  await page.goto(`/?place=${first}`); await expect(page.locator("#overview-heading")).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.clock.runFor(30 * 60000); expect(calls).toBe(0);
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect.poll(() => calls).toBe(1); await expect(page.getByRole("button", { name: "刷新 / 重试简报" })).toBeEnabled();
  await page.clock.runFor(15 * 60000); await expect.poll(() => calls).toBe(2);
  await expect(page.getByRole("button", { name: "刷新 / 重试简报" })).toBeEnabled();
  await selectHour(page, 23);
  // Jump the clock, then resume through the same visibility event to check date/age.
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  const midnight = Date.parse(`${fixture.data.localDate}T23:59:59.900+08:00`);
  // Freeze the 100 ms boundary while the larger object DOM renders; elapsed wall time must not trigger midnight before the assertion.
  await page.clock.pauseAt(midnight);
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect.poll(() => calls).toBe(3); await expect(page.getByRole("button", { name: "刷新 / 重试简报" })).toBeEnabled();
  await page.clock.runFor(100); await expect.poll(() => calls).toBe(4);
  const nextDay = new Date(midnight + 100 + 8 * 3600000).toISOString().slice(0, 10);
  await expect(page.locator("#overview-heading").locator("..")).toContainText(nextDay);
  await expect(hourDial(page)).toHaveAttribute("aria-valuetext", "尚未选择小时");
});

test("partial, stale and 503 unavailable documents preserve nulls, provenance and available solar", async ({ page, request }) => {
  fixtureOnly();
  const fixture = await (await request.get(`/api/briefing?place=${first}`)).json();
  let mode = "partial";
  await page.route("**/api/briefing?*", async (route) => {
    const data = structuredClone(fixture.data); data.state = mode;
    if (mode === "partial") {
      data.hours[0].weather.temperature = { value: null, state: "missing", notes: ["人工部分缺失样例"], sourceIds: [] };
    } else if (mode === "stale") {
      data.hours[0].weather.temperature.state = "stale";
      data.warnings.push("人工旧缓存样例，抓取时间以来源为准");
    } else {
      for (const hour of data.hours) for (const metric of [...Object.values(hour.weather), ...Object.values(hour.air)] as { value: number | null; state: string; sourceIds: string[]; notes: string[] }[]) {
        metric.value = null; metric.state = "missing"; metric.sourceIds = []; metric.notes = ["人工全部气象缺失样例"];
      }
    }
    await route.fulfill({ status: mode === "unavailable" ? 503 : 200, json: { data, error: mode === "unavailable" ? { code: "WEATHER_UNAVAILABLE", message: "天气与空气暂不可用；太阳事件仅为计算。" } : null } });
  });
  await page.goto(`/?place=${first}`);
  await page.getByRole("button", { name: "刷新 / 重试简报" }).click();
  await expect(page.locator("#overview-heading").locator("..")).toContainText("部分数据可用");
  await openHourDetails(page, 0);
  await page.locator("#hour-0").locator("..").locator("summary").click();
  await expect(page.locator("#hour-0").locator("..")).toContainText("人工部分缺失样例");
  await expect(page.locator("#hour-0").locator("..").locator("dt", { hasText: /^温度$/ }).locator("..")).toContainText("暂无数据");
  await page.keyboard.press("Escape");
  mode = "stale"; await page.getByRole("button", { name: "刷新 / 重试简报" }).click();
  await expect(page.locator("#overview-heading").locator("..")).toContainText("使用允许范围内的旧数据");
  mode = "unavailable"; await page.getByRole("button", { name: "刷新 / 重试简报" }).click();
  await expect(page.getByRole("alert", { name: "简报暂不可用" })).toContainText("WEATHER_UNAVAILABLE");
  await expect(page.locator("#overview-heading").locator("..")).toContainText("气象数据不可用");
  await expect(page.locator("#solar-heading").locator("..")).toContainText("日出");
  await openHourDetails(page,0);
  await expect(page.locator("#hour-0").locator("..")).toContainText("暂无数据");
  await page.keyboard.press("Escape");
});
