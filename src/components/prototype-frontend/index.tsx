"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { BriefingResult } from '../../server/briefing-service';
import type { Briefing, Genre } from '../../domain/types';
import { shanghaiIso } from '../../domain/time';
import { BriefingController, MEMORY_KEY } from '../briefing-client/controller';
import { genres, genreNames, pageHtml, fixture } from './adapter';
import { mountPrototype, type ObjectSnapshot } from './runtime';
import { LocationPicker } from './location-picker';
import type { AdviceContext, AdviceEnhancementResult } from '../../domain/workspace/advice';
import { WORKSPACE_INVALIDATION_KEY } from '../briefing-client/controller';
import { WorkspaceAccountProvider, WorkspaceAccountButton, WORKSPACE_EVENT } from '../account/account';
import '../account/account.css';
import { ShootingPlanner } from '../shooting-planner';

const adviceReasons: Record<string,string> = {
 MODEL_NOT_CONFIGURED:'尚未配置模型', TEXT_CAPABILITY_UNVERIFIED:'模型文本能力尚未验证', TEXT_CAPABILITY_UNAVAILABLE:'模型文本能力不可用',
 KNOWLEDGE_NOT_COVERED:'摄影知识暂无匹配条目', KNOWLEDGE_CHANGED:'所用知识已修订或撤回', TIMING_CHANGED:'拍摄时段已变化，需要刷新简报',
 CONFIG_CHANGED:'模型配置已变化', MODEL_TIMEOUT:'模型响应超时', MODEL_INPUT_TOO_LARGE:'本次生成材料超出模型输入预算',
 INVALID_MODEL_JSON:'模型回复格式不完整', INVALID_MODEL_STRUCTURE:'模型回复结构未通过检查', INVALID_STRUCTURE_OR_LENGTH:'模型回复未通过结构或纸面长度检查',
 INVALID_FACT_REFERENCE:'模型事实引用未通过检查', INVALID_KNOWLEDGE_REFERENCE:'模型知识引用未通过检查',
 UNSUPPORTED_OR_PROHIBITED_CLAIM:'模型建议未通过事实与文案检查', DUPLICATED_GENRE_SUBJECT:'模型未区分不同题材的主体',
 GENERIC_OR_DUPLICATED_ADVICE:'模型建议缺少独立的拍摄动作', RISK_REQUIRES_INDOOR_ACTION:'模型建议未遵守室内避险条件',
};

function PrototypeSheet({briefing,controller,hour,genre,advice}:{briefing:Briefing;controller:BriefingController;hour:number|null;genre:Genre;advice:AdviceEnhancementResult|null}) {
 const initialHour=hour??Number(shanghaiIso(briefing.generatedAt).slice(11,13));
 const html=useMemo(()=>pageHtml(briefing,Number(shanghaiIso(briefing.generatedAt).slice(11,13)),advice),[briefing,advice]);
 const [initialHtml]=useState(html);
 const host=useRef<HTMLDivElement>(null);
 const actions=useRef<ReturnType<typeof mountPrototype>|null>(null);
 const readingMode=useRef<boolean|null>(null);
 const objectSnapshot=useRef<ObjectSnapshot|null>(null);
 // The authored subtree belongs to the transplanted native controller. React owns its single host.
 // Rebuild on a whole Briefing replacement; selection updates use the native controller only.
 const latest=useRef({initialHour,genre});
 useLayoutEffect(()=>{latest.current={initialHour,genre};},[initialHour,genre]);
 useLayoutEffect(()=>{
  const node=host.current!;
  node.innerHTML=html;
  const runtime=mountPrototype(briefing,latest.current.initialHour,genres.indexOf(latest.current.genre),h=>controller.selectHour(h),g=>controller.selectGenre(genres[g]),readingMode.current,advice);
  actions.current=runtime;
  if(objectSnapshot.current)runtime.restore(objectSnapshot.current);
  return ()=>{readingMode.current=runtime.isStatic();objectSnapshot.current=runtime.snapshot();runtime.destroy();actions.current=null;};
 },[briefing,controller,html,advice]);
 useEffect(()=>{if(hour!==null)actions.current?.selectHour(hour);},[hour]);
 useEffect(()=>{actions.current?.selectGenre(genres.indexOf(genre));},[genre]);
 return <div ref={host} data-frontend="prototype" dangerouslySetInnerHTML={{__html:initialHtml}} />;
}
function BriefingContent({initialPlace,initialGenre,initialResult,initialWorkspace}:{initialPlace:string|null;initialGenre:Genre;initialResult:BriefingResult|null;initialWorkspace?:{context:AdviceContext|null;advice:AdviceEnhancementResult|null}}) {
 const [controller]=useState(()=>new BriefingController({place:initialPlace,genre:initialGenre,result:initialResult,workspace:initialWorkspace}));
 const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
 const picker=useRef<HTMLDialogElement>(null),locationButton=useRef<HTMLButtonElement>(null);
 const b=state.result?.data;
 const adviceStatus=state.adviceLoading?'正在整理 AI 摄影建议…':state.adviceError??(state.advice&&Object.values(state.advice.enhancement).some(x=>x.status==='generated')?'AI 摄影建议已更新 · 完整建议中可查看依据':state.adviceContext?.reason==='TEXT_CAPABILITY_UNVERIFIED'?'当前为规则建议 · 请在账户设置中验证模型文本能力':state.adviceContext?.reason==='MODEL_NOT_CONFIGURED'?'当前为规则建议 · 尚未配置模型':state.adviceContext?.reason==='TEXT_CAPABILITY_UNAVAILABLE'?'当前为规则建议 · 模型文本能力不可用，请检查账户设置':state.adviceContext?.enabled?'当前为规则建议 · 本次 AI 内容未通过生成或质量检查':'当前为规则建议 · 登录后可配置模型');

 useEffect(()=>{
  const stop=controller.start({now:Date.now,fetch:window.fetch.bind(window),visible:()=>document.visibilityState==='visible',timer:(callback,ms)=>{const id=window.setTimeout(callback,ms);return()=>window.clearTimeout(id);},readUrl:()=>window.location.href,writeUrl:({place,genre},replace)=>{const url=new URL(window.location.href);if(place===null)url.searchParams.delete('place');else url.searchParams.set('place',place);url.searchParams.set('genre',genre);window.history[replace?'replaceState':'pushState'](null,'',url);},readMemory:()=>window.localStorage.getItem(MEMORY_KEY),writeMemory:v=>window.localStorage.setItem(MEMORY_KEY,v),workspace:true});
  const navigate=()=>controller.navigate();
  const storage=(event:StorageEvent)=>{if(event.key===WORKSPACE_INVALIDATION_KEY||event.key===null)controller.workspaceChanged();};
  const visible=()=>{controller.visibilityChanged();if(document.visibilityState==='visible')controller.focusChanged();};
  document.addEventListener('visibilitychange',visible);window.addEventListener('popstate',navigate);window.addEventListener('focus',controller.focusChanged);window.addEventListener('storage',storage);window.addEventListener(WORKSPACE_EVENT,controller.workspaceChanged);
  return()=>{document.removeEventListener('visibilitychange',visible);window.removeEventListener('popstate',navigate);window.removeEventListener('focus',controller.focusChanged);window.removeEventListener('storage',storage);window.removeEventListener(WORKSPACE_EVENT,controller.workspaceChanged);stop();};
 },[controller]);
 return <>
  <a className="skip" href={b?'#newspaper':'#location-heading'}>跳到日报内容</a>
  <header className="site-header">
   <a className="brand" href="#newspaper" data-nav="paper">逐光<span>HIKARI DAILY</span></a>
   <div className="fixture-label">{b?.localDate??'北京时间'}{(!b||fixture(b))&&<b>{b?'人工合成演示':'先选拍摄地点'}</b>}</div>
   <button className="header-location" ref={locationButton} onClick={()=>picker.current?.showModal()} aria-label="选择拍摄地点">{b?.location.name??'选择拍摄地点'} ↗</button>
   <div className="header-actions">
    {b&&<button id="motion-toggle" type="button" aria-pressed="false">减少动态</button>}
    <WorkspaceAccountButton />
   </div>
  </header>
  <dialog ref={picker} aria-labelledby="location-picker-heading" onClose={()=>locationButton.current?.focus({preventScroll:true})}>
   <div className="dialog-top"><span>逐光 · 拍摄地点</span><button aria-label="关闭地点选择" onClick={()=>picker.current?.close()}>×</button></div>
   <LocationPicker onSelect={id=>{controller.selectPlace(id);picker.current?.close();}} />
  </dialog>
  {state.loading&&<p className="empty-state" role="status">{b?'正在刷新；以下为上次完整简报，时间与来源以其标注为准。':'正在加载所选地点当天简报…'}</p>}
  {state.place===null&&<main className="empty-state"><h1 id="location-heading">尚未选择地点</h1><p>请选择中国大陆城市或区域后，阅读当天的 24 小时简报。</p><p>地点搜索使用行政上下文区分同名地点；区县查不到时请选择所属城市。</p><button className="ink-button" onClick={()=>picker.current?.showModal()}>搜索城市或区县 ↗</button></main>}
  {state.result?.error&&<section className="empty-state" role="alert"><h2>简报暂不可用</h2><p>{state.result.error.message}</p><p>错误代码：{state.result.error.code}</p><button className="text-button" onClick={()=>controller.selectPlace(null)}>返回地点入口</button></section>}
  {b&&<><p className="sr-only" aria-live="polite">当前题材：{genreNames[state.genre]}。{fixture(b)?'演示数据：人工合成，非真实预报或观测。':''}</p>
   {adviceStatus!=='当前为规则建议 · 尚未配置模型'&&<aside className="advice-status" aria-label="摄影建议状态"><span role="status">{adviceStatus}</span>{state.adviceContext?.enabled&&<button type="button" className="text-button" onClick={controller.retryAdvice} disabled={state.adviceLoading||state.loading}>重新生成建议</button>}</aside>}
   {state.advice&&<details className="advice-generation-status"><summary>三种题材的生成状态</summary><ul>{genres.map(g=>{const x=state.advice!.enhancement[g];return <li key={g}>{genreNames[g]}：{x.status==='generated'?'AI 建议已生成':`${adviceReasons[x.reason??'']??'本次 AI 建议未生成'}，使用规则建议`}</li>;})}</ul></details>}
   <PrototypeSheet briefing={b} controller={controller} hour={state.selectedHour} genre={state.genre} advice={state.advice} /></>}
  <ShootingPlanner briefing={b ?? undefined} hour={state.selectedHour} genre={state.genre} advice={state.advice} />
 </>;
}

export function BriefingClient(props: Parameters<typeof BriefingContent>[0]) { return <WorkspaceAccountProvider><BriefingContent {...props} /></WorkspaceAccountProvider>; }
