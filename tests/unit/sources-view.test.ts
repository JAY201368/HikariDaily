import { describe,it,expect } from 'vitest';
import { syntheticBriefing } from '../fixtures/domain-synthetic';
import { fieldKeys,anomalyRanges,sourceRows,tableValue,varyingSource,sourceMetricHtml,sourceTableHtml,hourMetric } from '../../src/components/prototype-frontend/sources-view';
describe('source display model',()=>{
 it('covers all normalized fields and keeps 24 hours without mutating input',()=>{
  const b=syntheticBriefing(),before=JSON.stringify(b);
  expect(new Set(fieldKeys).size).toBe(16);
  expect([...Object.keys(b.hours[0].weather),...Object.keys(b.hours[0].air)].sort()).toEqual([...fieldKeys].sort());
  expect(sourceRows(b,'weather')).toHaveLength(24);anomalyRanges(b);expect(JSON.stringify(b)).toBe(before);
 });
 it('splits at healthy hours and different reasons even for ready briefings',()=>{
  const b=syntheticBriefing();b.state='ready';
  for(const h of b.hours)h.weather.temperature={value:10,state:'ok',notes:[],sourceIds:['x']};
  for(const [i,note] of [[0,'A'],[1,'A'],[3,'A'],[4,'B']] as const)b.hours[i].weather.temperature={value:null,state:'missing',notes:[note],sourceIds:[]};
  expect(anomalyRanges(b).filter(r=>r.key==='temperature').map(r=>[r.start,r.end])).toEqual([[0,2],[3,4],[4,5]]);
 });
 it('keeps zero, null, old values, conflicts and source changes distinct',()=>{
  const m={value:0,state:'ok' as const,notes:[],sourceIds:['x'],alternatives:[{sourceId:'y',value:8}]};
  expect(tableValue('temperature',m)).toBe('0');expect(tableValue('temperature',{...m,value:null,state:'missing'})).toBe('— 缺失');
  expect(tableValue('temperature',{...m,state:'stale'})).toBe('0 · 旧数据');expect(tableValue('visibility',{...m,value:12345,state:'conflict'})).toBe('12.345 · 来源分歧');
  const b=syntheticBriefing();b.hours[0].weather.temperature=m;expect(varyingSource(b,'temperature')).toBe(true);
 });
});

describe('source evidence preservation',()=>{
 it('keeps normalized full precision, alternatives, missing source IDs, notes and safe text',()=>{
  const b=syntheticBriefing();b.hours[23].weather.visibility={value:12345.678,state:'stale',sourceIds:['<missing>'],notes:['<script>完整说明','第二条说明'],alternatives:[{sourceId:'other',value:9876.543}]};
  const html=sourceMetricHtml(b,23,'visibility');
  for(const text of ['（次日）','12345.678 m','9876.543 m','&lt;missing&gt;','来源详情未提供','&lt;script&gt;完整说明','第二条说明','旧数据'])expect(html).toContain(text);
  expect(html).not.toContain('<script>');
 });
 it('filters by structured states only and exposes zero-anomaly feedback',()=>{
  const b=syntheticBriefing();for(const h of b.hours)for(const k of fieldKeys)Object.assign(hourMetric(h,k),{state:'ok',value:0,notes:['来源分歧仅为测试文字'],alternatives:[{sourceId:'other',value:1}]});
  expect(sourceRows(b,'weather',true)).toHaveLength(0);expect(sourceTableHtml(b,'weather',true)).toContain('本组没有缺失、旧数据或已标记的来源分歧');
  b.hours[3].weather.temperature.state='conflict';expect(sourceRows(b,'weather',true).map(r=>r.index)).toEqual([3]);
 });
 it('retains light reasons, restrictions and risk time and source',()=>{
  const b=syntheticBriefing(),h=b.hours[0];h.light.reasons=['完整光线依据'];h.light.limitations=['完整限制'];h.risks=[{code:'strong-wind',message:'完整风险',start:h.start,end:h.end,sourceIds:['risk-source']}];
  const html=sourceMetricHtml(b,0,'light');for(const text of ['完整光线依据','完整限制','完整风险','risk-source','00:00–01:00'])expect(html).toContain(text);
 });
});
