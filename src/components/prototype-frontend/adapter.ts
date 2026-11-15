import { anomaliesHtml, sourcesNoScriptHtml, sourceRecordHtml } from './sources-view';
import type { Briefing, Genre, Hour, Metric, RecommendedWindow } from '../../domain/types';
import { AIR_UNITS, WEATHER_UNITS } from '../../domain/schemas';
import { shanghaiIso, windowStatus } from '../../domain/time';
import { template } from './template';
import { filmIllustrationHtml } from './film-illustration';
import type { AdviceEnhancementResult, GenreEnhancement } from '../../domain/workspace/advice';

/** Only authored markup is trusted. Every Briefing string and attribute crosses this escape boundary. */
export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const e = escapeHtml;
export const genres = ['landscape', 'portrait', 'street'] as const;
export const genreNames: Record<Genre, string> = { landscape:'风光', portrait:'人像', street:'街拍' };
const states = {ready:'数据可用',partial:'部分数据可用',stale:'使用允许范围内的旧数据',unavailable:'气象数据不可用'};
export const metricStates = {ok:'有效',missing:'缺失',stale:'旧数据',conflict:'来源分歧'};
export const time = (v: string | null) => v ? shanghaiIso(v).slice(11,16) : '—';
export const stamp = (v: string | null) => v ? `${shanghaiIso(v).slice(0,19).replace('T',' ')} 北京时间` : '未知 / 未提供';
export const range = (v: {start:string;end:string} | null) => v ? `${time(v.start)}–${time(v.end)}${time(v.end)==='00:00'?'（次日）':''}` : '—';
export const metric = (v: number | null, digits?:number) => v === null ? '—' : digits === undefined ? String(v) : v.toFixed(digits);
export const fixture = (b: Briefing) => b.warnings.some(x=>x.includes('演示数据'));
export const notes = (items: readonly string[]) => items.length ? `<ul>${items.map(x=>`<li>${e(x)}</li>`).join('')}</ul>` : '';
const p = (value:string, cls='') => `<p${cls?` class="${cls}"`:''}>${e(value)}</p>`;
const title = (s:string) => `<h3>${e(s)}</h3>`;
/** Keep the requested copy removal in presentation while preserving source diagnostics. */
export function visibleDataNote(b:Briefing):string|null {
 const note=b.interpretation.dataNote?.split('；').filter(x=>x.trim()!=='这份预报只来自一家天气模型，没有经过第二家核对').join('；');
 return note||null;
}
/** Compact selected-hour context, shared by initial markup and dial updates. */
export function selectedHourSummary(r:Briefing['interpretation']['hours'][number]):string[] {
 const context=[`光线：${r.light.label} · 远景：${r.visibility.label}`,r.air.label];
 // Preserve every authored sentence, especially the final risk or genre advice.
 return [...r.sentences.slice(0,-1),...context,...r.sentences.slice(-1)];
}
export function readings(b:Briefing, hour:number) {
 const d=b.hours[hour];
 return {time:time(d.start),wind:metric(d.weather.windSpeed.value),gust:metric(d.weather.windGust.value),temperature:metric(d.weather.temperature.value),humidity:metric(d.weather.humidity.value),cloud:metric(d.weather.cloudTotal.value),rain:metric(d.weather.precipitation.value),visibility:metric(d.weather.visibility.value===null?null:d.weather.visibility.value/1000,1),aqi:metric(d.air.referenceAqi.value),pm25:metric(d.air.pm25.value),pm10:metric(d.air.pm10.value),azimuth:metric(d.light.azimuth,1),altitude:metric(d.light.altitude,1)};
}
export function opportunity(b: Briefing) { const s=b.sunsetOpportunity; return s.level===null ? '暂时判断不了' : `${s.level} / 5 · ${s.label}`; }
function windows(rows:RecommendedWindow[]) {
 const groups:(Pick<RecommendedWindow,'start'|'end'|'status'|'reasons'|'limitations'> & {key:string})[]=[];
 for(const w of rows){
  // Merge adjacent, continuous periods only; preserve input order and source windows.
  const key=JSON.stringify([w.status,w.reasons,w.limitations]);
  const previous=groups.at(-1);
  if(previous?.key===key && Date.parse(previous.end)===Date.parse(w.start))previous.end=w.end;
  else groups.push({key,start:w.start,end:w.end,status:w.status,reasons:w.reasons,limitations:w.limitations});
 }
 return groups.length ? `<ol class="plan">${groups.map(w=>`<li><time>${e(range(w))}</time><div><strong>${e({past:'已经过去',current:'现在',future:'接下来'}[w.status])}</strong>${notes(w.reasons)}${notes(w.limitations)}</div></li>`).join('')}</ol>` : p('今天没有排得出来的时段，可以看下面的限制和替代做法。');
}
const solarNames = [['morningBlue','清晨蓝调时刻'],['morningGolden','清晨黄金时刻'],['eveningGolden','傍晚黄金时刻'],['eveningBlue','傍晚蓝调时刻']] as const;
export function solarHtml(b: Briefing) { return `<section class="detail-solar"><h3>光线时刻 · 天文推算</h3>${p(`日出 ${b.solar.sunrise?time(b.solar.sunrise):'—'} / 日落 ${b.solar.sunset?time(b.solar.sunset):'—'}`)}<dl>${solarNames.map(([k,label])=>`<dt>${label}</dt><dd>${e(b.solar[k]?range(b.solar[k]):'—')}</dd>`).join('')}</dl>${p('蓝调时刻：太阳在地平线下 4°–6°，天空深蓝、灯刚亮。黄金时刻：太阳离地平线不到 6°，光偏暖、影子长。')}</section>`; }
export function sunsetHtml(b:Briefing) {
 const s=b.sunsetOpportunity;
 const sources=s.sourceIds.flatMap(id=>{const source=b.sources.find(x=>x.id===id);return source?[`${source.provider} · ${source.dataset}`]:[];});
 return `<h2>晚霞机会 · ${e(b.interpretation.sunset.title)}</h2><div class="levels">${['很低','偏低','一般','较高','很高'].map((x,i)=>`<div${s.level===i+1?' class="current"':''}><b>${i+1}</b>${x}</div>`).join('')}</div>${p(`今天日落 ${time(s.targetTime)}。沿日落方向检查本地和远处的云，看夕阳能不能照到云层、前方的云会不会挡住，再结合能见度和降水判断。`)}${s.confidence==='low'?p('预报之间有出入，或者用了早些时候存下的数据。'):''}${title('今天的情况')}${notes(s.reasons)}${sources.length?`${title('预报来源')}${notes(sources)}`:''}${title('判断不了的部分')}${notes(s.limitations)}`;
}
const names:Record<string,string>={temperature:'温度',humidity:'湿度',weatherCode:'天气代码',precipitation:'小时降水',precipitationProbability:'降水概率',windSpeed:'平均风',windGust:'小时最大阵风',windFrom:'风向（来向）',cloudTotal:'总云量',cloudLow:'低云量',cloudMid:'中云量',cloudHigh:'高云量',visibility:'能见度',pm25:'PM2.5',pm10:'PM10',referenceAqi:'参考 AQI（美国 EPA 口径）'};
function field(k:string,m:Metric<number>,unit:string){return `<div data-field="${e(k)}"><dt>${e(names[k])}</dt><dd>${m.value===null?'暂无数据':e(`${m.value} ${unit}`)} · ${metricStates[m.state]} · 来源 ${e(m.sourceIds.join('、')||'无')}${notes(m.notes)}${(m.alternatives??[]).map(a=>p(`对比来源 ${a.sourceId}：${a.value} ${unit}`)).join('')}</dd></div>`;}
export function hourHtml(b:Briefing,h:Hour,index:number){return `<section id="hour-${index}"><h3>${e(range(h))} · ${e({past:'已过',current:'当前小时',future:'随后预报'}[windowStatus(h.start,h.end,b.generatedAt)])}</h3>${p(h.light.description)}${p(`太阳计算参考 ${String(index).padStart(2,'0')}:30：高度 ${metric(h.light.altitude,1)}°，方位 ${metric(h.light.azimuth,1)}°；北0°顺时针。`)}${notes(h.risks.map(r=>r.message))}<details><summary>天气、空气与推断依据</summary><dl>${Object.entries(h.weather).map(([k,m])=>field(k,m,WEATHER_UNITS[k as keyof typeof WEATHER_UNITS])).join('')}${Object.entries(h.air).map(([k,m])=>field(k,m,AIR_UNITS[k as keyof typeof AIR_UNITS])).join('')}</dl>${notes(h.light.reasons)}${notes(h.light.limitations)}${p(`光照依据来源：${h.light.sourceIds.join('、')||'仅太阳计算 / 气象依据不足'}`)}${h.risks.map(r=>p(`风险时段 ${range(r)} · 来源 ${r.sourceIds.join('、')}。`)).join('')}</details></section>`;}
/** Sources is a reading sheet: current context first, complete audit details on demand. */
export function sourcesHtml(b:Briefing){
 const dataNote=b.state==='ready'?null:visibleDataNote(b);
 const diagnostics=[...new Set(b.warnings)];
 const notices=[...new Set([...(dataNote?[dataNote]:[]),...(b.warnings.some(x=>x.includes('演示数据')||x.includes('人工合成'))?['演示数据：人工合成，非真实预报或观测，不用于判断当前天气。']:[])])];
 const row=(label:string,value:string)=>`<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`;
 const sourceTime=(value:string|null)=>value?stamp(value):'未提供';
 const sources=b.sources.map((s,index)=>`<tr class="sources-entry">
  <th scope="row"><header class="sources-entry-heading"><h4><button type="button" class="source-name" data-source-record="${index}" aria-haspopup="dialog">${e(s.provider)} ↗</button></h4></header>${p(s.dataset,'sources-dataset')}</th>
  <td data-label="类型">${e({forecast:'预报',observation:'观测',astronomical:'天文计算'}[s.kind])}</td>
  <td data-label="状态"><span class="sources-status sources-status-${s.status}">${{ok:'可用',stale:'旧数据',failed:'获取失败',disabled:'已停用'}[s.status]}</span></td>
  <td data-label="数据获取">${s.kind==='astronomical'?'按地点与日期计算':e(sourceTime(s.fetchedAt))}</td>

 </tr>`).join('');
 return `<article class="sources-sheet"><header class="sources-intro"><p class="sources-kicker">数据与出处 / REFERENCE</p><h2>来源、更新时间与缺失说明</h2></header>
 <section class="sources-context"><h3>本次简报</h3><dl class="sources-facts">
  ${row('地点',`${b.location.name} · ${b.location.administrativePath.join(' / ')}`)}${row('对应日期',`${b.localDate} · 北京时间`)}${row('简报生成',sourceTime(b.generatedAt))}${row('数据状态',states[b.state])}
 </dl></section>
 <section class="sources-list"><div class="sources-section-heading"><h3>各来源的状态</h3><span>时间均为北京时间</span></div>${sources?`<table class="sources-catalog"><caption class="sr-only">各来源状态与时间</caption><thead><tr>${['来源／数据集','类型','状态','数据获取'].map(x=>`<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${sources}</tbody></table>`:p('本次简报未提供来源记录。')}
 ${p('“数据获取”是本站取得该份数据的时间，使用缓存时保留原获取时刻；点击来源名可查看适用时段、模型和署名等完整详情。未提供的时间保留为空缺。','sources-caption')}</section>
 <section class="sources-notices"><h3>缺失与使用提醒</h3>${notes(notices)}${anomaliesHtml(b)}${diagnostics.length?`<section class="sources-diagnostics"><h4>来源诊断 · ${diagnostics.length} 条</h4>${notes(diagnostics)}</section>`:''}</section>
 <section class="sources-reference sources-credits"><h3>署名与使用许可</h3><p>地点：Open-Meteo Geocoding / <a href="https://www.geonames.org/">GeoNames</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>。</p><p>气象：<a href="https://open-meteo.com/en/terms">Open-Meteo 条款</a>、<a href="https://api.met.no/doc/License">MET Norway 许可</a>。各数据集的署名链接保留在上方来源详情中。</p></section></article>`;
}
const deviceTitles = {wind:'风',direction:'太阳位置',light:'光线',weather:'天色与空气'} as const;
type DeviceKind = keyof typeof deviceTitles;
function deviceStrip(b:Briefing,kind:DeviceKind,hour:number){
 const cells=b.interpretation.hours.map((r,index)=>{
  const t=r.devices[kind].trend,label=`${String(index).padStart(2,'0')} 时 · ${t.label}`;
  const key=e(t.key),height=t.value===null?0:kind==='wind'?Math.max(2,t.value/12*100):kind==='direction'?Math.max(2,Math.abs(t.value)/90*50):100;
  const top=kind==='direction'&&t.value!==null?(t.value>=0?50-height:50):100-height;
  const cls=kind==='light'?`lt-${key}`:kind==='weather'?`sky-${key}`:t.value===null?'trend-unknown':`trend-${key}`;
  return `<i class="${cls}" role="listitem" data-trend-hour="${index}" title="${e(label)}"${index===hour?' aria-current="time"':''}><span class="detail-bar" style="height:${height.toFixed(2)}%;top:${top.toFixed(2)}%" aria-hidden="true"></span><span class="sr-only">${e(label)}${index===hour?'，选中小时':''}</span></i>`;
 }).join('');
 return `<figure class="detail-trend detail-trend-${kind}"><div class="detail-strip ${kind==='light'?'tl-light':'tl-sky'}" role="list" aria-label="${deviceTitles[kind]}，今天 24 小时的走势">${cells}<b class="tl-now" style="left:${((hour+.5)/24*100).toFixed(2)}%" aria-hidden="true"></b></div><div class="tl-ticks" aria-hidden="true"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div><figcaption>${e(`${String(hour).padStart(2,'0')} 时 · ${b.interpretation.hours[hour].devices[kind].trend.label} · 指针为选中小时`)}${kind==='direction'?'；横线为地平线，金色在线上，蓝色在线下':''}</figcaption></figure>`;
}
export function deviceHtml(b:Briefing,kind:DeviceKind,hour:number){
 const r=b.interpretation.hours[hour],d=r.devices[kind],main=kind==='wind'?r.wind:kind==='direction'?r.sun:kind==='light'?r.light:r.sky;
 return `<h2>${deviceTitles[kind]}</h2>${p(`${time(b.hours[hour].start)} · 北京时间`,'note')}<section class="device-reading"><h3>读数</h3>${p(main.label,'detail-reading')}${d.notices.length?`<div class="detail-notices" role="note">${notes(d.notices)}</div>`:''}<dl class="device-fields">${d.fields.map(f=>`<div><dt>${e(f.name)}</dt><dd>${e(f.value)}</dd></div>`).join('')}</dl></section><section class="device-meaning"><h3>这意味着什么</h3>${d.meaning.map(x=>p(x)).join('')}${d.reference.map(x=>p(x,'note')).join('')}${kind==='direction'?solarHtml(b):''}</section><section class="device-day"><h3>今天的走势</h3>${deviceStrip(b,kind,hour)}</section>`;
}
/** Eight readable columns; all semantic marks arrive from the interpretation layer. */
export function hoursHtml(b:Briefing){
 const keys=['sky','temperature','rain','wind','visibility','air','light'] as const;
 const labels=['时','天色','气温','雨','风','远景','空气','光线'];
 const rows=b.interpretation.hours.map((r,i)=>{
  const m=r.marks;
  const marks=`${m.recommendation?`<span class="hour-recommendation">${e(m.recommendation)}</span>`:''}${m.risks.map(risk=>`<span class="hour-risk">⚠ ${e(risk)}</span>`).join('')}`;
  return `<tr data-hour="${i}" class="hour-${m.timing}"${m.timing==='current'?' aria-current="time"':''}><th scope="row"><button type="button" class="hour-open" data-hour-detail="${i}" aria-haspopup="dialog" aria-label="${e(`${time(b.hours[i].start)}，天气和光线说明`)}"><time datetime="${e(b.hours[i].start)}">${e(time(b.hours[i].start))}</time></button>${m.timing==='current'?'<span class="hour-now">现在</span>':''}${marks}</th>${keys.map(key=>`<td><span class="hour-label">${e(key==='temperature'?r[key].label.replace('°C','°'):r[key].label)}</span></td>`).join('')}</tr>`;
 }).join('');
 return `<h2>24 小时天气与光线</h2>${p(`${b.localDate} · 北京时间 · 天气为预报，光线为推算`)}<div class="hours-scroll" tabindex="0" role="region" aria-label="今天24小时的天气和光线，可左右滚动"><table class="hours-table"><caption>今天24小时的天气和光线</caption><thead><tr>${labels.map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
/** Reuse the full, deduplicated explanation formerly expanded inside each row. */
export function hourDetailHtml(b:Briefing,index:number){
 const r=b.interpretation.hours[index];
 const keys=['sky','temperature','rain','wind','visibility','air','light'] as const;
 const details=[...new Set([...keys.map(key=>r[key].detail),...r.sentences,...Object.values(r.devices).flatMap(d=>d.notices)])];
 return `<h2 id="hour-detail-title">${e(time(b.hours[index].start))} 的天气与光线</h2>${p(`${b.location.name} · ${b.localDate} · ${time(b.hours[index].start)} · 北京时间`,'note')}${details.map(x=>p(x)).join('')}`;
}
export function detailHtml(b:Briefing,kind:string,hour:number,advice:AdviceEnhancementResult|null=null){
 if(kind==='overview'){const it=b.interpretation,dataNote=visibleDataNote(b);return `<h2>今天的天气和拍摄要点</h2>${p(it.headline,'detail-lead')}${p(it.lead)}${it.risks.length?`${title('风险')}${notes(it.risks.map(x=>x.text))}`:''}${title('一天的变化')}${p(it.weatherLine)}${notes(b.summary.changes)}${title('接下来')}${notes(it.nextUp)}${title('三种拍法')}${notes(b.summary.opportunities)}${b.summary.limitations.length||dataNote?`${title('数据上的不足')}${notes([...(dataNote?[dataNote]:[]),...b.summary.limitations])}`:''}${p('来源和更新时间见「数据与出处」。','note')}`;}
 const adviceGenre=genres.find(g=>kind===`advice-${g}`);
 if(adviceGenre)return adviceHtml(b,adviceGenre,advice);
 if(kind==='sources')return sourcesHtml(b);
 if(kind==='sunset')return sunsetHtml(b);
 if(kind==='hours')return hoursHtml(b);
 if(Object.hasOwn(deviceTitles,kind))return deviceHtml(b,kind as DeviceKind,hour);
 return '';
}
// Original, authored prototype diagrams; no weather calculation or fixture dependency.
const diagramArt = {
      horizon:'<path d="M15 143H355M20 151H350M40 143V116H72V143M260 143V102H284V143"/><path d="M40 143Q185-45 330 143" stroke-dasharray="4 5" opacity=".4"/><path d="M192 65H273M214 50H300M78 82H146" stroke="#943b2d" stroke-width="6" stroke-linecap="round"/><circle cx="301" cy="115" r="15" fill="#d7b33e"/><path d="M285 126L193 145M283 116L100 132" stroke="#943b2d" stroke-dasharray="4 4"/><text x="19" y="175">东</text><text x="319" y="175">西 · 日落</text><text x="126" y="25">本地云层 ≠ 远方光路</text>',
      portrait:'<circle cx="183" cy="78" r="28"/><path d="M183 106V148M183 121L145 144M183 121L217 144M169 148L157 171M193 148L204 171"/><circle cx="303" cy="43" r="20" fill="#d7b33e"/><path d="M279 61L211 88M271 44L211 65M284 76L219 112" stroke="#943b2d" stroke-dasharray="5 4"/><path d="M57 41L91 148H126L91 41Z" fill="#27251f" opacity=".12"/><text x="24" y="24">开放阴影 · 柔光备选</text><text x="226" y="174">太阳可见时再用侧逆光</text>',
      street:'<path d="M28 20V150H345M64 20V118H131V20M181 20V90H235V20M290 20V125H333V20"/><path d="M131 118L216 164H162L64 118M235 90L340 144H301L181 90" fill="#27251f" opacity=".15"/><circle cx="172" cy="104" r="9"/><path d="M172 113V139M172 120L159 130M172 120L187 129M172 138L163 153M172 138L183 153"/><path d="M41 171L308 171" stroke="#943b2d" stroke-dasharray="4 5"/><text x="31" y="193">云隙直射出现时，等主体走入亮处</text>'
};
function diagramHtml(g:Genre) {
 const kind=g==='landscape'?'horizon':g;
 const caption=kind==='horizon'?'日落与云层的方向关系示意。':kind==='portrait'?'受光关系示意。':'街头投影与人物构图示意。';
 return `<figure class="diagram" data-diagram="${kind}"><svg viewBox="0 0 370 205" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><g>${diagramArt[kind]}</g><style>text{font:11px sans-serif;fill:#686355;stroke:none}</style></svg><figcaption>${caption}</figcaption></figure>`;
}
/** Projections never modify the deterministic Briefing, including risk and film objects. */
export function genreEnhancement(b:Briefing,g:Genre,advice:AdviceEnhancementResult|null):GenreEnhancement|null {
 const m=advice?.metadata;
 return advice?.baseBriefing===b && m?.locationId===b.location.id && m.localDate===b.localDate && m.snapshotGeneratedAt===b.generatedAt && m.rulesVersion===b.rulesVersion && advice.enhancement[g].status==='generated' ? advice.enhancement[g] : null;
}
function evidenceHtml(x:GenreEnhancement,advice:AdviceEnhancementResult){
 const labels={timing:'时机',light:'用光',subject:'主体',composition:'构图',viewpoint:'视角',alternative:'替代',film:'胶片'};
 return `<section class="advice-evidence"><h3>建议依据与生成记录</h3>${p(`模型编辑 · ${advice.metadata.model??'未提供模型名'} · ${stamp(advice.metadata.generatedAt)}`)}${p(`提示版本 ${advice.metadata.promptVersion} · 质量版本 ${advice.metadata.qualityVersion}`)}${Object.entries(x.full!).map(([key,f])=>`<details><summary>${labels[key as keyof typeof labels]}的依据</summary>${p('事实字段：'+f.factIds.join('、'))}${f.knowledge.map(k=>{const entry=x.evidence.find(e=>e.id===k.chunkId&&e.source.id===k.sourceId&&e.source.version===k.version);return entry?`<article>${p(entry.title)}${p(entry.text)}${p(`${entry.source.title} · ${entry.source.author} · 版本 ${entry.source.version} · ${entry.source.sourceFile}${entry.locator}`)}<p><a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></p></article>`:'';}).join('')}</details>`).join('')}</section>`;
}
/** Full passages, constraints and actual evidence share all dialog/static/no-script outlets. */
export function adviceHtml(b:Briefing,g:Genre,advice:AdviceEnhancementResult|null=null){
 const a=b.advice[g],x=genreEnhancement(b,g,advice),n=x?.full;
 return `<section class="advice-detail" data-advice-genre="${g}" data-advice-origin="${n?'model':'rules'}"><h2>${genreNames[g]} · 今天怎么拍</h2>${p(`${b.location.name} · ${b.localDate} · 时间均为北京时间`)}${n?p('AI 摄影建议 · 依据当前天气与摄影知识生成','advice-origin'):''}${title('什么时候拍')}${p(a.timing)}${n?p(n.timing.text):''}${title('光线')}${p(n?.light.text??a.light)}${title('可以拍什么')}${n?p(n.subject.text):notes(a.opportunities)}${n?`${title('构图')}${p(n.composition.text)}${title('视角')}${p(n.viewpoint.text)}`:''}${title(a.recommendedWindows.length?'最值得拍的时间':'拍摄时段')}${windows(a.recommendedWindows)}${title('时段记录（含已经过去的）')}${windows(a.allWindows)}${title('要注意的')}${notes(a.limitations)}${visibleDataNote(b)?p(visibleDataNote(b)!):''}${notes(b.interpretation.risks.map(r=>r.text))}${title('条件不好时怎么办')}${n?p(n.alternative.text):notes(a.alternatives)}${title('胶片怎么选')}${p(`${a.film.type} · ${a.film.sensitivity}`)}${p(n?.film.text??a.film.reason)}${p(a.film.caveat)}${x&&advice?evidenceHtml(x,advice):''}</section>`;
}
// A printed page contains complete short passages. A longer passage is moved
// in full to the linked dialog; never truncate a sentence or scroll the paper.
function printedText(value:string,limit:number,fallback:string){
 const text=value.replace(/\s+/gu,' ').trim();
 return text&&Array.from(text).length<=limit?text:fallback;
}
export function bookHtml(b:Briefing,advice:AdviceEnhancementResult|null=null){return genres.map((g,i)=>{
 const a=b.advice[g],x=genreEnhancement(b,g,advice),context=`${b.location.name} ${b.localDate}，`;
 const timing=a.timing.startsWith(context)?a.timing.slice(context.length):a.timing;
 const detail=`<button type="button" class="text-button" data-detail="advice-${g}">完整${genreNames[g]}建议 ↗</button>`;
 return `<article class="spread" data-genre="${i}" aria-label="${genreNames[g]}，今天怎么拍"><section class="book-page"><div class="page-running"><span>逐光 / 外拍手册</span><span>${e(b.localDate)}</span></div><div class="genre-heading"><b>0${i+1}</b><div><h2>${genreNames[g]}</h2><span>${g.toUpperCase()}</span></div></div><h3>${{landscape:'等云层，也看远方。',portrait:'看见光，再靠近。',street:'把变化留在街头。'}[g]}</h3><div class="window">${e(a.recommendedWindows[0]?range(a.recommendedWindows[0]):b.interpretation.genres[g].when)}<small>${a.recommendedWindows.length?'最值得拍的时间':'拍摄时段'}</small></div>${p(printedText(x?.short?.manual.timing??timing,52,'打开完整建议，看看什么时候拍。'),'genre-reason')}<ol class="plan"><li><time>看光</time><div><strong>光线特点</strong>${p(printedText(x?.short?.manual.light??a.light,44,'打开完整建议，看看怎么用光。'))}</div></li><li><time>取景</time><div><strong>画面机会</strong>${p(printedText(x?.short?.manual.opportunity??a.opportunities[0]??'',44,'打开完整建议，看看能拍什么。'))}</div></li></ol><div class="page-number"><span>用光 / 主体 / 构图</span><span>0${i*2+1}</span></div></section><section class="book-page"><div class="page-running"><span>看光的方法</span><span>FIELD NOTES</span></div>${diagramHtml(g)}<div class="film-heading">胶片的性格</div><div class="film-row">${filmIllustrationHtml(a.film)}<div><strong>${e(a.film.type)} · ${e(a.film.sensitivity)}</strong>${p(printedText(x?.short?.manual.film??a.film.reason,45,'打开完整建议，看看胶片怎么选。'))}</div></div><div class="genre-limit"><b>拍摄条件 / </b>${e(printedText(a.limitations[0]??'',28,'打开完整建议，看看要注意什么。'))}<p><b>调整方向 / </b>${e(printedText(x?.short?.manual.alternative??a.alternatives[0]??'',28,'打开完整建议，看看怎么调整。'))}</p></div>${detail}<div class="page-number"><span>色彩与颗粒风格</span><span>0${i*2+2}</span></div></section></article>`;
}).join('');}
const TONE_NAMES={go:'值得出门',maybe:'看情况',poor:'不太适合',done:'自然光已结束',unknown:'暂时无法判断'} as const;
const WEEKDAYS=['周日','周一','周二','周三','周四','周五','周六'];
const weekday=(localDate:string)=>WEEKDAYS[new Date(`${localDate}T12:00:00+08:00`).getUTCDay()];
/** Fractional hour of generatedAt within the Beijing day; the timeline pointer and "now" column follow it. */
export function nowHour(b:Briefing){const f=(Date.parse(b.generatedAt)-Date.parse(b.hours[0].start))/3600000;return Math.min(23.99,Math.max(0,f));}
const tempText=(t:{min:number;max:number}|null)=>t?t.min===t.max?`${t.min}°C`:`${t.min}–${t.max}°C`:'';
function skyTimeline(b:Briefing){
 const it=b.interpretation,now=nowHour(b),pct=(h:number)=>`${(h/24*100).toFixed(2)}%`;
 const riskHours=new Set(b.hours.flatMap((h,i)=>h.risks.some(r=>r.code!=='air-quality')?[i]:[]));
 const light=it.hours.map((r,i)=>`<i class="lt-${e(r.light.key)}" data-h="${i}"></i>`).join('');
 const sky=it.hours.map((r,i)=>`<i class="sky-${e(r.sky.key)} rain-${e(r.rain.key)}${riskHours.has(i)?' risk':''}${i<Math.floor(now)?' past':''}" data-h="${i}"></i>`).join('');
 const dayStart=Date.parse(b.hours[0].start);
 const periods=it.periods.map(x=>{const from=(Date.parse(x.start)-dayStart)/3600000,to=(Date.parse(x.end)-dayStart)/3600000;return `<span style="width:${pct(to-from)}">${e(x.name)}</span>`;}).join('');
 return `<button type="button" class="sky-timeline" data-detail="hours" aria-label="${e(`今天的天色：${it.weatherLine}。打开 24 小时明细`)}"><span class="tl-light" aria-hidden="true">${light}</span><span class="tl-sky" aria-hidden="true">${sky}<b class="tl-now" style="left:${pct(now)}"></b></span><span class="tl-ticks" aria-hidden="true"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></span><span class="tl-periods" aria-hidden="true">${periods}</span></button>`;
}
export function newspaperHtml(b:Briefing,advice:AdviceEnhancementResult|null=null){
 const it=b.interpretation,temperatures=b.summary.temperatureRange,now=nowHour(b),r=it.hours[Math.floor(now)];
 const upcoming=it.risks.filter(x=>x.status!=='past');
 const big=r.sky.key==='unknown'&&r.rain.key==='unknown'?'暂无预报':['none','unknown'].includes(r.rain.key)?r.sky.label:r.rain.label;
 const nowRows=[['风',r.wind.label],['远处',r.visibility.label],['空气',r.air.label],['光线',r.light.label]];
 const dataLine=fixture(b)?'演示数据：人工合成，非真实预报或观测':visibleDataNote(b);
 const solarRow=(label:string,a:{start:string;end:string}|null,c:{start:string;end:string}|null)=>`<dt>${label}</dt><dd>${e(a?time(a.start):'—')} · ${e(c?time(c.start):'—')}</dd>`;
 return `<article class="newspaper plain" id="newspaper" tabindex="-1" aria-label="逐光日刊，今天的拍摄天气"><div class="masthead"><div class="ear">${b.location.granularity==='city'?'城市':'区县'}<strong>${e(b.location.name)}</strong><span>${e(b.location.administrativePath.join(' · '))}</span></div><div class="mast-title"><h1>逐光日刊</h1><p>THE HIKARI DAILY</p></div><div class="ear right">今日日落<strong>${e(time(b.solar.sunset))}</strong><span>日出 ${e(time(b.solar.sunrise))}</span></div></div><div class="dateline"><span>${e(b.localDate)} ${weekday(b.localDate)} · ${e(time(b.generatedAt))} 更新</span>${dataLine?`<b>${e(dataLine)}</b>`:''}</div><header class="headline"><p class="eyebrow tone-${it.tone}">今日结论 · ${TONE_NAMES[it.tone]}</p><h2>${e(it.headline)}</h2>${p(it.lead,'lead')}${upcoming.length?`<div class="briefing-risk" role="note">${notes(upcoming.map(x=>x.text))}</div>`:''}</header><div class="news-grid"><section class="now-column"><h3 class="column-title">现在 ${e(time(b.generatedAt))}</h3><p class="now-big">${e(big)}${r.temperature.key==='unknown'?'':`<span>${e(r.temperature.label)}</span>`}</p><dl class="now-rows">${nowRows.map(([k,v])=>`<dt>${k}</dt><dd>${e(v)}</dd>`).join('')}</dl>${p(r.wind.detail,'now-detail')}<h3 class="column-title second">今天气温</h3><div class="daily-temp">${e(metric(temperatures.min))}<span>—</span>${e(metric(temperatures.max))}<small>°C</small></div><p class="note temperature-coverage">${temperatures.coveredHours}/${temperatures.totalHours} 小时有气温预报${temperatures.coveredHours<temperatures.totalHours?'，缺的小时不算在内':''}</p></section><section class="sky-column"><h3 class="column-title">今天的天色</h3>${p(it.weatherLine,'note')}${skyTimeline(b)}<p class="tl-legend" aria-hidden="true"><i class="lt-golden"></i>黄金时刻 <i class="lt-blue"></i>蓝调时刻 <i class="legend-rain"></i>下雨 <i class="legend-now"></i>现在</p>${it.tone==='unknown'?'':`<ul class="periods">${it.periods.map(x=>`<li class="${x.status}"><b>${e(x.name)}</b><span>${e(tempText(x.temperature))}</span>${e(x.summary)}</li>`).join('')}</ul>`}<h3 class="column-title second">接下来</h3><ul class="next-up">${(it.nextUp.filter(x=>!upcoming.some(y=>y.text===x)).length?it.nextUp.filter(x=>!upcoming.some(y=>y.text===x)):it.nextUp.slice(0,1)).map(x=>`<li>${e(x)}</li>`).join('')}</ul></section><section class="genre-column"><h3 class="column-title">拍摄建议</h3><dl class="genre-summary">${genres.map(g=>{const x=it.genres[g];return `<div class="genre-${x.status}"><dt>${genreNames[g]}<span>${e(x.when)}</span></dt><dd>${e(genreEnhancement(b,g,advice)?.short?.newspaper??x.line)}</dd></div>`;}).join('')}</dl><button type="button" class="text-button" data-nav="book">翻开外拍手册，看具体怎么拍 →</button></section><section class="sun-column"><h3 class="column-title">晚霞与光线</h3><div class="sunset-row"><div><span class="eyebrow">晚霞机会 · 推算</span><strong class="opportunity">${e(it.sunset.title)}</strong></div><button class="text-button" data-detail="sunset" type="button">怎么判断 ↗</button></div>${p(it.sunset.line,'sunset-reason')}<dl class="almanac"><dt>日出 · 日落</dt><dd>${e(time(b.solar.sunrise))} · ${e(time(b.solar.sunset))}</dd>${solarRow('黄金时刻 早 · 晚',b.solar.morningGolden,b.solar.eveningGolden)}${solarRow('蓝调时刻 早 · 晚',b.solar.morningBlue,b.solar.eveningBlue)}</dl><p class="note">黄金时刻：太阳很低，光偏暖、影子长。蓝调时刻：太阳刚落下或快升起，天空深蓝、灯刚亮。</p></section></div><footer class="paper-footer"><button type="button" class="text-button" data-detail="sources">数据与出处 ↗</button></footer></article>`;
}
export function pageHtml(b:Briefing,hour=16,advice:AdviceEnhancementResult|null=null){
 const r=b.interpretation.hours[hour],dataNote=visibleDataNote(b);
 const replacements:Record<string,string>={WIND_LABEL:e(r.wind.label),WIND_SHORT:e(r.wind.short),SUN_LABEL:e(r.sun.label),LIGHT_LABEL:e(r.light.label),LIGHT_SHORT:e(r.light.short),SKY_LABEL:e(r.sky.label),RAIN_LABEL:e(r.rain.label),VISIBILITY_LABEL:e(r.visibility.label),AIR_LABEL:e(r.air.label),HOUR_READING:e(`${String(hour).padStart(2,'0')} 时，${r.sky.label}，${r.light.label}`),SENTENCES:selectedHourSummary(r).map((sentence,i)=>`<p${i===0?' id="weather-index"':''}>${e(sentence)}</p>`).join(''),STATE_HIDDEN:b.state==='ready'||!dataNote?' hidden':'',NEWSPAPER:newspaperHtml(b,advice),BOOK:bookHtml(b,advice),FULL_ADVICE:`<section class="full-advice-reading" aria-label="三种题材完整建议">${genres.map(g=>adviceHtml(b,g,advice)).join('')}</section>`,LOCATION_DATE:e(`${b.location.name} · ${b.localDate}`),PLACE:e(b.location.name),HOUR:e(time(b.hours[hour].start)),HOUR_INDEX:String(hour),STATE:e(b.state==='ready'?'':dataNote),SOURCE:e(`预报 · ${time(b.generatedAt)}`)};
 return template.replace(/@@([A-Z_]+)@@/g,(_,key:string)=>replacements[key]??'')+`<noscript><section class="empty-state"><h2>静态阅读说明</h2><p>JavaScript 未启用：以下按顺序保留全部字段与来源；地点搜索和小时切换需要脚本。</p>${detailHtml(b,'overview',hour)}${genres.map(g=>adviceHtml(b,g,advice)).join('')}${solarHtml(b)}${sunsetHtml(b)}${sourcesHtml(b)}${sourcesNoScriptHtml(b)}${b.sources.map((_,index)=>sourceRecordHtml(b,index)).join('')}</section></noscript>`;
}
