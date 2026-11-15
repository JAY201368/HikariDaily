import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Briefing } from '../../src/domain/types';

test.skip(process.env.HIKARI_SOURCE_MODE!=='fixture','Requires explicit fixture mode and location preload');
test('source tables, evidence, return state and real mouse entry',async({page,request},info)=>{
 const b=(await (await request.get('/api/briefing?place=geonames:1796236')).json()).data as Briefing;
 b.hours[0].weather.temperature={value:null,state:'missing',sourceIds:[],notes:['测试缺失气温']};
 await page.route('**/api/briefing?*',route=>route.fulfill({json:{data:b,error:null}}));
 await page.goto('/?place=geonames:1796236');
 await expect(page.locator('.dial-marks > line')).toHaveCount(24);
 // Browser routing does not intercept the server's direct SSR service call.
 const refreshed=page.waitForResponse('**/api/briefing?*');
 await page.locator('.header-refresh').click();await refreshed;
 await expect(page.locator('.header-refresh')).toBeEnabled();
 const opener=page.locator('#newspaper [data-detail="sources"]');await opener.click();
 const dialog=page.locator('#detail');
 await expect(dialog.getByRole('heading',{name:'来源、更新时间与缺失说明'})).toBeVisible();
 await expect(dialog.locator('.sources-entry')).toHaveCount(b.sources.length);
 await expect(dialog.locator('.sources-raw-hours,[data-source-table],.sources-method,.sources-solar')).toHaveCount(0);
 await expect(dialog.locator('.sources-credits')).toContainText('CC BY 4.0');
 await expect(dialog.locator('.sources-credits details,.sources-credits summary')).toHaveCount(0);
 await mkdir('/tmp/hikari-sources-tables',{recursive:true});
 await page.screenshot({path:`/tmp/hikari-sources-tables/${info.project.name}-overview.png`});
 const jump=dialog.locator('[data-source-jump]').first();
 if(await jump.count()){
  const key=await jump.getAttribute('data-source-jump');await jump.click();
  await expect(dialog.locator(`[data-source-cell="${key}"]`).first()).toBeVisible();
  await dialog.locator('[data-source-back="overview"]').click();await expect(jump).toBeFocused();
 }
 await dialog.locator('[data-source-jump="temperature"]').first().click();
 await expect(dialog.locator('tbody tr')).toHaveCount(24);
 await expect(dialog.locator('[data-source-group]')).toHaveCount(5);
 await dialog.locator('[data-source-group="wind"]').click();
 const region=dialog.locator('.source-table-scroll');
 await region.evaluate(n=>{n.scrollLeft=120;});
 const left=await region.evaluate(n=>n.scrollLeft);
 const cell=dialog.locator('[data-source-cell="windSpeed"][data-source-hour="9"]');
 await cell.focus();await cell.press('Enter');
 await expect(dialog).toContainText('采用值');await expect(dialog).toContainText('来源对比');
 await dialog.locator('[data-source-back="table"]').click();
 await expect(cell).toBeFocused();expect(await region.evaluate(n=>n.scrollLeft)).toBe(left);
 await expect(dialog.locator('[data-source-group="wind"]')).toHaveAttribute('aria-pressed','true');
 await dialog.locator('[data-source-filter]').click();
 await expect(dialog.locator('[data-source-filter]')).toHaveAttribute('aria-pressed','true');
 await dialog.locator('[data-source-locate]').click();await expect(dialog.locator('[data-source-filter]')).toHaveAttribute('aria-pressed','false');
 await dialog.locator('[data-source-group="cloud"]').click();
 expect(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
 const first=dialog.locator('tbody th').first();
 await first.scrollIntoViewIfNeeded();const x=(await first.boundingBox())!.x;
 await region.evaluate(n=>{n.scrollLeft=180;});expect(Math.abs((await first.boundingBox())!.x-x)).toBeLessThan(1);
 await mkdir('/tmp/hikari-sources-tables',{recursive:true});
 await page.screenshot({path:`/tmp/hikari-sources-tables/${info.project.name}-table.png`});
 await dialog.evaluate(n=>{n.scrollTop+=650;});
 await expect.poll(async()=>{const head=await dialog.locator('thead th').first().boundingBox(),box=await dialog.boundingBox();return Math.abs(head!.y-box!.y);}).toBeLessThan(2);
 await dialog.locator('[data-source-group="light"]').click();
 await dialog.locator('[data-source-cell="light"]').first().click();
 await expect(dialog).toContainText('风险及其来源');
 await page.screenshot({path:`/tmp/hikari-sources-tables/${info.project.name}-evidence.png`});
 await dialog.locator('[data-source-back="table"]').click();
 await dialog.locator('[data-source-back="overview"]').click();await expect(dialog.locator('[data-source-jump="temperature"]').first()).toBeFocused();
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(opener).toBeFocused();
 const footer=page.locator('.site-footer [data-detail="sources"]');await footer.click();await expect(dialog).toBeVisible();
 await page.keyboard.press('Escape');await expect(footer).toBeFocused();
});

test('source-name popup keeps metadata readable and returns to its row',async({page,request},info)=>{
 await page.setViewportSize({width:info.project.use.viewport!.width,height:520});
 const b=(await (await request.get('/api/briefing?place=geonames:1796236')).json()).data as Briefing;
 await page.goto('/?place=geonames:1796236');await expect(page.locator('.dial-marks > line')).toHaveCount(24);
 await page.locator('#newspaper [data-detail="sources"]').click();
 const parent=page.locator('#detail'),popup=page.locator('#source-record');
 const header=parent.locator('.dialog-top'),before=(await header.boundingBox())!.y;
 await parent.evaluate(n=>{n.scrollTop=160;});
 expect(Math.abs((await header.boundingBox())!.y-(before-160))).toBeLessThan(1);
 await expect(header).toHaveCSS('position','static');

 await expect(parent.locator('.sources-catalog thead th')).toHaveCount(4);
 await expect(parent.locator('.sources-catalog')).not.toContainText('上游发布');
 await expect(parent.locator('.sources-catalog details')).toHaveCount(0);
 for(let i=0;i<b.sources.length;i++){
  const name=parent.locator(`[data-source-record="${i}"]`);await name.scrollIntoViewIfNeeded();
  const top=await parent.evaluate(n=>n.scrollTop);
  await name.click();await expect(popup).toBeVisible();
  await expect(popup.locator('h2')).toHaveText(b.sources[i].provider);
  await expect(popup).toContainText(b.sources[i].dataset);await expect(popup).toContainText(b.sources[i].id);
  await expect(popup).toContainText(b.sources[i].model??'未提供');
  await expect(popup).toContainText('适用时段');await expect(popup).toContainText('原生分辨率');
  expect(await popup.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
  await expect(page.locator('#close-source-record')).toBeFocused();
  if(i===0){
   const heading=popup.locator('.dialog-top'),start=(await heading.boundingBox())!.y;
   const amount=await popup.evaluate(n=>{n.scrollTop=100;return n.scrollTop;});
   expect(amount).toBeGreaterThan(0);expect(Math.abs((await heading.boundingBox())!.y-(start-amount))).toBeLessThan(1);
   await expect(heading).toHaveCSS('position','static');await popup.evaluate(n=>{n.scrollTop=0;});
  }

  await page.keyboard.press('Tab');await expect(popup.getByRole('link')).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.locator('#close-source-record')).toBeFocused();
  if(i===0){await mkdir('/tmp/hikari-source-popup',{recursive:true});await page.screenshot({path:`/tmp/hikari-source-popup/${info.project.name}.png`});}
  if(i%2)await popup.getByRole('button',{name:'关闭来源详情'}).click();else await page.keyboard.press('Escape');
  await expect(popup).not.toBeVisible();await expect(parent).toBeVisible();await expect(name).toBeFocused();
  expect(await parent.evaluate(n=>n.scrollTop)).toBe(top);
 }
 await page.keyboard.press('Escape');await expect(parent).not.toBeVisible();
});
