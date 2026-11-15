import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
const place='geonames:1796236';
test.skip(process.env.HIKARI_SOURCE_MODE!=='fixture','Explicit fixture weather required');
/** Install before an action: pause its real animation in the phase mutation's
 * microtask, after synchronous animation creation, before another frame runs. */
async function stopAtPhase(page:Page,hostSelector:string,phase:string,targetSelector:string){
 const state=await page.evaluateHandle(({hostSelector,phase,targetSelector})=>{
  const host=document.querySelector<HTMLElement>(hostSelector)!;
  const state={phase:null as string|null,error:null as string|null,animation:null as Animation|null,observer:null as MutationObserver|null};
  state.observer=new MutationObserver(()=>{
   if(host.dataset.phase!==phase)return;
   const animations=document.querySelector(targetSelector)!.getAnimations();
   if(animations.length!==1)state.error=`${phase}: expected one animation, received ${animations.length}`;
   else{state.animation=animations[0];state.animation.pause();state.phase=host.dataset.phase;}
   state.observer!.disconnect();
  });
  state.observer.observe(host,{attributes:true,attributeFilter:['data-phase']});return state;
 },{hostSelector,phase,targetSelector});
 return {
  async wait(){await expect.poll(()=>state.evaluate(s=>s.error??s.phase)).toBe(phase);await expect(page.locator(hostSelector)).toHaveAttribute('data-phase',phase);},
  async seek(time:number){await state.evaluate((s,time)=>{s.animation!.currentTime=time;},time);},
  async release(mode:'play'|'finish'){await state.evaluate((s,mode)=>{s.observer!.disconnect();s.animation![mode]();},mode);await state.dispose();},
 };
}
test('peer objects use explicit extraction, real nodes, return and retained refresh state',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`/?place=${place}&genre=portrait`);
 await expect(page.locator('.dial-marks line')).toHaveCount(24);
 const reader=page.locator('#peer-reader');
 await page.locator('[data-nav="bag"]').click();
 await expect(page.locator('.handbook-pull')).toBeVisible();
 await page.evaluate(()=>{(window as unknown as {peerNodes:unknown}).peerNodes={book:document.querySelector('#handbook'),slip:document.querySelector('#subscription')};});
 await page.mouse.wheel(0,900);await page.waitForTimeout(120);
 await expect(reader).not.toBeVisible();await expect(page.locator('#handbook')).toHaveAttribute('data-phase','docked');
 await page.locator('[data-nav="bag"]').click();
 await page.locator('.handbook-pull').focus();await page.keyboard.press('Enter');
 await expect(reader).toHaveAttribute('data-phase','reading');
 await expect(page.locator('#book-nav [data-genre="1"]')).toHaveAttribute('aria-current','');
 expect(await page.evaluate(()=>document.querySelector('#handbook')===(window as unknown as {peerNodes:{book:Element}}).peerNodes.book)).toBe(true);
 await page.locator('#book-nav [data-genre="2"]').click();await expect(page).toHaveURL(/genre=street/);
 await page.locator('#peer-reader [data-peer="subscription"]').click();await expect(reader).toHaveAttribute('data-object','subscription');await expect(reader).toHaveAttribute('data-phase','reading');
 expect(await page.evaluate(()=>document.querySelector('#subscription')===(window as unknown as {peerNodes:{slip:Element}}).peerNodes.slip)).toBe(true);
 await page.locator('#place').fill('<纸单草稿>');await page.locator('#subscription input[value="12:00"]').check();await page.locator('#subscription button[type="submit"]').click();
 // Simulate a whole factual refresh while the canonical form is in the modal.
 await page.evaluate(()=>document.querySelector<HTMLButtonElement>('.header-refresh')!.click());
 await expect(page.locator('.header-refresh')).toBeEnabled();await expect(reader).toHaveAttribute('data-phase','reading');
 await expect(page.locator('#place')).toHaveValue('<纸单草稿>');await expect(page.locator('#subscription input[value="12:00"]')).toBeChecked();await expect(page.locator('#registration')).toBeVisible();
 await expect(page.locator('#registration-text')).toContainText('<纸单草稿>');
 await page.keyboard.press('Escape');await expect(reader).not.toBeVisible();await expect(page.locator('.subscription-pull')).toBeFocused();
 await page.locator('.subscription-pull').click();await expect(reader).toHaveAttribute('data-phase','reading');await page.keyboard.press('Escape');await expect(reader).not.toBeVisible();
 await page.locator('.handbook-pull').click();await expect(reader).toHaveAttribute('data-phase','reading');
 await page.locator('#book-nav [data-genre="0"]').click();
 await expect(page.locator('#turn-leaf')).toBeHidden();await page.locator('.peer-surface').evaluate(n=>n.scrollTop=0);
 if(!existsSync(`/tmp/hikari-t10-review/handbook-${test.info().project.name}.png`))await page.screenshot({path:`/tmp/hikari-t10-review/handbook-${test.info().project.name}.png`});
 await page.locator('#spreads [data-genre="0"] [data-detail="advice-landscape"]').click();await expect(page.locator('#detail')).toBeVisible();await page.keyboard.press('Escape');await expect(reader).toHaveAttribute('data-phase','reading');
 await page.keyboard.press('Escape');await expect(reader).not.toBeVisible();
 await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('body')).toHaveClass(/static/);await expect(reader).not.toBeVisible();
 await page.locator('.site-header [data-nav="book"]').click();await expect(reader).toHaveAttribute('data-phase','reading');await page.keyboard.press('Escape');await expect(reader).not.toBeVisible();
 expect(await page.evaluate(()=>document.querySelectorAll('dialog[open]').length)).toBe(0);
 expect(errors).toEqual([]);
});

test('refresh during motion keeps the newest intent and global return target; print retains all originals',async({page})=>{
 await page.goto(`/?place=${place}`);await expect(page.locator('.dial-marks line')).toHaveCount(24);
 const reader=page.locator('#peer-reader'),nav=page.locator('.site-header [data-nav="subscribe"]');
 const scroll=await page.evaluate(()=>scrollY);
 await nav.click();
 if(test.info().project.name!=='reduced-motion'){
  await expect(reader).toHaveAttribute('data-phase','extracting');
  expect(await page.locator('#subscription').evaluate(n=>n.parentElement?.id)).toBe('instruments');
  await page.evaluate(()=>document.querySelector<HTMLButtonElement>('.header-refresh')!.click());
 }
 await expect(page.locator('.header-refresh')).toBeEnabled();await expect(reader).toHaveAttribute('data-phase','reading');
 await page.keyboard.press('Escape');await expect(reader).not.toBeVisible();await expect(nav).toBeFocused();expect(await page.evaluate(()=>scrollY)).toBe(scroll);
 await page.locator('.site-header [data-nav="book"]').click();await expect(reader).toHaveAttribute('data-phase','reading');
 await page.evaluate(()=>{const reader=document.querySelector('#peer-reader')!;reader.querySelector<HTMLButtonElement>('[data-peer="subscription"]')!.click();reader.querySelector<HTMLButtonElement>('[data-peer="handbook"]')!.click();});
 await expect(reader).toHaveAttribute('data-object','handbook');await expect(reader).toHaveAttribute('data-phase','reading');await expect(page.locator('dialog[open]')).toHaveCount(1);
 await page.keyboard.press('Escape');await expect(reader).not.toBeVisible();
 await page.emulateMedia({media:'print'});
 const geometry=await page.locator('#spreads>.spread').evaluateAll(nodes=>nodes.map(n=>({display:getComputedStyle(n).display,height:n.getBoundingClientRect().height,width:n.getBoundingClientRect().width})));
 for(const n of geometry){expect(n.display).toBe('grid');expect(n.height).toBeGreaterThan(0);expect(n.width).toBeGreaterThan(0);}
 await expect(page.locator('#subscription')).toBeVisible();await expect(page.locator('.full-advice-reading')).toBeVisible();
 await page.emulateMedia({media:'screen'});await expect(reader).not.toBeVisible();
 if(test.info().project.name==='wide'){
  await page.locator('.site-header [data-nav="book"]').click();await expect(reader).toHaveAttribute('data-phase','reading');await page.emulateMedia({media:'print'});
  await expect(page.locator('#subscription')).toBeVisible();for(const spread of await page.locator('#spreads>.spread').all())await expect(spread).toBeVisible();
  await page.emulateMedia({media:'screen'});await page.keyboard.press('Escape');await expect(reader).not.toBeVisible();
  await page.locator('.site-header [data-nav="book"]').click();await expect(reader).toHaveAttribute('data-phase','reading');
  await page.evaluate(()=>{history.pushState(null,'','/');dispatchEvent(new PopStateEvent('popstate'));});await expect(page.locator('#newspaper')).toHaveCount(0);
  await page.goBack();await expect(page.locator('.dial-marks line')).toHaveCount(24);await expect(reader).not.toBeVisible();await expect(page.locator('#handbook')).toHaveAttribute('data-phase','docked');

 }

});

test('physical source clears its bag before travel and a real printed leaf reverses',async({page})=>{
 test.skip(test.info().project.name!=='wide','One representative physical motion capture');
 await page.goto(`/?place=${place}`);await expect(page.locator('.dial-marks line')).toHaveCount(24);await page.locator('.site-header [data-nav="bag"]').click();
 const reader=page.locator('#peer-reader'),book=page.locator('#handbook');
 const extraction=await stopAtPhase(page,'#peer-reader','extracting','#handbook');
 await page.locator('.handbook-pull').click();await extraction.wait();await extraction.seek(140);
 expect(await book.evaluate(n=>n.parentElement?.id)).toBe('instruments');await expect(reader).not.toBeVisible();
 if(!existsSync('/tmp/hikari-t10-review/mid-extract-wide.png'))await page.screenshot({path:'/tmp/hikari-t10-review/mid-extract-wide.png'});
 await extraction.release('play');await expect(reader).toHaveAttribute('data-phase','reading');
 await page.locator('#book-nav [data-genre="1"]').evaluate(n=>{(n as HTMLButtonElement).click();const a=document.querySelector('#turn-leaf')!.getAnimations()[0];a.pause();a.currentTime=140;});await expect(page.locator('#turn-leaf')).toBeVisible();
 await expect(page.locator('.leaf-front [data-diagram="horizon"]')).toHaveCount(1);await expect(page.locator('.leaf-back .genre-heading')).toContainText('人像');
 if(!existsSync('/tmp/hikari-t10-review/mid-flip-wide.png'))await page.screenshot({path:'/tmp/hikari-t10-review/mid-flip-wide.png'});
 await page.locator('#turn-leaf').evaluate(n=>n.getAnimations()[0].play());await expect(page.locator('#turn-leaf')).toBeHidden();
 const returning=await stopAtPhase(page,'#peer-reader','travelling','#handbook');
 await page.locator('[data-close-peer]').click();await returning.wait();
 await expect(page.locator('#book-nav')).toBeHidden();
 await returning.seek(140);
 if(!existsSync('/tmp/hikari-t10-review/mid-return-wide.png'))await page.screenshot({path:'/tmp/hikari-t10-review/mid-return-wide.png'});
 await returning.release('play');await expect(book).toHaveAttribute('data-phase','docked');await expect(page.locator('.handbook-pull')).toBeFocused();
});

test('reverse handbook leaf keeps the old printed page until the target lands',async({page})=>{
 test.skip(test.info().project.name==='reduced-motion','Reduced motion has no intermediate leaf');
 await page.goto(`/?place=${place}`);await expect(page.locator('.dial-marks line')).toHaveCount(24);
 const reader=page.locator('#peer-reader'),leaf=page.locator('#turn-leaf'),spreads=page.locator('#spreads');
 await page.locator('.site-header [data-nav="book"]').click();await expect(reader).toHaveAttribute('data-phase','reading');
 await page.locator('#book-nav [data-genre="1"]').click();await expect(leaf).toBeHidden();
 await page.locator('.peer-surface').evaluate(n=>n.scrollTop=0);
 // Pause in the same task as the click so even the first painted reverse frame
 // must contain the previous real page, rather than a prematurely installed target.
 await page.evaluate(()=>{document.querySelector<HTMLButtonElement>('#book-nav [data-genre="0"]')!.click();const a=document.querySelector('#turn-leaf')!.getAnimations()[0];a.pause();a.currentTime=0;});
 await expect(leaf).toBeVisible();
 const underlay=()=>spreads.evaluate(n=>{
  // Wide static halves are intentionally inert during a turn. Briefly remove
  // that hit-test exclusion, then restore it in this same task without painting.
  const pages=[...n.children] as HTMLElement[],inert=pages.map(p=>p.inert);pages.forEach(p=>p.inert=false);
  const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width*.8,r.top+180);
  const result={genre:hit?.closest<HTMLElement>('.spread')?.dataset.genre,live:!!hit?.closest('#spreads'),scroll:n.scrollLeft,width:n.clientWidth};pages.forEach((p,i)=>p.inert=inert[i]);return result;
 });
 const start=await underlay();expect(start.genre).toBe('1');expect(start.live).toBe(true);
 if(test.info().project.name==='narrow'){
  expect(start.scroll).toBe(start.width);
  await expect(page.locator('.leaf-front .genre-heading')).toContainText('风光');await expect(page.locator('.leaf-back .genre-heading')).toContainText('人像');
  await leaf.evaluate(n=>{n.getAnimations()[0].currentTime=260;});
  await mkdir('/tmp/hikari-t10-review',{recursive:true});await page.screenshot({path:'/tmp/hikari-t10-review/mid-reverse-narrow-fixed.png'});
 }
 await leaf.evaluate(n=>{n.getAnimations()[0].finish();});await expect(leaf).toBeHidden();
 const finish=await underlay();expect(finish.genre).toBe('0');expect(finish.live).toBe(true);expect(finish.scroll).toBe(0);
 await expect(page).toHaveURL(/genre=landscape/);await expect(page.locator('#spreads>.spread[data-genre="0"] .genre-heading')).toContainText('风光');
 await page.keyboard.press('Escape');await expect(reader).not.toBeVisible();
});

test('peer covers occupy real inner slots with direct hits and unblocked instrument readings',async({page})=>{
 await page.goto(`/?place=${place}`);await expect(page.locator('.dial-marks line')).toHaveCount(24);await page.locator('.site-header [data-nav="bag"]').click();
 for(const selector of ['.handbook-pull','.subscription-pull']){
  const hit=await page.locator(selector).evaluate(n=>{const r=n.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height*.5)?.closest('[data-peer]')===n;});expect(hit,selector).toBe(true);
 }
 await expect(page.locator('.bag-reserved-slot')).toHaveCount(1);await expect(page.locator('.peer-pull')).toHaveText(['','']);
 const readings=await page.locator('.devices>button .lcd').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {name:n.closest<HTMLElement>('[data-device]')?.dataset.device,clear:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('[data-device]')===n.closest('[data-device]')};}));
 for(const reading of readings)expect(reading.clear,reading.name).toBe(true);
 const occlusion=await page.evaluate(async()=>{
  const result=[];
  for(const [selector,layer] of [['#handbook','.bag-mid'],['#subscription','#bag-front']]){
   const node=document.querySelector<HTMLElement>(selector)!,lip=document.querySelector<HTMLElement>(layer)!,r=node.getBoundingClientRect();
   // Reduced motion uses the identical front image in the bag's ::after layer.
   const b=lip.getBoundingClientRect().width?lip.getBoundingClientRect():document.querySelector('.bag-back')!.getBoundingClientRect();
   const img=new Image();img.src=getComputedStyle(lip).backgroundImage.slice(5,-2);await img.decode();const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d')!;ctx.drawImage(img,0,0);
   const x=Math.floor((r.left+r.width*.5-b.left)/b.width*canvas.width),y=Math.floor((r.top+r.height*.88-b.top)/b.height*canvas.height);
   result.push({selector,alpha:ctx.getImageData(x,y,1,1).data[3],behind:Number(getComputedStyle(node).zIndex)<Number(getComputedStyle(lip).zIndex)});
  }
  return result;
 });
 for(const object of occlusion){expect(object.alpha,object.selector).toBeGreaterThan(220);expect(object.behind,object.selector).toBe(true);}
 await page.locator('.handbook-pull').focus();await expect(page.locator('#handbook')).toHaveCSS('filter',/brightness/);
 await page.locator('.site-header [data-nav="bag"]').click();
 if(test.info().project.name!=='reduced-motion'){await mkdir('/tmp/hikari-t10-review',{recursive:true});const path=`/tmp/hikari-t10-review/slots-in-bag-title-${test.info().project.name}.png`;if(!existsSync(path))await page.screenshot({path});}
 if(test.info().project.name==='narrow')for(const selector of ['.handbook-pull','.subscription-pull']){
  const r=(await page.locator(selector).boundingBox())!;await page.touchscreen.tap(r.x+r.width/2,r.y+r.height*.5);
  await expect(page.locator('dialog[open][data-phase="reading"]')).toHaveCount(1);await page.keyboard.press('Escape');await expect(page.locator('dialog[open]')).toHaveCount(0);await expect(page.locator(selector)).toBeFocused();
 }
});
