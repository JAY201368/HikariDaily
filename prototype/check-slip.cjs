'use strict';
// T07: extra leaf reveals a complete loose canonical form, then lifts and settles.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
let chromium;
try{({chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'));}
catch{console.error('SKIPPED: set PLAYWRIGHT_MODULE to installed Playwright.');process.exit(2);}
const review=path.resolve(process.env.REVIEW_DIR||path.join(__dirname,'review/T07/focused'));
fs.mkdirSync(review,{recursive:true});
const results=[],samples=[],errors=[],external=[];
function ok(value,message){assert(value,message);results.push(message);}
const wait=page=>page.waitForTimeout(120);
async function shot(page,name){await page.screenshot({path:path.join(review,`${name}.jpg`),type:'jpeg',quality:87});}
async function seek(page,q){await page.evaluate(q=>{const s=document.querySelector('#subscribe'),a=+s.dataset.extractionStart,b=+s.dataset.extractionEnd;scrollTo(0,a+(b-a)*q);},q);await wait(page);}
async function geometry(page){return page.evaluate(()=>{
  const $=s=>document.querySelector(s),s=$('#subscription'),r=s.getBoundingClientRect(),leaf=$('.discovery-leaf'),surface=$('.discovery-page');
  const pages=[...document.querySelectorAll('#spreads>.spread')];
  const i=document.body.classList.contains('compact')?Math.round($('#spreads').scrollLeft/$('#spreads').clientWidth):2;
  const intro=$('.subscribe-intro');
  return {rect:{x:r.x,y:r.y,w:r.width,h:r.height},transform:getComputedStyle(s).transform,clip:getComputedStyle(s).clipPath,
    leaf:{hidden:leaf.hidden,transform:leaf.style.transform,rect:leaf.getBoundingClientRect().toJSON(),turn:+$('#subscribe').dataset.leafTurn,source:leaf.querySelector('.discovery-front').textContent},
    surface:surface.getBoundingClientRect().toJSON(),lift:+$('#subscribe').dataset.slipLift,settle:+$('#subscribe').dataset.slipSettle,
    intro:{rect:intro.getBoundingClientRect().toJSON(),groups:[...intro.children].map(n=>({opacity:+getComputedStyle(n).opacity,transform:getComputedStyle(n).transform}))},
    inert:s.inert,q:+$('#subscribe').dataset.extraction,genre:i,page:pages[i].lastElementChild.getBoundingClientRect().toJSON(),
    pageText:pages[i].lastElementChild.textContent};
});}
function monitor(page){page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/i.test(r.url()))external.push(r.url());});}
async function canonical(page,label){
  ok(await page.evaluate(()=>document.querySelectorAll('form').length===1&&document.querySelectorAll('#place').length===1&&document.querySelector('#subscription')===window.testCanonical),`${label}: same canonical form node; no duplicate form or input`);
  ok(await page.locator('.slip-mouth').count()===0,`${label}: retired sleeve/lip is absent`);
  ok(await page.locator('.discovery-leaf').evaluate(n=>n.inert&&n.getAttribute('aria-hidden')==='true'&&!n.id&&!n.querySelector('[id],input,button')),`${label}: extra leaf is inert, aria-hidden, ID/control-free`);
  ok(await page.locator('.discovery-page').evaluate(n=>n.inert&&n.getAttribute('aria-hidden')==='true'&&!n.id),`${label}: underlying full page is decorative and inaccessible`);
}
async function preserved(page,label){
  ok(await page.locator('#place').inputValue()==='<img src=x onerror=alert(1)>',`${label}: literal typed place survives`);
  ok(await page.locator('[name="slot"][value="12:00"]').isChecked(),`${label}: selected 12:00 survives`);
  ok(await page.locator('#registration').evaluate(n=>!n.hidden)&& (await page.locator('#registration-text').textContent()).includes('<img src=x onerror=alert(1)>'),`${label}: preview state/text survives`);
  ok(await page.locator('#registration img').count()===0,`${label}: typed text is not markup`);
  await canonical(page,label);
}
async function formChecks(page,label){
  await page.locator('nav [data-nav="subscribe"]').click();await wait(page);
  ok(await page.locator('#subscription').evaluate(n=>!n.inert&&getComputedStyle(n).position!=='fixed'),`${label}: chapter navigation reaches stable normal-flow active form`);
  await page.locator('#place').focus();ok(await page.locator('#place').evaluate(n=>n===document.activeElement),`${label}: final place keyboard reachable`);
  await page.keyboard.press('Tab');ok(await page.evaluate(()=>document.activeElement.name==='slot'),`${label}: Tab reaches time radio group`);
  await page.locator('#place').fill('   ');await page.locator('#subscription [type="submit"]').click();
  ok(await page.locator('#registration').isHidden(),`${label}: whitespace place rejected`);
  await page.locator('#place').fill('<img src=x onerror=alert(1)>');await page.locator('[name="slot"][value="12:00"]').check();await page.locator('#subscription [type="submit"]').click();await wait(page);
  await preserved(page,`${label} submitted`);
  ok((await page.locator('#registration').textContent()).includes('不会发送消息'),`${label}: preview explicitly non-sending`);
  await page.locator('#registration').evaluate(n=>n.scrollIntoView({block:'end',behavior:'instant'}));await wait(page);
  await shot(page,`${label}-preview`);
  await seek(page,.3);
  ok(await page.locator('#subscription').evaluate(n=>n.inert&&n.getAttribute('aria-hidden')==='true'),`${label}: reverse transition controls inaccessible`);
  await page.locator('#place').evaluate(n=>n.focus());
  ok(await page.locator('#place').evaluate(n=>n!==document.activeElement),`${label}: inert transit input refuses focus`);
  await preserved(page,`${label} reverse`);
  await seek(page,.43);const saved=await geometry(page);
  ok(saved.rect.x>saved.page.left&&saved.rect.x+saved.rect.w<saved.page.right&&saved.rect.y>saved.page.top&&saved.rect.y+saved.rect.h<saved.page.bottom,`${label}: saved longer preview still fits as a full loose sheet`);
  await page.locator('nav [data-nav="subscribe"]').click();await preserved(page,`${label} forward`);
}
async function keyframes(page,label){
  const forward=new Map(), points=[0,.001,.04,.10,.18,.22,.30,.34,.40,.43,.46,.54,.62,.70,.74,.82,.86,.90,.96,.999,1];
  for(const q of points){
    await seek(page,q);const g=await geometry(page);forward.set(q,g);samples.push({label,direction:'forward',...g});
    if([0,.10,.18,.22,.34,.43,.54,.62,.74,.86,.96,1].includes(q))await shot(page,`${label}-q${q}`);
    ok(g.inert===(q<1),`${label} ${q}: only stable form interactive`);
    ok(g.clip==='none',`${label} ${q}: complete sheet is never clipped into a slit`);
    if(q<.62){
      ok(Math.abs(g.surface.left-g.page.left)<1&&Math.abs(g.surface.top-g.page.top)<1&&Math.abs(g.surface.width-g.page.width)<1&&Math.abs(g.surface.height-g.page.height)<1,`${label} ${q}: full underlying page tracks the real current book surface`);
      ok(g.leaf.source===g.pageText,`${label} ${q}: extra leaf front continues the current genre page`);
    }
    if(q>=.96)ok(g.intro.groups.every(n=>n.opacity===1&&n.transform==='matrix(1, 0, 0, 1, 0, 0)'),`${label} ${q}: every intro group already fully present before/at handoff`);
  }
  const start=forward.get(0),next=forward.get(.001),end=forward.get(1),near=forward.get(.999),rest=forward.get(.43),lift=forward.get(.62);
  ok(Math.abs(start.rect.x-next.rect.x)<1&&Math.abs(start.rect.y-next.rect.y)<1,`${label}: onset continuous before extra turn`);
  ok(!start.leaf.hidden&&start.leaf.turn===0&&start.leaf.transform.includes('rotateY(0deg)'),`${label}: opaque full extra leaf initially covers the loose sheet`);
  ok(start.rect.x>start.page.left&&start.rect.x+start.rect.w<start.page.right&&start.rect.y>start.page.top&&start.rect.y+start.rect.h<start.page.bottom,`${label}: every edge of full loose slip lies inside actual page`);
  ok(forward.get(.10).leaf.turn>0&&forward.get(.10).leaf.turn<forward.get(.22).leaf.turn&&forward.get(.22).leaf.turn<1&&forward.get(.34).leaf.turn===1,`${label}: an additional physical 180 degree page turn precedes lifting`);
  ok(JSON.stringify(forward.get(.34).rect)===JSON.stringify(rest.rect)&&rest.lift===0,`${label}: entire loose paper rests visibly between pages after reveal`);
  ok(lift.lift===1&&lift.rect.w>rest.rect.w+15&&Math.abs(lift.rect.y-rest.rect.y)>10,`${label}: lifted sheet separates from page before travelling to form`);
  if(label.endsWith('390'))ok(lift.rect.y>93&&lift.rect.x+lift.rect.w<390,`${label}: lifted paper clears fixed header and stays within narrow viewport`);
  const entering=forward.get(label.endsWith('390')?.86:.74).intro.groups;
  ok(entering.some(n=>n.opacity>0&&n.opacity<1)&&entering[0].opacity>entering[1].opacity,`${label}: intro fades/translates in staggered groups during settling`);
  ok(Math.abs(near.rect.x-end.rect.x)<1&&Math.abs(near.rect.y-end.rect.y)<2&&Math.abs(near.rect.w-end.rect.w)<1,`${label}: fixed-to-normal-flow form handoff aligns within 2px`);
  ok(Math.abs(near.intro.rect.x-end.intro.rect.x)<1&&Math.abs(near.intro.rect.y-end.intro.rect.y)<2,`${label}: fully visible intro fixed-to-flow handoff aligns within 2px`);
  for(const q of [...points].reverse()){
    await seek(page,q);const g=await geometry(page),f=forward.get(q);
    ok(['x','y','w','h'].every(k=>Math.abs(g.rect[k]-f.rect[k])<.1)&&g.clip===f.clip&&g.inert===f.inert,`${label} ${q}: reverse form geometry/activation identical`);
    ok(g.leaf.transform===f.leaf.transform&&JSON.stringify(g.intro.groups)===JSON.stringify(f.intro.groups),`${label} ${q}: reverse leaf turn and intro entrance identical`);
    samples.push({label,direction:'reverse',...g});
    if([.22,.54,.86,0].includes(q))await shot(page,`${label}-reverse-q${q}`);
  }
  await canonical(page,label);
}
async function run(){
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  try{
    for(const [width,height]of [[1440,960],[1920,958],[390,844]]){
      const label=`T07-${width}`,page=await browser.newPage({viewport:{width,height},...(width===390?{isMobile:true,hasTouch:true}:{})});monitor(page);
      await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);await wait(page);
      await page.evaluate(()=>window.testCanonical=document.querySelector('#subscription'));
      await page.locator('nav [data-nav="book"]').click();await wait(page);
      if(width===390){
        // Touch horizontal choice and native vertical reading before extraction.
        const cdp=await page.context().newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:330,y:410}]});
        for(let x=300;x>=45;x-=25){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:410}]});await page.waitForTimeout(14);}
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(650);
        ok(await page.locator('#spreads').evaluate(n=>n.scrollLeft>n.clientWidth*.8),'Mobile real touch swipe chooses a non-landscape genre');
        const before=await page.evaluate(()=>scrollY);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:650}]});
        for(let y=620;y>=280;y-=30){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:120,y}]});await page.waitForTimeout(15);}
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(650);
        ok(await page.evaluate(v=>scrollY>v+100,before),'Mobile book still allows native vertical touch reading');
        for(let genre=0;genre<3;genre++){
          await page.locator('#spreads').evaluate((n,i)=>n.scrollTo({left:n.clientWidth*i,behavior:'instant'}),genre);await wait(page);
          await seek(page,0);const g=await geometry(page);
          ok(g.genre===genre&&g.rect.x>=g.page.left&&g.rect.x+g.rect.w<=g.page.right,`Mobile genre ${genre}: slip uses currently visible page`);
          await seek(page,.18);await shot(page,`T07-mobile-genre${genre}-turn`);
          await seek(page,.40);const revealed=await geometry(page);
          await shot(page,`T07-mobile-genre${genre}-rest`);
          ok(revealed.leaf.turn===1&&revealed.rect.y>=revealed.page.top&&revealed.rect.y+revealed.rect.h<=revealed.page.bottom,`Mobile genre ${genre}: complete loose paper revealed after turning current page`);
          await seek(page,0);
          ok((await geometry(page)).genre===genre,`Mobile genre ${genre}: forward/reverse retains horizontal choice`);
        }
      }
      await keyframes(page,label);await formChecks(page,label);
      if(width===390){
        await page.emulateMedia({reducedMotion:'reduce'});await wait(page);
        await page.locator('nav [data-nav="subscribe"]').click();await preserved(page,'mobile live reduced-mode change');
        await page.emulateMedia({reducedMotion:'no-preference'});await wait(page);
        await page.locator('nav [data-nav="subscribe"]').click();await preserved(page,'mobile live dynamic-mode return');
      }
      if(width===1440){
        for(const w of [1090,1150,390,1440]){
          await page.setViewportSize({width:w,height:960});await page.waitForTimeout(350);
          await page.locator('nav [data-nav="subscribe"]').click();await preserved(page,`resize ${w}`);
          ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`resize ${w}: no horizontal overflow`);
          if(w===1090){
            await seek(page,.3);await page.setViewportSize({width:1150,height:960});await page.waitForTimeout(350);
            await preserved(page,'mid-extraction resize across 1100');
            await page.locator('nav [data-nav="subscribe"]').click();
          }
        }
        await page.locator('#motion-toggle').click();await preserved(page,'manual static');
        ok(await page.locator('#subscription').evaluate(n=>!n.inert&&getComputedStyle(n).position!=='fixed'),'Static mode leaves single sequential functional form');
        await shot(page,'T07-static-preview');
        await page.locator('#motion-toggle').click();await preserved(page,'return dynamic');
      }
      await page.locator('nav [data-nav="subscribe"]').click();
      await page.locator('#edit-preview').click();ok(await page.locator('#place').evaluate(n=>n===document.activeElement),`${label}: edit restores place focus`);
      await page.locator('#subscription [type="submit"]').click();await page.locator('#stop-preview').click();
      ok((await page.locator('#subscription-status').textContent()).includes('已停止'),`${label}: stop preview retained`);
      await page.close();
    }
    for(const width of [1440,390]){
      const page=await browser.newPage({viewport:{width,height:width===390?844:960},reducedMotion:'reduce'});monitor(page);
      await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);await page.locator('nav [data-nav="subscribe"]').click();
      ok(await page.locator('#subscription').evaluate(n=>!n.inert&&getComputedStyle(n).position!=='fixed')&&await page.locator('form').count()===1,`Reduced ${width}: one sequential functional form, no extraction`);
      ok(await page.locator('.subscribe-intro').evaluate(n=>[...n.children].every(c=>+getComputedStyle(c).opacity===1))&&await page.locator('.discovery-leaf').isHidden(),`Reduced ${width}: complete intro and no animated extra leaf`);
      await page.locator('#place').fill('杭州');await page.locator('#subscription [type="submit"]').click();
      ok((await page.locator('#registration-text').textContent()).includes('07:00'),`Reduced ${width}: 07:00 preview works`);
      await shot(page,`T07-reduced-${width}`);await page.close();
    }
    ok(!errors.length,'No browser page errors');ok(!external.length,'No HTTP(S) requests');
    fs.writeFileSync(path.join(review,'results.json'),JSON.stringify({status:'passed',checks:results.length,browser:await browser.version(),results,samples,errors,external},null,2)+'\n');
    console.log(`PASS: ${results.length} T07 checks; Chrome ${await browser.version()}; evidence ${review}`);
  }finally{await browser.close();}
}
run().catch(e=>{fs.writeFileSync(path.join(review,'failure.txt'),e.stack+'\n');console.error(e.stack);process.exitCode=1;});
