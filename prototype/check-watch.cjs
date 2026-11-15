'use strict';
// T06 focused: rendered dial coordinates, real Chrome touch input, pocket-layer geometry.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { hourDial, dialPoint, chooseHour } = require('./hour-control.cjs');
let chromium;
try { ({chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch { console.error('SKIPPED: set PLAYWRIGHT_MODULE to installed Playwright.'); process.exit(2); }
const review = path.resolve(process.env.REVIEW_DIR || path.join(__dirname,'review/T03/focused'));
fs.mkdirSync(review,{recursive:true});
const results=[], samples=[], errors=[], external=[];
function ok(value,message) { assert(value,message); results.push(message); }
async function shot(page,name) { await page.screenshot({path:path.join(review,`${name}.jpg`),type:'jpeg',quality:90}); }
async function seek(page,p) {
  await page.evaluate(v=>{const j=document.querySelector('#journey');scrollTo(0,j.offsetTop+Number(j.dataset.readingDistance)*v);},p);
  await page.waitForTimeout(100);
}
function monitor(page) {
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',r=>{if (/^https?:/i.test(r.url())) external.push(r.url());});
}
async function current(page) { return Number(await hourDial(page).getAttribute('aria-valuenow')); }
async function sync(page,h,label) {
  ok(await page.evaluate(h=>{
    const d=window.HIKARI.hours[h], q=s=>document.querySelector(s), dial=q('#hour-dial');
    return ['wind','gust','temperature','humidity','cloud','rain','visibility','aqi','pm25','pm10'].every(k=>q(`.devices [data-value="${k}"]`).textContent===String(d[k])) &&
      [...document.querySelectorAll('.selected-time')].every(n=>n.textContent===d.time) &&
      [...document.querySelectorAll('.devices [data-device]')].every(n=>n.getAttribute('aria-label').includes(d.time)) &&
      dial.getAttribute('aria-valuenow')===String(h) && dial.getAttribute('aria-valuetext').includes(d.time) &&
      dial.style.getPropertyValue('--hour-angle')===`${h*15}deg` && q('#hour-note').textContent===d.note;
  },h),`${label}: ${String(h).padStart(2,'0')} LCDs/labels/annotation/exact time/hand share state`);
}
async function controls(page,label) {
  ok(await page.evaluate(()=>{
    const q=s=>document.querySelector(s), visible=n=>{
      const r=n.getBoundingClientRect();
      return r.left>=0 && r.right<=innerWidth && r.top>=93 && r.bottom<=innerHeight &&
        (document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===n || n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)));
    };
    return ['#hour-dial','#prev-hour','#next-hour','#data-state','.hour-details'].every(s=>visible(q(s)));
  }),`${label}: all watch/state controls rendered, unclipped and unobstructed`);
  ok(await page.evaluate(()=>[...document.querySelectorAll('.devices .device')].every(n=>{
    const r=n.querySelector('.lcd').getBoundingClientRect();
    const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return hit?.closest('.device')===n;
  })),`${label}: all four LCD centers remain whole-device click targets`);
  ok(await page.evaluate(()=>{
    const q=s=>document.querySelector(s), front=q('.bag-back').getBoundingClientRect();
    const solar=q('.devices .light-lcd').getBoundingClientRect();
    // Front main lip starts around 494 / 680 of the authored surface; allow its slight curve.
    return solar.bottom < front.top+front.height*(735/1157);
  }),`${label}: solar LCD clears lower foreground lip`);
  ok(await page.evaluate(()=>{
    const q=s=>document.querySelector(s), stored=q(document.body.classList.contains('static')?'.static-pocket-paper':'#folding .lower-back');
    return q('.devices .direction-lcd').getBoundingClientRect().bottom < stored.getBoundingClientRect().top;
  }),`${label}: direction LCD clears stored newspaper`);
}
async function geometry(page) {
  return page.evaluate(()=>Object.fromEntries(['#paper-object','#handbook','#book-cover','#instruments','#bag-front','.bag-mid','.pocket-watch','.watch-case'].map(s=>{
    const n=document.querySelector(s),r=n.getBoundingClientRect();return [s,{transform:getComputedStyle(n).transform,x:r.x,y:r.y,w:r.width,h:r.height}];
  })));
}
async function anchors(page,staticMode) {
  return page.evaluate(staticMode=>{
    const bag=document.querySelector('#instruments').getBoundingClientRect();
    const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x-bag.x,y:r.y-bag.y,w:r.width,h:r.height};};
    return {book:rect(staticMode?'.static-pocket-book':'#handbook'),paper:rect(staticMode?'.static-pocket-paper':'#folding .lower-back')};
  },staticMode);
}
async function staticAnchors(page,label) {
  const a=await anchors(page,false);
  await page.locator('#motion-toggle').click();await page.locator('nav [data-nav="bag"]').click();
  const b=await anchors(page,true);samples.push({label,animated:a,static:b});
  for (const kind of ['book','paper']) ok(Object.keys(a[kind]).every(k=>Math.abs(a[kind][k]-b[kind][k])<1),`${label}: ${kind} static/animated pocket anchor agrees within 1px`);
  ok(await page.locator('.static-pocket-book,.static-pocket-paper').evaluateAll(ns=>ns.every(n=>n.inert&&n.getAttribute('aria-hidden')==='true'&&!n.querySelector('[id]'))),`${label}: stored static replicas inert, aria-hidden and ID-free`);
  await shot(page,`${label}-static-bag`);
  await page.locator('#motion-toggle').click();await page.locator('nav [data-nav="bag"]').click();
}
async function extraction(page,label,compact) {
  const start=compact?.23:.305, clear=compact?.28:.35, end=compact?.34:.39;
  await page.evaluate(()=>{window.t06Watch=document.querySelector('.pocket-watch');});
  const frames=[start,start+.0001,(start+clear)/2,clear,clear+.0001,(clear+end)/2,end,end+.0001];
  const forward=new Map();
  for(const p of frames){
    await seek(page,p);
    const sample=await page.evaluate(()=>{
      const q=s=>document.querySelector(s),w=q('.pocket-watch'),c=q('.watch-case'),bag=q('#instruments'),r=c.getBoundingClientRect(),b=bag.getBoundingClientRect(),art=q('.bag-back').getBoundingClientRect(),scale=art.width/(document.body.classList.contains('compact')?410:800);
      return {same:w===window.t06Watch,visible:getComputedStyle(w).visibility,opacity:getComputedStyle(w).opacity,inert:w.inert,lift:Number(w.dataset.lift),travel:Number(w.dataset.travel),transform:w.style.transform,case:{x:(r.x-b.x)/scale,y:(r.y-b.y)/scale,w:r.width/scale,h:r.height/scale},lip:(art.top-b.top)/scale+art.height/scale*(735/1157),noChain:!q('.watch-chain,.watch-bow,.watch-crown')};
    });
    samples.push({label,p,...sample});forward.set(p,sample);
    ok(sample.noChain&&sample.same&&sample.visible==='visible'&&sample.opacity==='1',`${label}: same fully opaque watch rendered at ${p}`);
    if(p===start)ok(sample.case.y<sample.lip&&sample.case.y+sample.case.h>sample.lip,`${label}: stored watch straddles physical foreground lip`);
    if(p===clear)ok(sample.lift===1&&sample.travel===0&&sample.case.y+sample.case.h<sample.lip,`${label}: case lifts completely clear before horizontal travel`);
    if(p===end+.0001)ok(sample.travel===1&&!sample.inert,`${label}: final watch settled and operable before stable interval`);
    if(p<end)ok(sample.inert,`${label}: moving watch has no active controls`);
    await shot(page,`${label}-watch-forward-${p.toFixed(5)}`);
  }
  for(const p of [...frames].reverse()){
    await seek(page,p);const before=forward.get(p),g=await page.locator('.pocket-watch').evaluate(n=>({transform:n.style.transform,lift:Number(n.dataset.lift),travel:Number(n.dataset.travel)}));
    assert.equal(g.transform,before.transform);assert.equal(g.lift,before.lift);assert.equal(g.travel,before.travel);results.push(`${label}: reverse watch position agrees at ${p}`);
    if([start,(start+clear)/2,(clear+end)/2,end].includes(p))await shot(page,`${label}-watch-reverse-${p.toFixed(5)}`);
  }
  for(const boundary of [start,clear,end]){
    const near=frames.filter(p=>Math.abs(p-boundary)<.0002);
    if(near.length===2){const a=forward.get(near[0]).case,b=forward.get(near[1]).case;ok(Math.hypot(a.x-b.x,a.y-b.y)<1&&Math.abs(a.w-b.w)<1,`${label}: subpixel continuous watch at boundary ${boundary}`);}
  }
  await page.locator('nav [data-nav="bag"]').click();
}
async function inputChecks(page,label) {
  const dial=hourDial(page);
  for(let h=0;h<24;h++) { await chooseHour(page,h);await sync(page,h,`${label} pointer`); }
  await dial.focus();await page.keyboard.press('End');ok(await current(page)===23,`${label}: End selects 23`);
  await page.keyboard.press('ArrowRight');ok(await current(page)===0,`${label}: right wraps 23→00`);
  await page.keyboard.press('ArrowLeft');ok(await current(page)===23,`${label}: left wraps 00→23`);
  await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');ok(await current(page)===23,`${label}: Home then down wraps 00→23`);
  await page.keyboard.press('ArrowUp');ok(await current(page)===0,`${label}: up wraps 23→00`);
  await page.locator('#prev-hour').click();ok(await current(page)===23,`${label}: visible previous wraps to 23`);
  await page.locator('#next-hour').click();ok(await current(page)===0,`${label}: visible next wraps to 00`);
  const start=await dialPoint(page,6), outside=await dialPoint(page,18,.9);
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(outside.x,outside.y,{steps:6});await page.mouse.up();
  ok(await current(page)===18 && await dial.evaluate(n=>!n.classList.contains('dragging')),`${label}: captured drag/outside release selects 18 and cleans up`);
  await page.mouse.move(start.x,start.y);ok(await current(page)===18,`${label}: later hover cannot change released state`);
  await dial.evaluate(n=>n.addEventListener('pointerdown',e=>{n.dataset.testPointer=String(e.pointerId);},{once:true}));
  await page.mouse.move(start.x,start.y);await page.mouse.down();
  await dial.evaluate(n=>n.releasePointerCapture(Number(n.dataset.testPointer)));
  await page.mouse.move(start.x+2,start.y+2);await page.mouse.up();
  ok(await dial.evaluate(n=>!n.classList.contains('dragging')),`${label}: lostpointercapture cleanup`);
  await dial.focus();await page.keyboard.press('End');
  const pivot=await dial.boundingBox();await page.mouse.click(pivot.x+pivot.width/2,pivot.y+pivot.height/2);
  ok(await current(page)===23,`${label}: pivot press has no fabricated angle`);
  await chooseHour(page,16);
}
async function run() {
  const options={headless:true};if(process.env.CHROME_PATH)options.executablePath=process.env.CHROME_PATH;
  const browser=await chromium.launch(options),url=pathToFileURL(path.join(__dirname,'index.html')).href;
  try {
    for(const viewport of [{width:1440,height:960},{width:1920,height:958}]) {
      const label=`${viewport.width}x${viewport.height}`;
      const page=await browser.newPage({viewport});monitor(page);await page.goto(url);
      await page.locator('nav [data-nav="bag"]').click();await controls(page,label);
      ok(await page.locator('#hour-range,#hour-strip,input[type="range"]').count()===0,`${label}: no old hour control relic`);
      await inputChecks(page,label);await extraction(page,label,false);
      await shot(page,`${label}-backpack-watch`);
      await page.locator('.pocket-watch').screenshot({path:path.join(review,`${label}-watch-detail.jpg`),type:'jpeg',quality:92});
      for(const device of ['wind','direction','light','weather']) {
        const source=await page.locator(`.devices [data-device="${device}"]`).evaluate(n=>({src:n.querySelector('img')?.getAttribute('src')||null,maker:n.dataset.maker,model:n.dataset.model,owner:n.dataset.owner,marks:[...n.querySelectorAll('.housing-mark')].map(m=>m.textContent),label:n.getAttribute('aria-label')}));
        const expectedAssets={wind:'assets/wind-photo-v3.png',direction:'assets/solar-direction-v1.png',light:'assets/light-meter-v2.png',weather:null};
        ok(source.src===expectedAssets[device] && source.model && source.owner==='H.K.' && source.label.includes(source.model),`${label}: ${device} approved housing/DOM card and accessible identity`);
        ok(source.marks.length===0,`${label}: ${device} no duplicate housing engravings`);
        await page.locator(`.devices [data-device="${device}"]`).click();
        assert.deepEqual(await page.locator('#detail .housing-mark').allTextContents(),source.marks);
        ok((await page.locator('#detail-body').textContent()).includes(source.model) && (await page.locator('#detail-body').textContent()).includes(source.owner),`${label}: ${device} detail retains model/owner description`);
        ok(await page.locator('#detail [id]').evaluateAll(ns=>ns.filter(n=>n.id==='detail-title').length===1),`${label}: ${device} enlarged clone retains marks without duplicate active IDs`);
        if(viewport.width===1440) await shot(page,`${label}-detail-${device}`);
        await page.keyboard.press('Escape');
      }
      const frames=[.30,.34,.365,.39,.46,.57,.59,.61,.63,.65,.68,.70,.75];
      const forward=new Map();
      for(const p of frames) {await seek(page,p);forward.set(p,await geometry(page));if([.365,.39,.57,.61,.65].includes(p))await shot(page,`${label}-forward-${p}`);}
      for(const p of [...frames].reverse()) {await seek(page,p);assert.deepEqual(await geometry(page),forward.get(p));results.push(`${label}: reverse pocket geometry at ${p}`);if([.365,.57,.61].includes(p))await shot(page,`${label}-reverse-${p}`);}
      await seek(page,.46);await staticAnchors(page,label);
      if(viewport.width===1440) {
        await page.setViewportSize({width:1150,height:830});await page.waitForTimeout(200);await page.locator('nav [data-nav="bag"]').click();
        ok(await page.locator('#world').evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).a<1),'Scaled desktop scene actually renders below 1×');
        for(let h=0;h<24;h++) {await chooseHour(page,h);await sync(page,h,'1150x830 scale-aware pointer');}
      }
      await page.close();
    }
    const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});monitor(mobile);await mobile.goto(url);await mobile.locator('nav [data-nav="bag"]').click();
    await controls(mobile,'390x844');await shot(mobile,'390x844-backpack-watch');
    await inputChecks(mobile,'390x844');await extraction(mobile,'390x844',true);
    const session=await mobile.context().newCDPSession(mobile);
    await mobile.evaluate(()=>{
      window.watchTouchLog=[];const n=document.querySelector('#hour-dial');
      ['pointerdown','pointerup','pointercancel','lostpointercapture'].forEach(type=>n.addEventListener(type,e=>window.watchTouchLog.push({type:e.type,pointerType:e.pointerType,id:e.pointerId})));
    });
    const yBefore=await mobile.evaluate(()=>scrollY);
    const p23=await dialPoint(mobile,23);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p23]});
    for(const h of [23.4,23.8,...Array.from({length:24},(_,i)=>i),0,23,0]) {
      const point=await dialPoint(mobile,h);await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point]});await mobile.waitForTimeout(20);
      if(Number.isInteger(h))await sync(mobile,h,'CDP actual touch drag');
    }
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    ok(await mobile.evaluate(y=>Math.abs(scrollY-y)<1,yBefore),'Touch drag on dial does not scroll the page');
    ok(await hourDial(mobile).evaluate(n=>!n.classList.contains('dragging')),'Actual touch end releases capture and drag state');
    const p9=await dialPoint(mobile,9);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p9]});
    await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    ok(await hourDial(mobile).evaluate(n=>!n.classList.contains('dragging')),'Actual touch cancellation clears capture/drag state');
    const log=await mobile.evaluate(()=>window.watchTouchLog);samples.push({touchEvents:log});
    ok(log.some(e=>e.type==='pointerdown'&&e.pointerType==='touch')&&log.some(e=>e.type==='pointerup'&&e.pointerType==='touch')&&log.some(e=>e.type==='pointercancel'&&e.pointerType==='touch'),'Observed real Chrome touch pointer down/up/cancel, not mouse-only emulation');
    ok(await mobile.evaluate(()=>getComputedStyle(document.querySelector('#hour-dial')).touchAction==='none'&&['.pocket-watch','.watch-case','#instruments','.bag-controls','.watch-actions'].every(s=>getComputedStyle(document.querySelector(s)).touchAction!=='none')),'Only dial captures touch; watch housing/scene/actions retain native scrolling');
    // Vertical native touch gesture outside the dial must still advance the document.
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:365,y:680}]});
    for(let y=650;y>=480;y-=25){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:365,y}]});await mobile.waitForTimeout(15);}
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await mobile.waitForTimeout(200);
    ok(await mobile.evaluate(y=>scrollY>y+80,yBefore),'Actual touch outside dial retains native vertical scrolling');
    // Let Chrome's native fling finish before comparing exact programmatic keyframes.
    await mobile.waitForTimeout(2000);
    await mobile.locator('nav [data-nav="bag"]').click();await chooseHour(mobile,16);await staticAnchors(mobile,'390x844');
    const frames=[.22,.28,.34,.43,.59,.62,.65,.69,.77];const forward=new Map();
    for(const p of frames){await seek(mobile,p);forward.set(p,await geometry(mobile));if([.28,.34,.59,.62,.65,.69].includes(p))await shot(mobile,`390x844-forward-${p}`);}
    for(const p of [...frames].reverse()){await seek(mobile,p);assert.deepEqual(await geometry(mobile),forward.get(p));results.push(`390x844 reverse geometry at ${p}`);if([.34,.59,.62].includes(p))await shot(mobile,`390x844-reverse-${p}`);}
    await mobile.emulateMedia({reducedMotion:'reduce'});await mobile.locator('nav [data-nav="bag"]').click();
    ok(await mobile.locator('.scene-title').evaluate(n=>n.getBoundingClientRect().top>=93),'Reduced mobile bag heading clears fixed chapter header');
    await shot(mobile,'390x844-reduced-bag');
    await chooseHour(mobile,9);await sync(mobile,9,'Reduced mobile');
    await mobile.locator('.devices [data-device="light"]').click();await shot(mobile,'390x844-reduced-solar-detail');await mobile.keyboard.press('Escape');
    ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Reduced mobile no horizontal page overflow');
    const reduced=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});monitor(reduced);await reduced.goto(url);await reduced.locator('nav [data-nav="bag"]').click();await controls(reduced,'Reduced desktop');await shot(reduced,'1440x960-reduced-bag');
    ok(errors.length===0,'No page errors');ok(external.length===0,'No HTTP(S) requests');
    fs.writeFileSync(path.join(review,'results.json'),JSON.stringify({status:'passed',checks:results.length,browser:await browser.version(),viewports:['1440x960','1920x958','1150x830 scaled','390x844 touch'],results,samples,pageErrors:errors,externalRequests:external},null,2)+'\n');
    console.log(`PASS: ${results.length} focused T06 checks; Chrome ${await browser.version()}; ${review}`);
  } finally { await browser.close(); }
}
run().catch(e=>{console.error(e.stack);fs.writeFileSync(path.join(review,'failure.txt'),e.stack+'\n'+JSON.stringify({results,samples,errors,external},null,2));process.exitCode=1;});
