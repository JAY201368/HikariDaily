import type { Briefing, Hour, Metric } from '../../domain/types';
import { AIR_UNITS, WEATHER_UNITS } from '../../domain/schemas';
import { shanghaiIso } from '../../domain/time';

type WeatherKey = keyof Hour['weather'];
type AirKey = keyof Hour['air'];
export type FieldKey = WeatherKey | AirKey;
export const sourceGroups = [
 {id:'weather',name:'温湿与降水',fields:['temperature','humidity','weatherCode','precipitation','precipitationProbability']},
 {id:'wind',name:'风况',fields:['windSpeed','windGust','windFrom']},
 {id:'cloud',name:'云量与能见度',fields:['cloudTotal','cloudLow','cloudMid','cloudHigh','visibility']},
 {id:'air',name:'空气',fields:['referenceAqi','pm25','pm10']},
 {id:'light',name:'太阳与光线',fields:[]},
] as const;
export type SourceGroup = typeof sourceGroups[number]['id'];
export const fieldNames:Record<FieldKey,string> = {temperature:'气温',humidity:'湿度',weatherCode:'天气代码',precipitation:'小时降水',precipitationProbability:'降水概率',windSpeed:'平均风',windGust:'小时最大阵风',windFrom:'风向（来向）',cloudTotal:'总云量',cloudLow:'低云量',cloudMid:'中云量',cloudHigh:'高云量',visibility:'能见度',referenceAqi:'参考 AQI',pm25:'PM2.5',pm10:'PM10'};
export const fieldKeys = sourceGroups.flatMap(g=>[...g.fields]) as FieldKey[];
export const fieldUnit = (key:FieldKey) => key in WEATHER_UNITS ? WEATHER_UNITS[key as WeatherKey] : AIR_UNITS[key as AirKey];
export const fieldTiming = (key:FieldKey) => ['precipitation','windGust'].includes(key)?'所示小时区间': '小时起点';
export const hourMetric = (h:Hour,key:FieldKey):Metric<number> => key in h.weather ? h.weather[key as WeatherKey] : h.air[key as AirKey];
export const groupFor = (key:FieldKey):SourceGroup => sourceGroups.find(g=>(g.fields as readonly string[]).includes(key))!.id;
export const sourceStates = {ok:'有效',missing:'缺失',stale:'旧数据',conflict:'来源分歧'};
export const sourceTime = (v:string|null) => v ? `${shanghaiIso(v).slice(0,19).replace('T',' ')} 北京时间` : '未提供';

export function anomalyRanges(b:Briefing){
 const result:{key:FieldKey;start:number;end:number;state:Metric<number>['state'];notes:string[]}[]=[];
 for(const key of fieldKeys){
  let previous:typeof result[number]|undefined;
  b.hours.forEach((h,i)=>{
   const m=hourMetric(h,key);
   if(m.state==='ok'){previous=undefined;return;}
   if(previous&&previous.end===i&&previous.state===m.state&&JSON.stringify(previous.notes)===JSON.stringify(m.notes))previous.end=i+1;
   else {previous={key,start:i,end:i+1,state:m.state,notes:[...m.notes]};result.push(previous);}
  });
 }
 return result;
}
export function varyingSource(b:Briefing,key:FieldKey){return new Set(b.hours.map(h=>JSON.stringify([...hourMetric(h,key).sourceIds].sort()))).size>1;}
export function sourceRows(b:Briefing,group:SourceGroup,onlyAnomalies=false){
 const fields=sourceGroups.find(g=>g.id===group)!.fields;
 return b.hours.flatMap((h,index)=>{
  const abnormal=fields.some(k=>hourMetric(h,k).state!=='ok');
  // The light group has no metric states; preserve risks and explicit unknown light.
  const lightAbnormal=h.light.character==='unknown'||h.risks.length>0;
  return onlyAnomalies&&!(group==='light'?lightAbnormal:abnormal)?[]:[{h,index}];
 });
}
export function tableValue(key:FieldKey,m:Metric<number>){
 if(m.value===null)return '— 缺失';
 const value=key==='visibility'?String(Number((m.value/1000).toFixed(3))):String(m.value);
 return `${value}${m.state==='ok'?'':` · ${sourceStates[m.state]}`}`;
}

const e=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const list=(items:readonly string[])=>`<ul>${[...new Set(items)].map(x=>`<li>${e(x)}</li>`).join('')}</ul>`;
const clock=(v:string)=>shanghaiIso(v).slice(11,16);
const span=(h:{start:string;end:string})=>`${clock(h.start)}–${clock(h.end)}${clock(h.end)==='00:00'?'（次日）':''}`;
const context=(b:Briefing)=>`<p>${e(b.location.name)} · ${e(b.localDate)} · 北京时间</p>`;
function sourceInfo(b:Briefing,id:string,heading=true){
 const s=b.sources.find(s=>s.id===id);
 return s?`<section class="source-evidence">${heading?`<h4>${e(s.provider)} · ${e(s.dataset)}</h4>`:''}<dl><dt>来源编号</dt><dd>${e(id)}</dd><dt>模型</dt><dd>${e(s.model??'未提供')}</dd><dt>原生分辨率</dt><dd>${e(s.nativeResolution??'未提供')}</dd><dt>数据获取</dt><dd>${e(sourceTime(s.fetchedAt))}</dd><dt>上游发布</dt><dd>${e(sourceTime(s.issuedAt))}</dd><dt>适用时段</dt><dd>${e(sourceTime(s.validFrom))} — ${e(sourceTime(s.validTo))}</dd></dl><a href="${e(s.attributionUrl)}">来源与署名说明 ↗</a></section>`:`<p>${e(id)} · 来源详情未提供</p>`;
}
export function anomaliesHtml(b:Briefing){
 const ranges=anomalyRanges(b);
 return ranges.length?`<div class="source-table-scroll"><table class="source-table"><caption>逐项缺失、旧数据与来源分歧</caption><thead><tr><th>指标</th><th>涉及时段</th><th>情况</th><th>操作</th></tr></thead><tbody>${ranges.map(r=>`<tr><th scope="row">${fieldNames[r.key]}</th><td>${span({start:b.hours[r.start].start,end:b.hours[r.end-1].end})}</td><td>${r.end-r.start} 个小时 · ${sourceStates[r.state]}</td><td><button type="button" data-source-jump="${r.key}" data-source-hour="${r.start}">查看对应数据 →</button></td></tr>`).join('')}</tbody></table></div>`:'<p>各项小时指标均有效。</p>';
}
export function sourceTableHtml(b:Briefing,group:SourceGroup='weather',onlyAnomalies=false,selected=0,interactive=true){
 const g=sourceGroups.find(g=>g.id===group)!;
 const rows=sourceRows(b,group,onlyAnomalies);
 const varying=new Set(g.fields.filter(key=>varyingSource(b,key)));
 const button=(index:number,key:string,text:string)=>interactive?`<button type="button" data-source-cell="${key}" data-source-hour="${index}" aria-label="${clock(b.hours[index].start)} · ${e(key==='light'?'太阳与光线依据':fieldNames[key as FieldKey])} · ${e(text)}">${e(text)}</button>`:e(text);
 const table=`<div class="source-table-scroll" tabindex="0" role="region" aria-label="${g.name}数据表，可左右滚动"><table class="source-table"><caption>${g.name} · ${rows.length} / 24 个小时</caption><thead><tr><th scope="col">时间</th>${group==='light'?'<th scope="col">太阳高度 °</th><th scope="col">太阳方位 °</th><th scope="col">光线判断 / 依据</th>':g.fields.map(k=>`<th scope="col">${fieldNames[k]}${k==='weatherCode'?'':` <small>${e(k==='visibility'?'km':fieldUnit(k))}</small>`}</th>`).join('')}</tr></thead><tbody>${rows.map(({h,index})=>{
 const current=Date.parse(h.start)<=Date.parse(b.generatedAt)&&Date.parse(b.generatedAt)<Date.parse(h.end);
 return `<tr data-source-row="${index}"${current?' aria-current="time"':''}${index===selected?' class="source-selected"':''}><th scope="row">${clock(h.start)}${current?'<small>当前</small>':''}${index===selected?'<small>所选小时</small>':''}${h.risks.length?'<small>⚠ 风险 · 查看光线依据</small>':''}</th>${group==='light'?`<td>${h.light.altitude===null?'—':h.light.altitude.toFixed(1)}</td><td>${h.light.azimuth===null?'—':h.light.azimuth.toFixed(1)}</td><td>${button(index,'light',h.light.description)}</td>`:g.fields.map(k=>`<td>${button(index,k,tableValue(k,hourMetric(h,k)))}${varying.has(k)?'<small>来源随小时变化</small>':''}</td>`).join('')}</tr>`;
 }).join('')}</tbody></table></div>`;
 const common=group==='light'?'<p>太阳角度参考小时中点（:30）；北 0° 顺时针，高度相对地平线。角度为天文计算，光线判断为摄影推断。异常筛选包含未知光线与风险小时。</p>':`<dl>${g.fields.map(k=>{
 const ids=[...new Set(b.hours.flatMap(h=>hourMetric(h,k).sourceIds))];
 return `<dt>${fieldNames[k]} · ${fieldTiming(k)}</dt><dd>${varying.has(k)?'来源随小时变化：':'采用来源：'}${ids.length?ids.map(id=>{const s=b.sources.find(s=>s.id===id);return e(s?`${s.provider} / ${s.dataset}（${id}）`:`${id} · 来源详情未提供`);}).join('；'):'未提供'}</dd>`;
 }).join('')}</dl>${group==='air'?'<p>参考 AQI：US_EPA（美国 EPA 口径）；CAMS 全球约45 km网格、原生3小时，模型小时序列含插值。空气质量与能见度分别展示。</p>':''}`;
 return `<article class="sources-sheet source-data"><h2>24 小时数据表${interactive?'':` · ${g.name}`}</h2>${context(b)}${interactive?`<button type="button" data-source-back="overview">← 返回来源说明</button><nav class="source-groups" aria-label="指标分组">${sourceGroups.map(x=>`<button type="button" data-source-group="${x.id}" aria-pressed="${group===x.id}">${x.name}</button>`).join('')}</nav><div class="source-tools"><button type="button" data-source-filter aria-pressed="${onlyAnomalies}">${onlyAnomalies?'查看全部小时':'仅看异常小时'}</button><button type="button" data-source-locate>定位所选小时</button></div>`:''}<p>当前展示 ${rows.length} / 24 个小时。<span class="source-swipe">左右滑动查看其余列。</span></p>${!rows.length?`<p role="status">${group==='light'?'本组没有未知光线或风险小时。':'本组没有缺失、旧数据或已标记的来源分歧。'}</p>`:''}${table}<section><h3>本组来源与口径</h3>${common}</section></article>`;
}
export function sourceMetricHtml(b:Briefing,index:number,key:FieldKey|'light',interactive=true){
 const h=b.hours[index],back=interactive?'<button type="button" data-source-back="table">← 返回数据表</button>':'';
 if(key==='light')return `<article class="sources-sheet">${back}<h2>${span(h)} · 太阳与光线依据</h2>${context(b)}<p>${e(h.light.description)}</p><p>太阳计算参考 ${clock(h.start).slice(0,2)}:30：高度 ${h.light.altitude??'—'}°，方位 ${h.light.azimuth??'—'}°；北0°顺时针。</p><h3>判断依据</h3>${list(h.light.reasons)}<h3>限制</h3>${list(h.light.limitations)}${h.light.sourceIds.map(id=>sourceInfo(b,id)).join('')}<h3>风险及其来源</h3>${h.risks.map(r=>`<section><h4>${e(r.message)}</h4><p>${span(r)}</p>${r.sourceIds.map(id=>sourceInfo(b,id)).join('')}</section>`).join('')||'<p>本小时没有已标记的风险。</p>'}</article>`;
 const m=hourMetric(h,key),value=m.value===null?'— 缺失':`${m.value} ${fieldUnit(key)}`;
 return `<article class="sources-sheet">${back}<h2>${span(h)} · ${fieldNames[key]}</h2>${context(b)}<p>采用值：${e(value)} · ${sourceStates[m.state]}</p><p>时间口径：${fieldTiming(key)}</p><h3>采用来源与时间</h3>${m.sourceIds.map(id=>sourceInfo(b,id)).join('')||'<p>采用来源未提供。</p>'}<h3>来源对比</h3><div class="source-table-scroll"><table class="source-table"><thead><tr><th>角色</th><th>来源</th><th>数值</th></tr></thead><tbody><tr><td>本次采用</td><td>${e(m.sourceIds.join('、')||'未提供')}</td><td>${e(value)}</td></tr>${(m.alternatives??[]).map(a=>`<tr><td>对比来源</td><td>${e(a.sourceId)}</td><td>${e(`${a.value} ${fieldUnit(key)}`)}</td></tr>`).join('')}</tbody></table></div>${[...new Set((m.alternatives??[]).map(a=>a.sourceId))].map(id=>sourceInfo(b,id)).join('')}<h3>完整说明</h3>${m.notes.length?list(m.notes):`<p>${m.state==='missing'?'本次未提供具体原因。':'本次未附加备注。'}</p>`}</article>`;
}
export function sourcesNoScriptHtml(b:Briefing){return `<section class="sources-static"><h2>完整小时数据与依据</h2>${sourceGroups.map(g=>sourceTableHtml(b,g.id,false,-1,false)).join('')}<h3>逐小时完整依据附录</h3>${b.hours.map((h,i)=>`<details id="hour-${i}"><summary>${span(h)} · 完整依据</summary>${fieldKeys.map(k=>`<details><summary>${fieldNames[k]}</summary>${sourceMetricHtml(b,i,k,false)}</details>`).join('')}${sourceMetricHtml(b,i,'light',false)}</details>`).join('')}</section>`;}

/** Source metadata is read in a dedicated modal, outside the comparison columns. */
export function sourceRecordHtml(b:Briefing,index:number){
 const s=b.sources[index];if(!s)return '';
 return `<article class="sources-sheet source-record"><h2>${e(s.provider)}</h2><p>${e(s.dataset)}</p>${sourceInfo(b,s.id,false)}<dl class="sources-facts"><div><dt>数据类型</dt><dd>${e({forecast:'预报',observation:'观测',astronomical:'天文计算'}[s.kind])} · ${s.kind}</dd></div><div><dt>状态</dt><dd>${e({ok:'可用',stale:'旧数据',failed:'获取失败',disabled:'已停用'}[s.status])}</dd></div></dl></article>`;
}
