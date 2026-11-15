import { test, expect } from '@playwright/test';
test('ordinary no-location entry needs no upstream data and offers an accessible search dialog',async({page})=>{
 const upstream:string[]=[];page.on('request',request=>{if(/open-meteo|api.met.no/.test(request.url()))upstream.push(request.url());});
 await page.goto('/');await expect(page.getByRole('heading',{name:'尚未选择地点'})).toBeVisible();await expect(page.locator('#newspaper')).toHaveCount(0);await expect(page.locator('#hour-dial')).toHaveCount(0);
 await page.getByRole('button',{name:'选择拍摄地点'}).click();await expect(page.getByRole('searchbox',{name:'中国大陆城市或区县'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'选择拍摄地点'})).toBeFocused();expect(upstream).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
