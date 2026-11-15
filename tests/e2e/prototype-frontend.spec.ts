import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createInterpretation } from '../../src/content/interpret';
import { BriefingSchema } from '../../src/domain/schemas';
import type { Briefing } from '../../src/domain/types';
import { selectedHourSummary } from '../../src/components/prototype-frontend/adapter';
// Fixtures are an explicit test environment, never an application fallback.
test.skip(process.env.HIKARI_SOURCE_MODE!=='fixture','Requires explicit non-production fixture mode and briefing-browser-preload.mjs');
const place='geonames:1796236';
const shots='/tmp/hikari-t10-review';
const BANNED = /窗口|本版|模型提示|US_EPA|依据置信度|暂无数据|不适用|漫射|金调|主推荐|非官方预警|不代表|不一定|不意味|不保证|不是保证|启发式|非现场|非区县实测|不随仪表|不收集微信身份|不创建订阅|仅预览文字/;
async function open(page:Page,genre='landscape'){
 await page.goto(`/?place=${place}&genre=${genre}`);
 await expect(page.locator('#hour-dial')).toHaveAttribute('aria-valuetext',/^\d{2} 时，.+，.+$/);
 await expect(page.locator('#stage')).toBeAttached();
 await expect.poll(()=>page.locator('.dial-marks > line').count()).toBe(24);
}
async function nav(page:Page,section:string){await page.locator(`.site-header nav [data-nav="${section}"]`).click();if(section==='book'||section==='subscribe')await expect(page.locator('#peer-reader')).toHaveAttribute('data-phase','reading');}
async function scene(page:Page,p:number){
 await page.evaluate(p=>{const j=document.querySelector<HTMLElement>('#journey')!;window.scrollTo({top:j.offsetTop+Number(j.dataset.readingDistance)*p,behavior:'instant'});},p);
 await expect.poll(async()=>Number(await page.locator('#stage').getAttribute('data-progress'))).toBeCloseTo(p,2);

}
async function screenshot(page:Page,name:string){await mkdir(shots,{recursive:true});const path=`${shots}/${test.info().project.name}-${name}.png`;if(!existsSync(path))await page.screenshot({path});}

test('direct prototype structure, authored assets and readable newspaper',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await open(page);
 await expect(page.locator('[data-frontend="prototype"]')).toHaveCount(1);
 await expect(page.locator('#newspaper .news-grid > section')).toHaveCount(4);
 await expect(page.locator('.devices > button')).toHaveCount(4);
 await expect(page.locator('.devices img')).toHaveCount(3);
 await expect(page.locator('#spreads > .spread')).toHaveCount(3);
 await expect(page.locator('#spreads [data-diagram]')).toHaveCount(3);
 expect(await page.evaluate(()=>({fixture:'HIKARI' in window,solar:'HIKARI_SOLAR' in window}))).toEqual({fixture:false,solar:false});
 expect(await page.locator('script[src*="data.js"],script[src*="solar.js"],iframe').count()).toBe(0);
 await expect(page.locator('#newspaper .dateline')).toContainText('人工合成');
 await expect(page.locator('.temperature-coverage').first()).toContainText('24/24');
 await screenshot(page,'newspaper');
 await writeFile(`${shots}/${test.info().project.name}-geometry.json`,JSON.stringify(await page.locator('#newspaper').evaluate(n=>({rect:n.getBoundingClientRect().toJSON(),height:n.scrollHeight,world:document.querySelector('#world')!.getBoundingClientRect().toJSON(),viewport:innerHeight})),null,2));
 expect(errors).toEqual([]);
});

test('no location has no fake weather; debounced search uses administrative context',async({page})=>{
 let searches=0;page.on('request',r=>{if(r.url().includes('/api/locations'))searches++;});
 await page.goto('/');await expect(page.getByRole('heading',{name:'尚未选择地点'})).toBeVisible();await expect(page.locator('#newspaper')).toHaveCount(0);
 await page.getByRole('button',{name:'搜索城市或区县'}).click();
 await page.getByRole('searchbox').fill('同');await page.waitForTimeout(350);expect(searches).toBe(0);
 await page.getByRole('searchbox').fill('同名');await page.waitForTimeout(180);expect(searches).toBe(0);
 await expect(page.getByRole('list',{name:'地点搜索结果'}).getByRole('button')).toHaveCount(2);
 await expect(page.locator('.results')).toContainText('人工北京行政上下文');
 await page.locator('.results button').first().click();await expect(page).toHaveURL(/place=geonames%3A1796236/);await expect(page.locator('#newspaper')).toBeAttached();
});

test('dial keyboard, buttons and touch select hours without fetching weather',async({page,request})=>{
 const b=(await (await request.get(`/api/briefing?place=${place}`)).json()).data as Briefing;
 await open(page);await nav(page,'bag');
 let calls=0;page.on('request',r=>{if(r.url().includes('/api/briefing'))calls++;});
 const dial=page.locator('#hour-dial');await dial.focus();await dial.press('Home');await expect(dial).toHaveAttribute('aria-valuenow','0');
 await dial.press('ArrowLeft');await expect(dial).toHaveAttribute('aria-valuenow','23');await dial.press('ArrowRight');await expect(dial).toHaveAttribute('aria-valuenow','0');await dial.press('End');await expect(dial).toHaveAttribute('aria-valuenow','23');
 await page.locator('#next-hour').click();await expect(dial).toHaveAttribute('aria-valuenow','0');await page.locator('#prev-hour').click();await expect(dial).toHaveAttribute('aria-valuenow','23');
 const box=(await dial.boundingBox())!;const x=box.x+box.width*.84,y=box.y+box.height*.5;
 if(test.info().project.name==='narrow')await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
 await expect(dial).toHaveAttribute('aria-valuenow','6');
 await expect(page.locator('#weather-index')).toHaveText(b.interpretation.hours[6].sentences[0]);expect(calls).toBe(0);await screenshot(page,'bag');
});

test('four screens and spoken reading follow every selected hour without LCD clipping',async({page,request})=>{
 const b=(await (await request.get(`/api/briefing?place=${place}`)).json()).data as Briefing;
 // Exercise the longest standard air label and both two/three sentence layouts.
 b.state='ready';b.interpretation.dataNote=null;
 b.interpretation.hours[12].air.label='空气对敏感人群不健康';
 b.interpretation.hours[6].light={...b.interpretation.hours[6].light,label:'蓝调时刻',short:'太阳快升起，天空是深蓝色，城市灯光还没灭；光很暗，相机要拿稳。'};
 b.interpretation.hours[18].sun.label='西北 · 刚落山，天还亮';
 b.interpretation.hours[22].wind={...b.interpretation.hours[22].wind,label:'西北风 12 级',short:'阵风 12 级 · -20°C · 湿度 100%'};
 b.interpretation.hours[12].sentences=[...b.interpretation.hours[12].sentences.slice(0,2),'这是今天最值得拍风光的时间。'];
 await open(page);
 await page.route('**/api/briefing?*',route=>route.fulfill({json:{data:b,error:null}}));
 await page.locator('.header-refresh').click();
 await expect(page.locator('#state-note')).toBeHidden();
 await nav(page,'bag');
 const dial=page.locator('#hour-dial');await dial.focus();await dial.press('Home');
 const values=(h:number)=>{const r=b.interpretation.hours[h];return {'wind-label':r.wind.label,'wind-short':r.wind.short,
  'sun-label':r.sun.label,'light-label':r.light.label,'light-short':r.light.short,'sky-label':r.sky.label,
  'rain-label':r.rain.label,'visibility-label':r.visibility.label,'air-label':r.air.label};};
 for(let hour=0;hour<24;hour++){
  if(hour)await dial.press('ArrowRight');
  const r=b.interpretation.hours[hour];
  for(const [key,value] of Object.entries(values(hour)))await expect(page.locator(`.devices [data-value="${key}"]`)).toHaveText(value);
  await expect(page.locator('.reading-index > p')).toHaveText(selectedHourSummary(r));
  await expect(page.locator('.reading-index')).toHaveAttribute('aria-live','polite');
  await expect(page.locator('#weather-index')).toHaveText(r.sentences[0]);
  await expect(dial).toHaveAttribute('aria-valuetext',`${String(hour).padStart(2,'0')} 时，${r.sky.label}，${r.light.label}`);
  for(const node of await page.locator('.selected-time').all())await expect(node).toHaveText(`${String(hour).padStart(2,'0')}:00`);
  const angle=await page.locator('.devices .sun-dial').evaluate(n=>n.style.getPropertyValue('--sun-angle'));
  expect(angle).toBe(b.hours[hour].light.azimuth===null?'':`${b.hours[hour].light.azimuth}deg`);
  const text=await page.locator('.devices, .reading-index').allTextContents();
  expect(await page.locator('.devices .light-lcd > span').evaluate(n=>n.clientHeight/parseFloat(getComputedStyle(n).lineHeight))).toBeLessThanOrEqual(2.1);
  expect((await page.locator('.devices .lcd:not(.direction-lcd)').allTextContents()).join(' ').replaceAll('°C','')).not.toContain('°');
  expect(text.join(' ')).not.toMatch(BANNED);
  expect(text.join(' ')).not.toMatch(/m\/s|μg\/m³|PM2\.5|PM10/);
  const overflow=await page.locator('.devices .lcd, .devices .weather-card').evaluateAll(nodes=>nodes.flatMap(n=>{
   const el=n as HTMLElement;
   const bad=[el,...el.querySelectorAll<HTMLElement>('*')].filter(x=>x.scrollWidth>x.clientWidth+1||x.scrollHeight>x.clientHeight+1);
   return bad.map(x=>({class:x.className,text:x.textContent,width:[x.scrollWidth,x.clientWidth],height:[x.scrollHeight,x.clientHeight]}));
  }));
  expect(overflow,`hour ${hour} LCD content`).toEqual([]);
  expect(await page.locator('.weather-card').evaluate(n=>{
   const source=n.querySelector<HTMLElement>('.card-source')!;
   return source.offsetTop+source.offsetHeight<=n.clientHeight-parseFloat(getComputedStyle(n).paddingBottom)+1;
  }),`hour ${hour} source inside the card padding`).toBe(true);
  const geometry=await page.locator('.reading-index').evaluate(n=>{
   const summary=n.getBoundingClientRect(),state=document.querySelector('.state-line')!.getBoundingClientRect(),button=document.querySelector('.hour-details')!.getBoundingClientRect();
   const overlap=(a:DOMRect,b:DOMRect)=>Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top);
   return {state:overlap(summary,state),button:overlap(summary,button),overflow:n.scrollWidth>n.clientWidth+1};
  });
  expect(geometry,`hour ${hour} summary stays clear of controls and data note`).toEqual({state:false,button:false,overflow:false});
  if(hour===12&&test.info().project.name!=='reduced-motion')await screenshot(page,'selected-hour-summary');
 }
 await expect(page.locator('.wind-lcd > *')).toHaveCount(3);await expect(page.locator('.card-grid > span')).toHaveCount(4);
 await expect(page.locator('.card-grid')).toContainText('美国标准');await expect(page.locator('.card-source')).toHaveText(`预报 · ${b.generatedAt.slice(11,16)}`);
 await expect(page.locator('#condition-index, #solar-index, #light-index, #hour-note')).toHaveCount(0);
 await expect(page.locator('.scene-title')).toContainText('这一小时的天气和光线');
 if(test.info().project.name!=='reduced-motion')await page.locator('#motion-toggle').click();
 await expect(page.locator('body')).toHaveClass(/static/);
 await expect(page.locator('.reading-index > p')).toHaveText(selectedHourSummary(b.interpretation.hours[23]));
 expect(await page.locator('.reading-index').evaluate(n=>n.getBoundingClientRect().bottom<=document.querySelector('.state-line')!.getBoundingClientRect().top)).toBe(true);
 await page.unroute('**/api/briefing?*');
});

test('sources, metric notes, five-level opportunity, Escape and return focus',async({page})=>{
 await open(page);const source=page.locator('#newspaper [data-detail="sources"]');await source.click();
 await expect(page.locator('#detail')).toBeVisible();await expect(page.locator('#detail .sources-credits')).toContainText('CC BY 4.0');
 await expect(page.locator('#detail [data-source-table],#detail .sources-method,#detail .sources-solar')).toHaveCount(0);
 await page.keyboard.press('Escape');await expect(page.locator('#detail')).not.toBeVisible();await expect(source).toBeFocused();
 await page.locator('#newspaper [data-detail="sunset"]').click();await expect(page.locator('#detail .levels > div')).toHaveCount(5);await expect(page.locator('#detail')).toContainText('今天日落');await page.keyboard.press('Escape');
 await nav(page,'bag');const device=page.locator('[data-device="weather"]').first();await device.focus();await device.press('Enter');
 await expect(page.locator('#detail h2')).toHaveText('天色与空气');await expect(page.locator('#detail')).toContainText('两回事');
 await expect(page.locator('#detail')).toContainText('美国标准');await expect(page.locator('#detail')).toContainText('公里');
 await page.keyboard.press('Tab');await expect(page.locator('#close-detail')).toBeFocused();
 await page.keyboard.press('Escape');await expect(device).toBeFocused();
});

test('four dedicated details have isolated fields, readable trends and return focus after source switching',async({page,request})=>{
 const b=(await (await request.get(`/api/briefing?place=${place}`)).json()).data as Briefing;
 await open(page);await nav(page,'bag');const dial=page.locator('#hour-dial');await dial.focus();await dial.press('Home');
 for(let i=0;i<12;i++)await dial.press('ArrowRight');
 const cases=[
  {kind:'wind',title:'风',included:['阵风','风向','气温','湿度','3 级发丝乱'],excluded:['PM2.5','低云','能见度','日出']},
  {kind:'direction',title:'太阳位置',included:['方位','高度','日出','日落','清晨黄金时刻','傍晚黄金时刻','清晨蓝调时刻','傍晚蓝调时刻'],excluded:['PM2.5','低云','湿度']},
  {kind:'light',title:'光线',included:['总云','低云','中云','高云','柔光：','硬光：','忽明忽暗：'],excluded:['PM2.5','能见度','湿度','日出']},
  {kind:'weather',title:'天色与空气',included:['天色','降水概率','能见度','美国标准 AQI','PM2.5','PM10','两回事'],excluded:['低云','湿度','日出']},
 ] as const;
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 for(const c of cases){
  const device=page.locator(`.devices [data-device="${c.kind}"]`),dialog=page.locator('#detail');
  await device.focus();await device.press('Enter');await expect(dialog).toBeVisible();
  await expect(page.locator('#detail h2')).toHaveText(c.title);
  for(const text of c.included)await expect(page.locator('#detail-body')).toContainText(text);
  const content=await page.locator('#detail-body').innerText();
  for(const text of c.excluded)expect(content).not.toContain(text);
  expect(content).not.toMatch(BANNED);
  expect(content).not.toMatch(/open-meteo|有效 ·|读数来自所选小时的简报/);
  await expect(page.locator('.detail-strip > i')).toHaveCount(24);
  for(let h=0;h<24;h++){
   const cell=page.locator(`.detail-strip > [data-trend-hour="${h}"]`);
   await expect(cell).toHaveAttribute('title',`${String(h).padStart(2,'0')} 时 · ${b.interpretation.hours[h].devices[c.kind].trend.label}`);
   await expect(cell).toContainText(`${String(h).padStart(2,'0')} 时`);
  }
  await expect(page.locator('.detail-strip [aria-current="time"]')).toHaveAttribute('data-trend-hour','12');
  await expect(page.locator('.detail-trend figcaption')).toContainText('12 时');
  await expect(page.locator('.detail-strip .tl-now')).toHaveCount(1);
  expect(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
  const overflow=await page.locator('.device-fields dd, .device-meaning, .device-day, .detail-source').evaluateAll(nodes=>nodes.filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.textContent));
  expect(overflow).toEqual([]);
  await screenshot(page,`v08c-${c.kind}-readings`);
  await page.locator('.device-day').scrollIntoViewIfNeeded();await screenshot(page,`v08c-${c.kind}-trend`);
  await page.keyboard.press('Escape');await expect(device).toBeFocused();
  // Device details no longer have an inline source link; use the current paper entry.
  await nav(page,'paper');const source=page.locator('#newspaper [data-detail="sources"]');await source.click();
  await expect(page.locator('#detail h2')).toHaveText('来源、更新时间与缺失说明');
  await expect(page.locator('#detail .sources-credits')).toContainText('署名与使用许可');
  await expect(page.locator('#close-detail')).toBeFocused();
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(source).toBeFocused();
  await nav(page,'bag');await device.focus();await expect(device).toBeFocused();
 }
 expect(errors).toEqual([]);
});

test('genre buttons, URL, history, memory and mobile native horizontal reader',async({page})=>{
 await open(page,'portrait');await expect(page).toHaveURL(/genre=portrait/);
 await expect(page.locator('#book-nav button[data-genre="1"]')).toHaveAttribute('aria-current','');
 const historyLength=await page.evaluate(()=>history.length);
 await nav(page,'book');expect(await page.evaluate(()=>history.length)).toBe(historyLength);await page.locator('#book-nav button[data-genre="2"]').click();expect(await page.evaluate(()=>history.length)).toBe(historyLength+1);await expect(page).toHaveURL(/genre=street/);
 await expect(page.locator('#spreads > .spread[data-genre="2"]')).toContainText('调整方向');await screenshot(page,'street-book');
 await page.goBack();await expect(page).toHaveURL(/genre=portrait/);await expect(page.locator('#book-nav button[data-genre="1"]')).toHaveAttribute('aria-current','');await expect(page.locator('#turn-leaf')).toBeHidden();
 if(test.info().project.name!=='wide'){
  if(test.info().project.name==='narrow'){
   const session=await page.context().newCDPSession(page);
   await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:330,y:380}]});
   for(const x of [290,230,170,110,50])await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:380}]});
   await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();
  }else await page.locator('#spreads').evaluate(n=>n.scrollTo({left:n.clientWidth*2,behavior:'instant'}));
  await expect(page).toHaveURL(/genre=street/);await expect(page.locator('#book-nav')).toBeVisible();
  expect(await page.locator('#spreads').evaluate(n=>getComputedStyle(n).scrollSnapType)).toContain('x');
 }
 await page.goto('/');await expect(page).toHaveURL(/place=geonames%3A1796236/);await expect(page).toHaveURL(/genre=(portrait|street)/);
});

test('subscription is local preview and untrusted text stays text',async({page})=>{
 await open(page);await nav(page,'subscribe');
 let mutations=0;page.on('request',r=>{if(r.method()!=='GET')mutations++;});
 const value='<img src=x onerror=alert(1)>';
 await page.locator('#place').fill(value);await page.getByRole('button',{name:'预览订阅单'}).click();
 await expect(page.locator('#registration-text')).toContainText(value);await expect(page.locator('#registration img')).toHaveCount(0);await expect(page.locator('#registration .stamp')).toHaveText('预览单');
 await page.locator('#edit-preview').click();await expect(page.locator('#place')).toBeFocused();await page.getByRole('button',{name:'预览订阅单'}).click();await page.locator('#stop-preview').click();await expect(page.locator('#subscription-status')).toContainText('已停止本次预览');expect(mutations).toBe(0);await screenshot(page,'subscription');
});

test('runtime mode switches keep focus and no duplicate DOM/listener effect on refresh',async({page})=>{
 await open(page);await nav(page,'bag');
 const toggle=page.locator('#motion-toggle');await toggle.click();await expect(toggle).toBeFocused();
 await page.getByRole('button',{name:'刷新 / 重试简报'}).click();await expect(page.getByRole('button',{name:'刷新 / 重试简报'})).toBeEnabled();
 await expect(page.locator('#peer-reader')).toHaveCount(1);await expect(page.locator('.dial-marks line')).toHaveCount(24);await expect(page.locator('.discovery-leaf')).toHaveCount(0);
 await nav(page,'bag');await page.locator('#hour-dial').focus();await page.locator('#hour-dial').press('Home');await page.locator('#next-hour').click();await expect(page.locator('#hour-dial')).toHaveAttribute('aria-valuenow','1');
 const ids=await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);return ids.filter((id,i)=>ids.indexOf(id)!==i);});expect(ids).toEqual([]);
 await page.emulateMedia({reducedMotion:'no-preference'});await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('body')).toHaveClass(/static/);await expect(page.locator('#spreads > .spread')).toHaveCount(3);
});

test('missing/conflicting/stale/unavailable payload preserves semantics and solar',async({page,request})=>{
 const response=await request.get(`/api/briefing?place=${place}`);const original=(await response.json()).data as Briefing;
 await open(page);
 for(const state of ['partial','stale','unavailable'] as const){
  const b=structuredClone(original);b.state=state;b.interpretation.dataNote=`测试${state}：缺少风的预报`;b.interpretation.headline=`${state}<script>`;b.summary.temperatureRange={min:-4,max:8,coveredHours:7,totalHours:24};
  b.hours[0].weather.visibility={value:null,state:'missing',sourceIds:[],notes:['测试缺失能见度，不由AQI推导']};
  b.hours[0].weather.temperature={value:4,state:'conflict',sourceIds:[b.sources[0].id],notes:['测试多源分歧'],alternatives:[{sourceId:b.sources[0].id,value:12}]};
  b.hours[0].light.azimuth=null;b.sunsetOpportunity={...b.sunsetOpportunity,status:'unknown',level:null,confidence:null,label:'暂无法判断'};
  if(state==='unavailable'){b.hours.forEach(h=>{for(const m of [...Object.values(h.weather),...Object.values(h.air)])Object.assign(m,{value:null,state:'missing',sourceIds:[],alternatives:undefined});});}
  b.hours[0].risks=[{code:'strong-wind',message:'测试大风风险必须醒目',start:b.hours[0].start,end:b.hours[0].end,sourceIds:[b.sources[0].id]}];
  b.interpretation.risks=[{code:'strong-wind',status:'future',text:'测试大风风险必须醒目',start:b.hours[23].start,end:b.hours[23].end}];
  b.interpretation=createInterpretation({...b,now:b.generatedAt});
  b.interpretation.dataNote=`测试${state}：缺少风的预报`;b.interpretation.headline=`${state}<script>`;
  b.interpretation.risks=[{code:'strong-wind',status:'future',text:'测试大风风险必须醒目',start:b.hours[23].start,end:b.hours[23].end}];
  BriefingSchema.parse(b);
  await page.route('**/api/briefing?*',route=>route.fulfill({status:state==='unavailable'?503:200,json:{data:b,error:state==='unavailable'?{code:'WEATHER_UNAVAILABLE',message:'测试整体不可用'}:null}}));
  await page.getByRole('button',{name:'刷新 / 重试简报'}).click();await expect(page.locator('#newspaper .headline')).toContainText(`${state}<script>`);
  await expect(page.locator('#newspaper .briefing-risk')).toContainText('测试大风风险必须醒目');await expect(page.locator('.temperature-coverage').first()).toContainText('7/24');
  await expect(page.locator('#newspaper .daily-temp')).toContainText('-4');await expect(page.locator('#newspaper .almanac')).toContainText(new Date(original.solar.sunrise!).toLocaleTimeString('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'}));
  await expect(page.locator('#newspaper script')).toHaveCount(0);
  await nav(page,'bag');await expect(page.locator('#state-note')).toBeVisible();await expect(page.locator('#state-note')).toHaveText(b.interpretation.dataNote!);await page.locator('#hour-dial').focus();await page.locator('#hour-dial').press('Home');await expect(page.locator('.sun-dial').first()).toHaveClass(/sun-unknown/);
  await nav(page,'paper');await page.locator('#newspaper [data-detail="sources"]').click();
  await page.locator('[data-source-jump="temperature"]').first().click();
  await page.locator('[data-source-cell="temperature"][data-source-hour="0"]').click();
  if(state!=='unavailable'){await expect(page.locator('#detail')).toContainText('来源分歧');await expect(page.locator('#detail')).toContainText('对比来源');}
  await page.locator('[data-source-back="table"]').click();await page.locator('[data-source-group="cloud"]').click();
  await page.locator('[data-source-cell="visibility"][data-source-hour="0"]').click();
  await expect(page.locator('#detail')).toContainText('测试缺失能见度');await page.keyboard.press('Escape');
  await page.unroute('**/api/briefing?*');
 }
});

test('native reversible fold ends in the bag and scrolling never extracts a peer',async({page})=>{
 await open(page);if(test.info().project.name==='reduced-motion')await page.locator('#motion-toggle').click();await nav(page,'bag');
 for(const p of [.46,.59,.75,.96,1,.75,.46]){await scene(page,p);await expect(page.locator('#handbook')).toHaveAttribute('data-phase','docked');await expect(page.locator('#peer-reader')).not.toBeVisible();await expect(page.locator('#subscription')).toHaveAttribute('data-phase','docked');}
 await nav(page,'book');await expect(page.locator('#peer-reader')).toHaveAttribute('data-phase','reading');
 await page.keyboard.press('Escape');await expect(page.locator('#handbook')).toHaveAttribute('data-phase','docked');
 await nav(page,'subscribe');await expect(page.locator('#peer-reader')).toHaveAttribute('data-phase','reading');await expect(page.locator('#place')).toBeEditable();
 await page.keyboard.press('Escape');await expect(page.locator('#subscription')).toHaveAttribute('data-phase','docked');
});

test('the visible newspaper hands off in place and both hinges reverse continuously',async({page})=>{
 await open(page);
 if(test.info().project.name==='reduced-motion')await page.locator('#motion-toggle').click();
 const compact=test.info().project.name!=='wide';
 const handoff=await page.locator('#journey').evaluate((n,compact)=>(n as HTMLElement).offsetTop+(compact?0:Number((n as HTMLElement).dataset.readingDistance)*.035),compact);
 async function at(y:number){await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),y);await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));}
 await at(handoff-1);await expect(page.locator('#newspaper')).not.toHaveAttribute('inert','');
 const before=(await page.locator('#newspaper').boundingBox())!;
 await at(handoff+1);await expect(page.locator('#newspaper')).toHaveAttribute('inert','');await expect(page.locator('#folding')).toBeVisible();
 const after=(await page.locator('#folding .newspaper').first().boundingBox())!;
 for(const key of ['x','y','width','height'] as const)expect(Math.abs(after[key]-before[key]),key).toBeLessThan(3);
 await screenshot(page,'handoff');
 const first=compact?.08:.09,pause=compact?.135:.158,second=compact?.18:.22;
 await scene(page,first);
 const firstPose=await page.locator('#paper-object').getAttribute('style');
 // A late window.load rebuilds the panels while their source is already hidden.
 await page.evaluate(()=>dispatchEvent(new Event('load')));
 await expect(page.locator('#folding .newspaper').first()).toHaveCSS('visibility','visible');
 const firstAngle=await page.locator('.fold-panel.right').first().evaluate(n=>parseFloat(n.style.transform.slice(8)));
 expect(firstAngle).toBeLessThan(0);expect(firstAngle).toBeGreaterThan(-180);
 expect(await page.locator('.fold-row.lower').evaluate(n=>n.style.transform)).toBe('rotateX(0deg)');
 await scene(page,pause);expect(await page.locator('.fold-panel.right').first().evaluate(n=>n.style.transform)).toBe('rotateY(-180deg)');expect(await page.locator('.fold-row.lower').evaluate(n=>n.style.transform)).toBe('rotateX(0deg)');
 await scene(page,second);expect(await page.locator('.fold-panel.right').first().evaluate(n=>n.style.transform)).toBe('rotateY(-180deg)');
 const secondAngle=await page.locator('.fold-row.lower').evaluate(n=>parseFloat(n.style.transform.slice(8)));expect(secondAngle).toBeGreaterThan(0);expect(secondAngle).toBeLessThan(180);
 await scene(page,first);expect(await page.locator('#paper-object').getAttribute('style')).toBe(firstPose);
 await at(handoff-1);const reverse=(await page.locator('#newspaper').boundingBox())!;for(const key of ['x','y','width','height'] as const)expect(Math.abs(reverse[key]-before[key])).toBeLessThan(1);
 await scene(page,.09);await page.setViewportSize(compact?{width:1440,height:1000}:{width:390,height:844});
 await page.waitForTimeout(180);await expect.poll(async()=>Number(await page.locator('#stage').getAttribute('data-progress'))).toBeCloseTo(.09,2);await expect(page.locator('#folding')).toBeVisible();
});

test('desktop first view includes the full paper and risk-heavy metadata stays out of its title',async({page,request})=>{
 await open(page);
 if(test.info().project.name!=='wide'){
  expect(await page.locator('#newspaper').evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);return;
 }
 const b=(await (await request.get(`/api/briefing?place=${place}`)).json()).data as Briefing;
 b.location.name='人工合成上海浏览器样例（不是实时地点响应）';
 b.summary.headline=`${b.location.name} ${b.localDate}：20–21 时雨势较大（最大 6.2 毫米/小时），气温 17.6–22.3°C，白天光线柔和。`;
 for(const [i,value] of [[20,6.2],[21,5.1]])b.hours[i].risks=[{code:'heavy-rain',message:`雨势较大（约 ${value} 毫米/小时），这段时间别安排户外拍摄。`,start:b.hours[i].start,end:b.hours[i].end,sourceIds:[b.sources[0].id]}];
 b.interpretation.headline='20–21 时雨势较大，别安排户外拍摄';
 b.interpretation.risks=[{code:'heavy-rain',status:'future',text:'20–21 时雨势较大（最大 6.2 毫米/小时），这段时间别安排户外拍摄',start:b.hours[20].start,end:b.hours[21].end}];
 // This is a presentation-only artificial payload, not weather-source evidence.
 await page.route('**/api/briefing?*',route=>route.fulfill({json:{data:b,error:null}}));
 await page.locator('.header-refresh').click();await expect(page.locator('#newspaper .briefing-risk')).toContainText('6.2 毫米');
 for(const viewport of [{width:1920,height:958},{width:1440,height:1000},{width:1366,height:900}]){
  await page.setViewportSize(viewport);await expect.poll(()=>page.locator('body').getAttribute('class')).not.toContain('flow-paper');
  await page.waitForTimeout(150);
  const paper=(await page.locator('#newspaper').boundingBox())!,header=(await page.locator('.site-header').boundingBox())!;
  expect(paper.y).toBeGreaterThan(header.y+header.height+15);expect(paper.y+paper.height).toBeLessThan(viewport.height-23);
  expect(paper.x).toBeGreaterThan(20);expect(paper.x+paper.width).toBeLessThan(viewport.width-20);
  await expect(page.locator('#newspaper .headline h2')).not.toContainText(b.location.name);
  await expect(page.locator('#newspaper .headline h2')).toContainText('雨势较大');
  await screenshot(page,`fit-risk-${viewport.width}`);
 }
 await expect(page.locator('#newspaper .sky-column > .note')).toHaveText(b.interpretation.weatherLine);
 await expect(page.locator('#newspaper [data-detail="overview"]')).toHaveCount(0);
 // Exceptionally long authored content stays readable in normal flow. Its last
 // reading viewport must still meet the fixed copy at exactly the same geometry.
 b.interpretation.lead='人工超长排版样例，逐段保留全部内容。'.repeat(55);
 await page.setViewportSize({width:1280,height:840});await page.locator('.header-refresh').click();
 await expect(page.locator('body')).toHaveClass(/flow-paper/);
 const handoff=await page.locator('#journey').evaluate(n=>(n as HTMLElement).offsetTop);
 async function at(y:number){await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),y);await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));}
 await at(handoff-1);const before=(await page.locator('#newspaper').boundingBox())!;
 expect(before.y+before.height).toBeGreaterThan(700);
 await at(handoff+1);await expect(page.locator('#folding')).toBeVisible();const after=(await page.locator('#folding .newspaper').first().boundingBox())!;
 for(const key of ['x','y','width','height'] as const)expect(Math.abs(after[key]-before[key]),key).toBeLessThan(3);
 await at(handoff-1);await expect(page.locator('#newspaper')).not.toHaveAttribute('inert','');
});

test('printed advice stays on the paper and complete long advice opens outside the book',async({page,request})=>{
 await open(page);
 await expect(page.locator('#newspaper [data-detail="overview"]')).toHaveCount(0);
 const b=(await (await request.get(`/api/briefing?place=${place}`)).json()).data as Briefing;
 await expect(page.locator('#newspaper .sky-column > .note')).toHaveText(b.interpretation.weatherLine);
 for(const [g,a] of Object.entries(b.advice)){
  a.timing=`${g}完整时机：${'长文依据，'.repeat(40)}时机末尾`;
  a.light=`${g}完整光线：${'光线解释，'.repeat(40)}光线末尾`;
  a.opportunities=[`${g}完整机会：${'画面机会，'.repeat(40)}机会末尾`,`${g}第二机会`];
  a.limitations=[`${g}完整限制：${'天气限制，'.repeat(40)}限制末尾`,`${g}第二限制`];
  a.alternatives=[`${g}完整调整：${'替代方案，'.repeat(40)}调整末尾`];
  a.film.reason=`${g}胶片理由：${'风格说明，'.repeat(40)}理由末尾`;a.film.caveat=`${g}完整胶片说明末尾`;
 }
 BriefingSchema.parse(b);
 await page.route('**/api/briefing?*',route=>route.fulfill({json:{data:b,error:null}}));
 await page.locator('.header-refresh').click();await expect(page.locator('#newspaper')).toBeAttached();await nav(page,'book');
 await expect(page.locator('#spreads details')).toHaveCount(0);
 await expect(page.locator('#spreads>.spread').first()).toHaveAttribute('aria-label','风光，今天怎么拍');
 await expect(page.locator('#spreads>.spread').first().locator('.window small')).toHaveText(b.advice.landscape.recommendedWindows.length?'最值得拍的时间':'拍摄时段');
 for(const [i,g] of ['landscape','portrait','street'].entries()){
  await page.locator(`#book-nav button[data-genre="${i}"]`).click();
  // No sources dialog is open here, so body.innerText excludes its technical audit.
  expect(await page.locator('body').innerText()).not.toMatch(BANNED);
  expect(await page.locator(`#spreads>.spread[data-genre="${i}"]`).innerText()).not.toMatch(BANNED);
  const paper=page.locator(`#spreads>.spread[data-genre="${i}"]>.book-page`).last();
  const source=paper.locator(`[data-detail="advice-${g}"]`);await source.scrollIntoViewIfNeeded();
  const anchor=(await page.locator('#handbook').boundingBox())!;await source.click();
  const a=b.advice[g as keyof typeof b.advice];
  for(const full of [a.timing,a.light,...a.opportunities,...a.limitations,...a.alternatives,a.film.reason,a.film.caveat])await expect(page.locator('#detail-body')).toContainText(full);
  await expect(page.locator('#detail-body')).toContainText('时段记录（含已经过去的）');await page.locator('#detail').evaluate(n=>{n.scrollTop=n.scrollHeight;});
  await expect(page.locator('#detail-body .advice-detail>p').last()).toBeInViewport();await page.keyboard.press('Escape');await expect(source).toBeFocused();
  expect((await page.locator('#handbook').boundingBox())!.y).toBeCloseTo(anchor.y,1);
  expect(await paper.evaluate(n=>n.scrollTop)).toBe(0);
 }
 await screenshot(page,'printed-advice');
});

test('manual stays anchored through local paper wheel and both printed turns',async({page})=>{
 await open(page);await nav(page,'book');await expect(page.locator('#peer-reader')).toHaveAttribute('data-phase','reading');
 const book=page.locator('#handbook'),anchor=(await book.boundingBox())!,scroll=await page.evaluate(()=>scrollY);
 for(const i of [1,2,1,0]){
  await page.locator(`#book-nav [data-genre="${i}"]`).click();
  await expect(page.locator('#turn-leaf')).toBeHidden();
  expect((await book.boundingBox())!.x).toBeCloseTo(anchor.x,1);expect(await page.evaluate(()=>scrollY)).toBe(scroll);
  const paper=page.locator(`#spreads>.spread[data-genre="${i}"]>.book-page`);
  for(const n of await paper.all())expect(await n.evaluate(n=>({scroll:n.scrollTop,content:n.scrollHeight,height:n.clientHeight}))).toEqual({scroll:0,content:await n.evaluate(n=>n.clientHeight),height:await n.evaluate(n=>n.clientHeight)});
 }
 await page.locator('#spreads').dispatchEvent('wheel',{deltaY:120});await expect(page).toHaveURL(/genre=portrait/);
 await expect(page.locator('#turn-leaf')).toBeHidden();await page.waitForTimeout(230);
 await page.locator('#spreads').dispatchEvent('wheel',{deltaY:120,ctrlKey:true});await expect(page).toHaveURL(/genre=portrait/);
 await page.locator('#spreads').dispatchEvent('wheel',{deltaX:180,deltaY:10});await expect(page).toHaveURL(/genre=portrait/);
});

test('no-script reading retains complete advice for all three genres',async({browser,request})=>{
 const b=(await (await request.get(`/api/briefing?place=${place}`)).json()).data as Briefing;
 const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:1440,height:1000}});
 try{
  const page=await context.newPage();await page.goto(`http://127.0.0.1:3100/?place=${place}`);
  const sections=page.locator('noscript .advice-detail');await expect(sections).toHaveCount(3);
  for(const [i,a] of Object.values(b.advice).entries()){
   const section=sections.nth(i);await section.locator('h2').scrollIntoViewIfNeeded();await expect(section.locator('h2')).toBeInViewport();
   for(const full of [a.timing,a.light,...a.opportunities,...a.limitations,...a.alternatives,a.film.reason,a.film.caveat])await expect(section).toContainText(full);
   await expect(section).toContainText('时段记录（含已经过去的）');
  }
  const raw=page.locator('noscript .sources-static');
  await expect(page.locator('#spreads>.spread>.book-page')).toHaveCount(6);await expect(page.locator('#subscription')).toBeVisible();await expect(page.locator('#subscription')).toContainText('逐 光 日 刊 · 订 阅 单');
  await expect(raw.locator('details[id^="hour-"]')).toHaveCount(24);
  for(let h=0;h<24;h++)await expect(page.locator(`#hour-${h}`)).toHaveCount(1);
  await raw.locator('#hour-0 > summary').click();await raw.locator('#hour-0 > details').filter({has:page.getByText('参考 AQI',{exact:true})}).locator('summary').click();await expect(raw.locator('#hour-0')).toContainText('参考 AQI');
 }finally{await context.close();}
});

test('late place response and rapid scene teardown cannot restore obsolete content or callbacks',async({page,request})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const a=await (await request.get(`/api/briefing?place=${place}`)).json();
 const second='geonames:1816670',b=await (await request.get(`/api/briefing?place=${second}`)).json();
 let release!:()=>void;const held=new Promise<void>(done=>{release=done;});let started=false;
 await page.route('**/api/briefing?*',async route=>{if(new URL(route.request().url()).searchParams.get('place')===second){started=true;await held;await route.fulfill({json:b}).catch(()=>{});}else await route.fulfill({json:a});});
 await open(page);await nav(page,'bag');
 await page.getByRole('button',{name:'选择拍摄地点'}).click();await page.getByRole('searchbox').fill('北京');await page.locator('.results button').click();await expect.poll(()=>started).toBe(true);await expect(page.locator('#newspaper')).toHaveCount(0);
 await page.getByRole('button',{name:'选择拍摄地点'}).click();await page.getByRole('searchbox').fill('上海');await page.locator('.results button').click();await expect(page.locator('#newspaper')).toContainText('人工合成上海');release();
 await expect(page.locator('#newspaper')).not.toContainText('人工合成北京区域');
 await page.unroute('**/api/briefing?*');await page.route('**/api/briefing?*',route=>route.fulfill({contentType:'application/json',body:'{malformed'}));
 // Queue a native scroll frame, synchronously navigate twice, then replace the entire host.
 await page.evaluate(()=>{dispatchEvent(new Event('scroll'));document.querySelector<HTMLAnchorElement>('.site-header nav [data-nav="book"]')!.click();document.querySelector<HTMLAnchorElement>('.site-header nav [data-nav="bag"]')!.click();document.querySelector<HTMLButtonElement>('.header-refresh')!.click();});
 await expect(page.locator('section[role="alert"]')).toContainText('BRIEFING_UNAVAILABLE');await expect(page.locator('#mobile-book-home')).toHaveCount(0);await expect(page.locator('#newspaper')).toHaveCount(0);
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));expect(errors).toEqual([]);await expect(page.locator('body')).toHaveClass('static');
});

test('15-minute checks pause while hidden and replace the Shanghai day at midnight',async({page,request})=>{
 const fixture=await (await request.get(`/api/briefing?place=${place}`)).json();let calls=0;
 await page.clock.install({time:new Date(fixture.data.generatedAt)});
 await page.route('**/api/briefing?*',async route=>{
  calls++;const now=await page.evaluate(()=>Date.now());const day=new Date(now+8*3600000).toISOString().slice(0,10);const data=structuredClone(fixture.data) as Briefing;
  data.generatedAt=new Date(now).toISOString();data.localDate=day;data.solar={sunrise:null,sunset:null,morningBlue:null,morningGolden:null,eveningGolden:null,eveningBlue:null,notes:['人工跨日浏览器样例，未重新计算星历']};
  const from=Date.parse(`${day}T00:00:00+08:00`);data.hours.forEach((h,i)=>{h.start=new Date(from+i*3600000).toISOString();h.end=new Date(from+(i+1)*3600000).toISOString();});
  await route.fulfill({json:{data,error:null}});
 });
 await open(page);
 async function visibility(value:string){await page.evaluate(value=>{Object.defineProperty(document,'visibilityState',{configurable:true,value});document.dispatchEvent(new Event('visibilitychange'));},value);}
 await visibility('hidden');await page.clock.runFor(30*60000);expect(calls).toBe(0);await visibility('visible');await expect.poll(()=>calls).toBe(1);await expect(page.locator('.header-refresh')).toBeEnabled();
 await page.clock.runFor(15*60000);await expect.poll(()=>calls).toBe(2);await expect(page.locator('.header-refresh')).toBeEnabled();
 await visibility('hidden');const midnight=Date.parse(`${fixture.data.localDate}T23:59:59.900+08:00`);await page.clock.pauseAt(midnight);await visibility('visible');await expect.poll(()=>calls).toBe(3);await expect(page.locator('.header-refresh')).toBeEnabled();
 await page.clock.runFor(100);await expect.poll(()=>calls).toBe(4);await expect(page.locator('.header-refresh')).toBeEnabled();
 const next=new Date(midnight+100+8*3600000).toISOString().slice(0,10);await expect(page.locator('#newspaper .dateline')).toContainText(next);await expect(page.locator('#spreads > .spread').first()).toContainText(next);
});


test('eight-column hourly table uses generated time, readable marks, plain details and a sticky keyboard scroll region',async({page,request})=>{
 if(test.info().project.name==='wide')await page.setViewportSize({width:1440,height:900});
 const b=(await (await request.get(`/api/briefing?place=${place}`)).json()).data as Briefing;
 b.generatedAt=`${b.localDate}T09:30:00+08:00`;
 const win=(start:string,end:string,reasonCodes=['D2'])=>({start,end,reasonCodes,status:'future' as const,reasons:[],limitations:[],sourceIds:[]});
 b.advice.landscape.recommendedWindows=[win(b.hours[9].start,b.hours[9].end)];
 b.advice.portrait.recommendedWindows=[win(b.hours[9].start,b.hours[9].end)];
 b.advice.street.recommendedWindows=[win(b.hours[9].start,b.hours[9].end,['D0'])];
 b.hours[10].risks=[{code:'strong-wind',start:b.hours[10].start,end:b.hours[10].end,message:'raw-secret-risk',sourceIds:['raw-secret-id']}];
 b.interpretation=createInterpretation({...b,now:b.generatedAt});BriefingSchema.parse(b);
 await open(page);await page.route('**/api/briefing?*',route=>route.fulfill({json:{data:b,error:null}}));await page.locator('.header-refresh').click();
 await expect(page.locator('#newspaper .dateline')).toContainText('09:30');await nav(page,'bag');
 const dial=page.locator('#hour-dial');await dial.focus();await dial.press('End');
 const trigger=page.locator('.hour-details');await trigger.focus();await trigger.press('Enter');
 const table=page.locator('.hours-table'),region=page.locator('.hours-scroll'),dialog=page.locator('#detail');
 await expect(table.locator('caption')).toHaveText('今天24小时的天气和光线');
 await expect(table.locator('thead th[scope="col"]')).toHaveText(['时','天色','气温','雨','风','远景','空气','光线']);
 await expect(table.locator('tbody > tr[data-hour]')).toHaveCount(24);await expect(table.locator('tbody th[scope="row"]')).toHaveCount(24);
 await expect(table.locator('[aria-current="time"]')).toHaveAttribute('data-hour','9');await expect(table.locator('[data-hour="9"]')).toContainText('现在');
 await expect(table.locator('[data-hour="9"] th .hour-recommendation')).toHaveText('好时段 · 风光、人像');
 await expect(table.locator('[data-hour="10"] th .hour-risk')).toHaveText('⚠ 风很大');await expect(table.locator('.hour-past')).toHaveCount(9);
 await expect(page.locator('#detail-body')).toContainText(`${b.localDate} · 北京时间 · 天气为预报，光线为推算`);
 for(let h=0;h<24;h++){
  const r=b.interpretation.hours[h];await expect(table.locator(`[data-hour="${h}"] td > .hour-label`)).toHaveText([r.sky.label,r.temperature.label.replace('°C','°'),r.rain.label,r.wind.label,r.visibility.label,r.air.label,r.light.label]);
 }
 const text=await table.innerText();expect(text).not.toMatch(BANNED);expect(text).not.toMatch(/raw-secret|open-meteo|有效 ·|对比来源|来源分歧/);
 await expect(region).toHaveAttribute('tabindex','0');await expect(region).toHaveAttribute('aria-label',/可左右滚动/);
 expect(await dialog.evaluate(n=>n.scrollHeight>n.clientHeight)).toBe(true);
 expect(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
 await region.focus();await expect(region).toBeFocused();
 const first=table.locator('tbody th').first(),before=(await first.boundingBox())!.x;let after=before,keyboardLeft=0;
 if(test.info().project.name==='wide')expect(await region.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
 else {
  expect(await region.evaluate(n=>n.scrollWidth>n.clientWidth)).toBe(true);
  await page.keyboard.press('ArrowRight');await expect.poll(()=>region.evaluate(n=>n.scrollLeft)).toBeGreaterThan(0);keyboardLeft=await region.evaluate(n=>n.scrollLeft);
  await region.evaluate(n=>n.scrollTo({left:n.scrollWidth,behavior:'instant'}));
  after=(await first.boundingBox())!.x;expect(Math.abs(after-before)).toBeLessThan(1);
  await region.evaluate(n=>n.scrollTo({left:0,behavior:'instant'}));
 }
 const contrast=await table.locator('.hour-past .hour-label').evaluateAll(nodes=>{
  const luminance=(rgb:string)=>{const c=rgb.match(/[\d.]+/g)!.slice(0,3).map(Number).map(v=>{const x=v/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
  return nodes.map(n=>{const fg=luminance(getComputedStyle(n).color),bg=luminance(getComputedStyle(n.closest('table')!).backgroundColor);return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);});
 });expect(Math.min(...contrast)).toBeGreaterThanOrEqual(4.5);
 await writeFile(`${shots}/${test.info().project.name}-v08d-geometry.json`,JSON.stringify({stickyBefore:before,stickyAfter:after,keyboardScrollLeft:keyboardLeft,minimumPastTextContrast:Math.min(...contrast),region:await region.evaluate(n=>({width:n.clientWidth,scrollWidth:n.scrollWidth})),dialog:await dialog.evaluate(n=>({height:n.clientHeight,scrollHeight:n.scrollHeight}))},null,2));
 await expect(table.locator('tbody > tr')).toHaveCount(24);
 await expect(table.locator('td .hour-recommendation,td .hour-risk,details')).toHaveCount(0);
 const borders=await table.locator('tbody th').evaluateAll(nodes=>nodes.map(n=>({shadow:getComputedStyle(n).boxShadow,border:getComputedStyle(n).borderBottomWidth,width:n.getBoundingClientRect().width})));
 for(const border of borders){expect(border.shadow).not.toBe('none');expect(border.border).toBe('1px');expect(border.width).toBeGreaterThanOrEqual(100);}
 const button=table.locator('[data-hour="9"] .hour-open'),popup=page.locator('#hour-detail');
 await button.focus();
 const originalUrl=page.url(),selected=await dial.getAttribute('aria-valuenow');
 const position=await dialog.evaluate(n=>({top:n.scrollTop,left:n.querySelector('.hours-scroll')!.scrollLeft}));
 await button.press('Enter');
 await expect(popup).toBeVisible();await expect(dialog).toBeVisible();
 await expect(popup.locator('h2')).toHaveText('09:00 的天气与光线');
 await expect(popup).toContainText(`${b.location.name} · ${b.localDate} · 09:00 · 北京时间`);
 for(const key of ['sky','temperature','rain','wind','visibility','air','light'] as const)await expect(popup).toContainText(b.interpretation.hours[9][key].detail);
 expect(await popup.innerText()).not.toMatch(BANNED);expect(await popup.innerText()).not.toMatch(/raw-secret|open-meteo|data-field|对比来源|有效 ·/);
 await expect(page.locator('#close-hour-detail')).toBeFocused();await page.keyboard.press('Tab');await expect(page.locator('#close-hour-detail')).toBeFocused();
 await screenshot(page,'hour-popup');await page.keyboard.press('Escape');
 await expect(popup).not.toBeVisible();await expect(button).toBeFocused();await expect(dialog).toBeVisible();
 expect(await dialog.evaluate(n=>({top:n.scrollTop,left:n.querySelector('.hours-scroll')!.scrollLeft}))).toEqual(position);
 expect(page.url()).toBe(originalUrl);await expect(dial).toHaveAttribute('aria-valuenow',selected!);
 await button.press('Space');await expect(popup).toBeVisible();await page.locator('#close-hour-detail').click();await expect(button).toBeFocused();
 const next=table.locator('[data-hour="10"] .hour-open');await next.click();
 await expect(popup.locator('h2')).toHaveText('10:00 的天气与光线');await expect(popup).toContainText(b.interpretation.hours[10].wind.detail);
 await page.locator('#close-hour-detail').click();await expect(next).toBeFocused();
 await screenshot(page,'hour-table');await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
 await trigger.press('Enter');await expect(table.locator('[aria-current="time"]')).toHaveAttribute('data-hour','9');
 await table.locator('[data-hour="0"] .hour-open').click();
 await dialog.evaluate(n=>(n as HTMLDialogElement).close());
 await expect(popup).not.toBeVisible();await expect(dialog).not.toBeVisible();
 await trigger.focus();await trigger.press('Enter');await expect(table.locator('tbody > tr')).toHaveCount(24);await page.keyboard.press('Escape');
 await page.unroute('**/api/briefing?*');
});

test('physical handbook keeps its shell and correct double-sided leaf at print scale',async({page})=>{
 await open(page);await nav(page,'book');await expect(page.locator('#peer-reader')).toHaveAttribute('data-phase','reading');
 await expect(page.locator('#book-cover')).toBeAttached();
 const surfaces=await page.locator('.paper-stack').evaluateAll(ns=>ns.map(n=>({clipped:!!n.closest('#spreads'),shadow:getComputedStyle(n).boxShadow})));
 expect(surfaces).toHaveLength(2);for(const n of surfaces){expect(n.clipped).toBe(false);expect(n.shadow).not.toBe('none');}
 await page.locator('#book-nav [data-genre="1"]').click();
 if(test.info().project.name!=='reduced-motion'){
  await expect(page.locator('#turn-leaf')).toBeVisible();
  expect(await page.locator('#turn-leaf').evaluate(n=>n.getAnimations().some(a=>a.playState==='running'))).toBe(true);
  const clone=page.locator('.leaf-front>.book-page');
  if(test.info().project.name==='wide'){
   expect(await clone.evaluate(n=>({width:(n as HTMLElement).offsetWidth,height:(n as HTMLElement).offsetHeight}))).toEqual({width:460,height:598});
   await expect(page.locator('.leaf-front [data-diagram="horizon"]')).toHaveCount(1);await expect(page.locator('.leaf-back .genre-heading')).toContainText('人像');
  }
  if(test.info().project.name==='narrow'){await expect(page.locator('.leaf-front>.spread[data-genre="0"]')).toHaveCount(1);await expect(page.locator('.leaf-back>.spread[data-genre="1"]')).toHaveCount(1);}
  expect(await page.locator('#turn-leaf button').evaluateAll(ns=>ns.every(n=>n.tabIndex===-1&&!!n.closest('[inert]')))).toBe(true);
 }
 await expect(page.locator('#turn-leaf')).toBeHidden();
 await expect(page.locator('#book-nav [data-genre="1"]')).toHaveAttribute('aria-current','');
 await page.locator('#book-nav [data-genre="0"]').click();
 if(test.info().project.name==='narrow'){
  await expect(page.locator('#turn-leaf')).toBeVisible();
  await page.locator('#turn-leaf').evaluate(n=>{const a=n.getAnimations()[0];a.pause();a.currentTime=270;});
  await expect(page.locator('.leaf-front>.spread[data-genre="0"]')).toHaveCount(1);await expect(page.locator('.leaf-back>.spread[data-genre="1"]')).toHaveCount(1);
  expect(await page.locator('#turn-leaf').evaluate(n=>getComputedStyle(n).transformOrigin)).toMatch(/^0px /);
  if(!existsSync('/tmp/hikari-t10-review/mid-reverse-narrow.png'))await page.screenshot({path:'/tmp/hikari-t10-review/mid-reverse-narrow.png'});
  await page.locator('#turn-leaf').evaluate(n=>n.getAnimations()[0].play());
 }
 await expect(page.locator('#turn-leaf')).toBeHidden();
});
