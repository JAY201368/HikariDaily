import { expect, type Page } from "@playwright/test";
export const hourDial = (page: Page) => page.getByRole("slider", {name:"拨针选择小时，北京时间"});
export async function selectHour(page: Page, hour: number) {
  if (await page.getByRole("dialog").isVisible()) await page.keyboard.press("Escape");
  await page.getByRole("link", {name:"02 皮包",exact:true}).click();
  const dial=hourDial(page); await dial.focus();
  await page.keyboard.press(hour > 11 ? "End" : "Home");
  for(let i=0;i<(hour > 11 ? 23-hour : hour);i++) await page.keyboard.press(hour > 11 ? "ArrowLeft" : "ArrowRight");
  await expect(dial).toHaveAttribute("aria-valuenow",String(hour));
}
export async function openHourDetails(page: Page, hour?: number) {
  if(hour !== undefined) await selectHour(page,hour);
  await page.getByRole("button", {name:"24 小时明细",exact:true}).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  return page.getByRole("dialog");
}
