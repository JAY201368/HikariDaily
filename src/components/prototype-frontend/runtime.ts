import { activePeer, dockLift, forgetPeer, objectMotion, rectTransform, registerPeer, requestPeer, type PeerObject } from './peer-objects';
import { bindPaperGestures } from '../shared/paper-wheel';
import { lockModalPage, unlockModalPage } from '../shared/modal-lock';
import { sourceGroups, sourceRecordHtml, sourceTableHtml, sourceMetricHtml, groupFor, fieldKeys, type FieldKey, type SourceGroup } from './sources-view';
// Native actions directly transplanted from prototype/app.js. Fixture rendering is replaced by adapter.ts.
import type { AdviceEnhancementResult } from '../../domain/workspace/advice';
import type { Briefing } from '../../domain/types';
import { detailHtml, hourDetailHtml, selectedHourSummary, time, visibleDataNote } from './adapter';
export function mountPrototype(briefing:Briefing, initialHour:number, initialGenre:number, onHour:(hour:number)=>void, onGenre:(genre:number)=>void, initialStatic:boolean|null=null, advice:AdviceEnhancementResult|null=null) {
  const scope=new AbortController(); let rafId=0, destroyed=false, lastPublishedGenre=initialGenre;
  const $ = <T extends Element = HTMLElement>(selector:string, root:Document|Element=document):T => {const node=root.querySelector<T>(selector);if(!node)throw new Error(`Missing prototype node: ${selector}`);return node;};
  const $$ = <T extends Element = HTMLElement>(selector:string, root:Document|Element=document):T[] => [...root.querySelectorAll<T>(selector)];
  const el = <K extends keyof HTMLElementTagNameMap>(tag:K, cls='', text?:string) => {const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  function on<K extends keyof GlobalEventHandlersEventMap>(target:EventTarget,type:K,callback:(event:GlobalEventHandlersEventMap[K])=>void, options:AddEventListenerOptions={}){target.addEventListener(type,callback as EventListener,{...options,signal:scope.signal});}
  const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const range=(p:number,a:number,b:number)=>clamp((p-a)/(b-a));
  const ease=(t:number)=>t*t*(3-2*t);
  const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
  const compactQuery = matchMedia('(max-width:1099px), (max-height:819px)');
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let compact = compactQuery.matches, staticMode = initialStatic??reducedQuery.matches, hour = initialHour, genre = initialGenre;
  let widePaperFlow=false;
  let opener: HTMLElement | null = null, activeDetail = '', framePending = false, paperHeight = 760, progress = 0;
  let paperStart={x:0,y:0,scale:1};
  let paperReadingFraction:number|null=0;
  let resizeAnchor:{p:number;reading:number|null}|null=null;
  const newspaper = $('#newspaper'), paperObject = $('#paper-object'), folding = $('#folding');
  const watch = $('.pocket-watch');
  const bag = $('#instruments'), front = $('#bag-front'), book = $('#handbook'), bookNav = $('#book-nav');
  const spreads = $('#spreads'), cover = $('#book-cover'), leaf = $('#turn-leaf'), journey = $('#journey');
  const mobileHome = $('#mobile-paper-home');
  const slip = $('#subscription');
  let readingDistance = 0;
  const pocketPaper = foldBack();
  pocketPaper.classList.add('static-pocket-paper');
  pocketPaper.setAttribute('aria-hidden','true'); pocketPaper.inert = true;
  bag.append(pocketPaper);

  function foldBack() {
    return el('div','lower-back');
  }
  function cloneInert(node:Element) {
    const clone = node.cloneNode(true) as HTMLElement;
    [clone, ...$$('*', clone)].forEach(n => {
      n.removeAttribute('id'); n.removeAttribute('for'); n.removeAttribute('aria-labelledby');
      if (n.matches('button,a,input,select,textarea,[tabindex]')) n.setAttribute('tabindex', '-1');
    });
    clone.setAttribute('aria-hidden', 'true'); clone.inert = true;
    return clone;
  }
  function activate(node:HTMLElement, yes:boolean) {
    node.inert = !yes;
    node.setAttribute('aria-hidden', String(!yes));
  }
  function text(selector:string, value:string) { $$(selector).forEach(n => { n.textContent = value; }); }
  function renderHours() {
    const svg = $('.dial-marks'), ns = 'http://www.w3.org/2000/svg';
    for (let h = 0; h < 24; h++) {
      const angle = h * Math.PI / 12, major = h % 6 === 0;
      const tick = document.createElementNS(ns, 'line');
      const point = (r:number) => [120 + Math.sin(angle) * r, 120 - Math.cos(angle) * r];
      const a = point(major ? 99 : 103), b = point(110);
      ['x1','y1','x2','y2'].forEach((key,i) => tick.setAttribute(key, String([...a,...b][i])));
      tick.setAttribute('class', major ? 'major-tick' : 'minor-tick');
      const label = document.createElementNS(ns, 'text'), at = point(85);
      label.setAttribute('x', String(at[0])); label.setAttribute('y', String(at[1]));
      label.setAttribute('class', major ? 'major-hour' : 'minor-hour');
      label.textContent = String(h).padStart(2,'0'); svg.append(tick,label);
    }
    $$('.spread').forEach(spread=>[...spread.children].forEach((page,i)=>{(page as HTMLElement).dataset.pageSide=i===0?'left':'right';}));
    $('.cover-back').replaceChildren(cloneInert($('.spread .book-page')));

  }
  function setHour(h:number) {
    hour = ((Math.round(Number(h)) % 24) + 24) % 24;
    renderReadings(); onHour(hour);
  }
  const dial = $('#hour-dial');
  let dialPointer: number | null = null;
  function selectDialPoint(event:PointerEvent) {
    // Rendered local coordinates, never unscaled scene offsets (also handles resize).
    const rect = dial.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - .5;
    const y = (event.clientY - rect.top) / rect.height - .5;
    if (Math.hypot(x,y) < .09) return; // A press on the pivot has no defined angle.
    setHour(Math.atan2(x,-y) * 12 / Math.PI);
  }
  function endDialGesture(event?:PointerEvent) {
    if (dialPointer === null || (event && event.pointerId !== dialPointer)) return;
    const id = dialPointer; dialPointer = null;
    dial.classList.remove('dragging');
    if (dial.hasPointerCapture(id)) dial.releasePointerCapture(id);
  }
  on(dial,'pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || dialPointer !== null) return;
    dialPointer = event.pointerId; dial.setPointerCapture(dialPointer);
    dial.focus({preventScroll:true}); dial.classList.add('dragging');
    selectDialPoint(event); event.preventDefault();
  });
  on(dial,'pointermove', event => { if (event.pointerId === dialPointer) selectDialPoint(event); });
  (['pointerup','pointercancel','lostpointercapture'] as const).forEach(type => on(dial,type,endDialGesture));
  on(window,'blur', () => endDialGesture());
  on(dial,'keydown', event => {
    const change = ({ArrowRight:1,ArrowUp:1,ArrowLeft:-1,ArrowDown:-1} as Record<string,number>)[event.key];
    if (change) { event.preventDefault(); setHour(hour + change); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); setHour(event.key === 'Home' ? 0 : 23); }
  });
  on($('#prev-hour'),'click', () => setHour(hour - 1));
  on($('#next-hour'),'click', () => setHour(hour + 1));
  function renderReadings() {
    const h=briefing.hours[hour], r=briefing.interpretation.hours[hour], selectedTime=time(h.start);
    text('.selected-time',selectedTime);
    const labelsByValue={'wind-label':r.wind.label,'wind-short':r.wind.short,'sun-label':r.sun.label,
      'light-label':r.light.label,'light-short':r.light.short,'sky-label':r.sky.label,
      'rain-label':r.rain.label,'visibility-label':r.visibility.label,'air-label':r.air.label};
    Object.entries(labelsByValue).forEach(([key,value])=>text(`[data-value="${key}"]`,value));
    $$('.sun-dial').forEach(n=>{n.classList.toggle('sun-unknown',h.light.azimuth===null);if(h.light.azimuth===null)n.style.removeProperty('--sun-angle');else n.style.setProperty('--sun-angle',`${h.light.azimuth}deg`);});
    text('.card-source',`预报 · ${time(briefing.generatedAt)}`);
    $('.reading-index').replaceChildren(...selectedHourSummary(r).map((sentence,index)=>{
      const paragraph=el('p','',sentence);if(index===0)paragraph.id='weather-index';return paragraph;
    }));
    const stateNote=$('#state-note');
    const dataNote=visibleDataNote(briefing);
    stateNote.hidden=briefing.state==='ready'||!dataNote;
    stateNote.textContent=stateNote.hidden?'':dataNote??'';
    dial.setAttribute('aria-valuenow',String(hour));
    dial.setAttribute('aria-valuetext',`${String(hour).padStart(2,'0')} 时，${r.sky.label}，${r.light.label}`);
    dial.style.setProperty('--hour-angle',`${hour*15}deg`);
    const labels:Record<string,string>={wind:'风温湿仪',direction:'太阳方位仪',light:'经典测光表',weather:'气象记录卡'};
    $$('[data-device]').forEach(n=>n.setAttribute('aria-label',`${labels[n.dataset.device!] }，${selectedTime}，打开说明`));
    if($<HTMLDialogElement>('#detail').open&&activeDetail)renderDetail(activeDetail);
  }
  function buildFolds() {
    folding.replaceChildren();
    // Layout dimensions, never the dimensions after the scene's camera scale.
    paperHeight = newspaper.offsetHeight;
    const width = newspaper.offsetWidth;
    paperObject.style.width = `${width}px`; paperObject.style.height = `${paperHeight}px`;
    paperObject.style.left = compact ? `${($('#world').clientWidth - width) / 2}px` : '0px';
    folding.style.setProperty('--fold-paper-width', `${width}px`);
    folding.style.setProperty('--fold-paper-height', `${paperHeight}px`);
    ['upper','lower'].forEach((name,row) => {
      const group = el('div',`fold-row ${name}`);
      [0,1].forEach(col => {
        const panel = el('div',`fold-panel ${col ? 'right' : 'left'}`), face = el('div','fold-face front'), back = el('div','fold-face back');
        const clone = cloneInert(newspaper);clone.style.visibility='visible';clone.style.position='absolute';clone.style.left = `${-col*width/2}px`;clone.style.top = `${-row*paperHeight/2}px`;
        face.append(clone);
        panel.append(face,back);group.append(panel);
      });
      if (row) group.append(foldBack());
      folding.append(group);
    });
  }

  function setupMode() {
    if(destroyed)return;
    const anchor=resizeAnchor;resizeAnchor=null;
    endDialGesture();cancelTurn();compact = compactQuery.matches;
    document.body.classList.toggle('static',staticMode);
    document.body.classList.toggle('compact',compact);
    document.body.classList.add('peer-objects');
    mobileHome.style.minHeight='';newspaper.style.position='';newspaper.style.top='';
    $('#motion-toggle').setAttribute('aria-pressed',String(staticMode));
    $('#motion-toggle').textContent=staticMode?'恢复动态':'减少动态';
    const cameraScale=Math.min(1,(innerWidth-60)/1120,(innerHeight-125)/780);
    widePaperFlow=!compact&&!staticMode&&newspaper.offsetHeight*cameraScale>(innerHeight-144)/.75;
    document.body.classList.toggle('flow-paper',widePaperFlow);
    mobileHome.classList.toggle('mobile-intro',compact&&!staticMode);
    if((compact||widePaperFlow)&&!staticMode){
      mobileHome.append(newspaper);journey.style.marginTop=`-${innerHeight-64}px`;
      mobileHome.style.minHeight=`${mobileHome.offsetHeight+innerHeight*.55}px`;
      newspaper.style.position='sticky';newspaper.style.top=`${innerHeight-64-newspaper.offsetHeight}px`;
    }else{paperObject.prepend(newspaper);journey.style.marginTop='0';}
    readingDistance=innerHeight*(compact?2.7:3.2);
    journey.dataset.readingDistance=String(readingDistance);
    journey.style.height=staticMode?'':`${innerHeight+readingDistance*(compact?.34:.39)+2}px`;
    if(staticMode){bag.append(watch);watch.style.transform=compact?'translate(14px,414px)':'translate(824px,182px)';watch.style.setProperty('--watch-ui','1');activate(watch,true);bag.style.transform='none';front.style.transform='none';activate(bag,true);activate(newspaper,true);}
    else{
      $('#world').append(watch);$('#world').style.transform=compact?'none':`scale(${cameraScale})`;
      buildFolds();measurePaperStart();
      if(anchor&&anchor.p<.39)scrollTo({top:anchor.reading!==null?journey.offsetTop*anchor.reading:journey.offsetTop+readingDistance*anchor.p,behavior:'instant'});
      renderScene();
    }
    if(!reader.open)dockObjects();else layoutReader();
  }

  function currentProgress() {
    return clamp((scrollY - journey.offsetTop) / readingDistance);
  }
  function measurePaperStart(){
    const world=$('#world'), worldBounds=world.getBoundingClientRect(), stageBounds=$('#stage').getBoundingClientRect();
    const scale=worldBounds.width/world.offsetWidth;
    if(compact||widePaperFlow){
      // At scroll == journey.offsetTop the sticky stage starts. Match the last
      // naturally scrolled sheet in that exact viewport, in both directions.
      const r=newspaper.getBoundingClientRect();
      paperStart={x:(r.left-worldBounds.left)/scale-paperObject.offsetLeft,
        y:(innerHeight-64-paperHeight-(worldBounds.top-stageBounds.top))/scale,scale:1/scale};
    }else{
      const fit=Math.min(1,(innerHeight-144)/(paperHeight*scale));
      const top=64+(innerHeight-64-paperHeight*scale*fit)/2;
      paperStart={x:1120*(1-fit)/2,y:(top-(worldBounds.top-stageBounds.top))/scale,scale:fit};
    }
    journey.dataset.paperHandoff=String(journey.offsetTop);
  }
  function scenePosition(p:number) {
    // Fold completely, then fit and align above the open main compartment.
    // Only the separate final descent can cross the actual front leather lip.
    if (compact) {
      const shrink=ease(range(p,0,.10)), align=ease(range(p,.22,.29)), descend=ease(range(p,.29,.34));
      const storedScale=220/paperHeight, paperLeft=($('#world').clientWidth-newspaper.getBoundingClientRect().width)/2;
      const fold1=ease(range(p,.035,.13)),fold2=ease(range(p,.14,.22));
      const gatheredScale=Math.min(.6,(innerHeight-200)/paperHeight),scale=mix(1,gatheredScale,shrink);
      const centreY=93+(innerHeight-93)/2-($('#world').getBoundingClientRect().top-$('#stage').getBoundingClientRect().top);
      const x=($('#world').clientWidth-newspaper.offsetWidth*(1-fold1/2)*scale)/2-paperObject.offsetLeft;
      const y=mix(paperStart.y,centreY-paperHeight*gatheredScale/2,shrink)+paperHeight*gatheredScale*fold2/4;
      return {fold1,fold2,x:mix(x,190-paperLeft,align),y:mix(y,230,align)+46*descend,scale:mix(scale,storedScale,align),rotation:90*align,aligned:align===1};
    }
    const align=ease(range(p,.30,.35)),descend=ease(range(p,.35,.39));
    const gather=ease(range(p,.035,.28));
    const fold1=ease(range(p,.035,.15)),fold2=ease(range(p,.165,.28));
    const scale=widePaperFlow?mix(paperStart.scale,Math.min(1,700/paperHeight),gather)
      :paperStart.scale*(1-.055*Math.sin(Math.PI*fold1)-.025*Math.sin(Math.PI*fold2));
    // Track the centre of the remaining footprint while each hinge closes.
    // A little room at the steepest angles keeps the lifted edge below the header.
    const x=widePaperFlow?paperStart.x:560-1120*(1-fold1/2)*scale/2;
    const y=widePaperFlow?mix(paperStart.y,0,gather)
      :paperStart.y+paperHeight*paperStart.scale/2-paperHeight*(1-fold2/2)*scale/2;
    return {fold1,fold2,x:mix(x,210,align),y:mix(y,360,align)+105*descend,scale:mix(scale,190/560,align),rotation:0,aligned:align===1};
  }
  function renderScene() {
    if(destroyed)return;
    if(rafId){cancelAnimationFrame(rafId);rafId=0;}
    framePending = false;
    if (staticMode||resizeAnchor) return;
    const p = currentProgress();progress=p;
    $('#stage').dataset.progress=p.toFixed(4);
    const geo = scenePosition(p);
    const exit = 0;
    const bagEnter = compact ? mix(650,0,ease(range(p,.04,.29))) : mix(900,0,ease(range(p,.24,.34)));
    const bagInset = compact ? 0 : -40;
    const bagY = bagEnter + exit*(compact?740:1050) + bagInset;
    bag.style.transform=bagY===0?'none':`translateY(${bagY}px)`;front.style.transform=`translateY(${bagY}px)`;
    const paperY = geo.y + exit*(compact?740:1050) + bagInset*ease(range(p,.30,.35));
    paperObject.style.clipPath = 'none';
    paperObject.style.transform=`translate(${geo.x}px,${paperY}px) scale(${geo.scale}) rotate(${geo.rotation}deg)`;
    paperObject.style.visibility='visible';
    paperObject.style.zIndex=geo.aligned?'30':'45';
    paperObject.dataset.aligned=String(geo.aligned);
    const paperReading = (compact||widePaperFlow) ? scrollY<=journey.offsetTop : p<=.035;
    const foldingNow = !paperReading;
    paperReadingFraction=paperReading ? ((compact||widePaperFlow)?clamp(scrollY/journey.offsetTop):0) : null;
    newspaper.style.visibility=paperReading?'visible':'hidden';
    folding.style.display=foldingNow?'block':'none';
    $$('.fold-panel.right').forEach(n=>{n.style.transform=`rotateY(${-180*geo.fold1}deg)`;});
    $('.fold-row.lower').style.transform=`rotateX(${180*geo.fold2}deg)`;
    // Contact shade belongs to the moving surfaces, never a cross above the world.
    // Zero at both flat endpoints; only the currently bending hinge deepens.
    folding.style.setProperty('--hinge-v', Math.sin(Math.PI*geo.fold1).toFixed(5));
    folding.style.setProperty('--hinge-h', Math.sin(Math.PI*geo.fold2).toFixed(5));
    // Keep the backside above the completed stack without flattening intermediate 3D hinges.
    $('.fold-row.upper').style.zIndex='1';
    $('.fold-row.lower').style.zIndex='2';
    const bagReading = p >= (compact?.34:.39);
    if (!bagReading) endDialGesture();
    // The watch remains rendered while the bag is inert: occlusion, never visibility,
    // reveals the same case. It first lifts vertically clear, then travels/grows.
    const watchLift = ease(range(p,compact?.23:.305,compact?.28:.35));
    const watchTravel = ease(range(p,compact?.28:.35,compact?.34:.39));
    const watchStart = compact ? {x:64,y:260,s:.43,clear:85} : {x:175,y:470,s:.42,clear:130};
    const watchX = mix(watchStart.x,compact?14:824,watchTravel);
    const watchY = mix(mix(watchStart.y,watchStart.clear,watchLift),compact?350:182,watchTravel);
    const watchScale = mix(watchStart.s,1,watchTravel);
    watch.style.transform=`translate(${watchX}px,${watchY+bagY}px) scale(${watchScale})`;
    // Once its entire case has cleared every front surface, it passes in front
    // of the side wall during travel. At the layer change there is no overlap.
    watch.style.zIndex=watchLift===1?'45':'33';
    activate(watch,bagReading);
    watch.style.setProperty('--watch-ui',String(watchTravel));
    watch.dataset.lift=watchLift.toFixed(5); watch.dataset.travel=watchTravel.toFixed(5);
    activate(bag,bagReading);$('.bag-controls').style.visibility=bagReading?'visible':'hidden';$('.scene-title').style.visibility=p> (compact?.26:.34)?'visible':'hidden';
    activate(newspaper,paperReading);
    const chapter=p<(compact?.34:.39)?'paper':'bag';
    $$('[data-nav]').forEach(n=>{if(n.closest('nav'))n.toggleAttribute('aria-current',n.dataset.nav===chapter);});
    const scrollCaption=$<HTMLElement>('#scroll-caption');
    scrollCaption.hidden=bagReading;
    if(!bagReading)scrollCaption.textContent='打开摄影包 ↓';
    document.body.classList.toggle('bag-footer-visible',bagReading);
  }
  function genreButtons(){
    $$('[data-genre]').forEach(n=>n.toggleAttribute('aria-current',Number(n.dataset.genre)===genre));
    $<HTMLButtonElement>('#prev-page').disabled=genre===0;$<HTMLButtonElement>('#next-page').disabled=genre===2;
  }
  function goProgress(p:number){scrollTo({top:journey.offsetTop+readingDistance*p,behavior:'instant'});renderScene();}
  let turnAnimation:Animation|null=null,turnToken=0;
  function cancelTurn(){turnToken++;turnAnimation?.cancel();turnAnimation=null;leaf.style.display='none';}
  function goGenre(i:number,publish=true){
    const previous=genre;genre=clamp(i,0,2);
    if(publish&&genre!==lastPublishedGenre)onGenre(genre);lastPublishedGenre=genre;
    const animate=reader.open&&currentObject==='handbook'&&reader.dataset.phase==='reading'&&Math.abs(previous-genre)===1&&!staticMode;
    // A reverse single-page leaf enters from the left. Keep the old printed
    // page underneath until that incoming leaf has landed over it.
    cancelTurn();layoutReader(animate&&compact&&genre<previous?previous:genre);genreButtons();
    if(animate){void turnPage(previous,genre);}
  }
  async function turnPage(previous:number,next:number){
    const token=turnToken,forward=next>previous,pages=$$('.spread'),left=pages[Math.min(previous,next)],right=pages[Math.max(previous,next)];
    const source=pages[previous];
    if(compact){
      // The single-column reader keeps the same left-hand book spine.
      $('.leaf-front').replaceChildren(cloneInert(forward?source:pages[next]));$('.leaf-back').replaceChildren(cloneInert(forward?pages[next]:source));
      leaf.style.cssText=`display:block;left:0;top:0;width:${spreads.clientWidth}px;height:1220px;transform-origin:0 50%;`;
      turnAnimation=leaf.animate([{transform:`rotateY(${forward?0:-180}deg)`},{transform:`rotateY(${forward?-180:0}deg)`}],{duration:420,easing:'ease-in-out'});
    }else{
      // Forward: the old right page becomes the next left page. Reverse reuses
      // exactly those two printed faces, viewed from the opposite side.
      $('.leaf-front').replaceChildren(cloneInert(left.children[1]));$('.leaf-back').replaceChildren(cloneInert(right.children[0]));
      [left,right].forEach(n=>{n.style.display='grid';n.style.removeProperty('visibility');activate(n,true);n.inert=true;});
      left.style.clipPath='inset(0 50% 0 0)';right.style.clipPath='inset(0 0 0 50%)';
      leaf.style.cssText='display:block;left:0;top:0;width:460px;height:610px;transform-origin:0 50%;';
      turnAnimation=leaf.animate([{transform:`rotateY(${forward?0:-180}deg)`},{transform:`rotateY(${forward?-180:0}deg)`}],{duration:420,easing:'ease-in-out'});
    }
    leaf.style.setProperty('--turn-shade','.7');
    try{await turnAnimation.finished;}catch{}if(token!==turnToken||destroyed)return;
    turnAnimation.cancel();turnAnimation=null;layoutReader();
  }
  function navigate(target:'paper'|'bag'|'book'|'subscribe',opener:HTMLElement){
    if(target==='book'||target==='subscribe'){requestPeer(target==='book'?'handbook':'subscription',opener);return;}
    requestPeer(null);
    if(staticMode)({paper:newspaper,bag})[target].scrollIntoView({block:'start',behavior:'instant'});
    else if(target==='paper'){scrollTo({top:0,behavior:'instant'});renderScene();}
    else goProgress(compact?.43:.46);
  }

  // One native reading layer holds the original book and the original preview form.
  const reader=el('dialog','peer-reader') as HTMLDialogElement;
  reader.id='peer-reader';reader.setAttribute('aria-label','随身物件阅读层');
  const toolbar=el('div','peer-toolbar');
  toolbar.innerHTML='<span>HIKARI / 随身物件</span><button type="button" data-peer="handbook">手册</button><button type="button" data-peer="subscription">订阅单</button><button type="button" data-peer="planner">计划本</button><button type="button" data-close-peer aria-label="收回物件">收回包中 ×</button>';
  const surface=el('div','peer-surface');reader.append(toolbar,surface);journey.after(reader);
  const bookTrigger=el('button','peer-pull handbook-pull');
  bookTrigger.dataset.peer='handbook';bookTrigger.setAttribute('aria-label','从背包取出摄影手册');
  const slipTrigger=el('button','peer-pull subscription-pull');
  slipTrigger.dataset.peer='subscription';slipTrigger.setAttribute('aria-label','从背包取出订阅单');bag.append(bookTrigger,slipTrigger);
  const holder=Symbol('peer-reader');
  let currentObject:'handbook'|'subscription'|null=null, returnFocus:HTMLElement|null=null;
  let returnScroll=0, subscriptionScroll=0, handbookScroll=0,returnTarget:string|null=null;
  function phase(value:string){reader.dataset.phase=value;if(currentObject)(currentObject==='handbook'?book:slip).dataset.phase=value;}
  function dockObjects(){
    bag.append(book,slip);book.append(bookNav);
    book.classList.add('peer-docked');slip.classList.add('peer-docked');
    book.removeAttribute('style');slip.removeAttribute('style');cover.removeAttribute('style');
    book.style.setProperty('--book-open','0');book.dataset.open='0';
    spreads.style.clipPath='inset(0 0 0 50%)';cover.style.display='block';
    activate(book,false);activate(slip,false);bookNav.style.visibility='hidden';
    bookTrigger.hidden=false;slipTrigger.hidden=false;
    book.dataset.phase=slip.dataset.phase='docked';
  }
  function layoutReader(visibleGenre=genre){
    if(!reader.open)return;
    if(currentObject==='handbook'){
      $$('.spread').forEach((n,i)=>{n.style.display=compact||i===visibleGenre?'grid':'none';n.style.clipPath='none';activate(n,i===visibleGenre);});
      spreads.style.removeProperty('width');spreads.style.removeProperty('display');spreads.style.clipPath='none';
      leaf.style.display='none';bookNav.style.visibility='visible';if(compact)spreads.scrollLeft=visibleGenre*spreads.clientWidth;
      book.dataset.open='1';book.style.setProperty('--book-open','1');cover.style.transform='rotateY(-180deg)';
      cover.style.zIndex='0';genreButtons();
    }
  }
  async function openObject(value:'handbook'|'subscription',trigger:HTMLElement|null,immediate:boolean){
    if(destroyed)return;
    if(!immediate)returnScroll=scrollY;
    if(!immediate){if(staticMode)bag.scrollIntoView({block:'center',behavior:'instant'});else goProgress(compact?.43:.46);}
    const node=value==='handbook'?book:slip;
    returnFocus=trigger;
    if(trigger?.dataset.nav)returnTarget=`${trigger.closest('#newspaper')?'#newspaper':'.site-header'} [data-nav="${trigger.dataset.nav}"]`;
    else returnTarget=value==='handbook'?'.handbook-pull':'.subscription-pull';
    currentObject=value;phase('extracting');lockModalPage(holder);
    const lift=dockLift(node);
    await objectMotion(node,[{transform:lift.pose},{transform:lift.raised}],220,immediate||activePeer()!==value);
    if(destroyed)return;
    node.style.transform=lift.raised;
    const raised=node.getBoundingClientRect();
    node.classList.remove('peer-docked');node.removeAttribute('style');surface.append(node);if(value==='handbook')surface.append(bookNav);
    reader.dataset.object=value;reader.showModal();activate(node,true);
    (value==='handbook'?bookTrigger:slipTrigger).hidden=true;
    surface.scrollTop=0;layoutReader();
    if(value==='handbook'){if(!compact)$('.cover-back').replaceChildren(cloneInert($$('.spread',spreads)[genre].children[0]));cover.style.zIndex='8';cover.style.transform='rotateY(0deg)';book.style.setProperty('--book-open','0');spreads.style.clipPath='inset(0 0 0 50%)';}
    const to=node.getBoundingClientRect();
    phase('travelling');surface.inert=true;
    await objectMotion(node,[{transform:rectTransform(raised,to)},{transform:'none'}],260,immediate||activePeer()!==value);
    if(destroyed)return;
    phase('opening');
    if(value==='handbook'){
      book.style.setProperty('--book-open','1');spreads.style.clipPath='none';
      await Promise.all([objectMotion(cover,[{transform:'rotateY(0deg)'},{transform:'rotateY(-180deg)'}],280,immediate||activePeer()!==value),...['.shell-left','.paper-stack-left'].map(selector=>objectMotion($(selector,book),[{transform:'rotateY(180deg)'},{transform:'rotateY(0deg)'}],280,immediate||activePeer()!==value))]);
    }else await objectMotion(node,[{transform:'perspective(1200px) rotateX(-15deg)'},{transform:'none'}],220,immediate||activePeer()!==value);
    if(destroyed)return;
    layoutReader();phase('reading');surface.inert=false;
    surface.scrollTop=value==='handbook'?handbookScroll:subscriptionScroll;
    if(!immediate)(value==='handbook'?bookNav.querySelector<HTMLElement>('[aria-current]'):$<HTMLElement>('#place',slip))?.focus({preventScroll:true});
  }
  async function closeObject(immediate:boolean){
    if(destroyed||!currentObject)return;
    const value=currentObject,node=value==='handbook'?book:slip;
    if(value==='handbook')handbookScroll=surface.scrollTop;else subscriptionScroll=surface.scrollTop;
    cancelTurn();surface.inert=true;phase('opening');
    if(value==='handbook'){
      if(!compact){
        // Carry the current printed left page on the cover's inward face.
        // Clip its stationary copy before the first closing frame is painted.
        $('.cover-back').replaceChildren(cloneInert($$('.spread',spreads)[genre].children[0]));
        spreads.style.clipPath='inset(0 0 0 50%)';
      }
      cover.style.zIndex='8';bookNav.style.visibility='hidden';
      await Promise.all([objectMotion(cover,[{transform:'rotateY(-180deg)'},{transform:'rotateY(0deg)'}],240,immediate),...['.shell-left','.paper-stack-left'].map(selector=>objectMotion($(selector,book),[{transform:'rotateY(0deg)'},{transform:'rotateY(180deg)'}],240,immediate))]);
      if(destroyed)return;cover.style.zIndex='8';cover.style.transform='rotateY(0deg)';book.style.setProperty('--book-open','0');spreads.style.clipPath='inset(0 0 0 50%)';bookNav.style.visibility='hidden';
    }else await objectMotion(node,[{transform:'none'},{transform:'perspective(1200px) rotateX(-15deg)'}],180,immediate);
    const from=node.getBoundingClientRect();
    // Measure both real bag positions, with the source behind the same leather lip.
    const before=node.nextSibling;bag.append(node);node.classList.add('peer-docked');node.removeAttribute('style');
    const lift=dockLift(node);node.style.transform=lift.raised;const raised=node.getBoundingClientRect();
    node.classList.remove('peer-docked');node.removeAttribute('style');surface.insertBefore(node,before?.parentNode===surface?before:null);
    const to=node.getBoundingClientRect();
    phase('travelling');await objectMotion(node,[{transform:rectTransform(from,to)},{transform:rectTransform(raised,to)}],260,immediate);
    if(destroyed)return;
    reader.close();bag.append(node);node.classList.add('peer-docked');node.removeAttribute('style');node.style.transform=lift.raised;activate(node,false);
    phase('extracting');await objectMotion(node,[{transform:lift.raised},{transform:lift.pose}],220,immediate);
    if(destroyed)return;
    unlockModalPage(holder);currentObject=null;surface.inert=false;dockObjects();
    scrollTo({top:returnScroll,behavior:'instant'});
    renderScene();
    const fallback=value==='handbook'?bookTrigger:slipTrigger;
    const target=returnFocus?.isConnected?returnFocus:(returnTarget?document.querySelector<HTMLElement>(returnTarget):null);
    const focus=target?.getClientRects().length&&!target.closest('[inert]')?target:fallback;
    focus.focus({preventScroll:true});
    phase('docked');
  }
  const unregister=[registerPeer('handbook',{open:(trigger,instant)=>openObject('handbook',trigger,instant),close:closeObject}),registerPeer('subscription',{open:(trigger,instant)=>openObject('subscription',trigger,instant),close:closeObject})];
  on(window,'hikari:peer-dock' as 'scroll',()=>{if(staticMode)bag.scrollIntoView({block:'center',behavior:'instant'});else goProgress(compact?.43:.46);});
  const unbindPaper=bindPaperGestures(spreads,delta=>{if(!reader.open||currentObject!=='handbook'||reader.dataset.phase!=='reading'||turnAnimation||genre+delta<0||genre+delta>2)return false;goGenre(genre+delta);return true;});
  on(document,'keydown',event=>{if(event.key==='Escape'&&currentObject&&!reader.open){event.preventDefault();requestPeer(null);}});
  on(reader,'cancel',event=>{event.preventDefault();requestPeer(null);});
  on(reader,'click',event=>{
    if(!currentObject||reader.dataset.phase!=='reading')return;
    const target=event.target;
    const content=currentObject==='handbook'?'.handbook,.book-nav':'.subscription';
    if(target instanceof Element&&!target.closest(content))requestPeer(null);
  });
  on(toolbar,'click',event=>{const target=(event.target as Element).closest<HTMLElement>('[data-peer],[data-close-peer]');if(target)requestPeer(target.dataset.peer as PeerObject??null,target);});
  on(bag,'click',event=>{const target=(event.target as Element).closest<HTMLElement>('[data-peer]');if(target)requestPeer(target.dataset.peer as PeerObject,target);});

  const sourceDialog=$<HTMLDialogElement>('#source-record');
  let sourceOpener:HTMLElement|null=null,sourceParentTop=0;
  function closeSourceRecord(restore=true){
    const button=sourceOpener;sourceOpener=null;
    if(sourceDialog.open)sourceDialog.close();
    const parent=$<HTMLDialogElement>('#detail');
    if(restore&&!destroyed&&parent.open&&button?.isConnected){button.focus({preventScroll:true});parent.scrollTop=sourceParentTop;}
  }
  function openSourceRecord(button:HTMLElement){
    const index=Number(button.dataset.sourceRecord);
    if(!$<HTMLDialogElement>('#detail').open||!Number.isInteger(index)||!briefing.sources[index])return;
    sourceOpener=button;sourceParentTop=$<HTMLDialogElement>('#detail').scrollTop;
    $('#source-record-body').innerHTML=sourceRecordHtml(briefing,index);
    $('#source-record-body h2').id='source-record-title';
    sourceDialog.showModal();sourceDialog.scrollTop=0;$('#close-source-record').focus({preventScroll:true});
  }
  on($('#close-source-record'),'click',()=>closeSourceRecord());
  on(sourceDialog,'cancel',event=>{event.preventDefault();closeSourceRecord();});
  on(sourceDialog,'close',()=>{if(!sourceDialog.open&&sourceOpener)closeSourceRecord();});
  on(sourceDialog,'click',event=>{
    if(event.target!==sourceDialog)return;
    const r=sourceDialog.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeSourceRecord();
  });
  on(sourceDialog,'keydown',event=>{
    if(event.key!=='Tab')return;
    const controls=$$('button,a[href]',sourceDialog).filter(n=>n.getClientRects().length);
    const first=controls[0],last=controls[controls.length-1];
    if((event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last)){event.preventDefault();(event.shiftKey?last:first).focus();}
  });
  const hourDialog=$<HTMLDialogElement>('#hour-detail');
  let hourReturn:{button:HTMLElement;top:number;left:number;scrollTop:number}|null=null;
  function closeHourDetail(restore=true){
    const saved=hourReturn;hourReturn=null;
    if(hourDialog.open)hourDialog.close();
    const parent=$<HTMLDialogElement>('#detail');
    if(restore&&!destroyed&&parent.open&&saved?.button.isConnected){
      saved.button.focus({preventScroll:true});parent.scrollTop=saved.top;
      const region=$('.hours-scroll',parent);region.scrollLeft=saved.left;region.scrollTop=saved.scrollTop;
    }
  }
  function openHourDetail(button:HTMLElement){
    const index=Number(button.dataset.hourDetail),parent=$<HTMLDialogElement>('#detail');
    if(!parent.open||activeDetail!=='hours'||!Number.isInteger(index)||index<0||index>=briefing.hours.length)return;
    const region=$('.hours-scroll',parent);
    hourReturn={button,top:parent.scrollTop,left:region.scrollLeft,scrollTop:region.scrollTop};
    $('#hour-detail-body').innerHTML=hourDetailHtml(briefing,index);
    hourDialog.showModal();hourDialog.scrollTop=0;$('#close-hour-detail').focus({preventScroll:true});
  }
  on($('#close-hour-detail'),'click',()=>closeHourDetail());
  on(hourDialog,'cancel',event=>{event.preventDefault();closeHourDetail();});
  on(hourDialog,'close',()=>{if(!hourDialog.open&&hourReturn)closeHourDetail();});
  on(hourDialog,'keydown',event=>{
    // This dialog has one control; keep Tab within the topmost modal.
    if(event.key==='Tab'){event.preventDefault();$('#close-hour-detail').focus({preventScroll:true});}
  });
  on(hourDialog,'click',event=>{
    if(event.target!==hourDialog)return;
    const r=hourDialog.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeHourDetail();
  });
  let sourceGroup:SourceGroup='weather', sourceFilter=false;
  type SourcePosition={html:string;top:number;left:number;focus:string;label:string};
  let sourceOverview:SourcePosition|null=null,sourceTable:SourcePosition|null=null;
  const sourcePositions=new Map<string,SourcePosition>();
  function sourcePosition(button:HTMLElement):SourcePosition {
    const dialog=$<HTMLDialogElement>('#detail');
    const token=`source-return-${Date.now()}`;button.id=token;
    return {html:$('#detail-body').innerHTML,top:dialog.scrollTop,left:dialog.querySelector('.source-table-scroll')?.scrollLeft??0,focus:token,label:$('#detail .dialog-top span').textContent??''};
  }
  function showSource(html:string,label='24 小时数据表'){
    $('#detail-body').innerHTML=html;
    $('#detail .dialog-top span').textContent=`逐光 · ${label}`;
    const heading=$('#detail-body h2');heading.id='detail-title';heading.setAttribute('tabindex','-1');
    $<HTMLDialogElement>('#detail').scrollTop=0;heading.focus({preventScroll:true});
  }
  function restoreSource(saved:SourcePosition|null){
    if(!saved)return;
    $('#detail-body').innerHTML=saved.html;
    $('#detail .dialog-top span').textContent=saved.label;
    const button=document.getElementById(saved.focus);button?.focus({preventScroll:true});
    const region=$<HTMLDialogElement>('#detail').querySelector('.source-table-scroll');if(region)region.scrollLeft=saved.left;
    $<HTMLDialogElement>('#detail').scrollTop=saved.top;pinSourceHeader();
  }
  function pinSourceHeader(){
    const dialog=$<HTMLDialogElement>('#detail'),table=dialog.querySelector<HTMLTableElement>('.source-data .source-table');
    if(!table?.tHead)return;
    const top=table.getBoundingClientRect().top+(table.caption?.offsetHeight??0);
    const offset=Math.max(0,Math.min(dialog.getBoundingClientRect().top-top,table.offsetHeight-table.tHead.offsetHeight-(table.caption?.offsetHeight??0)));
    for(const cell of table.tHead.querySelectorAll<HTMLElement>('th'))cell.style.transform=`translateY(${offset}px)`;
  }
  on($<HTMLDialogElement>('#detail'),'scroll',pinSourceHeader,{passive:true});
  function renderSourceTable(){showSource(sourceTableHtml(briefing,sourceGroup,sourceFilter,hour));}

  function sourceAction(target:Element){
    const button=target.closest<HTMLElement>('[data-source-table],[data-source-jump],[data-source-group],[data-source-filter],[data-source-locate],[data-source-cell],[data-source-back]');
    if(!button||!$<HTMLDialogElement>('#detail').open||!$('#detail-body').contains(button))return false;
    if(button.hasAttribute('data-source-table')||button.hasAttribute('data-source-jump')){
      sourceOverview=sourcePosition(button);sourceGroup='weather';sourceFilter=false;
      const key=button.dataset.sourceJump as FieldKey|undefined;
      if(key&&fieldKeys.includes(key))sourceGroup=groupFor(key);
      renderSourceTable();
      if(key){const cell=$<HTMLElement>(`[data-source-cell="${key}"][data-source-hour="${button.dataset.sourceHour}"]`);cell.focus();}
    }else if(button.dataset.sourceGroup&&sourceGroups.some(g=>g.id===button.dataset.sourceGroup)){
      sourcePositions.set(`${sourceGroup}:${sourceFilter}`,sourcePosition(button));
      sourceGroup=button.dataset.sourceGroup as SourceGroup;
      const saved=sourcePositions.get(`${sourceGroup}:${sourceFilter}`);
      if(saved)restoreSource(saved);else renderSourceTable();
      $(`[data-source-group="${sourceGroup}"]`).focus({preventScroll:true});
    }else if(button.hasAttribute('data-source-filter')){
      sourceFilter=!sourceFilter;renderSourceTable();$('[data-source-filter]').focus({preventScroll:true});
    }else if(button.hasAttribute('data-source-locate')){
      if(sourceFilter){sourceFilter=false;renderSourceTable();}
      const row=$(`[data-source-row="${hour}"]`);row.scrollIntoView({block:'center',behavior:'instant'});const cell=row.querySelector<HTMLElement>('button');cell?.focus({preventScroll:true});
    }else if(button.dataset.sourceCell){
      const key=button.dataset.sourceCell as FieldKey|'light',index=Number(button.dataset.sourceHour);
      if((key==='light'||fieldKeys.includes(key))&&Number.isInteger(index)&&index>=0&&index<24){sourceTable=sourcePosition(button);showSource(sourceMetricHtml(briefing,index,key),key==='light'?'光线依据':'指标依据');}
    }else if(button.dataset.sourceBack==='table')restoreSource(sourceTable);
    else if(button.dataset.sourceBack==='overview')restoreSource(sourceOverview);
    return true;
  }
  function renderDetail(kind:string){
    closeSourceRecord(false);
    closeHourDetail(false);
    const labels:Record<string,string>={overview:'天气概览',sources:'数据与出处',sunset:'晚霞判断',hours:'24 小时明细',wind:'风温湿说明',direction:'太阳位置说明',light:'光线说明',weather:'天色与空气说明','advice-landscape':'风光建议','advice-portrait':'人像建议','advice-street':'街拍建议'};
    $('#detail .dialog-top span').textContent=`逐光 · ${labels[kind]??'详情'}`;
    const content=el('div','dialog-content');
    // detailHtml escapes all data; it contains no user-authored markup.
    content.innerHTML=detailHtml(briefing,kind,hour,advice);
    const heading=content.querySelector('h2'); if(heading)heading.id='detail-title';
    if(['wind','direction','light','weather'].includes(kind)){
      content.classList.add('device-detail');
      const copy=cloneInert($(`[data-device="${kind}"]`));copy.removeAttribute('data-device');
      const art=el('div','detail-art');art.append(copy);
      const column=el('div');while(content.firstChild)column.append(content.firstChild);
      content.append(art,column);
    }
    $('#detail-body').replaceChildren(content);
  }
  function openDetail(kind:string,button:HTMLElement){
    const dialog=$<HTMLDialogElement>('#detail');
    // An in-dialog source link replaces only the content. Retain the connected
    // instrument opener so Escape returns to the instrument after this switch.
    if(!dialog.open){opener=button;button.focus({preventScroll:true});}
    sourceOverview=null;sourceTable=null;sourcePositions.clear();sourceGroup='weather';sourceFilter=false;
    activeDetail=kind;renderDetail(kind);
    if(!dialog.open)dialog.showModal();
    dialog.scrollTop=0;$('#close-detail').focus();
  }
  on($('#close-detail'),'click',()=>$<HTMLDialogElement>('#detail').close());
  on($<HTMLDialogElement>('#detail'),'keydown',event=>{
    if(event.key!=='Tab')return;
    const focusable=$$('button,a[href],input,select,textarea,summary,[tabindex]', $<HTMLDialogElement>('#detail')).filter(n=>n.tabIndex>=0&&!n.hasAttribute('disabled')&&!n.closest('[inert]')&&n.getClientRects().length);
    const first=focusable[0],last=focusable[focusable.length-1];
    if((event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last)){
      event.preventDefault();(event.shiftKey?last:first)?.focus();
    }
  });
  on($<HTMLDialogElement>('#detail'),'close',()=>{
    // Native close restores focus before this queued event. Do not let an old close
    // steal a subsequent intentional focus or clear a newly opened instrument.
    if($<HTMLDialogElement>('#detail').open)return;
    closeHourDetail(false);
    closeSourceRecord(false);
    activeDetail='';
    const needsReturn=document.activeElement===document.body||$<HTMLDialogElement>('#detail').contains(document.activeElement);
    if(needsReturn&&opener?.isConnected&&!opener.closest('[inert]'))opener.focus({preventScroll:true});
  });
  on($<HTMLDialogElement>('#detail'),'click',e=>{if(e.target===$<HTMLDialogElement>('#detail')){const r=$<HTMLDialogElement>('#detail').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$<HTMLDialogElement>('#detail').close();}});
  on(document,'click',e=>{
    if(!(e.target instanceof Element))return;
    const sourceRecord=e.target.closest<HTMLElement>('[data-source-record]');
    if(sourceRecord){openSourceRecord(sourceRecord);return;}
    if(sourceAction(e.target))return;
    const hourly=e.target.closest<HTMLElement>('[data-hour-detail]');
    if(hourly){openHourDetail(hourly);return;}
    const detail=e.target.closest<HTMLElement>('[data-detail]'), device=e.target.closest<HTMLElement>('[data-device]'),nav=e.target.closest<HTMLElement>('[data-nav]'),gn=e.target.closest<HTMLElement>('button[data-genre]');
    if(detail)openDetail(detail.dataset.detail!,detail);
    else if(device)openDetail(device.dataset.device!,device);
    else if(nav){e.preventDefault();navigate(nav.dataset.nav as 'paper'|'bag'|'book'|'subscribe',nav);}
    else if(gn)goGenre(Number(gn.dataset.genre));
  });
  on($('#prev-page'),'click',()=>goGenre(genre-1));on($('#next-page'),'click',()=>goGenre(genre+1));
  on(spreads,'scroll',()=>{if(turnAnimation||!compact||!reader.open||currentObject!=='handbook'||!spreads.clientWidth)return;const selected=clamp(Math.round(spreads.scrollLeft/spreads.clientWidth),0,2);if(selected!==genre){genre=selected;lastPublishedGenre=genre;onGenre(genre);$$('.spread').forEach((n,i)=>activate(n,i===genre));genreButtons();}},{passive:true});
  on($('#motion-toggle'),'click',()=>{staticMode=!staticMode;setupMode();});
  on(compactQuery,'change',scheduleResize);
  on(reducedQuery,'change',()=>{staticMode=reducedQuery.matches;setupMode();});
  function scheduleScene(){if(!destroyed&&!framePending&&!resizeAnchor){framePending=true;rafId=requestAnimationFrame(renderScene);}}
  on(window,'scroll',scheduleScene,{passive:true});
  let resizeTimer:ReturnType<typeof setTimeout> | undefined;
  function scheduleResize(){resizeAnchor??={p:progress,reading:paperReadingFraction};clearTimeout(resizeTimer);resizeTimer=setTimeout(setupMode,100);}
  on(window,'resize',scheduleResize);

  const form=$<HTMLFormElement>('#subscription');
  on(form,'submit',e=>{
    e.preventDefault();const place=$<HTMLInputElement>('#place').value.trim();
    $<HTMLInputElement>('#place').setCustomValidity(place?'':'请填写关注地点。');if(!form.reportValidity())return;
    const slot=$<HTMLInputElement>('input[name="slot"]:checked',form).value;
    if(!['07:00','12:00'].includes(slot))return;
    $('#registration-text').textContent=`${place} · ${slot} 北京时间 / 简报摘要与对应地点网页入口的界面预览`;
    $('#registration').hidden=false;$('#subscription-status').textContent='';scheduleScene();
  });
  on($<HTMLInputElement>('#place'),'input',()=>$<HTMLInputElement>('#place').setCustomValidity(''));
  on($('#edit-preview'),'click',()=>{$('#registration').hidden=true;$('#subscription-status').textContent='可调整地点与时段，再预览。';$<HTMLInputElement>('#place').focus();scheduleScene();});
  on($('#stop-preview'),'click',()=>{$('#registration').hidden=true;$('#registration-text').textContent='';$('#subscription-status').textContent='已停止本次预览。';$('button[type="submit"]',form).focus();scheduleScene();});

  renderHours();renderReadings();setupMode();
  lastPublishedGenre=initialGenre; genre=initialGenre;
  // Measurement never publishes the initial landscape frame over a URL genre.
  goGenre(initialGenre,false);
  on(window,'load',()=>{if(!staticMode){buildFolds();measurePaperStart();renderScene();}});
  return {
    isStatic(){return staticMode;},
    selectHour(value:number){hour=value;renderReadings();},
    selectGenre(value:number){if(value!==lastPublishedGenre){lastPublishedGenre=value;goGenre(value,false);}},
    snapshot():ObjectSnapshot{return {activeObject:activePeer(),genre,place:$<HTMLInputElement>('#place').value,slot:$<HTMLInputElement>('input[name="slot"]:checked',slip).value,preview:!$('#registration').hidden,previewText:$('#registration-text').textContent??'',status:$('#subscription-status').textContent??'',returnScroll,returnTarget,handbookScroll:currentObject==='handbook'?surface.scrollTop:handbookScroll,subscriptionScroll:currentObject==='subscription'?surface.scrollTop:subscriptionScroll};},
    restore(saved:ObjectSnapshot){
      genre=saved.genre;goGenre(genre,false);$<HTMLInputElement>('#place').value=saved.place;
      const radio=slip.querySelector<HTMLInputElement>(`input[name="slot"][value="${saved.slot}"]`);if(radio)radio.checked=true;
      $('#registration').hidden=!saved.preview;$('#registration-text').textContent=saved.previewText;$('#subscription-status').textContent=saved.status;
      returnScroll=saved.returnScroll;returnTarget=saved.returnTarget;handbookScroll=saved.handbookScroll;subscriptionScroll=saved.subscriptionScroll;
      if(saved.activeObject==='handbook'||saved.activeObject==='subscription')requestPeer(saved.activeObject,saved.returnTarget?document.querySelector<HTMLElement>(saved.returnTarget):null,true);
    },
    destroy(){destroyed=true;cancelTurn();unbindPaper();unregister.forEach(fn=>fn());forgetPeer('handbook');forgetPeer('subscription');closeSourceRecord(false);closeHourDetail(false);endDialGesture();scope.abort();clearTimeout(resizeTimer);if(rafId)cancelAnimationFrame(rafId);[...reader.getAnimations({subtree:true}),...book.getAnimations(),...slip.getAnimations()].forEach(a=>a.cancel());reader.close();unlockModalPage(holder);reader.remove();const dialog=$<HTMLDialogElement>('#detail');if(dialog.open)dialog.close();pocketPaper.remove();document.body.classList.remove('compact','flow-paper','peer-objects','bag-footer-visible');document.body.classList.add('static');}
  };
}
export type ObjectSnapshot={activeObject:PeerObject|null;genre:number;place:string;slot:string;preview:boolean;previewText:string;status:string;returnScroll:number;returnTarget:string|null;handbookScroll:number;subscriptionScroll:number};
