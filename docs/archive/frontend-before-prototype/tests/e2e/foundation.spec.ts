import { expect, test } from "@playwright/test";

test("initial page stays readable and truthful without external services", async ({ page, baseURL }, testInfo) => {
  const externalRequests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin !== baseURL) {
      externalRequests.push(route.request().url());
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await page.goto("/");
  await expect(page).toHaveTitle("逐光日刊 · HikariDaily");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("heading", { name: "逐光日刊", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "尚未选择地点" })).toBeVisible();
  await expect(page.getByText("此页没有天气实况、预报或演示数值；", { exact: false })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/°C|μg|晴天/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("foundation.png"), fullPage: true });
});
