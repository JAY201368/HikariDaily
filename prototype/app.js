'use strict';
(() => {
  const F = window.HIKARI, S = window.HIKARI_SOLAR;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const range = (p, a, b) => clamp((p - a) / (b - a));
  const ease = t => t * t * (3 - 2 * t);
  const mix = (a, b, t) => a + (b - a) * t;
  const compactQuery = matchMedia('(max-width:1099px), (max-height:819px)');
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let compact = compactQuery.matches, staticMode = reducedQuery.matches, hour = 16, state = 'ok', genre = 0;
  let opener = null, activeDetail = '', framePending = false, paperHeight = 760, progress = 0;
  const newspaper = $('#newspaper'), paperObject = $('#paper-object'), folding = $('#folding');
  const watch = $('.pocket-watch');
  const bag = $('#instruments'), front = $('#bag-front'), book = $('#handbook'), bookNav = $('#book-nav');
  const spreads = $('#spreads'), cover = $('#book-cover'), leaf = $('#turn-leaf'), journey = $('#journey');
  const mobileHome = $('#mobile-paper-home');
  const mobileBookHome = el('div', 'mobile-book-home');
  mobileBookHome.id = 'mobile-book-home';
  journey.after(mobileBookHome);
  const mobileReader = el('div', 'mobile-book-reader');
  mobileBookHome.append(mobileReader);
  const slip = $('#subscription'), slipHome = $('#slip-home'), subscribe = $('#subscribe');
  const intro = $('.subscribe-intro'), introHome = $('.intro-home');
  const discovery = el('div', 'discovery-page');
  const extraLeaf = el('div', 'discovery-leaf');
  const extraFront = el('div', 'discovery-front'), extraBack = el('div', 'discovery-back');
  extraLeaf.append(extraFront,extraBack);
  [discovery,extraLeaf].forEach(n=>{n.setAttribute('aria-hidden','true');n.inert=true;subscribe.prepend(n);});
  let extraSource = null;
  let readingDistance = 0, slipStart = 0, slipEnd = 0, mobileBase = 1450;
  let compactChoice = 0;
  const pocketBook = el('div', 'static-pocket-book');
  pocketBook.setAttribute('aria-hidden', 'true'); pocketBook.inert = true;
  bag.append(pocketBook);
  const pocketPaper = foldBack();
  pocketPaper.classList.add('static-pocket-paper');
  pocketPaper.setAttribute('aria-hidden','true'); pocketPaper.inert = true;
  bag.append(pocketPaper);

  function foldBack() {
    return el('div','lower-back');
  }
  function cloneInert(node) {
    const clone = node.cloneNode(true);
    [clone, ...$$('*', clone)].forEach(n => {
      n.removeAttribute('id'); n.removeAttribute('for'); n.removeAttribute('aria-labelledby');
      if (n.matches('button,a,input,select,textarea,[tabindex]')) n.setAttribute('tabindex', '-1');
    });
    clone.setAttribute('aria-hidden', 'true'); clone.inert = true;
    return clone;
  }
  function activate(node, yes) {
    node.inert = !yes;
    node.setAttribute('aria-hidden', String(!yes));
  }
  function text(selector, value) { $$(selector).forEach(n => { n.textContent = value; }); }
  function metric(value, suffix = '') { return value === null || value === undefined ? '—' : `${value}${suffix}`; }
  function selected() {
    const row = { ...F.hours[hour] };
    if (state === 'missing') { row.wind = null; row.gust = null; row.cloud = null; row.pm10 = null; row.visibility = null; row.low = null; }
    return row;
  }
  function opportunity() {
    if (state === 'missing') return '暂无法判断';
    if (state === 'stale' || state === 'conflict') return '3 / 5 · 一般';
    return '4 / 5 · 较高';
  }
  function stateNote() {
    if (state === 'missing') return '缺失演示：风、总云、PM10、能见度与低云暂无数据（PM2.5 独立保留）；晚霞必要输入不足。';
    if (state === 'stale') return '旧数据演示：最后获取 13:00，相对样例 15:20 已旧 2 小时 20 分；晚霞限至三级。';
    if (state === 'conflict') return `来源分歧演示：${F.hours[hour].time} 总云 A ${F.hours[hour].cloud}% / B ${Math.max(0,F.hours[hour].cloud-35)}%；不平均。日落小时 A 65% / B 30%，晚霞限至三级。`;
    return '固定样例 15:20 更新；无真实请求。';
  }
  function renderHours() {
    [6,9,12,14,16,17,18,21].forEach(h => {
      const d = F.hours[h], tr = el('tr'); tr.dataset.hour = h;
      [String(h).padStart(2,'0'),d.temperature,d.cloud,d.rain].forEach(v => tr.append(el('td','',String(v))));
      $('#news-hours').append(tr);
    });
    const svg = $('.dial-marks'), ns = 'http://www.w3.org/2000/svg';
    for (let h = 0; h < 24; h++) {
      const angle = h * Math.PI / 12, major = h % 6 === 0;
      const tick = document.createElementNS(ns, 'line');
      const point = r => [120 + Math.sin(angle) * r, 120 - Math.cos(angle) * r];
      const a = point(major ? 99 : 103), b = point(110);
      ['x1','y1','x2','y2'].forEach((key,i) => tick.setAttribute(key, [...a,...b][i]));
      tick.setAttribute('class', major ? 'major-tick' : 'minor-tick');
      const label = document.createElementNS(ns, 'text'), at = point(85);
      label.setAttribute('x', at[0]); label.setAttribute('y', at[1]);
      label.setAttribute('class', major ? 'major-hour' : 'minor-hour');
      label.textContent = String(h).padStart(2,'0'); svg.append(tick,label);
    }
  }
  function setHour(h) {
    hour = ((Math.round(Number(h)) % 24) + 24) % 24;
    renderReadings();
  }
  const dial = $('#hour-dial');
  let dialPointer = null;
  function selectDialPoint(event) {
    // Rendered local coordinates, never unscaled scene offsets (also handles resize).
    const rect = dial.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - .5;
    const y = (event.clientY - rect.top) / rect.height - .5;
    if (Math.hypot(x,y) < .09) return; // A press on the pivot has no defined angle.
    setHour(Math.atan2(x,-y) * 12 / Math.PI);
  }
  function endDialGesture(event) {
    if (dialPointer === null || (event && event.pointerId !== dialPointer)) return;
    const id = dialPointer; dialPointer = null;
    dial.classList.remove('dragging');
    if (dial.hasPointerCapture(id)) dial.releasePointerCapture(id);
  }
  dial.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || dialPointer !== null) return;
    dialPointer = event.pointerId; dial.setPointerCapture(dialPointer);
    dial.focus({preventScroll:true}); dial.classList.add('dragging');
    selectDialPoint(event); event.preventDefault();
  });
  dial.addEventListener('pointermove', event => { if (event.pointerId === dialPointer) selectDialPoint(event); });
  ['pointerup','pointercancel','lostpointercapture'].forEach(type => dial.addEventListener(type,endDialGesture));
  addEventListener('blur', () => endDialGesture());
  dial.addEventListener('keydown', event => {
    const change = {ArrowRight:1,ArrowUp:1,ArrowLeft:-1,ArrowDown:-1}[event.key];
    if (change) { event.preventDefault(); setHour(hour + change); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); setHour(event.key === 'Home' ? 0 : 23); }
  });
  $('#prev-hour').addEventListener('click', () => setHour(hour - 1));
  $('#next-hour').addEventListener('click', () => setHour(hour + 1));
  function renderReadings() {
    const d = selected();
    text('.selected-time',d.time);
    ['wind','gust','temperature','humidity','cloud','rain','visibility','aqi','pm25','pm10'].forEach(k => text(`[data-value="${k}"]`,metric(d[k])));
    ['azimuth','altitude'].forEach(k=>text(`[data-value="${k}"]`,d[k].toFixed(1)));
    text('[data-value="stage"]',S.stage(d.altitude,hour*60));
    text('[data-value="light"]',S.light(d.altitude,d.cloud));
    text('.card-source',`天气预报样例 · AQI: US EPA / CAMS · ${state==='stale'?'13:00 旧样例':'15:20 样例更新'}`);
    $$('.sun-dial').forEach(n=>n.style.setProperty('--sun-angle',`${d.azimuth}deg`));
    text('.opportunity',opportunity());
    const reasons = state === 'missing' ? '日落小时能见度与低云缺失；保留天文时刻，不以最低等级代替未知。' : state === 'stale' ? '日落依据使用 13:00 取得的旧样例；原条件四级，时效限制后为三级。' : state === 'conflict' ? '日落小时总云样例 A 65% / B 30%，差异 35 个百分点；保留分歧，限至三级。' : '日落小时低云 50%、中云 50%、高云 20%；能见度 15 km，小时降水 0 mm。';
    text('.sunset-reason',reasons);
    $('#weather-index').textContent = `${d.time} · ${d.temperature}°C / 湿度 ${d.humidity}% · 风 ${metric(d.wind,' m/s')}，阵风 ${metric(d.gust,' m/s')}`;
    $('#condition-index').textContent = `云 ${metric(d.cloud,'%')} · 雨 ${metric(d.rain,' mm')} · 能见度 ${metric(d.visibility,' km')} · 参考 AQI ${metric(d.aqi)}（US EPA / CAMS）；PM2.5 ${metric(d.pm25)} / PM10 ${metric(d.pm10)} μg/m³`;
    $('#solar-index').textContent = `计算太阳：${d.azimuth.toFixed(1)}° / 高度 ${d.altitude.toFixed(1)}° · ${S.stage(d.altitude,hour*60)}。北0°顺时针；非设备朝向。`;
    $('#light-index').textContent = `${S.light(d.altitude,d.cloud)} · 非现场测光。蓝调−6°至−4° / 金调−4°至+6°；云可遮挡光效。`;
    $('#hour-note').textContent = d.note;
    $('#state-note').textContent = stateNote();
    dial.setAttribute('aria-valuenow', String(hour));
    dial.setAttribute('aria-valuetext', `${d.time}，北京时间，固定演示`);
    dial.style.setProperty('--hour-angle', `${hour * 15}deg`);
    $$('#spreads>.spread').forEach((spread,i)=>{
      const warning=state==='missing'?'条件缺失 · 建议样张':state==='stale'?'旧数据 · 需重新复核':state==='conflict'?'来源分歧 · 需现场复核':'上海 · 10.21';
      $('.page-running span:last-child',spread).textContent=warning;
      $('.window small',spread).textContent=state==='missing'?'以下为完整夹具的窗口，当前不作推荐。':F.genres[i].secondary;
    });
    const labels = {
      wind:`风温湿仪，${d.time}，平均风 ${metric(d.wind,' m/s')}，温度 ${d.temperature} 摄氏度，湿度 ${d.humidity}%，打开说明`,
      direction:`太阳方位仪，${d.time}，计算方位 ${d.azimuth.toFixed(1)} 度，高度 ${d.altitude.toFixed(1)} 度，${S.stage(d.altitude,hour*60)}，非设备朝向，打开说明`,
      light:`经典测光表意象，${d.time}，${S.light(d.altitude,d.cloud)}，${S.stage(d.altitude,hour*60)}，预报解释，打开说明`,
      weather:`气象记录卡，${d.time}，云 ${metric(d.cloud,'%')}，雨 ${metric(d.rain,' mm')}，能见度 ${metric(d.visibility,' km')}，参考 AQI ${metric(d.aqi)} US EPA CAMS，PM2.5 ${metric(d.pm25)}，PM10 ${metric(d.pm10)} 微克每立方米，打开说明`
    };
    $$('[data-device]').forEach(b => b.setAttribute('aria-label',`${labels[b.dataset.device]}，${b.dataset.maker} ${b.dataset.model}，主人刻字 ${b.dataset.owner}`));
    if ($('#detail').open && activeDetail) renderDetail(activeDetail);
  }

  function diagram(kind) {
    const figure = el('figure','diagram');
    // Authored static SVG only. No user or fixture strings are interpolated into markup.
    const art = {
      horizon:'<path d="M15 143H355M20 151H350M40 143V116H72V143M260 143V102H284V143"/><path d="M40 143Q185-45 330 143" stroke-dasharray="4 5" opacity=".4"/><path d="M192 65H273M214 50H300M78 82H146" stroke="#943b2d" stroke-width="6" stroke-linecap="round"/><circle cx="301" cy="115" r="15" fill="#d7b33e"/><path d="M285 126L193 145M283 116L100 132" stroke="#943b2d" stroke-dasharray="4 4"/><text x="19" y="175">东</text><text x="319" y="175">西 · 日落</text><text x="126" y="25">本地云层 ≠ 远方光路</text>',
      portrait:'<circle cx="183" cy="78" r="28"/><path d="M183 106V148M183 121L145 144M183 121L217 144M169 148L157 171M193 148L204 171"/><circle cx="303" cy="43" r="20" fill="#d7b33e"/><path d="M279 61L211 88M271 44L211 65M284 76L219 112" stroke="#943b2d" stroke-dasharray="5 4"/><path d="M57 41L91 148H126L91 41Z" fill="#27251f" opacity=".12"/><text x="24" y="24">开放阴影 · 柔光备选</text><text x="226" y="174">太阳可见时再用侧逆光</text>',
      street:'<path d="M28 20V150H345M64 20V118H131V20M181 20V90H235V20M290 20V125H333V20"/><path d="M131 118L216 164H162L64 118M235 90L340 144H301L181 90" fill="#27251f" opacity=".15"/><circle cx="172" cy="104" r="9"/><path d="M172 113V139M172 120L159 130M172 120L187 129M172 138L163 153M172 138L183 153"/><path d="M41 171L308 171" stroke="#943b2d" stroke-dasharray="4 5"/><text x="31" y="193">云隙直射出现时，等主体走入亮处</text>'
    };
    figure.innerHTML = `<svg viewBox="0 0 370 205" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><g>${art[kind]}</g><style>text{font:11px sans-serif;fill:#686355;stroke:none}</style></svg>`;
    figure.append(el('figcaption','',kind === 'horizon' ? '方向关系示意，非现场机位或完整太阳光路验证。' : kind === 'portrait' ? '受光关系示意；光的软硬仍取决于现场云层。' : '条件性构图示意，不预设每个街口都有长影。'));
    return figure;
  }
  function renderBook() {
    F.genres.forEach((g,i) => {
      const spread = el('article','spread'); spread.dataset.genre = i;
      spread.setAttribute('aria-label',`${g.name}，当天摄影建议`);
      const left = el('section','book-page');
      const running = el('div','page-running'); running.append(el('span','','逐光 / 外拍手册'),el('span','','上海 · 10.21'));
      left.append(running);
      const heading = el('div','genre-heading'); heading.append(el('b','',`0${i+1}`));
      const title = el('div'); title.append(el('h2','',g.name),el('span','',g.english)); heading.append(title); left.append(heading,el('h3','',g.title));
      const win = el('div','window',g.window); win.append(el('small','',g.secondary)); left.append(win,el('p','genre-reason',g.reason));
      const list = el('ol','plan');
      g.steps.forEach(([time,name,copy]) => { const li = el('li'), block = el('div'); block.append(el('strong','',name),el('p','',copy));li.append(el('time','',time),block);list.append(li); });
      left.append(list);
      const pageNum = el('div','page-number');pageNum.append(el('span','','当天建议 · 不随所选小时改写'),el('span','',String(i*2+1).padStart(2,'0')));left.append(pageNum);
      const right = el('section','book-page'); const r = el('div','page-running');r.append(el('span','','看光的方法'),el('span','','FIELD NOTES'));right.append(r,diagram(g.diagram),el('div','film-heading','胶片的性格 / 不是曝光答案'));
      const film = el('div','film-row'), copy = el('div');copy.append(el('strong','',g.film),el('p','',g.filmNote));film.append(el('div','film-can',i===2?'B&W':'COLOR'),copy);right.append(film);
      const limit = el('p','genre-limit');limit.append(el('b','','现场复核 / '),document.createTextNode(g.limit));right.append(limit);
      const rn = el('div','page-number');rn.append(el('span','','通用胶片类别 · 无商品推荐'),el('span','',String(i*2+2).padStart(2,'0')));right.append(rn);
      spread.append(left,right);spreads.append(spread);
    });
    $('.cover-back').replaceChildren(cloneInert($('.spread .book-page')));
    pocketBook.replaceChildren(cloneInert($('.cover-front')));
  }

  function buildFolds() {
    folding.replaceChildren();
    const bounds = newspaper.getBoundingClientRect();
    paperHeight = compact ? bounds.height : 760;
    const width = compact ? bounds.width : 1120;
    paperObject.style.width = `${width}px`; paperObject.style.height = `${paperHeight}px`;
    paperObject.style.left = compact ? `${($('#world').clientWidth - width) / 2}px` : '0px';
    folding.style.setProperty('--fold-paper-width', `${width}px`);
    folding.style.setProperty('--fold-paper-height', `${paperHeight}px`);
    ['upper','lower'].forEach((name,row) => {
      const group = el('div',`fold-row ${name}`);
      [0,1].forEach(col => {
        const panel = el('div',`fold-panel ${col ? 'right' : 'left'}`), face = el('div','fold-face front'), back = el('div','fold-face back');
        const clone = cloneInert(newspaper);clone.style.left = `${-col*width/2}px`;clone.style.top = `${-row*paperHeight/2}px`;
        face.append(clone);
        panel.append(face,back);group.append(panel);
      });
      if (row) group.append(foldBack());
      folding.append(group);
    });
  }

  function setupMode() {
    endDialGesture();
    // Keep the same form DOM and the last horizontally chosen genre across reflow.
    if (compact && spreads.clientWidth && spreads.scrollLeft > 0) compactChoice = genre;
    compact = compactQuery.matches;
    slip.removeAttribute('style'); slipHome.style.height = '';
    discovery.hidden = extraLeaf.hidden = true; extraSource = null;
    intro.removeAttribute('style'); intro.removeAttribute('aria-hidden'); introHome.style.height='';
    [...intro.children].forEach(n=>n.removeAttribute('style'));
    activate(slip,true);
    document.body.classList.toggle('static',staticMode);
    document.body.classList.toggle('compact',compact);
    $('#motion-toggle').setAttribute('aria-pressed',String(staticMode));
    $('#motion-toggle').textContent = staticMode ? '动态阅读' : '静态阅读';
    mobileHome.classList.toggle('mobile-intro',compact && !staticMode);
    mobileBookHome.hidden = !compact || staticMode;
    if (compact && !staticMode) {
      mobileHome.append(newspaper); mobileReader.append(book,bookNav);
      mobileBookHome.style.setProperty('--handoff-y', `${innerHeight / 2 - 241}px`);
      journey.style.marginTop = `${-(innerHeight / 2 + 365)}px`;
      mobileBookHome.style.minHeight = '';
    } else {
      paperObject.prepend(newspaper); $('#world').append(book,bookNav);
      journey.style.marginTop = '0';
    }
    readingDistance = innerHeight * (compact ? 6.8 : 9);
    journey.dataset.readingDistance = String(readingDistance);
    if (compact && !staticMode) {
      // Measure the normal reader before the same book returns to the animation host.
      book.style.height='auto'; book.style.width='100%';
      spreads.style.display='flex'; spreads.style.width='100%';
      $$('.spread').forEach(n=>{n.style.display='grid';});
      mobileBase = Math.max(1450, mobileReader.offsetHeight + 80);
      mobileBookHome.style.height = `${mobileBase + innerHeight * 2.5}px`;
      mobileReader.style.top = `${innerHeight - mobileBase}px`;
      spreads.scrollLeft = compactChoice * spreads.clientWidth;
    }
    mobileReader.style.transform = '';
    [newspaper,bag,book,bookNav].forEach(n => {activate(n,true);n.style.visibility='visible';});
    if (staticMode) {
      bag.append(watch);activate(watch,true);
      const paperBounds = newspaper.getBoundingClientRect();
      pocketPaper.style.left = `${compact ? 220 : 260}px`;
      pocketPaper.style.transform = compact ? `rotate(90deg) scale(${220/paperBounds.height})` : 'scale(.3392857142857143)';
      pocketPaper.style.width = `${(compact ? paperBounds.width : 1120) / 2}px`;
      pocketPaper.style.height = `${(compact ? paperBounds.height : 760) / 2}px`;
      paperObject.style.clipPath='none';paperObject.style.left='0px';
      book.style.width='100%'; book.style.height='auto'; spreads.style.display=''; spreads.style.width='';
      $('#book-block').style.overflow='visible';
      paperObject.style.visibility='visible';
      paperObject.style.zIndex='30';front.style.visibility='visible';bag.style.transform='none';
      $$('.spread').forEach(n=>{n.style.display='grid';n.style.clipPath='none';activate(n,true);});
      spreads.style.clipPath='none'; cover.style.display='none';
      bookNav.style.visibility='visible'; $('#world').style.transform='none';
      genreButtons();
      subscribe.classList.remove('slip-ready');
      slipHome.style.height='';
    } else {
      $('#world').append(watch);
      book.style.width=compact?'320px':'460px'; book.style.height=compact?'550px':'610px';
      spreads.style.display='';spreads.style.width=compact?'320px':'920px';
      cover.style.display='block';
      buildFolds();
      renderScene();
    }
  }

  function currentProgress() {
    return clamp((scrollY - journey.offsetTop) / readingDistance);
  }
  function scenePosition(p) {
    // Fold completely, then fit and align above the open main compartment.
    // Only the separate final descent can cross the actual front leather lip.
    if (compact) {
      const shrink=ease(range(p,.035,.22)), align=ease(range(p,.22,.29)), descend=ease(range(p,.29,.34));
      const storedScale=220/paperHeight, paperLeft=($('#world').clientWidth-newspaper.getBoundingClientRect().width)/2;
      return {fold1:range(p,.035,.13),fold2:range(p,.13,.22),x:mix(0,220-paperLeft,align),y:mix(mix(640-paperHeight,52,shrink),230,align)+46*descend,scale:mix(mix(1,.24,shrink),storedScale,align),rotation:90*align,aligned:align===1};
    }
    const align=ease(range(p,.30,.35)),descend=ease(range(p,.35,.39));
    return {fold1:range(p,.14,.22),fold2:range(p,.22,.30),x:mix(0,260,align),y:mix(0,360,align)+105*descend,scale:mix(1,190/560,align),rotation:0,aligned:align===1};
  }
  function renderScene() {
    framePending = false;
    if (staticMode) return;
    const p = currentProgress();progress=p;
    $('#stage').dataset.progress=p.toFixed(4);
    const geo = scenePosition(p);
    const exit = ease(range(p,compact?.69:.66,compact?.79:.75));
    const bagEnter = compact ? mix(650,0,ease(range(p,.04,.29))) : mix(900,0,ease(range(p,.24,.34)));
    const bagY = bagEnter + exit*(compact?740:1050);
    bag.style.transform=`translateY(${bagY}px)`;front.style.transform=`translateY(${bagY}px)`;
    const paperY = geo.y + exit*(compact?740:1050);
    paperObject.style.clipPath = 'none';
    paperObject.style.transform=`translate(${geo.x}px,${paperY}px) scale(${geo.scale}) rotate(${geo.rotation}deg)`;
    paperObject.style.visibility='visible';
    paperObject.style.zIndex=geo.aligned?'30':'45';
    paperObject.dataset.aligned=String(geo.aligned);
    const foldingNow = compact || p > .14;
    const paperReading = p <= (compact ? .035 : .14);
    newspaper.style.visibility=paperReading?'visible':'hidden';
    folding.style.display=foldingNow?'block':'none';
    $$('.fold-panel.right').forEach(n=>{n.style.transform=`rotateY(${-180*geo.fold1}deg)`;});
    $('.fold-row.lower').style.transform=`rotateX(${180*geo.fold2}deg)`;
    // Contact shade belongs to the moving surfaces, never a cross above the world.
    // Zero at both flat endpoints; only the currently bending hinge deepens.
    folding.style.setProperty('--hinge-v', Math.sin(Math.PI*geo.fold1).toFixed(5));
    folding.style.setProperty('--hinge-h', Math.sin(Math.PI*geo.fold2).toFixed(5));
    // Keep the backside above the completed stack without flattening intermediate 3D hinges.
    $('.fold-row.upper').style.zIndex=geo.fold2>.01?'1':'3';
    $('.fold-row.lower').style.zIndex=geo.fold2>.01?'5':'1';
    const bagReading = p >= (compact?.34:.39) && p <= (compact?.59:.57);
    if (!bagReading) endDialGesture();
    // The watch remains rendered while the bag is inert: occlusion, never visibility,
    // reveals the same case. It first lifts vertically clear, then travels/grows.
    const watchLift = ease(range(p,compact?.23:.305,compact?.28:.35));
    const watchTravel = ease(range(p,compact?.28:.35,compact?.34:.39));
    const watchStart = compact ? {x:64,y:260,s:.43,clear:85} : {x:175,y:470,s:.42,clear:130};
    const watchX = mix(watchStart.x,compact?14:824,watchTravel);
    const watchY = mix(mix(watchStart.y,watchStart.clear,watchLift),compact?414:182,watchTravel);
    const watchScale = mix(watchStart.s,1,watchTravel);
    watch.style.transform=`translate(${watchX}px,${watchY+bagY}px) scale(${watchScale})`;
    // Once its entire case has cleared every front surface, it passes in front
    // of the side wall during travel. At the layer change there is no overlap.
    watch.style.zIndex=watchLift===1?'45':'33';
    activate(watch,bagReading);
    watch.style.setProperty('--watch-ui',String(watchTravel));
    watch.dataset.lift=watchLift.toFixed(5); watch.dataset.travel=watchTravel.toFixed(5);
    activate(bag,bagReading);$('.bag-controls').style.visibility=bagReading?'visible':'hidden';$('.scene-title').style.visibility=p> (compact?.26:.34)&&p<.64?'visible':'hidden';
    activate(newspaper,paperReading);
    const extract= ease(range(p,compact?.59:.57,compact?.69:.65));
    const travel= ease(range(p,compact?.69:.65,compact?.77:.70));
    const open=range(p,compact?.77:.70,compact?.87:.75);
    const initial = compact ? {x:230,y:168,s:.14,r:3} : {x:495,y:285,s:.19,r:3};
    const clearY = compact ? 58 : 90;
    const bx=mix(initial.x,compact?20:560,travel), by=mix(mix(initial.y,clearY,extract),compact?34:70,travel);
    const bs=mix(initial.s,1,travel), br=mix(initial.r,0,travel);
    if(extract<1){if(book.parentElement!==bag)bag.append(book);}else if(!compact||p<1){if(book.parentElement!==$('#world'))$('#world').append(book);}
    if (compact) {
      // The exact book DOM moves to the normal reading host only once the opening finishes.
      if (p<1) {
        if(extract===1&&book.parentElement!==$('#world')) $('#world').append(book); if(bookNav.parentElement!==$('#world'))$('#world').append(bookNav);
        const settle = ease(range(p,.87,1));
        const handoffX = mobileBookHome.getBoundingClientRect().left + 16 - $('#world').getBoundingClientRect().left;
        book.style.width = `${mix(320, mobileBookHome.clientWidth - 32, settle)}px`;
        spreads.style.width = '100%';
        book.style.transform=`translate(${mix(bx,handoffX,settle)}px,${by}px) scale(${bs}) rotate(${br}deg)`;
        book.style.height='550px';
        bookNav.style.visibility='hidden';activate(book,false);activate(bookNav,false);
        spreads.style.display='block';spreads.style.clipPath='none';
        $$('.spread').forEach((n,i)=>{n.style.display=i===0?'grid':'none';n.style.visibility='visible';activate(n,false);});
        cover.style.display=open===1?'none':'block';cover.style.transform=`rotateY(${-180*open}deg)`;
        $('#book-block').style.overflow=p<.87?'hidden':'visible';
      } else {
        if(book.parentElement!==mobileReader) {
          mobileReader.append(book,bookNav);
          spreads.scrollLeft = compactChoice * spreads.clientWidth;
        }
        book.style.height='auto';book.style.width='100%';book.style.transform='none';cover.style.display='none';
        $('#book-block').style.overflow='visible';spreads.style.display='flex';
        $$('.spread').forEach(n=>{n.style.display='grid';n.style.clipPath='none';activate(n,true);});
        activate(book,true);activate(bookNav,true);bookNav.style.visibility='visible';
      }
      book.style.zIndex=extract===1?'55':'24';
    } else {
      book.style.transform=`translate(${bx}px,${by}px) scale(${bs}) rotate(${br}deg)`;
      book.style.zIndex=extract===1?'55':'24';
      cover.style.transform=`rotateY(${-180*open}deg)`;
      cover.style.display=open===1?'none':'block';
      spreads.style.clipPath=open===1?'none':'inset(0 0 0 50%)';
      const bookReading = p>=.75;
      activate(book,bookReading);activate(bookNav,bookReading);bookNav.style.visibility=bookReading?'visible':'hidden';
      renderPageTurn(p);
      const scale=Math.min(1,(innerWidth-60)/1120,(innerHeight-125)/780);
      $('#world').style.transform=`scale(${scale})`;
    }
    renderSlip();
    const chapter=scrollY >= slipEnd-2 ? 'subscribe' : p<(compact?.34:.39)?'paper':p<(compact?.69:.68)?'bag':'book';
    $$('[data-nav]').forEach(n=>{if(n.closest('nav'))n.toggleAttribute('aria-current',n.dataset.nav===chapter);});
    $('#scroll-caption').textContent = p < (compact?.34:.39) ? '往下滚动 · 折好日报 ↓' : p<(compact?.59:.57) ? '选一个小时，或继续抽出手册 ↓' : p<.75 ? '沿袋口抽出 · 展开手册 ↓' : compact ? '继续向下阅读 · 手册可横向滑动 ↓' : '滚动翻页 · 也可使用题材导航 ↓';
  }
  let leafPair='';
  function renderPageTurn(p) {
    let base=0,t=0;
    if(p>=.91){base=1;t=range(p,.91,.935);}else if(p>=.83){base=0;t=range(p,.83,.855);}
    genre=t===1?base+1:base;
    const pages=$$('.spread');
    pages.forEach((n,i)=>{n.style.display=i===genre?'grid':'none';n.style.clipPath='none';activate(n,p>=.75&&i===genre);});
    if(t>0&&t<1){
      pages[base].style.display='grid';pages[base].style.clipPath='inset(0 50% 0 0)';
      pages[base+1].style.display='grid';pages[base+1].style.clipPath='inset(0 0 0 50%)';
      activate(pages[base],false);activate(pages[base+1],false);
      if(leafPair!==String(base)){
        $('.leaf-front').replaceChildren(cloneInert(pages[base].children[1]));
        $('.leaf-back').replaceChildren(cloneInert(pages[base+1].children[0]));leafPair=String(base);
      }
      leaf.style.display='block';leaf.style.transform=`rotateY(${-180*t}deg)`;
    }else leaf.style.display='none';
    genreButtons();
  }
  function genreButtons(){
    $$('[data-genre]').forEach(n=>n.toggleAttribute('aria-current',Number(n.dataset.genre)===genre));
    $('#prev-page').disabled=genre===0;$('#next-page').disabled=genre===2;
  }
  function goProgress(p){scrollTo({top:journey.offsetTop+readingDistance*p,behavior:'instant'});renderScene();}
  function goGenre(i){
    genre=clamp(i,0,2);
    if(compact){
      if(!staticMode && currentProgress()<1)goProgress(1);
      const target=$$('.spread')[genre];spreads.scrollTo({left:target.offsetLeft,behavior:reducedQuery.matches?'instant':'smooth'});
      if(!staticMode)mobileBookHome.scrollIntoView({block:'start',behavior:'instant'});
      genreButtons();
    }else if(staticMode){$$('.spread')[genre].scrollIntoView({block:'center',behavior:'instant'});genreButtons();}
    else goProgress([.785,.875,.96][genre]);
  }
  function navigate(target){
    $$('nav [data-nav]').forEach(n=>n.toggleAttribute('aria-current',n.dataset.nav===target));
    if(target==='subscribe'){
      if(staticMode)subscribe.scrollIntoView({block:'start',behavior:'instant'});
      else {
        // Resolve the compact normal reader first; never reset its horizontal selection.
        if(compact && currentProgress()<1)goProgress(1);
        renderScene(); scrollTo({top:slipEnd+2,behavior:'instant'});renderScene();
      }
      return;
    }
    if(staticMode){({paper:newspaper,bag,book})[target].scrollIntoView({block:'start',behavior:'instant'});return;}
    if(compact && target==='paper'){scrollTo({top:0,behavior:'instant'});return;}
    if(compact && target==='book'){goProgress(1);mobileBookHome.scrollIntoView({block:'start',behavior:'instant'});return;}
    goProgress({paper:.04,bag:compact?.43:.46,book:.785}[target]);
  }

  const detailMeta = {
    wind:{title:'叶轮式风温湿仪',note:'风让衣摆、枝叶与支撑都进入画面。',source:'风温湿为同一小时的模型预报夹具，不是本机传感器。平均风与阵风分开，不能互相替代。',limit:'阵风可能影响高位支撑与发丝；现场情况优先。',history:'造型线索来自所提供参考稿中的早期便携叶轮仪（1996 年起的家族）。年代未重新核验。'},
    direction:{title:'计算太阳方位仪',note:'读太阳在天空的位置，先看现场遮挡。',source:'上海 31.23°N / 121.47°E，2026-10-21，北京时间整点。本地 SunCalc 1.9.0 太阳位置公式；不是设备实时朝向，不访问传感器或定位。',limit:'北为0°，顺时针；高度以地平线为0°，负值表示在地平线下。事件使用同一公式的高度阈值求根，显示到分钟；不含建筑地形遮挡。',history:'原创虚构太阳方向器材；角度计算与天气预报独立。'},
    light:{title:'经典测光表 · 光照解释',note:'先判断直射、漫射或变化光，再在现场看光。',source:'依据同小时总云量与计算太阳阶段作条件性解释，不是现场测光。云≤25%且太阳在地平线上：可能直射；云≥75%：可能漫射；其余为变化光。云缺失时光照未知，保留已知太阳阶段。',limit:'蓝调采用太阳高度−6°至−4°，可关注暮色层次；金调−4°至+6°，可关注低角度侧光。云层可能遮挡预期效果；负高度没有太阳直射，夜间不生成自然光窗口。',history:'原创经典受光罩与手持表意象；不提供照度、能量、色温或相机曝光参数。'},
    weather:{title:'袋内气象记录卡',note:'把天气、空气与能见度分别记录。',source:'手工固定天气与空气预报样例；参考 AQI 为 US EPA / CAMS 口径，模型小时序列含插值语境，非中国官方站点实况。PM2.5、PM10 单位 μg/m³；PM10 是独立编写的24小时演示数组，不从其他数值反推。',limit:'降水为该小时段累计 mm，能见度为 km。缺失逐项保留，不变成零，不从 AQI 推导能见度或空气安全。',history:'原生 DOM 纸卡；所有读数与摘要、详情共用同一小时。'}
  };
  function renderDetail(kind){
    const content=el('div','dialog-content');
    const title=el('h2','');title.id='detail-title';
    const d=selected();
    if(detailMeta[kind]){
      const meta=detailMeta[kind];content.classList.add('device-detail');
      const art=el('div','detail-art');const copy=cloneInert($(`[data-device="${kind}"]`));copy.removeAttribute('data-device');art.append(copy);
      const column=el('div');title.textContent=meta.title;
      column.append(el('p','note',`${copy.dataset.maker} · ${copy.dataset.model} · 主人刻字 ${copy.dataset.owner}`));
      column.append(el('p','eyebrow',`${F.date} · 上海 · ${d.time} / ${state==='ok'?'完整样例':$('#data-state').selectedOptions[0].textContent}`),title);
      const value=kind==='wind'?`${metric(d.wind,' m/s')} · ${d.temperature}°C` :kind==='direction'?`${d.azimuth.toFixed(1)}° / ${d.altitude.toFixed(1)}°` :kind==='light'?S.light(d.altitude,d.cloud):`云 ${metric(d.cloud,'%')} / 雨 ${metric(d.rain,' mm')}`;
      column.append(el('div','detail-reading',value),el('p','',meta.note));
      if(kind==='wind')column.append(el('p','',`湿度 ${d.humidity}% · 阵风 ${metric(d.gust,' m/s')}。${d.note}`));
      if(kind==='direction'||kind==='light')column.append(el('p','',`${S.stage(d.altitude,hour*60)} · 日出 ${F.sunrise} / 日落 ${F.sunset}；早蓝调 ${F.morningBlue}，早金调 ${F.morningGold}；晚金调 ${F.eveningGold}，晚蓝调 ${F.eveningBlue}。`));
      if(kind==='weather')column.append(el('p','',`能见度 ${metric(d.visibility,' km')} · 参考 AQI ${metric(d.aqi)}（US EPA / CAMS） · PM2.5 ${metric(d.pm25,' μg/m³')} · PM10 ${metric(d.pm10,' μg/m³')}。`));
      column.append(el('p','detail-factors',meta.source),el('p','',meta.limit),el('p','note',stateNote()),el('p','note',meta.history));content.append(art,column);
    }else if(kind==='sunset'){
      title.textContent=`日落 ${F.sunset} · ${opportunity()}`;content.append(title,el('p','','五个由低到高的机会等级；未知独立于最低一级。它们是启发式条件判断，不是校准概率。'));
      const levels=el('div','levels');F.levels.forEach((label,i)=>{const n=el('div');n.append(el('b','',String(i+1)),el('span','',label));levels.append(n);});content.append(levels);
      content.append(el('p','',$('.sunset-reason').textContent),el('p','','完整样例条件分 70，对应四级。旧数据或日落来源显著分歧限至三级；缺失必要分层云、能见度或降水则暂无法判断。'),el('p','','很低：已知条件多不利；偏低：支持较少；一般：支持与限制并存；较高：多个本地条件有利；很高：本地组合较理想，仍非保证。'),el('p','note','只关联当日日落窗口，不随所选仪表小时改变。仅基于本地预报条件，未验证西向远方云场与现场遮挡。样例基准时刻是 15:20，而非系统现在。'));
    }else if(kind==='hours'){
      title.textContent='24 小时 · 同一天的变化';content.append(title,el('p','note',`${F.date} · 北京时间 · 所选 ${d.time}。小时选择不改写全天概览。${stateNote()}`));
      const wrap=el('div','table-overflow');wrap.tabIndex=0;wrap.setAttribute('aria-label','完整逐时表，可横向滚动');const table=el('table','dialog-table'),head=el('thead'),tr=el('tr');['时','°C','风 m/s','云 %','雨 mm','能见 km'].forEach(v=>tr.append(el('th','',v)));head.append(tr);table.append(head);const tbody=el('tbody');
      F.hours.forEach(r=>{const row=el('tr');[r.time,r.temperature,state==='missing'?'—':r.wind,state==='missing'?'—':r.cloud,r.rain,state==='missing'?'—':r.visibility].forEach(v=>row.append(el('td','',String(v))));tbody.append(row);});table.append(tbody);wrap.append(table);content.append(wrap,el('p','note','瞬时量表示小时起点参考；降水表示该小时段累计。固定夹具不验证任何真实服务、时效或覆盖。'));
    }else{
      title.textContent='这是一份离线样刊';content.append(title,el('p','','固定地点：上海城市参考点。固定日期：2026-10-21。样例更新时间：15:20，北京时间。没有实时天气、远程请求、遥测或位置采集。'),el('p','','天气与空气数字是手工固定夹具；不是实际获取的服务响应。空气参考采用美国 EPA / CAMS 口径，小时序列可含插值，不标中国“优良”等级。能见度单列，不从 AQI 推导。'),el('p','','太阳角度使用本地 SunCalc 1.9.0 太阳位置公式，事件由相同公式求阈值交点；固定上海、日期、北京时间，无设备朝向或定位。摄影与光照是条件性解释，不是现场测光。'),el('p','','背包及器材外壳为本轮 imagegen 生成或依据本地参考素材编辑的实物质感图；读数为 DOM。纸纹与江岸图来自用户参考，手册图解为原创 SVG/CSS。历史造型线索沿用参考稿，未核验原厂档案。'),el('p','note','素材许可尚未核实：仅供本地设计评审，公开发布前必须确认或替换。文件来源逐项见 prototype/assets/PROVENANCE.md。'));
    }
    $('#detail-body').replaceChildren(content);
  }
  function openDetail(kind,button){opener=button;activeDetail=kind;renderDetail(kind);$('#detail').showModal();$('#close-detail').focus();}
  $('#close-detail').addEventListener('click',()=>$('#detail').close());
  $('#detail').addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const focusable=$$('button,a[href],input,select,textarea,[tabindex]', $('#detail')).filter(n=>n.tabIndex>=0&&!n.disabled&&!n.closest('[inert]')&&n.getClientRects().length);
    const first=focusable[0],last=focusable[focusable.length-1];
    if((event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last)){
      event.preventDefault();(event.shiftKey?last:first)?.focus();
    }
  });
  $('#detail').addEventListener('close',()=>{
    // Native close restores focus before this queued event. Do not let an old close
    // steal a subsequent intentional focus or clear a newly opened instrument.
    if($('#detail').open)return;
    activeDetail='';
    const needsReturn=document.activeElement===document.body||$('#detail').contains(document.activeElement);
    if(needsReturn&&opener?.isConnected&&!opener.closest('[inert]'))opener.focus({preventScroll:true});
  });
  $('#detail').addEventListener('click',e=>{if(e.target===$('#detail')){const r=$('#detail').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#detail').close();}});
  document.addEventListener('click',e=>{
    const detail=e.target.closest('[data-detail]'), device=e.target.closest('[data-device]'),nav=e.target.closest('[data-nav]'),gn=e.target.closest('[data-genre]');
    if(detail)openDetail(detail.dataset.detail,detail);
    else if(device)openDetail(device.dataset.device,device);
    else if(nav){e.preventDefault();navigate(nav.dataset.nav);}
    else if(gn)goGenre(Number(gn.dataset.genre));
  });
  $('#data-state').addEventListener('change',e=>{state=e.target.value;renderReadings();if(!staticMode)buildFolds();renderScene();});
  $('#prev-page').addEventListener('click',()=>goGenre(genre-1));$('#next-page').addEventListener('click',()=>goGenre(genre+1));
  spreads.addEventListener('scroll',()=>{if(compact && (staticMode || book.parentElement===mobileReader)){genre=clamp(Math.round(spreads.scrollLeft/spreads.clientWidth),0,2);compactChoice=genre;genreButtons();scheduleScene();}},{passive:true});
  $('#motion-toggle').addEventListener('click',()=>{
    const previous=progress, atSlip=staticMode ? scrollY>=subscribe.offsetTop-200 : scrollY>=slipStart;
    staticMode=!staticMode;setupMode();
    if(atSlip)navigate('subscribe');
    else if(staticMode)navigate(previous<.3?'paper':previous<.68?'bag':'book');else navigate('paper');
  });
  compactQuery.addEventListener('change',setupMode);
  reducedQuery.addEventListener('change',()=>{staticMode=reducedQuery.matches;setupMode();});
  function scheduleScene(){if(!framePending){framePending=true;requestAnimationFrame(renderScene);}}
  addEventListener('scroll',scheduleScene,{passive:true});
  let resizeTimer;addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(setupMode,100);});

  const form=$('#subscription');
  form.addEventListener('submit',e=>{
    e.preventDefault();const place=$('#place').value.trim();
    $('#place').setCustomValidity(place?'':'请填写关注地点。');if(!form.reportValidity())return;
    const slot=$('input[name="slot"]:checked',form).value;
    if(!['07:00','12:00'].includes(slot))return;
    $('#registration-text').textContent=`${place} · ${slot} 北京时间 / 简报摘要与对应地点网页入口的界面预览`;
    $('#registration').hidden=false;$('#subscription-status').textContent='';scheduleScene();
  });
  $('#place').addEventListener('input',()=>$('#place').setCustomValidity(''));
  $('#edit-preview').addEventListener('click',()=>{$('#registration').hidden=true;$('#subscription-status').textContent='可调整地点与时段，再预览；尚未创建任何订阅。';$('#place').focus();scheduleScene();});
  $('#stop-preview').addEventListener('click',()=>{$('#registration').hidden=true;$('#registration-text').textContent='';$('#subscription-status').textContent='已停止本次预览。没有真实订阅需要取消，也不会发送消息。';$('button[type="submit"]',form).focus();scheduleScene();});

  // The canonical form is the complete loose sheet, covered by one extra leaf.
  // All phases use the same native-scroll q in both directions; no clipped slit.
  function renderSlip(){
    mobileReader.style.transform='none';
    slipEnd = subscribe.offsetTop;
    slipStart = compact ? mobileBookHome.offsetTop + mobileBase - innerHeight : journey.offsetTop + readingDistance;
    const q=range(scrollY,slipStart,slipEnd);
    subscribe.dataset.extraction=q.toFixed(5);
    subscribe.dataset.extractionStart=String(slipStart);
    subscribe.dataset.extractionEnd=String(slipEnd);
    const available = compact ? progress===1 : progress>=.935;
    const turn=ease(range(q,.04,.34)), lift=ease(range(q,.46,.62));
    const travel=ease(range(q,.62,compact?.82:.90));
    const settle=compact?ease(range(q,.82,.96)):travel;
    const ready = q===1;
    subscribe.classList.toggle('slip-ready',ready);
    subscribe.dataset.leafTurn=turn.toFixed(5);
    subscribe.dataset.slipLift=lift.toFixed(5);
    subscribe.dataset.slipSettle=settle.toFixed(5);
    // Reserve both final columns before fixing either object, preserving layout.
    slipHome.style.height=`${slip.offsetHeight}px`;
    intro.removeAttribute('style');
    introHome.style.height=`${intro.offsetHeight}px`;
    const introRect=intro.getBoundingClientRect();
    const introY=introRect.top+scrollY-slipEnd;
    if(!ready)intro.style.cssText=`position:fixed;left:${introRect.left}px;top:${introY}px;width:${introRect.width}px;z-index:4;`;
    intro.setAttribute('aria-hidden',String(!ready));
    [...intro.children].forEach((n,i)=>{
      const entrance=ease(range(q,compact?.82+i*.025:.66+i*.04,compact?.88+i*.035:.79+i*.055));
      n.style.opacity=String(entrance);
      n.style.transform=`translateY(${(1-entrance)*18}px)`;
    });
    discovery.hidden=extraLeaf.hidden=!available||ready;
    if(ready){
      slip.removeAttribute('style'); activate(slip,true);
    }else{
      activate(slip,false);
      const page=$$('.spread')[compact ? compactChoice : 2].lastElementChild;
      const r=page.getBoundingClientRect(), home=slipHome.getBoundingClientRect();
      const width=home.width, height=slip.offsetHeight;
      // Fit every edge of the whole paper onto the real page, including a saved preview.
      const scale=Math.min((r.width-48)/width,(r.height-52)/height,.76);
      const sx=r.left+(r.width-width*scale)/2, sy=r.top+(r.height-height*scale)/2;
      const targetY=home.top+scrollY-slipEnd;
      const x=mix(sx+lift*12,home.left,travel);
      const liftedY=compact?mix(sy,Math.max(128,sy-32),lift):sy-lift*74;
      const y=mix(liftedY,targetY+(compact?14:0),travel)-(compact?14*settle:0);
      const s=mix(scale*(1+lift*.07),1,travel), rotation=-2.5*lift*(1-travel);
      slip.style.cssText=`position:fixed;left:0;top:0;width:${width}px;margin:0;transform-origin:0 0;transform:translate(${x}px,${y}px) scale(${s}) rotate(${rotation}deg);visibility:${available?'visible':'hidden'};z-index:2;--slip-lift:${lift};`;
      if(extraSource!==page){
        extraFront.replaceChildren(cloneInert(page)); extraSource=page;
      }
      const leave=travel*(compact?-innerHeight*1.1:innerHeight);
      const surface=`left:${r.left}px;top:${r.top+leave}px;width:${r.width}px;height:${r.height}px;`;
      discovery.style.cssText=surface;
      extraLeaf.style.cssText=surface+`transform:perspective(1800px) rotateY(${-180*turn}deg);--leaf-shade:${Math.sin(Math.PI*turn)};`;
    }
    if(compact)mobileReader.style.transform=`translateY(${-travel*innerHeight*1.1}px)`;
    else book.style.transform+=` translateY(${travel*innerHeight}px)`;
    if(q>0){activate(book,false);activate(bookNav,false);bookNav.style.visibility='hidden';}
    $('#scroll-caption').style.visibility=q>0?'hidden':'visible';
  }

  $$('[data-event]').forEach(n=>{n.textContent=n.dataset.event==='riseSet'?`${F.sunrise} / ${F.sunset}`:F[n.dataset.event];});
  renderHours();renderBook();renderReadings();setupMode();
  // Re-measure after local images and system font layout, without a network dependency.
  addEventListener('load',()=>{if(!staticMode){buildFolds();renderScene();}});
})();
