import { openHourDetails } from "./instrument-helpers";
import { expect, test } from '@playwright/test';
const fixtureOnly = () => test.skip(process.env.HIKARI_SOURCE_MODE !== 'fixture', 'Explicit artificial fixtures required');
test('T10 reversible geometry, full reading, independent folds and clear-before-travel', async ({page}, info) => {
  fixtureOnly(); await page.goto('/?place=geonames:1796236');
  const root = page.locator('article');
  if (info.project.name === 'reduced-motion') {
    await expect(root).not.toHaveAttribute('data-scene');
    await expect(page.locator('[data-scene-run="fold"]')).toHaveCSS('height','0px');
    await page.getByRole('button',{name:'下一题材',exact:true}).click();
    await expect(page.locator('#advice-portrait')).toBeVisible();
    await page.screenshot({path:info.outputPath('T10-reduced.png')}); return;
  }
  await expect(root).toHaveAttribute('data-fold-start', /\d/);
  const positions = await root.evaluate(el=>({... (el as HTMLElement).dataset}));
  async function go(kind:string,p:number) { await page.evaluate(({kind,p})=>{const d=document.querySelector<HTMLElement>('article')!.dataset; const start=Number(d[`${kind}Start`]),end=Number(d[`${kind}End`]); window.scrollTo(0,start+(end-start)*p);},{kind,p}); await expect.poll(async()=>page.evaluate(()=>scrollY)).toBeGreaterThan(0); await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))); }
  const records = [];
  for(const [name,p] of [['fold1',.13],['fold2',.39],['aligned',.75],['insert',.82],['dial-clear',.92],['dial-travel',.96]] as const) {
    await go('fold',p);
    const data=await page.locator('[data-fold]').evaluate(el=>({... (el as HTMLElement).dataset}));
    if(name==='fold1') { expect(Number(data.first)).toBeGreaterThan(.2); expect(Number(data.second)).toBe(0); }
    if(name==='fold2') { expect(Number(data.first)).toBe(1); expect(Number(data.second)).toBeGreaterThan(.2); expect(Number(data.align)).toBe(0); }
    if(name==='aligned') { expect(Number(data.first)).toBe(1); expect(Number(data.second)).toBe(1); expect(Number(data.descend)).toBeLessThan(.01); }
    if(name==='dial-clear') { expect(Number(await page.locator('[data-dial-home]').evaluate(el=>el.querySelector('[data-lift]')?.getAttribute('data-lift') ?? document.querySelector('[data-lift]')?.getAttribute('data-lift')))).toBeGreaterThan(.99); }
    if(name==='aligned' || name==='insert') {
      const geometry = await page.locator('[data-bag]').evaluate(el=>{const r=el.getBoundingClientRect();const stack=el.querySelector('[data-fold]')!.firstElementChild!.firstElementChild!.getBoundingClientRect();return {lip:r.top+r.height*.6,top:stack.top,bottom:stack.bottom,z:getComputedStyle(el.querySelector('[data-fold]')!).zIndex};});
      if(name==='aligned') expect(geometry.bottom).toBeLessThanOrEqual(geometry.lip+2);
      if(name==='insert') {expect(geometry.bottom).toBeGreaterThan(geometry.lip);expect(geometry.top).toBeLessThan(geometry.lip);expect(geometry.z).toBe('30');}
      records.push({name,geometry});
    }
    records.push({name,data}); await page.screenshot({path:info.outputPath(`T10-${name}.png`)});
  }
  for(const [name,p] of [['book-lift',.2],['book-clear',.45],['book-travel',.55],['book-open',.85]] as const) {
    await go('book',p); const data=await page.locator('[data-moving-book]').evaluate(el=>({... (el as HTMLElement).dataset}));
    if(p<.44) expect(Number(data.travel)).toBe(0); if(p>=.55) expect(Number(data.lift)).toBe(1);
    await page.screenshot({path:info.outputPath(`T10-${name}.png`)});
  }
  if(info.project.name==='wide') {
    for(let i=0;i<3;i++) {
      await page.evaluate(({i})=>{const d=document.querySelector<HTMLElement>('article')!.dataset;scrollTo(0,Number(d.readerStart)+i*(Number(d.readDistance)+innerHeight*.6)+10);},{i});
      await expect(page).toHaveURL(new RegExp(`genre=${['landscape','portrait','street'][i]}`));
      await expect(page.locator(`[data-genre="${['landscape','portrait','street'][i]}"]`)).toBeVisible();
      await page.screenshot({path:info.outputPath(`T10-genre-${i}.png`)});
    }
  } else {
    await page.getByRole('link',{name:'03 手册',exact:true}).click();
    await page.getByRole('button',{name:'下一题材',exact:true}).click();
    await expect(page.locator('#advice-portrait')).toBeVisible();
    await page.locator('[data-book-reader]').evaluate(el=>el.scrollTo({left:el.clientWidth*2,behavior:'instant'}));
    await expect(page).toHaveURL(/genre=street/);
  }
  for(const [name,p] of [['extra-page',.15],['slip-rest',.35],['slip-lift',.55],['slip-travel',.75],['slip-settle',.98]] as const) { await go('slip',p); await expect(page.locator('[data-loose-slip]')).toBeVisible(); await page.screenshot({path:info.outputPath(`T10-${name}.png`)}); }
  for(const p of [.98,.75,.55,.15]) {await go('slip',p);await page.screenshot({path:info.outputPath(`T10-reverse-slip-${p}.png`)});}
  for(const p of [.75,.35,.0]) { await go('book',p); await expect(page.locator('[data-turn-leaf]')).not.toBeVisible(); await page.screenshot({path:info.outputPath(`T10-reverse-book-${p}.png`)}); }
  for(const p of [.78,.33,.11]) {await go('fold',p); await page.screenshot({path:info.outputPath(`T10-reverse-fold-${p}.png`)});}
  await page.getByRole('link',{name:'01 日报',exact:true}).click(); await expect(page.locator('#overview-heading')).toBeVisible();
  expect(await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);return ids.length===new Set(ids).size;})).toBe(true);
  await expect(page.locator('[data-fold]')).toHaveAttribute('inert',''); await expect(page.locator('[data-fold] [id]')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await info.attach('geometry.json',{body:JSON.stringify({positions,records},null,2),contentType:'application/json'});
});

test('T10 expanded long pages remeasure and explicit simple mode preserves operations', async ({page},info)=>{
  fixtureOnly(); await page.goto('/?place=geonames:1796236');
  const root=page.locator('article');
  await page.getByRole('link',{name:'03 手册',exact:true}).click();
  const before=Number(await root.getAttribute('data-page-height'));
  await page.locator('[data-active="true"] summary').filter({hasText:'全天窗口（含已过时段）'}).click();
  if(info.project.name==='wide') await expect.poll(async()=>Number(await root.getAttribute('data-page-height'))).toBeGreaterThan(before);
  await page.getByRole('button',{name:'简化阅读',exact:true}).click();
  await expect(root).not.toHaveAttribute('data-scene');
  await expect(page.locator('[data-scene-run="book"]')).toHaveCSS('height','0px');
  await openHourDetails(page, 12); await expect(page.locator("#hour-12")).toBeVisible(); await page.keyboard.press("Escape");
  await page.getByRole('button',{name:'下一题材',exact:true}).click(); await expect(page.locator('#advice-portrait')).toBeVisible();
  await expect(page.locator('[data-loose-slip]')).toContainText('不保存订阅设置');
  await page.screenshot({path:info.outputPath('T10-explicit-simple.png')});
});

for (const mode of ['simple', 'reduced-motion'] as const) {
  test(`T10 runtime ${mode} cleanup preserves the current mobile page accessibility`, async ({page},info)=>{
    fixtureOnly();
    await page.setViewportSize({width:390,height:844});
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.goto('/?place=geonames:1796236&genre=landscape');
    const root=page.locator('article');
    await expect(root).toHaveAttribute('data-scene', /.+/);
    await page.getByRole('link',{name:'03 手册',exact:true}).click();
    await page.getByRole('navigation',{name:'摄影题材'}).getByRole('button',{name:'人像',exact:true}).click();
    await expect(page.locator('#advice-portrait')).toBeVisible();
    await expect(page).toHaveURL(/genre=portrait/);
    if(mode==='simple') await page.getByRole('button',{name:'简化阅读',exact:true}).click();
    else await page.emulateMedia({reducedMotion:'reduce'});
    await expect(root).not.toHaveAttribute('data-scene');
    await expect(root).toHaveAttribute('data-reading',mode==='simple'?'simple':'reduced');
    const assertPages = async () => {
      for(const genre of ['landscape','portrait','street']) {
        const spread=page.locator(`[data-genre="${genre}"]`), active=genre==='portrait';
        await expect(spread).toHaveAttribute('data-active',String(active));
        await expect(spread).toHaveAttribute('aria-hidden',String(!active));
        if(active) { await expect(spread).not.toHaveAttribute('inert'); await spread.locator('summary').first().focus(); await expect(spread.locator('summary').first()).toBeFocused(); }
        else { await expect(spread).toHaveAttribute('inert',''); expect(await spread.locator('summary').first().evaluate(el=>{(el as HTMLElement).focus();return document.activeElement===el;})).toBe(false); }
      }
    };
    await assertPages();
    for(const selector of ['[data-pocket-book]','[data-pocket-paper]','[data-decoration="book-cover"]']) await expect(page.locator(selector)).toHaveAttribute('aria-hidden','true');
    await expect(page.locator('[data-fold],[data-moving-book],[data-turn-leaf]')).toHaveCount(0);
    await page.screenshot({path:info.outputPath(`T10-runtime-${mode}.png`)});
    if(mode==='simple') await page.getByRole('button',{name:'简化阅读',exact:true}).click();
    else await page.emulateMedia({reducedMotion:'no-preference'});
    await expect(root).toHaveAttribute('data-scene', /.+/);
    for(const selector of ['[data-fold]','[data-moving-book]','[data-turn-leaf]']) { await expect(page.locator(selector)).toHaveCount(1); await expect(page.locator(selector)).toHaveAttribute('inert',''); await expect(page.locator(`${selector} [id]`)).toHaveCount(0); }
    await assertPages();
    // Clean up again after reconstruction; no copies or focusable inactive pages may leak.
    if(mode==='simple') await page.getByRole('button',{name:'简化阅读',exact:true}).click();
    else await page.emulateMedia({reducedMotion:'reduce'});
    await expect(root).not.toHaveAttribute('data-scene'); await assertPages();
    await expect(page.locator('[data-fold],[data-moving-book],[data-turn-leaf]')).toHaveCount(0);
  });
}
