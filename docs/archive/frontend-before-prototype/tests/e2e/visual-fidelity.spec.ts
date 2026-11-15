import { hourDial, selectHour, openHourDetails } from "./instrument-helpers";
import { expect, test, type Page } from "@playwright/test";

async function frame(page: Page, kind: string, progress: number) {
  await page.evaluate(({kind,progress}) => {
    const d = document.querySelector<HTMLElement>("article")!.dataset;
    window.scrollTo(0, Number(d[`${kind}Start`]) + (Number(d[`${kind}End`]) - Number(d[`${kind}Start`])) * progress);
  }, {kind,progress});
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test("prototype composition, registered objects, attached pages and loose-sheet support", async ({page}, info) => {
  test.skip(process.env.HIKARI_SOURCE_MODE !== "fixture", "Explicit artificial fixtures required");
  await page.goto("/?place=geonames:1796236");
  const paper = page.locator("#newspaper"), root = page.locator("article");
  await expect(page.getByRole("note")).toContainText("演示数据");
  const opening = await paper.boundingBox();
  expect(opening!.y).toBeLessThan(190); // A full search form must never displace the front page.
  await page.screenshot({path:info.outputPath("opening.png")});
  await page.getByRole("link", {name:"02 皮包",exact:true}).click();
  if(info.project.name !== "wide") expect((await page.getByRole("heading", {name:"把天气带在身边。",exact:true}).boundingBox())!.y).toBeGreaterThanOrEqual(112);
  const objects = await page.locator("[data-bag]").evaluate(el => {
    const size = (selector:string) => {const r=el.querySelector(selector)!.getBoundingClientRect(); return {width:r.width,height:r.height};};
    const light = el.querySelector<HTMLElement>('[data-instrument-art="light"]')!;
    return {lightRatio:light.offsetWidth/light.offsetHeight,pocket:size("[data-pocket-book]")};
  });
  expect(objects.lightRatio).toBeCloseTo(150/183, 1);
  expect(objects.pocket.width/objects.pocket.height).toBeCloseTo(460/610, 1);
  await expect(page.locator('#instruments > [class*="readings"]')).toHaveCount(0);
  await expect(page.locator('#instruments > nav')).toHaveCount(0);
  await expect(page.getByRole("group", {name:"选择小时"})).toHaveCount(0);
  await expect(page.getByRole("button", {name:/^阅读.+说明$/})).toHaveCount(0);
  await expect(page.locator('#instruments > section[aria-labelledby^="hour-"]')).toHaveCount(0);
  await page.screenshot({path:info.outputPath("instruments.png")});
  await selectHour(page, 16);
  await expect(page.getByRole("button", {name:"16 时",exact:true})).toHaveCount(0);
  await openHourDetails(page);
  await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(24);
  await page.getByRole("dialog").getByRole("button", {name:"12 时",exact:true}).click();
  await expect(page.getByRole("dialog").locator("#hour-12")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(hourDial(page)).toHaveAttribute("aria-valuenow","12");
  await expect(page.getByRole("button", {name:"24 小时明细",exact:true})).toBeFocused();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.locator("#instruments").screenshot({path:info.outputPath("bag-without-legacy-panel.png")});
  await page.getByRole("link", {name:"03 手册",exact:true}).click();
  await page.getByRole("button", {name:"下一题材",exact:true}).click();
  await expect(page.locator("#advice-portrait")).toBeVisible();
  if(info.project.name === "wide") {
    await page.getByRole("button", {name:"上一题材",exact:true}).click();
    await expect(page.locator("#advice-landscape")).toBeVisible();
    await page.getByRole("button", {name:"下一题材",exact:true}).click();
    await expect(page.locator("#advice-portrait")).toBeVisible();
  }
  if(info.project.name !== "wide") {
    await page.locator("[data-book-reader]").evaluate(el=>el.scrollTo({left:el.clientWidth*2,behavior:"instant"}));
    await expect(page).toHaveURL(/genre=street/);
    await expect(page.locator("#advice-street")).toBeVisible();
  }
  if(info.project.name === "reduced-motion") {
    await expect(root).not.toHaveAttribute("data-scene");
    await expect(page.locator("[data-fold],[data-moving-book],[data-turn-leaf],[data-discovery-page]")).toHaveCount(0);
    await page.screenshot({path:info.outputPath("static-reader.png")});
    return;
  }
  await expect(root).toHaveAttribute("data-scene", "handbook");
  await frame(page,"fold",.75);
  if(info.project.name === "narrow") {
    const fold=page.locator("[data-fold]");
    await expect(fold).toHaveAttribute("data-rotation","90");
    expect(Number(await fold.getAttribute("data-stored-width"))).toBeGreaterThan(70);
    expect(Number(await fold.getAttribute("data-stored-width"))).toBeGreaterThan(Number(await fold.getAttribute("data-stored-height")));
  }
  await frame(page,"book",.95);
  const attached = await page.locator("[data-moving-book]").evaluate(el=> {
    const book=el.getBoundingClientRect(), page=document.querySelector('[data-book-reader] [data-active="true"]')!.getBoundingClientRect();
    const border = matchMedia("(max-width:48rem)").matches ? parseFloat(getComputedStyle(document.querySelector("[data-book-reader]")!).borderTopWidth) : 0;
    return {bookTop:book.top,pageTop:page.top-border};
  });
  expect(Math.abs(attached.bookTop-attached.pageTop)).toBeLessThan(3);
  await page.screenshot({path:info.outputPath("attached-opening.png")});
  if(info.project.name === "wide") {
    await page.evaluate(()=>{const d=document.querySelector<HTMLElement>("article")!.dataset;scrollTo(0,Number(d.readerStart)+Number(d.readDistance)+innerHeight*.6*.7);});
    await expect(page.locator("[data-turn-leaf]")).toHaveAttribute("data-back","next-page");
    await expect(page.locator("[data-turn-leaf] > :last-child")).toContainText("PORTRAIT");
    const spread=await page.locator('[data-genre="landscape"]').boundingBox();
    expect(spread!.width).toBeCloseTo(920,0);
    expect(spread!.height).toBeLessThan(760);
    await page.screenshot({path:info.outputPath("two-sided-turn.png")});
  }
  await frame(page,"slip",.35);
  const support=await page.locator("[data-loose-slip]").evaluate(el=>{
    const s=el.getBoundingClientRect(),p=document.querySelector("[data-discovery-page]")!.getBoundingClientRect();
    return {left:s.left-p.left,right:p.right-s.right,top:s.top-Math.max(112,p.top),bottom:Math.min(innerHeight,p.bottom)-s.bottom};
  });
  expect(Math.min(support.left,support.right,support.top,support.bottom)).toBeGreaterThanOrEqual(0);
  await expect(page.locator("[data-discovery-page]")).toBeVisible();
  await expect(page.locator("#handbook nav")).toHaveAttribute("inert", "");
  await expect(page.locator("#handbook nav")).not.toBeVisible();
  await page.screenshot({path:info.outputPath("supported-loose-sheet.png")});
  await frame(page,"slip",.98);
  await page.screenshot({path:info.outputPath("ending.png")});
  await frame(page,"slip",.35);
  await expect(page.locator("[data-discovery-page]")).toBeVisible();
  await page.getByRole("link", {name:"01 日报",exact:true}).click();
  expect((await paper.boundingBox())!.y).toBeLessThan(190);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
