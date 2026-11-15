import { sourceMetricHtml, sourceRecordHtml } from '../../src/components/prototype-frontend/sources-view';
import { describe, expect, it } from 'vitest';
import type { GenreAdvice } from '../../src/domain/types';
import { createInterpretation, deviceReadings, hourReadings } from '../../src/content/interpret';
import { syntheticBriefing } from '../fixtures/domain-synthetic';
import { adviceHtml, bookHtml, detailHtml, hourDetailHtml, newspaperHtml, pageHtml, readings, selectedHourSummary, time, range, opportunity } from '../../src/components/prototype-frontend/adapter';

const BANNED = /窗口|本版|模型提示|US_EPA|依据置信度|暂无数据|不适用|漫射|金调|主推荐|非官方预警|不代表|不一定|不意味|不保证|不是保证|启发式|非现场|非区县实测|不随仪表|不收集微信身份|不创建订阅|仅预览文字/;

describe('V03 concise presentation copy',()=>{
 it('explains the spatial sunset model and preserves its attributed source safely',()=>{
  const b=syntheticBriefing();
  b.sources.push({...b.sources[0],id:'open-meteo-ecmwf-sunset',provider:'Open-Meteo / ECMWF',dataset:'ECMWF IFS HRES 日落方向空间云场'});
  b.sunsetOpportunity.sourceIds=['open-meteo-ecmwf-sunset'];
  b.sunsetOpportunity.reasons=['日落方向400公里的云场依据'];
  const html=detailHtml(b,'sunset',0);
  expect(html).toContain('夕阳能不能照到云层');
  expect(html).toContain('ECMWF IFS HRES 日落方向空间云场');
  expect(html).toContain('日落方向400公里的云场依据');
  expect(html).not.toContain('这几样越齐，分数越高');
  b.sources.at(-1)!.provider='<script>test</script>';
  expect(detailHtml(b,'sunset',0)).toContain('&lt;script&gt;test&lt;/script&gt;');
 });
 it('keeps forecast, solar, advice, EPA scope, source resolution and synthetic labels with a preview form',()=>{
  const b=syntheticBriefing();b.warnings=['演示数据：人工合成'];
  const html=pageHtml(b);
  for(const fact of ['预报','天文推算','今天怎么拍','美国 EPA','45 km','原生3小时','含插值','人工合成','订阅预览'])expect(html).toContain(fact);
  // The no-script fallback includes the sources audit; scan the visible template separately.
  expect(html.split('<noscript>')[0]).not.toMatch(BANNED);
  expect(bookHtml(b)).not.toMatch(BANNED);
  expect(detailHtml(b,'hours',0)).not.toMatch(BANNED);
  for(let hour=0;hour<24;hour++){
   expect(pageHtml(b,hour).split('<noscript>')[0]).not.toMatch(BANNED);
   for(const kind of ['wind','direction','light','weather'])expect(detailHtml(b,kind,hour)).not.toMatch(BANNED);
  }
  expect(detailHtml(b,'sources',0)).toContain('署名与使用许可');
 });
});

describe('V02 formal briefing to original prototype presentation',()=>{
 it('prints the shared headline and day summary in the newspaper without a duplicate overview link',()=>{
  const b=syntheticBriefing();
  b.interpretation.headline='上午云多光柔，10 时前后最值得出门';
  b.summary.headline=`${b.location.name} ${b.localDate}：完整的当天摘要，包含气温、云、雨、风和光线的变化。`;
  const html=newspaperHtml(b);
  expect(html).toContain('<h2>上午云多光柔，10 时前后最值得出门</h2>');expect(html).not.toContain(b.summary.headline);
  expect(html).toContain(`<h3 class="column-title">今天的天色</h3><p class="note">${b.interpretation.weatherLine}</p><button type="button" class="sky-timeline"`);
  expect(html).not.toContain('data-detail="overview"');
  expect(detailHtml(b,'overview',0)).toContain(b.interpretation.headline);expect(detailHtml(b,'overview',0)).not.toContain(b.summary.headline);
  expect(pageHtml(b).split('<noscript>')[1]).toContain(b.interpretation.headline);
 });
 it('consumes the authoritative temperature range and coverage instead of recomputing hourly values',()=>{
  const b=syntheticBriefing();b.summary.temperatureRange={min:-7,max:11,coveredHours:9,totalHours:24};
  b.hours[0].weather.temperature={value:99,state:'ok',sourceIds:['fixture'],notes:[]};
  const html=newspaperHtml(b);expect(html).toContain('-7<span>—</span>11');expect(html).toContain('9/24 小时有气温预报，缺的小时不算在内');
 });
 it('keeps risk messages above the newspaper columns, not inside collapsed explanations',()=>{
  const b=syntheticBriefing(),{start,end}=b.hours[20];
  b.interpretation.risks=[{code:'strong-wind',status:'future',text:'人工测试大风，先考虑安全',start,end},
   {code:'heavy-rain',status:'past',text:'人工测试已过的雨',start:b.hours[2].start,end:b.hours[2].end}];
  const html=newspaperHtml(b);expect(html).not.toContain('人工测试已过的雨');expect(html.indexOf('人工测试大风')).toBeLessThan(html.indexOf('class="news-grid"'));expect(html).toContain('class="briefing-risk"');
 });
 it('retains genre-specific timing, light, opportunities, alternatives, film and all three original diagrams',()=>{
  const b=syntheticBriefing();for(const [g,a] of Object.entries(b.advice)){a.timing=`${g}时机`;a.light=`${g}光线`;a.opportunities=[`${g}机会`];a.alternatives=[`${g}调整`];}
  const html=bookHtml(b);for(const g of ['landscape','portrait','street'])for(const label of ['时机','光线','机会','调整'])expect(html).toContain(g+label);
  for(const kind of ['horizon','portrait','street'])expect(html).toContain(`data-diagram="${kind}"`);
 });
 it.each<[GenreAdvice['film']['type'],GenreAdvice['film']['sensitivity'],string[]]>([
  ['彩色负片','低感',['Kodak GOLD 200']],
  ['彩色负片','中感',['Kodak ULTRAMAX 400']],
  ['彩色负片','较高感',['Kodak PORTRA 800']],
  ['黑白负片','低感',['ILFORD DELTA 100','Kodak T-MAX 100']],
  ['黑白负片','中感',['ILFORD DELTA 400','Kodak T-MAX 400']],
  ['黑白负片','较高感',['ILFORD DELTA 3200','Kodak T-MAX P3200']],
  ['彩色反转片','低感',['FUJICHROME PROVIA 100F']],
 ])('illustrates %s · %s with classic film stocks', (type,sensitivity,labels)=>{
  const b=syntheticBriefing();
  b.advice.landscape.film={...b.advice.landscape.film,type,sensitivity};
  const original=structuredClone(b.advice.landscape.film);
  const html=bookHtml(b).split('</article>')[0];
  for(const label of labels)expect(html).toContain(`alt="${label}"`);
  expect(html.match(/class="film-can"/g)).toHaveLength(labels.length);
  expect(html).toContain('src="/films/illustrated/');
  expect(b.advice.landscape.film).toEqual(original);
 });
 it('moves long passages entirely off the printed page while retaining complete advice and no-script content',()=>{
  const b=syntheticBriefing(),a=b.advice.landscape;
  a.timing='完整时机'+('长文依据'.repeat(40));a.light='完整光线'+('光线依据'.repeat(40));a.opportunities=['完整机会一','完整机会二'];
  a.limitations=['完整限制一','完整限制二'];a.alternatives=['完整调整一','完整调整二'];a.film.caveat='完整胶片测光限制';
  const paper=bookHtml(b),full=detailHtml(b,'advice-landscape',0);
  expect(paper).not.toContain(a.timing);expect(paper).not.toContain(a.light);expect(paper).not.toContain('<details>');
  expect(paper).toContain('data-detail="advice-landscape"');
  for(const value of [a.timing,a.light,...a.opportunities,...a.limitations,...a.alternatives,a.film.caveat]){expect(full).toContain(value);expect(pageHtml(b).split('<noscript>')[1]).toContain(value);}
 });
 it('preserves missing metrics and comparison/source notes in complete hour explanations',()=>{
  const b=syntheticBriefing();b.hours[0].weather.temperature={value:1,state:'conflict',sourceIds:['one'],notes:['来源分歧说明'],alternatives:[{sourceId:'two',value:8}]};
  const html=sourceMetricHtml(b,0,'temperature');expect(html).toContain('two');expect(html).toContain('8 °C');expect(html).toContain('来源分歧说明');expect(sourceMetricHtml(b,0,'visibility')).toContain('— 缺失');
  expect(readings(b,0).visibility).toBe('—');expect(readings(b,0).azimuth).toBe('—');
 });
 it.each(['landscape','portrait','street'] as const)('merges only adjacent continuous identical advice periods for %s in their original order',g=>{
  const b=syntheticBriefing(),a=b.advice[g];
  const period=(start:number,end:number)=>({start:b.hours[start].start,end:b.hours[end-1].end,status:'past' as const,reasons:['相同光线 <script>'],limitations:['相同提醒'],reasonCodes:[`phase:${start}`],sourceIds:[`source-${start}`]});
  a.allWindows=[period(9,10),period(10,11),{...period(11,12),reasons:['不同光线']},period(12,13),period(13,14),period(15,16)];
  a.recommendedWindows=[{...period(16,17),status:'future'},{...period(17,18),status:'future'}];
  const original=structuredClone(a),html=adviceHtml(b,g);
  const recommended=html.split('<ol class="plan">')[1].split('</ol>')[0];
  const all=html.split('<ol class="plan">')[2].split('</ol>')[0];
  expect(recommended).toContain('<time>16:00–18:00</time>');
  expect([...all.matchAll(/<time>(.*?)<\/time>/g)].map(match=>match[1])).toEqual(['09:00–11:00','11:00–12:00','12:00–14:00','15:00–16:00']);
  expect(all.match(/相同光线 &lt;script&gt;/g)).toHaveLength(3);
  expect(all).not.toContain('09:00–14:00');expect(html).not.toContain('<script>');
  expect(a).toEqual(original);
 });
 it('keeps advice periods separate when their status, reasons or limitations differ',()=>{
  const b=syntheticBriefing(),a=b.advice.street;
  const base={status:'past' as const,reasons:['光线建议'],limitations:['风力提醒'],reasonCodes:[],sourceIds:[]};
  a.recommendedWindows=[];
  a.allWindows=b.hours.slice(8,12).map(({start,end})=>({...base,start,end}));
  a.allWindows[1].limitations=['不同风力提醒'];
  a.allWindows[2].reasons=['不同光线建议'];
  a.allWindows[3].status='future';
  const all=adviceHtml(b,'street').split('<ol class="plan">')[1].split('</ol>')[0];
  expect(all.match(/<time>/g)).toHaveLength(4);
  for(const label of ['08:00–09:00','09:00–10:00','10:00–11:00','11:00–12:00','不同风力提醒','不同光线建议','接下来'])expect(all).toContain(label);
 });
});

describe('V08B instrument screens and hourly reading',()=>{
 it('adds compact light, distant view and air context while preserving weather, wind and final risk or advice',()=>{
  const b=syntheticBriefing(),r=b.interpretation.hours[6];
  r.sentences=['多云，无雨，23°C。','阵风 4 级，三脚架容易抖。','这一小时风很大，别架三脚架。'];
  r.light.label='柔光';r.visibility.label='很通透';r.air.label='空气中等';
  expect(selectedHourSummary(r)).toEqual([r.sentences[0],r.sentences[1],'光线：柔光 · 远景：很通透','空气中等',r.sentences[2]]);
  const html=pageHtml(b,6).split('class="reading-index"')[1].split('</div>')[0];
  expect(html).toContain(selectedHourSummary(r).map((x,i)=>`<p${i===0?' id="weather-index"':''}>${x}</p>`).join(''));
  r.sentences=r.sentences.slice(0,2);r.light.label='光线不明';r.visibility.label='远景不明';r.air.label='空气不明';
  expect(selectedHourSummary(r)).toEqual([r.sentences[0],'光线：光线不明 · 远景：远景不明','空气不明',r.sentences[1]]);
  r.air.label='<script>alert(1)</script>';
  expect(pageHtml(b,6).split('class="reading-index"')[1].split('</div>')[0]).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
 });
 it('prints interpretation labels and sentences without recalculating raw metrics',()=>{
  const b=syntheticBriefing(),r=b.interpretation.hours[6];
  r.wind.label='东风 3 级';r.wind.short='阵风 5 级 · 20°C · 湿度 96%';
  r.sun.label='东南 · 离地平线 28°';r.light.label='柔光';r.light.short='云层像一块柔光罩。';
  r.sky.label='多云';r.rain.label='小雨';r.visibility.label='朦胧';r.air.label='空气对敏感人群不健康';
  r.sentences=['多云，小雨，20°C。','云层像一块柔光罩。','这是今天最值得拍风光的时间。'];
  const html=pageHtml(b,6),scene=html.split('<section class="bag-scene"')[1].split('<section class="handbook"')[0];
  for(const value of [r.wind.label,r.wind.short,r.sun.label,r.light.label,r.light.short,r.sky.label,r.rain.label,r.visibility.label,r.air.label,...r.sentences])expect(scene).toContain(value);
  expect(scene).toContain('aria-valuetext="06 时，多云，柔光"');
  expect(scene).toContain('aria-live="polite"');expect(scene).toContain('<p id="weather-index">多云，小雨，20°C。</p>');
  expect(scene).toContain('美国标准');expect(scene).toContain('预报 · 12:00');
  for(const old of ['m/s','μg/m³','US_EPA','PM2.5','PM10','预报光照解释','condition-index','solar-index','light-index','hour-note'])expect(scene).not.toContain(old);
  expect(readings(b,6)).not.toHaveProperty('light');expect(readings(b,6)).not.toHaveProperty('stage');
 });
 it('hides ready state and safely prints other states from dataNote',()=>{
  const b=syntheticBriefing();b.state='ready';b.interpretation.dataNote='这行在 ready 不显示';
  expect(pageHtml(b)).toContain('<span id="state-note" hidden></span>');
  for(const state of ['partial','stale','unavailable'] as const){
   b.state=state;b.interpretation.dataNote=`${state}<script>缺风预报`;
   expect(pageHtml(b)).toContain(`<span id="state-note">${state}&lt;script&gt;缺风预报</span>`);
  }
  const removed='这份预报只来自一家天气模型，没有经过第二家核对';
  b.interpretation.dataNote=removed;b.warnings=[];
  expect(pageHtml(b)).toContain('<span id="state-note" hidden></span>');
  expect(pageHtml(b)).not.toContain(removed);expect(newspaperHtml(b)).not.toContain('今天的数据齐全');
  expect(detailHtml(b,'overview',0)).not.toContain(removed);
  b.interpretation.dataNote=`空气质量预报暂时拿不到；${removed}；部分数据是早些时候存下的`;
  const remaining='空气质量预报暂时拿不到；部分数据是早些时候存下的';
  expect(pageHtml(b)).toContain(`<span id="state-note">${remaining}</span>`);
  expect(newspaperHtml(b)).toContain(remaining);expect(detailHtml(b,'overview',0)).toContain(remaining);
  expect(pageHtml(b)).not.toContain(removed);
 });
});


describe('V08C separate instrument details',()=>{
 const kinds=['wind','direction','light','weather'] as const;
 it.each(kinds)('%s renders a readable 24-cell trend and selected pointer without a source link',kind=>{
  const b=syntheticBriefing(),html=detailHtml(b,kind,6);
  expect(html.match(/data-trend-hour=/g)).toHaveLength(24);
  expect(html.match(/aria-current="time"/g)).toHaveLength(1);
  expect(html).toContain('data-trend-hour="6"');expect(html).toContain('title="06 时 ·');
  expect(html).toContain('class="tl-now" style="left:27.08%"');
  expect(html).toContain('选中小时');expect(html).not.toContain('data-detail="sources"');
  expect(html.indexOf('读数</h3>')).toBeLessThan(html.indexOf('这意味着什么</h3>'));
  expect(html.indexOf('这意味着什么</h3>')).toBeLessThan(html.indexOf('今天的走势</h3>'));
  for(const forbidden of ['open-meteo','US_EPA','有效 ·','暂无数据','窗口','本版','模型提示','依据置信度','不适用','漫射','金调','主推荐','读数来自所选小时的简报','不保证','非现场'])expect(html).not.toContain(forbidden);
 });
 it('isolates all four field sets, solar events and references',()=>{
  const b=syntheticBriefing(),wind=detailHtml(b,'wind',0),sun=detailHtml(b,'direction',0),light=detailHtml(b,'light',0),weather=detailHtml(b,'weather',0);
  for(const field of ['阵风','风向','气温','湿度','3 级发丝乱'])expect(wind).toContain(field);
  for(const field of ['PM2.5','低云','能见度','日出'])expect(wind).not.toContain(field);
  for(const field of ['方位','高度','日出','日落','清晨黄金时刻','傍晚黄金时刻','清晨蓝调时刻','傍晚蓝调时刻'])expect(sun).toContain(field);
  for(const field of ['PM2.5','湿度','低云'])expect(sun).not.toContain(field);
  for(const field of ['总云','低云','中云','高云','柔光：','硬光：','忽明忽暗：'])expect(light).toContain(field);
  for(const field of ['PM2.5','湿度','日出','能见度'])expect(light).not.toContain(field);
  for(const field of ['天色','降水概率','能见度','空气','PM2.5','PM10','两回事'])expect(weather).toContain(field);
  for(const field of ['湿度','低云','日出'])expect(weather).not.toContain(field);
  expect(detailHtml(b,'unknown',0)).toBe('');
 });
 it('prints available weather details in human units and source metadata remains reachable',()=>{
  const b=syntheticBriefing(),h=b.hours[0],metric=(value:number)=>({value,state:'ok' as const,sourceIds:['hidden'],notes:[]});
  h.weather.visibility=metric(12000);h.air.referenceAqi=metric(73);h.air.pm25=metric(12.4);h.air.pm10=metric(31);
  const r=hourReadings(h);b.interpretation.hours[0]={...r,marks:b.interpretation.hours[0].marks,sentences:['测试一句','测试二句'],devices:deviceReadings(h,r,b.solar)};
  const html=detailHtml(b,'weather',0);expect(html).toContain('美国标准 AQI 73');expect(html).toContain('12 公里');expect(html).toContain('12.4 μg/m³');
  expect(detailHtml(b,'sources',0)).toContain('署名与使用许可');expect(sourceRecordHtml(b,0)).toContain('synthetic-weather');
 });
 it('escapes explanation text and omits raw solar notes even for missing events',()=>{
  const b=syntheticBriefing();b.solar.notes=['morningBlue 不适用 <script>'];
  b.interpretation.hours[0].devices.wind.notices=['<img src=x onerror=alert(1)>'];
  expect(detailHtml(b,'wind',0)).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(detailHtml(b,'wind',0)).not.toContain('<img');
  expect(detailHtml(b,'direction',0)).not.toMatch(/morningBlue|不适用|<script>/);
 });
});


describe('V08D eight-column daily table and raw source audit',()=>{
 const rebuild=(b:ReturnType<typeof syntheticBriefing>)=>{b.interpretation=createInterpretation({...b,now:b.generatedAt});};
 it('renders 24 semantic rows using interpretation labels and generatedAt marks, not the selected dial hour',()=>{
  const b=syntheticBriefing();b.generatedAt='2026-10-22T09:30:00+08:00';
  const win=(start:string,end:string,reasonCodes=['D2'])=>({start,end,reasonCodes,status:'future' as const,reasons:[],limitations:[],sourceIds:[]});
  b.advice.landscape.recommendedWindows=[win(b.hours[9].start,b.hours[9].end)];
  b.advice.portrait.recommendedWindows=[win(b.hours[9].start,b.hours[9].end)];
  b.advice.street.recommendedWindows=[win(b.hours[9].start,b.hours[9].end,['D0'])];
  b.hours[10].risks=[{code:'strong-wind',start:b.hours[10].start,end:b.hours[10].end,message:'hidden-raw-message',sourceIds:['raw-source-id']}];
  rebuild(b);
  const r=b.interpretation.hours[9];r.temperature.label='20°C';r.sky.label='独有天色标签';r.rain.label='独有雨标签';
  const html=detailHtml(b,'hours',22);
  expect(html).toContain('<caption>今天24小时的天气和光线</caption>');
  expect(html.match(/scope="col"/g)).toHaveLength(8);expect(html.match(/scope="row"/g)).toHaveLength(24);
  expect(html.match(/<tr data-hour=/g)).toHaveLength(24);expect(html.match(/aria-current="time"/g)).toHaveLength(1);
  expect(html).toContain('<tr data-hour="9" class="hour-current" aria-current="time">');
  expect(html).toContain('现在');expect(html).toContain('好时段 · 风光、人像');expect(html).not.toContain('好时段 · 街拍');
  expect(html).toContain('⚠ 风很大');expect(html).toContain('class="hour-past"');
  expect(html).toContain('<span class="hour-label">20°</span>');
  for(const key of ['sky','rain','wind','visibility','air','light'] as const)expect(html).toContain(r[key].label);
  expect(html).toContain('2026-10-22 · 北京时间 · 天气为预报，光线为推算');
  expect(html).toContain('tabindex="0" role="region" aria-label=');
  expect(html.match(/data-hour-detail="/g)).toHaveLength(24);
  expect(html.match(/<tr /g)).toHaveLength(24);expect(html).not.toContain('colspan');
  expect(html).toContain('aria-label="09:00，天气和光线说明"');
  const row=html.split('<tr data-hour="9"')[1].split('</tr>')[0];
  expect(row.split('</th>')[0]).toContain('好时段 · 风光、人像');
  expect(row.split('</th>')[1]).not.toContain('hour-recommendation');
  const popup=hourDetailHtml(b,9);
  expect(popup).toContain(`${b.location.name} · ${b.localDate} · 09:00 · 北京时间`);
  for(const key of ['sky','temperature','rain','wind','visibility','air','light'] as const)expect(popup).toContain(r[key].detail);
  for(const raw of ['data-field','raw-source-id','hidden-raw-message','来源分歧','对比来源','有效 ·','暂无数据','US_EPA'])expect(html).not.toContain(raw);
  expect(detailHtml(b,'hours',0)).toBe(html);
 });
 it('retains all 24 complete raw hours and solar notes at the end of sources, once in noscript',()=>{
  const b=syntheticBriefing();b.solar.notes=['morningBlue technical note <script>'];
  b.hours[0].weather.temperature={value:1,state:'conflict',sourceIds:['one'],notes:['来源分歧说明'],alternatives:[{sourceId:'two',value:8}]};
  const html=detailHtml(b,'sources',0);
  for(const removed of ['data-source-table','sources-raw-hours','sources-method','sources-solar','时间口径与空气数据说明','太阳计算原始备注'])expect(html).not.toContain(removed);
  expect(html).toContain('<section class="sources-reference sources-credits"><h3>署名与使用许可</h3>');
  expect(html).not.toContain('morningBlue technical note');
  const noscript=pageHtml(b).split('<noscript>')[1];expect(noscript.match(/id="hour-/g)).toHaveLength(24);
  for(const text of ['对比来源','来源分歧说明','one','two','太阳计算参考 00:30'])expect(noscript).toContain(text);
  for(let i=0;i<24;i++)expect(noscript.match(new RegExp(`id="hour-${i}"`,'g'))).toHaveLength(1);
 });
 it('escapes table labels, details and supplied semantic marks',()=>{
  const b=syntheticBriefing(),r=b.interpretation.hours[0];r.sky.label='<script>';r.sky.detail='<img onerror=x>';
  r.marks.recommendation='<b>好时段</b>';r.marks.risks=['<svg>'];
  const html=detailHtml(b,'hours',0)+hourDetailHtml(b,0);for(const value of ['&lt;script&gt;','&lt;img onerror=x&gt;','&lt;b&gt;好时段&lt;/b&gt;','⚠ &lt;svg&gt;'])expect(html).toContain(value);
  expect(html).not.toMatch(/<script>|<img|<svg>/);
 });
 it('keeps complete deduplicated hourly explanation and escapes its location context',()=>{
  const b=syntheticBriefing(),r=b.interpretation.hours[9];
  b.location.name='<img onerror=x>';r.sentences=[r.sky.detail,'独有逐时说明'];
  r.devices.wind.notices=[r.sky.detail,'独有缺失提醒'];
  const html=hourDetailHtml(b,9);
  expect(html).toContain('&lt;img onerror=x&gt;');expect(html).not.toContain('<img');
  expect(html.split(`<p>${r.sky.detail}</p>`)).toHaveLength(2);
  expect(html).toContain('独有逐时说明');expect(html).toContain('独有缺失提醒');
  expect(html).not.toContain('08:00 的天气');
 });
});


describe('V08E printed wording and state branches',()=>{
 it('keeps empty times neutral and missing recommendations descriptive',()=>{
  const b=syntheticBriefing();expect(time(null)).toBe('—');expect(range(null)).toBe('—');
  b.sunsetOpportunity.level=null;expect(opportunity(b)).toBe('暂时判断不了');
  for(const g of ['landscape','portrait','street'] as const){b.advice[g].recommendedWindows=[];b.interpretation.genres[g].when=`${g}今天没有好时段`;}
  const paper=bookHtml(b);
  for(const [g,name] of [['landscape','风光'],['portrait','人像'],['street','街拍']] as const){
   expect(paper).toContain(`${g}今天没有好时段`);expect(paper).toContain(`aria-label="${name}，今天怎么拍"`);
  }
  expect(paper.match(/<small>拍摄时段<\/small>/g)).toHaveLength(3);
  expect(paper).not.toContain("<small>最值得拍的时间</small>");
  expect(adviceHtml(b,"landscape")).toContain("时段记录（含已经过去的）");
  expect(adviceHtml(b,"landscape")).not.toContain("今天所有可以拍");
 });
 it('limits state labels to sources and keeps the subscription timezone',()=>{
  const b=syntheticBriefing();b.state='ready';expect(bookHtml(b)).not.toContain('数据不全');expect(bookHtml(b)).not.toContain('数据可用');
  for(const state of ['partial','stale','unavailable'] as const){b.state=state;expect(bookHtml(b)).not.toContain('数据不全');}
  const html=pageHtml(b);expect(html).not.toContain('天气为预报 · 太阳为天文推算 · 拍法为建议');expect(html).not.toContain('天气为预报，太阳为天文推算，拍法为建议。');expect(detailHtml(b,'overview',0)).toContain('来源和更新时间见「数据与出处」。');expect(html).not.toContain('数据与素材说明');
  expect(html).toContain('北京时间 · Asia/Shanghai');expect(html).not.toContain('这是根据预报推算的机会，不是保证');
  for(const phrase of ['请阅读','详见'])expect(bookHtml(b)).not.toContain(phrase);
 });
});


describe('source reading sheet',()=>{
 it('shows source states before expanded complete diagnostics',()=>{
  const b=syntheticBriefing();b.interpretation.dataNote='能见度缺失；这份预报只来自一家天气模型，没有经过第二家核对';
  b.warnings=['上游诊断 <script>','上游诊断 <script>'];
  const html=detailHtml(b,'sources',0);
  expect(html).toContain('<li>能见度缺失</li>');expect(html).not.toContain('没有经过第二家核对');
  expect(html).toContain('<section class="sources-diagnostics"><h4>来源诊断 · 1 条</h4>');
  expect(html.match(/上游诊断 &lt;script&gt;/g)).toHaveLength(1);
  expect(html.indexOf('各来源的状态')).toBeLessThan(html.indexOf('缺失与使用提醒'));
  expect(html).not.toContain('这些信息从哪里来');expect(html).not.toContain('<details');
  b.state='ready';expect(detailHtml(b,'sources',0)).not.toContain('<li>能见度缺失</li>');
 });
 it('keeps four overview columns and moves complete metadata to source-name details',()=>{
  const b=syntheticBriefing(),source=b.sources[0];
  b.sources=['ok','stale','failed','disabled'].map((status,i)=>({...source,status:status as typeof source.status,id:`source-${i}`,provider:`上游 <${i}>`,dataset:`数据集 ${i}`,model:'模型 <script>',nativeResolution:'格网 1°'}));
  const html=detailHtml(b,'sources',0);
  for(const text of ['可用','旧数据','获取失败','已停用','未提供','上游 &lt;0&gt;'])expect(html).toContain(text);
  expect(html).not.toContain('上游发布');expect(html).not.toContain('查看来源详情');
  const detail=sourceRecordHtml(b,0);for(const text of ['格网 1°','模型 &lt;script&gt;','预报 · forecast','source-0','来源与署名说明','适用时段'])expect(detail).toContain(text);
  expect(detail).not.toContain('<script>');
  expect(html.match(/data-source-record="/g)).toHaveLength(4);expect(html.match(/scope="col"/g)).toHaveLength(4);
  expect(html).not.toContain('<script>');
  b.sources=[];expect(detailHtml(b,'sources',0)).toContain('本次简报未提供来源记录。');
 });
});
