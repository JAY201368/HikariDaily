'use strict';
/* Canonical offline browser smoke check. See README.md for prerequisites. */
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chooseHour, hourDial } = require('./hour-control.cjs');
let chromium;
try { ({chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch { console.error('SKIPPED: Playwright is unavailable. Set PLAYWRIGHT_MODULE to an installed playwright module path; see README.md.'); process.exit(2); }
const review=path.resolve(process.env.REVIEW_DIR || path.join(__dirname,'review'));
fs.mkdirSync(review,{recursive:true});
const url=pathToFileURL(path.join(__dirname,'index.html')).href;
const results=[],errors=[],external=[];
let checks=0;
function ok(value,message){assert(value,message);checks++;results.push(message);}
async function snapshot(page,name){await page.screenshot({path:path.join(review,`${name}.jpg`),type:'jpeg',quality:86});}
async function seek(page,p){await page.evaluate(v=>{const j=document.querySelector('#journey');scrollTo(0,j.offsetTop+Number(j.dataset.readingDistance)*v);},p);await page.waitForTimeout(90);}
async function geometry(page){return page.evaluate(()=>Object.fromEntries(['#paper-object','.fold-panel.right','.fold-row.lower','#handbook','#book-cover','#instruments','#bag-front'].map(s=>[s,getComputedStyle(document.querySelector(s)).transform])));}
function watch(page){page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/i.test(r.url()))external.push(r.url());});}
async function widthCheck(page,label){ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${label}: no horizontal page overflow`);}
async function run(){
  const options={headless:true};if(process.env.CHROME_PATH)options.executablePath=process.env.CHROME_PATH;
  const browser=await chromium.launch(options);
  try {
    const desktop=await browser.newPage({viewport:{width:1440,height:960}});watch(desktop);
    await desktop.goto(url);await desktop.waitForTimeout(150);
    ok(await desktop.locator('#newspaper').isVisible(),'Desktop first view has readable semantic newspaper');
    ok(await desktop.evaluate(()=>{const n=document.querySelector('#newspaper');return n.querySelector('.news-grid').getBoundingClientRect().bottom+5<n.querySelector('.paper-footer').getBoundingClientRect().top;}),'Desktop newspaper grid clears the footer');
    await widthCheck(desktop,'Desktop');await snapshot(desktop,'desktop-newspaper');
    const positions=[['fold-vertical',.175],['fold-horizontal',.25],['insertion',.365],['desktop-bag',.46],['extraction',.61],['opening',.72],['desktop-handbook',.785],['page-turn',.84],['desktop-portrait',.875],['desktop-street',.96]];
    const forward={};
    for(const [name,p] of positions){await seek(desktop,p);forward[name]=await geometry(desktop);await snapshot(desktop,name);}
    for(const [name,p] of [...positions].reverse()){await seek(desktop,p);assert.deepEqual(await geometry(desktop),forward[name],`Reverse matches ${name}`);}
    checks+=positions.length;results.push(`Forward/reverse geometry identical at ${positions.length} keyframes (two hinges, insertion, extraction, opening, page turn, three spreads)`);
    await seek(desktop,.18);
    ok(await desktop.evaluate(()=>document.querySelector('#newspaper').inert&&document.querySelector('#instruments').inert&&document.querySelector('#book-nav').inert),'Transition controls inert');
    ok(await desktop.evaluate(()=>[...document.querySelectorAll('#folding [id]')].length===0&&document.querySelector('#folding').inert),'Fold replicas inert and ID-free');
    await seek(desktop,.46);
    const contexts=await desktop.evaluate(()=>({daily:document.querySelector('#newspaper .daily-temp').textContent,solar:document.querySelector('#newspaper .almanac').textContent,book:document.querySelector('#spreads').textContent,op:document.querySelector('#newspaper .opportunity').textContent}));
    ok(await hourDial(desktop).getAttribute('aria-valuemin')==='0' && await hourDial(desktop).getAttribute('aria-valuemax')==='23' && await desktop.locator('.dial-marks text').count()===24,'One slider-semantic watch, 24 marked selectable hours');
    for(let hour=0;hour<24;hour++){
      await chooseHour(desktop,hour);
      const values=await desktop.evaluate(h=>{const d=window.HIKARI.hours[h];return {actual:document.querySelector('.wind-device [data-value="wind"]').textContent,expected:String(d.wind),label:document.querySelector('.wind-device').getAttribute('aria-label'),time:d.time};},hour);
      ok(values.actual===values.expected&&values.label.includes(values.time),`Hour ${String(hour).padStart(2,'0')}: LCD and accessible label match fixture`);
      const expected=await desktop.evaluate(h=>{
        const d=window.HIKARI.hours[h];
        return {note:d.note,angle:d.azimuth.toFixed(1),comparison:`${d.azimuth.toFixed(1)}° / ${d.altitude.toFixed(1)}°`,stage:window.HIKARI_SOLAR.stage(d.altitude,h*60)};
      },hour);
      ok(await desktop.locator('#hour-note').textContent()===expected.note,`Hour ${hour}: annotation matches selected fixture`);
      ok(await desktop.locator('.devices [data-value="azimuth"]').textContent()===expected.angle,`Hour ${hour}: computed direction matches selected instant`);
      await desktop.locator('.devices [data-device="direction"]').click();
      const solarDetail=await desktop.locator('#detail-body').textContent();
      ok(solarDetail.includes(expected.comparison)&&solarDetail.includes(expected.stage),`Hour ${hour}: direction modal matches angle and stage`);
      if(hour===0||hour===6)await snapshot(desktop,`desktop-solar-${hour}`);
      await desktop.locator('#close-detail').click();
    }
    // A native close queues its close event after synchronous focus restoration.
    // A later intentional focus must not be stolen by that old callback.
    await desktop.evaluate(()=>{
      document.querySelector('.devices [data-device="wind"]').click();
      document.querySelector('#detail').close();
      document.querySelector('.devices [data-device="direction"]').focus();
    });
    await desktop.waitForTimeout(100);
    ok(await desktop.locator('.devices [data-device="direction"]').evaluate(n=>n===document.activeElement),'Queued modal close preserves a subsequent intentional instrument focus');
    for(const hour of [9,16,18]){
      await chooseHour(desktop,hour);
      for(const device of ['wind','direction','light','weather']){
        const button=desktop.locator(`.devices [data-device="${device}"]`);
        await button.focus();await desktop.keyboard.press('Enter');
        ok(await desktop.locator('#detail').evaluate(d=>d.open),`${hour}:00 ${device}: keyboard opens modal`);
        const body=await desktop.locator('#detail-body').textContent();ok(body.includes(`${String(hour).padStart(2,'0')}:00`),`${hour}:00 ${device}: current modal hour`);
        if(hour===16&&device==='wind'){
          await desktop.keyboard.press('Tab');
          ok(await desktop.evaluate(()=>document.querySelector('#detail').contains(document.activeElement)),'Modal keeps keyboard focus inside');
          await snapshot(desktop,'desktop-modal');
        }
        await desktop.keyboard.press('Escape');
        try {
          await desktop.waitForFunction(selector=>document.querySelector(selector)===document.activeElement,`.devices [data-device="${device}"]`,{timeout:2000});
        } catch (error) {
          const context = await desktop.evaluate(({hour,device})=>({hour,device,scrollY,
            progress:document.querySelector('#stage').dataset.progress,
            dialogOpen:document.querySelector('#detail').open,
            active:document.activeElement.outerHTML,
            bagInert:document.querySelector('#instruments').inert}),{hour,device});
          fs.writeFileSync(path.join(review,'focus-timeout-context.json'),JSON.stringify(context,null,2));
          throw error;
        }
        ok(await button.evaluate(n=>n===document.activeElement),`${device}: Escape returns focus`);
      }
    }
    const after=await desktop.evaluate(()=>({daily:document.querySelector('#newspaper .daily-temp').textContent,solar:document.querySelector('#newspaper .almanac').textContent,book:document.querySelector('#spreads').textContent,op:document.querySelector('#newspaper .opportunity').textContent}));assert.deepEqual(after,contexts);checks++;results.push('Hour changes leave daily range, solar events, handbook and sunset conclusion unchanged');
    await desktop.locator('#data-state').selectOption('missing');
    ok(await desktop.locator('.wind-device [data-value="wind"]').textContent()==='—','Missing wind is dash, never zero');
    ok(await desktop.locator('#newspaper .opportunity').textContent()==='暂无法判断','Missing required sunset inputs are independent unknown');
    await snapshot(desktop,'desktop-missing');
    ok((await desktop.locator('#spreads>.spread').first().textContent()).includes('当前不作推荐'),'Missing state marks retained handbook windows as samples, not available recommendations');
    await desktop.locator('#data-state').selectOption('stale');
    ok((await desktop.locator('#state-note').textContent()).includes('13:00'),'Stale state retains source time');
    ok((await desktop.locator('#newspaper .opportunity').textContent()).startsWith('3 / 5'),'Stale state limits sunset to level three');
    await desktop.locator('#data-state').selectOption('conflict');
    ok((await desktop.locator('#state-note').textContent()).includes('A 65% / B 30%'),'Conflict retains both sunset source values');
    ok((await desktop.locator('#newspaper .opportunity').textContent()).startsWith('3 / 5'),'Conflict limits sunset to level three');
    await desktop.locator('#data-state').selectOption('ok');await chooseHour(desktop,16);
    await desktop.locator('nav [data-nav="paper"]').click();await desktop.locator('#newspaper [data-detail="sunset"]').click();
    ok(await desktop.locator('#detail .levels>div').count()===5,'All five opportunity levels explained');await desktop.locator('#close-detail').click();
    await desktop.locator('nav [data-nav="book"]').click();
    for(let i=0;i<3;i++){await desktop.locator(`#book-nav [data-genre="${i}"]`).click();ok(await desktop.locator(`#spreads>.spread[data-genre="${i}"]`).isVisible(),`Desktop genre ${i+1} navigation`);}
    await desktop.locator('nav [data-nav="subscribe"]').click();await snapshot(desktop,'desktop-subscribe');
    await desktop.locator('#place').fill('');await desktop.locator('#subscription button[type="submit"]').click();ok(await desktop.locator('#registration').isHidden(),'Empty place does not register');
    await desktop.locator('#place').fill('   ');await desktop.locator('#subscription button[type="submit"]').click();ok(await desktop.locator('#registration').isHidden(),'Whitespace place does not register');
    const testText='<img src=x onerror=alert(1)>';
    await desktop.locator('#place').fill(testText);await desktop.locator('input[name="slot"][value="12:00"]').check();await desktop.locator('#subscription button[type="submit"]').click();
    ok((await desktop.locator('#registration-text').textContent()).includes(testText),'Entered place is literal text');ok(await desktop.locator('#registration img').count()===0,'Entered place cannot create HTML');
    ok((await desktop.locator('#registration').textContent()).includes('不会发送消息'),'Registration explicitly does not send');
    await desktop.locator('#edit-preview').click();ok(await desktop.locator('#place').evaluate(n=>n===document.activeElement),'Edit returns to place');
    await desktop.locator('#place').fill('上海');await desktop.locator('#subscription button[type="submit"]').click();await desktop.locator('#stop-preview').click();ok((await desktop.locator('#subscription-status').textContent()).includes('已停止'),'Stop preview acknowledged');
    ok(await desktop.locator('input[name="slot"]').count()===2,'Only 07:00 and 12:00 slots');
    const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});watch(mobile);await mobile.goto(url);await mobile.waitForTimeout(150);await snapshot(mobile,'mobile-newspaper');await widthCheck(mobile,'Mobile');
    ok(await mobile.locator('#newspaper').evaluate(n=>n.offsetHeight>1500&&getComputedStyle(n.querySelector('.headline h2')).fontSize==='28px'),'Mobile newspaper reflows at native type sizes');
    for(const [name,p] of [['mobile-fold',.1],['mobile-insertion',.28],['mobile-bag',.43],['mobile-extraction',.65],['mobile-opening',.82],['mobile-handoff',.999],['mobile-handoff-end',1]]){await seek(mobile,p);await snapshot(mobile,name);}
    const end=await mobile.locator('#handbook').boundingBox();await seek(mobile,.999);const pre=await mobile.locator('#handbook').boundingBox();ok(Math.abs(end.x-pre.x)<2&&Math.abs(end.y-pre.y)<2,'Mobile book handoff position is continuous within 2px');
    await mobile.locator('nav [data-nav="bag"]').click();await mobile.locator('.devices [data-device="wind"]').click();await snapshot(mobile,'mobile-modal');
    ok(await mobile.locator('#detail').evaluate(n=>n.getBoundingClientRect().height<=innerHeight-40),'Mobile modal fits viewport and scrolls internally');await mobile.locator('#close-detail').click();
    await mobile.locator('nav [data-nav="book"]').click();await snapshot(mobile,'mobile-handbook');
    // Chrome touch events exercise horizontal scrolling; no app handler intercepts touchmove.
    const session=await mobile.context().newCDPSession(mobile);
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:330,y:410}]});
    for(let x=300;x>=45;x-=25){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:410}]});await mobile.waitForTimeout(12);}
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await mobile.waitForTimeout(500);
    ok(await mobile.locator('#spreads').evaluate(n=>n.scrollLeft>n.clientWidth*.8),'Mobile actual touch swipe advances handbook');
    await mobile.locator('#book-nav [data-genre="2"]').click();await mobile.waitForTimeout(350);ok(await mobile.locator('#spreads').evaluate(n=>n.scrollLeft>=n.clientWidth*1.9),'Mobile genre button reaches street');await widthCheck(mobile,'Mobile handbook');
    await mobile.locator('nav [data-nav="subscribe"]').click();await snapshot(mobile,'mobile-subscribe');
    const reduced=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});watch(reduced);await reduced.goto(url);
    ok(await reduced.locator('body').evaluate(n=>n.classList.contains('static')),'Reduced motion selects complete static reading');
    ok(await reduced.locator('#spreads>.spread').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).display!=='none'&&!n.inert)),'Reduced motion exposes all three spreads');
    await snapshot(reduced,'reduced-newspaper');await reduced.locator('nav [data-nav="bag"]').click();await snapshot(reduced,'reduced-bag');
    await chooseHour(reduced,9);await reduced.locator('.devices [data-device="light"]').click();ok((await reduced.locator('#detail-body').textContent()).includes('09:00'),'Reduced motion preserves hour and modal interaction');await reduced.keyboard.press('Escape');
    await reduced.locator('nav [data-nav="book"]').click();await snapshot(reduced,'reduced-handbook');
    ok(await reduced.locator('#spreads>.spread .book-page').evaluateAll(ns=>ns.every(n=>n.lastElementChild.previousElementSibling.getBoundingClientRect().bottom<n.lastElementChild.getBoundingClientRect().top)),'All six reduced-motion pages clear their printed footers');
    await desktop.locator('#motion-toggle').click();ok(await desktop.locator('body').evaluate(n=>n.classList.contains('static')),'Manual static toggle restores sequential reading');
    await desktop.locator('#motion-toggle').click();ok(await desktop.locator('body').evaluate(n=>!n.classList.contains('static')),'Manual toggle restores reversible timeline');
    await mobile.emulateMedia({reducedMotion:'reduce'});await mobile.locator('nav [data-nav="book"]').click();await snapshot(mobile,'mobile-reduced');
    ok(await mobile.locator('#spreads').evaluate(n=>getComputedStyle(n).scrollSnapType.includes('mandatory')),'Reduced mobile retains native horizontal handbook');
    ok(errors.length===0,`No browser page errors (${errors.length})`);ok(external.length===0,`No HTTP(S) requests (${external.length})`);
    fs.rmSync(path.join(review,'browser-failure.txt'),{force:true});
    fs.writeFileSync(path.join(review,'browser-results.json'),JSON.stringify({status:'passed',checks,browser:await browser.version(),viewports:['1440×960','390×844'],reducedMotion:true,externalRequests:external,pageErrors:errors,results},null,2)+'\n');
    console.log(`PASS: ${checks} checks; Chrome ${await browser.version()}; desktop, touch-mobile, reduced motion; screenshots in ${review}`);
  }finally{await browser.close();}
}
run().catch(e=>{console.error(`FAIL: ${e.stack}`);fs.writeFileSync(path.join(review,'browser-failure.txt'),`${e.stack}\n`);process.exitCode=1;});
