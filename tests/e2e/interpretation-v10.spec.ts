import { test, expect } from "@playwright/test";
import { SCENARIOS } from "../fixtures/interpret-scenes";
import { at, sceneBriefing, setAll } from "../fixtures/interpret-helpers";
import { photoSolar } from "../fixtures/photography-synthetic";
import type { Genre } from "../../src/domain/types";

test.skip(process.env.HIKARI_SOURCE_MODE !== "fixture", "Requires explicit artificial fixture mode");
const GENRES: Genre[] = ["landscape", "portrait", "street"];
const cases = [5, 9, 21].flatMap(hour => SCENARIOS.map(scenario => ({ ...scenario, hour })));
cases.push({ id: "freezing-missing-cloud", hour: 9,
  edit: day => setAll(day, { weatherCode: 66, precipitation: 0.3, cloudTotal: null }) },
{ id: "freezing-arrival", hour: 9, edit: day => {
  const arrival = Date.parse(photoSolar.sunset!) - 20 * 60000;
  const index = day.hours.findIndex(hour => Date.parse(hour.start) <= arrival && arrival < Date.parse(hour.end));
  setAll(day, { weatherCode: 66, precipitation: 0 }, [index]);
} });
for (const { hour, ...scenario } of cases) test(`V10 ${scenario.id}@${String(hour).padStart(2, "0")} paper and complete advice`, async ({ page }, info) => {
  const now = at(hour), briefing = sceneBriefing(now, scenario.edit);
  await page.clock.setFixedTime(new Date(now));
  await page.addInitScript(({ place }) => localStorage.setItem("hikari-daily.preferences.v1", JSON.stringify({ place, genre: "landscape" })), { place: briefing.location.id });
  await page.route("**/api/briefing?*", route => route.fulfill({ json: { data: briefing, error: null } }));
  // No place in the initial URL: the server never requests upstream data or today's real date.
  await page.goto("/");
  const headline = page.locator("#newspaper .headline h2");
  await expect(headline).toHaveText(briefing.interpretation.headline);
  expect(Array.from(await headline.innerText()).length).toBeLessThanOrEqual(28);
  expect(await page.locator("#newspaper").evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.locator('.site-header nav [data-nav="book"]').click();
  await expect(page.locator("#spreads > .spread > .book-page")).toHaveCount(6);
  for (const [index, genre] of GENRES.entries()) {
    await page.locator(`#book-nav [data-genre="${index}"]`).click();
    await expect(page.locator(`#book-nav [data-genre="${index}"]`)).toHaveAttribute("aria-current", "");
    const spread = page.locator(`#spreads > .spread[data-genre="${index}"]`);
    await expect(spread.locator(".window small")).toHaveText(briefing.advice[genre].recommendedWindows.length ? "最值得拍的时间" : "拍摄时段");
    await expect(spread.locator(".plan li").first().locator("p")).toHaveText(briefing.advice[genre].light);
    if (scenario.id === "freezing-missing-cloud") await expect(spread.locator(".plan li").last().locator("p")).toContainText("结冰");
    if (info.project.name === "wide") expect(await spread.evaluate(node => (node as HTMLElement).offsetHeight)).toBe(610);
    // Measurements use the paper's own layout coordinates, independent of the scene transform.
    const papers = await spread.locator(":scope > .book-page").evaluateAll(nodes => nodes.map(node => {
      const paper = node as HTMLElement;
      const footer = paper.querySelector<HTMLElement>(".page-number")!;
      const children = [...paper.children] as HTMLElement[];
      return { height: paper.clientHeight, content: paper.scrollHeight, width: paper.clientWidth, scrollWidth: paper.scrollWidth,
        scrollTop: paper.scrollTop, overflow: getComputedStyle(paper).overflowY,
        inside: children.every(child => child.offsetTop >= 0 && child.offsetLeft >= 0 &&
          child.offsetTop + child.offsetHeight <= paper.clientHeight + 1 && child.offsetLeft + child.offsetWidth <= paper.clientWidth + 1),
        clear: children.filter(child => child !== footer).every(child => child.offsetTop + child.offsetHeight <= footer.offsetTop + 1) };
    }));
    for (const paper of papers) {
      expect(paper.inside, `${genre} paper bounds`).toBe(true);
      expect(paper.clear, `${genre} footer separation`).toBe(true);
      expect(paper.scrollWidth).toBeLessThanOrEqual(paper.width + 1);
      expect(paper.content).toBeLessThanOrEqual(paper.height + 1);
      expect(paper.overflow).toBe("visible");
      expect(paper.scrollTop).toBe(0);
      if (info.project.name === "wide") expect(paper.height).toBe(598);
    }
    const full = spread.locator(`[data-detail="advice-${genre}"]`);
    await full.click();
    await expect(page.locator("#detail")).toBeVisible();
    const advice = briefing.advice[genre];
    if (scenario.id === "freezing-arrival" && genre === "landscape") {
      expect(advice.opportunities[1]).toContain("别外出拍摄");
      await expect(page.locator("#detail-body")).not.toContainText("20 分钟到位");
    }
    await expect(page.locator("#detail-body").getByRole("heading", { name: "时段记录（含已经过去的）", exact: true })).toBeVisible();
    await expect(page.locator("#detail-body").getByRole("heading", { name: advice.recommendedWindows.length ? "最值得拍的时间" : "拍摄时段", exact: true })).toBeVisible();
    for (const text of [advice.timing, advice.light, ...advice.opportunities, ...advice.limitations,
      ...advice.alternatives, advice.film.reason, advice.film.caveat]) await expect(page.locator("#detail-body")).toContainText(text);
    await page.keyboard.press("Escape");
    await expect(page.locator("#detail")).not.toBeVisible();
  }
});
