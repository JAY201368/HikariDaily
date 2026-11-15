(() => {
  'use strict';

  const storageKey = 'hikari-shooting-planner-prototype-v1';
  const draftKey = `${storageKey}-annotation`;
  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const uid = () => window.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const samplePhoto = 'assets/riverside-film.webp';
  const plansPerIndexPage = 4;
  let saveTimer;
  let toastTimer;
  let annotation;
  let pendingConfirm;
  let inlineComposition = null;
  let inlineBeforeInput = null;
  let pageTurnAnimation = null;
  let writingHistory = [];
  let writingFuture = [];
  let forceSaveFailure = false;
  let uploadError = false;
  let store = loadStore();
  for (const plan of [...store.plans, ...store.trash]) {
    for (const item of plan.checklist) item.id ||= uid();
  }
  const state = { planId: null, spread: 0, query: '', trash: false, closed: false, thumbs: false };

  function blankPlan(title = '新的拍摄计划') {
    return {
      id: uid(), title, date: '', location: '', genre: '街拍', intent: '', notes: '',
      schedule: [], checklist: [], photos: [], extraPages: [], createdAt: Date.now(), updatedAt: Date.now(),
    };
  }

  function seedStore() {
    const first = blankPlan('江岸的午后');
    Object.assign(first, {
      id: 'sample-riverside', date: '2026-11-21', location: '上海 · 外滩', genre: '街拍 / 风光',
      intent: '沿着江岸慢慢走，寻找栏杆、行人与远处建筑之间的关系。\n\n让光落在水面上，也给画面留出呼吸的地方。',
      notes: '先找好前景，再等人物走入画面。\n\n路灯可以放在画面左侧，让栏杆把视线带向江面。保留水面上的亮部，把远处建筑留在较轻的灰度里。\n\n同一个位置分别试一张横幅和一张竖幅，回来看空间关系。',
      schedule: [
        { id: 'shot-a', time: '14:30', title: '沿江走一段', detail: '从路灯和栏杆开始，观察前景与天际线的重叠。' },
        { id: 'shot-b', time: '15:20', title: '等一个人走进画面', detail: '固定构图，留出行走的方向。记录不同人物与环境的比例。' },
        { id: 'shot-c', time: '16:10', title: '收集水面的亮光', detail: '换长焦压缩远景，选一小片有层次的水面。' },
      ],
      checklist: [{ label: '相机与备用电池', checked: true }, { label: '35 mm / 85 mm 镜头', checked: true }, { label: '轻便外套与水', checked: false }],
      photos: [{ id: 'reference-a', source: samplePhoto, name: '江岸 · 空间关系', caption: '把路灯作为前景，栏杆引导视线；人物进入左侧步道时按下快门。', annotations: [{ type: 'arrow', color: '#9c5c43', points: [{ x: .22, y: .72 }, { x: .06, y: .71 }] }, { type: 'text', color: '#9c5c43', x: .12, y: .85, text: '等人物走入' }] }],
    });
    const second = blankPlan('秋日街角');
    Object.assign(second, { id: 'sample-street', date: '2026-11-23', location: '上海 · 衡山路', genre: '街拍', intent: '在街角寻找树影和慢下来的行人。用一支定焦镜头走完这段路。', notes: '留意橱窗的倒影与落叶。', checklist: [{ label: '相机与一支定焦镜头', checked: false }] });
    const third = blankPlan('阴天的人像练习');
    Object.assign(third, { id: 'sample-portrait', date: '2026-11-28', location: '地点待定', genre: '人像', intent: '柔和的光，简单的衣服，放松的动作。\n\n练习把注意力留给人物的表情。', checklist: [{ label: '浅色外套', checked: false }, { label: '反光板', checked: false }] });
    for (const plan of [first, second, third]) {
      plan.checklist.forEach((item) => { item.id = uid(); });
    }
    return { version: 1, plans: [first, second, third], trash: [] };
  }

  function loadStore() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved?.version === 1 && Array.isArray(saved.plans) && Array.isArray(saved.trash)) return saved;
    } catch { /* The initial example stays available when storage is blocked. */ }
    return seedStore();
  }

  function currentPlan() {
    return store.plans.find((plan) => plan.id === state.planId);
  }

  function setSaveStatus(message, error = false) {
    byId('save-status').textContent = message;
    byId('save-status').classList.toggle('error', error);
  }

  function save(immediate = false) {
    clearTimeout(saveTimer);
    setSaveStatus('◌ 正在保存到本机');
    const commit = () => {
      try {
        if (forceSaveFailure) throw new Error('preview');
        localStorage.setItem(storageKey, JSON.stringify(store));
        setSaveStatus('● 已保存到本机');
      } catch {
        setSaveStatus('保存失败 · 点击重试', true);
      }
    };
    if (immediate) commit();
    else saveTimer = setTimeout(commit, 450);
  }

  function rememberChange(anchor = captureInlineSelection()) {
    byId('toast').hidden = true;
    clearTimeout(toastTimer);
    writingHistory.push({ store: clone(store), anchor });
    if (writingHistory.length > 30) writingHistory.shift();
    writingFuture = [];
  }

  function finishChange(message) {
    const plan = currentPlan();
    if (plan) plan.updatedAt = Date.now();
    save();
    render();
    if (message) toast(message, true);
  }

  function toast(message, canUndo = false) {
    byId('toast').textContent = message;
    if (canUndo) {
      const undo = document.createElement('button');
      undo.dataset.action = 'undo';
      undo.textContent = '撤销';
      byId('toast').append(undo);
    }
    byId('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { byId('toast').hidden = true; }, canUndo ? 6000 : 3200);
  }

  function dateParts(date) {
    if (!date) return { day: '—', month: '待定', full: '拍摄日期待定' };
    const parts = date.split('-');
    return { day: parts[2], month: `${Number(parts[1])}月`, full: `${parts[0]}.${parts[1]}.${parts[2]}` };
  }

  function highlight(value) {
    const text = String(value || '');
    if (!state.query) return escapeHtml(text);
    const index = text.toLocaleLowerCase().indexOf(state.query.toLocaleLowerCase());
    if (index < 0) return escapeHtml(text);
    return `${escapeHtml(text.slice(0, index))}<mark>${escapeHtml(text.slice(index, index + state.query.length))}</mark>${escapeHtml(text.slice(index + state.query.length))}`;
  }

  function searchableText(plan) {
    return [plan.title, plan.location, plan.genre, plan.intent, plan.notes, ...plan.checklist.map((item) => item.label), ...plan.schedule.flatMap((entry) => [entry.title, entry.detail]), ...plan.photos.flatMap((photo) => [photo.caption, photo.name, ...photo.annotations.filter((item) => item.type === 'text').map((item) => item.text)]), ...plan.extraPages.flatMap((page) => [page.title, page.text])].join('\n');
  }

  function matchingPlans() {
    const plans = state.trash ? store.trash : store.plans;
    return plans.filter((plan) => searchableText(plan).toLocaleLowerCase().includes(state.query.toLocaleLowerCase()));
  }

  function page(content, side, number, label, endAction = '', pageId = '') {
    return `<article class="page ${side}" data-page-id="${escapeHtml(pageId)}" aria-label="${escapeHtml(label)}"><div class="page-body">${content}</div>${endAction}<div class="page-number"><span>${escapeHtml(label)}</span><span>${escapeHtml(number)}</span></div></article>`;
  }

  function indexPages(plans) {
    return [0, 1].map((offset) => {
      const physicalIndex = state.spread * 2 + offset;
      const side = offset === 0 ? 'left' : 'right';
      if (physicalIndex === 0) {
        const title = `<div class="page-header"><span>HIKARI DAILY</span><span>2026</span></div><h1 class="index-title">拍摄计划本</h1><p class="index-subtitle">PHOTOGRAPHY JOURNAL</p><div class="index-rule"></div><div class="index-month"><b>11</b><span>月的拍摄</span></div><figure class="index-photo"><img src="${samplePhoto}" alt="外滩江岸与远处城市天际线"><figcaption>江岸的午后 · 参考照片</figcaption></figure>`;
        return page(title, side, 'I', '拍摄计划本', '', 'index-title');
      }
      const firstEntry = (physicalIndex - 1) * plansPerIndexPage;
      if (firstEntry >= plans.length && physicalIndex > 1) {
        return `<article class="page ${side}" data-page-id="index-blank" aria-label="空白页"><div class="page-body"></div></article>`;
      }
      const content = indexPageContent(plans, firstEntry, physicalIndex);
      return page(content, side, String(physicalIndex).padStart(2, '0'), state.trash ? '回收夹' : '目录', '', `index-${physicalIndex}`);
    });
  }

  function indexPageContent(plans, firstEntry, pageNumber) {
    const entries = plans.slice(firstEntry, firstEntry + plansPerIndexPage);
    const list = entries.map((plan, index) => {
      const date = dateParts(plan.date);
      const queryText = searchableText(plan);
      const position = queryText.toLocaleLowerCase().indexOf(state.query.toLocaleLowerCase());
      const snippet = state.query && position >= 0 ? queryText.slice(Math.max(0, position - 10), position + 35).replace(/\n/g, ' · ') : '';
      const deleteButton = state.trash ? '' : `<button class="plan-delete" data-delete-plan="${escapeHtml(plan.id)}" aria-label="删除计划 ${escapeHtml(plan.title)}">删除</button>`;
      return `<div class="plan-row"><button class="plan-entry" data-${state.trash ? 'restore' : 'open'}="${escapeHtml(plan.id)}"><span class="plan-date">${escapeHtml(date.day)}<small>${escapeHtml(date.month)}</small></span><span><strong>${highlight(plan.title || '未命名拍摄计划')}</strong><span class="plan-meta">${escapeHtml(plan.location || '地点待定')} · ${escapeHtml(plan.genre)}</span>${snippet ? `<span class="search-snippet">${highlight(snippet)}</span>` : ''}</span><span class="page-ref">${state.trash ? '恢复' : String(firstEntry + index + 1).padStart(2, '0')}</span></button>${deleteButton}</div>`;
    }).join('');
    return `<div class="index-heading-row"><h2>${state.trash ? '回收夹' : '目录'}</h2><button class="small-link" data-action="trash">${state.trash ? '返回全部计划' : '回收夹'}</button></div><label class="search-field"><input id="plan-search-${pageNumber}" data-plan-search type="search" aria-label="搜索计划、文字与批注" placeholder="搜索计划、文字与批注" value="${escapeHtml(state.query)}"><span aria-hidden="true">⌕</span></label><div class="plan-list">${list || '<div class="empty-page"><h3>这里还没有计划</h3><p>写下一个想去拍摄的地方。</p></div>'}</div>${state.trash ? '' : '<button class="new-plan-button" data-action="new">＋ 新建一份拍摄计划</button>'}<div class="index-bottom"><span>${plans.length} 份${state.trash ? '已删除' : '拍摄'}计划</span><span>${state.query ? '检索标题、正文与文字批注' : '按拍摄日期整理'}</span></div>`;
  }

  function safeTextCut(text, index) {
    const previous = text.charCodeAt(index - 1);
    const next = text.charCodeAt(index);
    if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) return index > 1 ? index - 1 : index + 1;
    return index;
  }

  function splitText(text, maxHeight, continuationHeight = maxHeight) {
    if (!text) return [''];
    const measure = byId('measure-page');
    const segments = [];
    let remaining = text;
    while (remaining) {
      const height = segments.length ? continuationHeight : maxHeight;
      measure.value = remaining;
      if (measure.scrollHeight <= height) { segments.push(remaining); break; }
      let low = 1;
      let high = remaining.length;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        measure.value = remaining.slice(0, middle);
        if (measure.scrollHeight <= height) low = middle;
        else high = middle - 1;
      }
      let cut = Math.max(1, low);
      const previousBreak = remaining.slice(0, cut).lastIndexOf('\n');
      if (previousBreak > cut * .65) cut = previousBreak + 1;
      cut = safeTextCut(remaining, cut);
      segments.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut);
    }
    return segments;
  }

  function inlineField(scope, targetId, fieldName, value, options = {}) {
    const text = options.text ?? String(value || '');
    const start = options.start || 0;
    const key = `${scope}/${targetId}/${fieldName}`;
    const attributes = `class="inline-field ${options.className || ''}" data-inline="${scope}" data-inline-key="${escapeHtml(key)}" data-target="${escapeHtml(targetId)}" data-field="${fieldName}" data-start="${start}" data-end="${start + text.length}" aria-label="${escapeHtml(options.label || options.placeholder || fieldName)}" placeholder="${escapeHtml(options.placeholder || '')}"`;
    if (options.multiline) return `<textarea ${attributes} rows="1" spellcheck="false">\n${escapeHtml(text)}</textarea>`;
    return `<input ${attributes} type="${options.type || 'text'}" value="${escapeHtml(text)}">`;
  }

  function fitInlineFields(root) {
    root.querySelectorAll('textarea[data-inline]').forEach((input) => {
      input.style.height = '0px';
      input.style.height = `${input.scrollHeight}px`;
    });
  }

  function inlineTarget(input) {
    const plan = currentPlan();
    if (!plan) return null;
    if (input.dataset.inline === 'plan') return plan;
    return plan[input.dataset.inline]?.find((item) => item.id === input.dataset.target);
  }

  function captureInlineSelection(input = document.activeElement) {
    if (!input?.matches('[data-inline]') || !byId('spread').contains(input)) return null;
    const start = Number(input.dataset.start);
    return {
      planId: state.planId, key: input.dataset.inlineKey,
      pageId: input.closest('.page').dataset.pageId,
      start: start + (input.selectionStart || 0),
      end: start + (input.selectionEnd || 0),
      direction: input.selectionDirection || 'none',
    };
  }

  function matchingInlineField(root, anchor) {
    const matches = [...root.querySelectorAll('[data-inline]')].filter((input) => {
      const start = Number(input.dataset.start);
      const end = Number(input.dataset.end);
      return input.dataset.inlineKey === anchor.key && anchor.end >= start && anchor.end <= end;
    });
    return matches.find((input) => input.closest('.page')?.dataset.pageId === anchor.pageId) || matches[0];
  }

  function restoreInlineSelection(anchor) {
    if (!anchor || anchor.planId !== state.planId) return;
    const input = matchingInlineField(byId('spread'), anchor);
    if (!input) return;
    input.focus({ preventScroll: true });
    const offset = Number(input.dataset.start);
    try { input.setSelectionRange(Math.max(0, anchor.start - offset), anchor.end - offset, anchor.direction); } catch { /* Date and time fields use the browser's own selection. */ }
  }

  function updateInlineField(input) {
    const target = inlineTarget(input);
    if (!target) return;
    const fieldName = input.dataset.field;
    const before = String(target[fieldName] || '');
    const start = Number(input.dataset.start);
    const end = Number(input.dataset.end);
    const after = before.slice(0, start) + input.value + before.slice(end);
    if (before === after) return;
    if (!inlineComposition?.recorded) rememberChange(inlineBeforeInput);
    if (inlineComposition) inlineComposition.recorded = true;
    target[fieldName] = after;
    input.dataset.end = String(start + input.value.length);
    currentPlan().updatedAt = Date.now();
    if (inlineComposition) { fitInlineFields(byId('spread')); return; }
    const anchor = captureInlineSelection(input);
    save();
    render(anchor);
  }

  function textSegments(value, firstHeight, continuationHeight = firstHeight) {
    let start = 0;
    return splitText(value, firstHeight, continuationHeight).map((text) => {
      const segment = { text, start };
      start += text.length;
      return segment;
    });
  }

  function measureMarkup(markup) {
    let measure = byId('measure-layout');
    if (!measure) {
      measure = document.createElement('div');
      measure.id = 'measure-layout';
      measure.className = 'page-body layout-measure';
      measure.setAttribute('aria-hidden', 'true');
      document.body.append(measure);
    }
    measure.innerHTML = markup;
    fitInlineFields(measure);
    return measure.getBoundingClientRect().height;
  }

  function splitMarkupText(text, renderChunk, maxHeight, maxChunks = Infinity) {
    const chunks = [];
    let remaining = text;
    while (remaining && chunks.length < maxChunks) {
      if (measureMarkup(renderChunk(remaining)) <= maxHeight) {
        chunks.push(remaining);
        break;
      }
      let low = 1;
      let high = remaining.length;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (measureMarkup(renderChunk(remaining.slice(0, middle))) <= maxHeight) low = middle;
        else high = middle - 1;
      }
      const cut = safeTextCut(remaining, Math.max(1, low));
      chunks.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut);
    }
    return chunks;
  }

  function makeSchedulePages(plan, date) {
    const pages = [];
    const height = 538;
    let body = '';
    const header = () => pages.length ? '' : `<div class="page-header"><span>SHOOTING NOTES</span><span>${escapeHtml(date.month)} · ${escapeHtml(date.day)}</span></div><h2 class="section-heading">拍摄安排</h2>`;
    const flush = () => {
      if (!body) return;
      pages.push({ id: pages.length ? `schedule-${pages.length}` : 'schedule', section: '安排', title: '拍摄安排', content: header() + body });
      body = '';
    };
    const append = (markup) => {
      if (body && measureMarkup(header() + body + markup) > height) flush();
      body += markup;
    };
    for (const entry of plan.schedule) {
      const entryMarkup = (text, start = 0) => `
        <div class="schedule-entry">
          ${start === 0 ? inlineField('schedule', entry.id, 'time', entry.time, { type: 'time', label: '拍摄时间', className: 'schedule-time' }) : '<span aria-hidden="true"></span>'}
          <div class="schedule-content">
            ${start === 0 ? inlineField('schedule', entry.id, 'title', entry.title, { placeholder: '拍摄安排', className: 'schedule-title' }) : ''}
            ${inlineField('schedule', entry.id, 'detail', entry.detail, { text, start, multiline: true, placeholder: '写下画面与操作……', className: 'schedule-detail' })}
          </div>
          <button class="row-remove" data-remove-schedule="${escapeHtml(entry.id)}" aria-label="删除这条拍摄安排">×</button>
        </div>`;
      if (measureMarkup(header() + entryMarkup(entry.detail)) <= height) {
        append(entryMarkup(entry.detail));
        continue;
      }
      flush();
      let start = 0;
      while (start < entry.detail.length) {
        const text = splitMarkupText(entry.detail.slice(start), (chunk) => header() + entryMarkup(chunk, start), height, 1)[0];
        append(entryMarkup(text, start));
        start += text.length;
        flush();
      }
    }
    append('<button class="small-link" data-action="add-schedule">＋ 添加拍摄安排</button>');

    let checklistStarted = false;
    const checklistMarkup = (rows, isLast = false) => `
      ${checklistStarted ? '' : '<h2 class="section-heading preparation-heading">出发准备</h2>'}
      <ul class="checklist">${rows.join('')}</ul>
      ${isLast ? '<button class="small-link" data-action="add-checklist">＋ 添加准备事项</button>' : ''}`;
    const items = plan.checklist.map((item) => `<li>
      <input type="checkbox" data-check="${escapeHtml(item.id)}" ${item.checked ? 'checked' : ''} aria-label="完成 ${escapeHtml(item.label || '准备事项')}">
      ${inlineField('checklist', item.id, 'label', item.label, { placeholder: '写下准备事项……', label: '准备事项' })}
      <button class="row-remove" data-remove-checklist="${escapeHtml(item.id)}" aria-label="删除这条准备事项">×</button>
    </li>`);
    let rows = [];
    for (const item of items) {
      if (rows.length && measureMarkup(header() + checklistMarkup([...rows, item], true)) > height) {
        append(checklistMarkup(rows));
        checklistStarted = true;
        flush();
        rows = [];
      }
      rows.push(item);
    }
    append(checklistMarkup(rows, true));
    flush();
    return pages;
  }

  function photoAnnotationMatch(photo) {
    if (!state.query) return null;
    return photo.annotations.find((item) => item.type === 'text' && item.text.toLocaleLowerCase().includes(state.query.toLocaleLowerCase()));
  }

  function annotationMatchSnippet(item) {
    const index = item.text.toLocaleLowerCase().indexOf(state.query.toLocaleLowerCase());
    return item.text.slice(Math.max(0, index - 8), index + state.query.length + 15);
  }

  function makePlanPages(plan) {
    const pages = [];
    const date = dateParts(plan.date);
    const planField = (name, options) => inlineField('plan', plan.id, name, plan[name], options);
    const intro = (first) => `
      <div class="page-header"><span>拍摄计划</span><span>拍摄概况</span></div>
      <div class="title-date">${planField('date', { type: 'date', label: '拍摄日期' })}</div>
      <h1 class="plan-title">${planField('title', { placeholder: '写下计划标题' })}</h1>
      <dl class="plan-basics">
        <div><dt>地点</dt><dd>${planField('location', { placeholder: '拍摄地点' })}</dd></div>
        <div><dt>题材</dt><dd>${planField('genre', { placeholder: '拍摄题材' })}</dd></div>
      </dl>
      <div class="field-block"><span class="field-label">想拍的画面</span>
        ${planField('intent', { ...first, multiline: true, placeholder: '写下这次拍摄的想法……', className: 'field-text' })}
      </div>
      <div class="weather-slip"><small>天气引用</small><p>尚未添加该日天气资料</p><small>可在正式组件中收进报纸与手册的建议</small></div>`;
    const firstIntent = splitMarkupText(plan.intent, (text) => intro({ text, start: 0 }), 558, 1)[0] || '';
    pages.push({ id: 'overview', section: '概况', title: plan.title || '拍摄计划', content: intro({ text: firstIntent, start: 0 }) });
    const remainingIntent = plan.intent.slice(firstIntent.length);
    const continuations = remainingIntent ? textSegments(remainingIntent, 538).map((segment) => ({ ...segment, start: segment.start + firstIntent.length })) : [];
    continuations.forEach((segment, index) => pages.push({
      id: `intent-${index}`, section: '概况', title: '拍摄想法',
      content: planField('intent', { ...segment, multiline: true, placeholder: '接着写下拍摄想法……', className: 'text-lines' }),
    }));
    pages.push(...makeSchedulePages(plan, date));

    for (const photo of plan.photos) {
      const annotationMatch = photoAnnotationMatch(photo);
      const captions = textSegments(photo.caption, annotationMatch ? 57 : 86, 500);
      const photoField = (name, options) => inlineField('photos', photo.id, name, photo[name], options);
      const matchHint = annotationMatch ? `<p class="annotation-search-hit">文字批注 · ${highlight(annotationMatchSnippet(annotationMatch))}</p>` : '';
      pages.push({
        id: photo.id, section: '参考', title: photo.name || '参考照片',
        content: `<div class="page-header"><span>VISUAL REFERENCES</span><span>参考资料</span></div>
          <h2 class="section-heading">${photoField('name', { placeholder: '图片名称' })}</h2>${matchHint}
          <figure class="photo-card${annotationMatch ? ' search-match' : ''}">
            <button class="photo-button" data-annotate="${escapeHtml(photo.id)}" aria-label="批注${escapeHtml(photo.name || '参考照片')}">
              <img src="${escapeHtml(photo.source)}" alt="${escapeHtml(photo.name)}"><canvas data-photo-canvas="${escapeHtml(photo.id)}" aria-hidden="true"></canvas>
            </button>
            <figcaption class="photo-meta"><span>${photo.annotations.length} 条批注</span><span>点击照片进行批注</span></figcaption>
          </figure>
          ${photoField('caption', { ...captions[0], multiline: true, placeholder: '写下图片说明……', className: 'photo-caption' })}
          <button class="photo-link" data-annotate="${escapeHtml(photo.id)}">写批注 ↗</button>
          <button class="photo-link" data-remove-photo="${escapeHtml(photo.id)}">移除</button>`,
      });
      captions.slice(1).forEach((segment, index) => pages.push({
        id: `${photo.id}-caption-${index}`, section: '参考', title: `${photo.name || '参考照片'} · 说明`,
        content: `${photoField('caption', { ...segment, multiline: true, placeholder: '接着写下图片说明……', className: 'text-lines' })}
          <button class="photo-link" data-annotate="${escapeHtml(photo.id)}">查看原图与批注 ↗</button>`,
      }));
    }
    if (!plan.photos.length) pages.push({ id: 'empty-reference', section: '参考', title: '参考资料', content: '<div class="page-header"><span>VISUAL REFERENCES</span><span>参考资料</span></div><div class="empty-page"><h3>留一页给喜欢的画面</h3><p>参考照片、构图草图、现场记录</p><button data-action="upload">＋ 贴入第一张图片</button></div>' });
    if (uploadError) pages.push({ id: 'upload-error', section: '参考', title: '图片上传失败', content: '<h2 class="continuation-title">参考资料</h2><div class="status-slip"><p>图片未能读取，已保留插入位置。</p><button data-action="retry-upload">重新选择图片</button></div><div class="empty-page"><h3>图片等待重新读取</h3></div>' });
    if (plan.photos.length && !uploadError) pages.at(-1).endAction = '<button class="page-end-action" data-action="upload">＋ 贴入参考图片</button>';
    textSegments(plan.notes, 455, 538).forEach((segment, index) => pages.push({
      id: `notes-${index}`, section: '笔记', title: '拍摄备注',
      content: `${index === 0 ? '<div class="page-header"><span>FIELD NOTES</span><span>拍摄备注</span></div><h2 class="continuation-title">再记几笔</h2>' : ''}
        ${planField('notes', { ...segment, multiline: true, placeholder: '写下拍摄备注……', className: 'text-lines note-field' })}`,
    }));
    for (const extra of plan.extraPages) {
      textSegments(extra.text, 455, 500).forEach((segment, index) => pages.push({
        id: `${extra.id}-${index}`, section: '笔记', title: extra.title || '拍摄资料',
        content: `<div class="page-header"><span>${index === 0 ? 'INSERTED PAGE' : ''}</span>
          <button class="page-delete" data-remove-extra="${escapeHtml(extra.id)}">删除资料页</button></div>
          ${index === 0 ? `<h2 class="continuation-title">${inlineField('extraPages', extra.id, 'title', extra.title, { placeholder: '资料页标题' })}</h2>` : ''}
          ${inlineField('extraPages', extra.id, 'text', extra.text, { ...segment, multiline: true, placeholder: '写下资料内容……', className: 'text-lines note-field' })}`,
      }));
    }
    return pages;
  }

  function render(anchor = captureInlineSelection()) {
    if (inlineComposition) return;
    pageTurnAnimation?.cancel();
    pageTurnAnimation = null;
    byId('book').querySelector('.turning-leaf')?.remove();
    const plan = currentPlan();
    byId('book').hidden = state.closed;
    byId('cover').hidden = !state.closed;
    byId('close-book').hidden = state.closed;
    byId('back-button').hidden = !plan || state.closed;
    byId('breadcrumb').textContent = plan ? plan.title || '未命名拍摄计划' : '我的拍摄计划';
    byId('section-tabs').hidden = !plan;
    byId('thumb-toggle').hidden = !plan || state.closed;
    byId('previous-page').hidden = state.closed;
    byId('next-page').hidden = state.closed;
    if (!plan) {
      const plans = matchingPlans();
      const directoryPages = Math.max(1, Math.ceil(plans.length / plansPerIndexPage));
      state.spread = Math.max(0, Math.min(state.spread, Math.floor(directoryPages / 2)));
      const firstDirectoryPage = Math.max(1, state.spread * 2);
      const lastDirectoryPage = Math.min(directoryPages, state.spread * 2 + 1);
      const visiblePages = firstDirectoryPage === lastDirectoryPage ? String(firstDirectoryPage) : `${firstDirectoryPage} – ${lastDirectoryPage}`;
      byId('spread').innerHTML = indexPages(plans).join('');
      byId('section-tabs').innerHTML = '';
      byId('page-counter').textContent = state.closed ? '封面' : `${state.trash ? '回收夹' : '目录'} ${visiblePages} / ${directoryPages}`;
      byId('previous-page').disabled = state.spread === 0;
      byId('next-page').disabled = lastDirectoryPage >= directoryPages;
    } else {
      const pages = makePlanPages(plan);
      if (anchor?.planId === plan.id) {
        const template = document.createElement('template');
        const containsAnchor = (item) => {
          template.innerHTML = item.content;
          return Boolean(matchingInlineField(template.content, anchor));
        };
        const preferred = pages.findIndex((item) => item.id === anchor.pageId);
        const target = preferred >= 0 && containsAnchor(pages[preferred]) ? preferred : pages.findIndex(containsAnchor);
        if (target >= 0) state.spread = Math.floor(target / 2);
      }
      state.spread = Math.max(0, Math.min(state.spread, Math.ceil(pages.length / 2) - 1));
      const first = state.spread * 2;
      byId('spread').innerHTML = [0, 1].map((offset) => {
        const item = pages[first + offset];
        const isLastPage = first + offset === pages.length - 1;
        const endAction = isLastPage ? '<button class="page-end-action" data-action="add-page">＋ 加一页</button>' : item?.endAction;
        return page(item?.content || '<div class="blank-spread"><p>这一页留给下一次灵感。</p></div>', offset === 0 ? 'left' : 'right', String(first + offset + 1).padStart(2, '0'), item?.title || plan.title, endAction, item?.id || 'blank');
      }).join('');
      byId('page-counter').textContent = `${first + 1} – ${Math.min(first + 2, pages.length)} / ${pages.length}`;
      byId('previous-page').disabled = state.spread === 0;
      byId('next-page').disabled = first + 2 >= pages.length;
      const sections = ['概况', '安排', '参考', '笔记'];
      byId('section-tabs').innerHTML = sections.map((section) => `<button data-section="${section}" aria-current="${pages[first]?.section === section || pages[first + 1]?.section === section}">${section}</button>`).join('');
      byId('thumbnail-strip').innerHTML = pages.map((item, index) => `<button class="thumbnail ${Math.floor(index / 2) === state.spread ? 'current' : ''}" data-page="${index}" aria-label="第${index + 1}页，${escapeHtml(item.title)}"><strong>${escapeHtml(item.title)}</strong><i></i><i></i><i></i><i></i><span>${String(index + 1).padStart(2, '0')}</span></button>`).join('');
      fitInlineFields(byId('spread'));
      byId('spread').querySelectorAll('[data-inline]').forEach((input) => {
        input.classList.toggle('search-match', Boolean(state.query) && input.value.toLocaleLowerCase().includes(state.query.toLocaleLowerCase()));
      });
      restoreInlineSelection(anchor);
      drawVisibleAnnotations();
    }
    byId('thumbnail-strip').hidden = !state.thumbs || !plan || state.closed;
    byId('thumb-toggle').setAttribute('aria-expanded', String(state.thumbs));
    scaleBook();
  }

  async function turn(change, direction = 1) {
    const old = byId('spread').children[direction > 0 ? 1 : 0]?.cloneNode(true);
    change();
    render();
    if (old && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const leaf = document.createElement('div');
      leaf.className = `turning-leaf${direction < 0 ? ' backward' : ''}`;
      const front = document.createElement('div');
      front.className = 'leaf-front';
      front.append(old);
      const back = document.createElement('div');
      back.className = 'leaf-back';
      const next = byId('spread').children[direction > 0 ? 0 : 1].cloneNode(true);
      back.append(next);
      leaf.append(front, back);
      leaf.setAttribute('aria-hidden', 'true');
      leaf.inert = true;
      leaf.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
      byId('book').append(leaf);
      const animation = leaf.animate([{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${direction > 0 ? -180 : 180}deg)` }], { duration: 620, easing: 'cubic-bezier(.25,.6,.3,1)' });
      pageTurnAnimation = animation;
      try { await animation.finished; } catch { /* A closed page can cancel the decorative animation. */ }
      leaf.remove();
      if (pageTurnAnimation === animation) pageTurnAnimation = null;
    }
  }

  function openPlan(id) {
    turn(() => {
      state.planId = id;
      state.spread = 0;
      state.trash = false;
      const plan = currentPlan();
      if (state.query && plan) {
        const pages = makePlanPages(plan);
        const template = document.createElement('template');
        const found = pages.findIndex((item) => {
          template.innerHTML = item.content;
          return item.content.includes('<mark>') || [...template.content.querySelectorAll('[data-inline]')].some((input) => input.value.toLocaleLowerCase().includes(state.query.toLocaleLowerCase()));
        });
        if (found >= 0) state.spread = Math.floor(found / 2);
      }
    });
  }

  function backToIndex() {
    turn(() => { state.planId = null; state.spread = 0; state.thumbs = false; }, -1);
  }

  function scaleBook() {
    const scale = Math.min(1, (window.innerWidth - 200) / 1035, (window.innerHeight - 144) / 790);
    const bounded = Math.max(.6, scale);
    document.documentElement.style.setProperty('--scale', bounded);
    byId('book-viewport').style.height = `${790 * bounded + (state.thumbs ? 130 * bounded : 0)}px`;
  }

  function field(label, name, value, type = 'text') {
    const input = type === 'textarea' ? `<textarea name="${name}">${escapeHtml(value)}</textarea>` : `<input name="${name}" type="${type}" value="${escapeHtml(value)}">`;
    return `<label class="writing-field"><span>${label}</span>${input}</label>`;
  }

  function startWriting() {
    byId('writing-title').textContent = '新建一份拍摄计划';
    byId('writing-fields').innerHTML = field('计划标题', 'title', '')
      + `<div class="writing-grid">${field('拍摄日期', 'date', '', 'date')}${field('题材', 'genre', '街拍')}</div>`
      + field('拍摄地点', 'location', '') + field('想拍的画面', 'intent', '', 'textarea');
    byId('writing-dialog').showModal();
    byId('writing-fields').querySelector('input').focus();
  }

  function commitWriting(event) {
    event.preventDefault();
    const data = new FormData(byId('writing-form'));
    rememberChange();
    const plan = blankPlan();
    for (const key of ['title', 'date', 'location', 'genre', 'intent']) plan[key] = String(data.get(key) || '').trim();
    plan.title ||= '未命名拍摄计划';
    store.plans.push(plan);
    state.planId = plan.id;
    state.spread = 0;
    state.query = '';
    state.trash = false;
    byId('writing-dialog').close();
    finishChange('拍摄计划已创建');
  }

  function confirmAction(title, copy, action) {
    byId('confirm-title').textContent = title;
    byId('confirm-copy').textContent = copy;
    byId('confirm-done').textContent = title;
    pendingConfirm = action;
    byId('confirm-dialog').showModal();
  }

  function addPage() {
    const plan = currentPlan();
    rememberChange();
    const extra = { id: uid(), title: '拍摄资料', text: '' };
    plan.extraPages.push(extra);
    const pages = makePlanPages(plan);
    const index = pages.findIndex((item) => item.id === `${extra.id}-0`);
    const target = Math.floor(index / 2);
    if (target === state.spread) render();
    else turn(() => { state.spread = target; });
    save();
    toast('已加一张资料页，空白页将保留', true);
  }

  function selectPhotos() {
    if (!currentPlan()) return;
    byId('photo-input').value = '';
    byId('photo-input').click();
  }

  async function uploadPhotos(files) {
    const plan = currentPlan();
    if (!plan || !files.length) return;
    rememberChange();
    setSaveStatus(`◌ 正在读取 ${files.length} 张图片`);
    let firstId;
    for (const file of files) {
      try {
        const source = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await new Promise((resolve, reject) => { const image = new Image(); image.onload = resolve; image.onerror = reject; image.src = source; });
        const photo = { id: uid(), source, name: file.name.replace(/\.[^.]+$/, ''), caption: '', annotations: [] };
        plan.photos.push(photo);
        firstId ||= photo.id;
      } catch { uploadError = true; }
    }
    if (firstId) {
      uploadError = false;
      const pages = makePlanPages(plan);
      state.spread = Math.floor(pages.findIndex((item) => item.id === firstId) / 2);
    }
    finishChange(firstId ? '图片已贴进参考资料' : '图片读取失败，可重新选择');
  }

  function paintAnnotations(canvas, items, imageWidth, imageHeight, contain = false) {
    const width = canvas.clientWidth || 900;
    const height = canvas.clientHeight || 600;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    let drawWidth = width;
    let drawHeight = height;
    if (contain) {
      const scale = Math.min(width / imageWidth, height / imageHeight);
      drawWidth = imageWidth * scale;
      drawHeight = imageHeight * scale;
    }
    const offsetX = (width - drawWidth) / 2;
    const offsetY = (height - drawHeight) / 2;
    for (const item of items) {
      ctx.strokeStyle = item.color;
      ctx.fillStyle = item.color;
      ctx.lineWidth = Math.max(1.5, drawWidth / 420);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (item.type === 'text') {
        ctx.font = `${Math.max(10, drawWidth / 45)}px 'PingFang SC', sans-serif`;
        ctx.fillText(item.text, offsetX + item.x * drawWidth, offsetY + item.y * drawHeight);
        continue;
      }
      if (!item.points?.length) continue;
      ctx.beginPath();
      item.points.forEach((point, index) => {
        const x = offsetX + point.x * drawWidth;
        const y = offsetY + point.y * drawHeight;
        if (!index) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      if (item.type === 'arrow' && item.points.length > 1) {
        const end = item.points.at(-1);
        const start = item.points[0];
        const angle = Math.atan2((end.y - start.y) * drawHeight, (end.x - start.x) * drawWidth);
        const x = offsetX + end.x * drawWidth;
        const y = offsetY + end.y * drawHeight;
        const size = Math.max(9, drawWidth / 65);
        ctx.beginPath();
        ctx.moveTo(x - size * Math.cos(angle - .5), y - size * Math.sin(angle - .5));
        ctx.lineTo(x, y);
        ctx.lineTo(x - size * Math.cos(angle + .5), y - size * Math.sin(angle + .5));
        ctx.stroke();
      }
    }
  }

  function drawVisibleAnnotations() {
    const plan = currentPlan();
    document.querySelectorAll('[data-photo-canvas]').forEach((canvas) => {
      const photo = plan.photos.find((item) => item.id === canvas.dataset.photoCanvas);
      const image = canvas.previousElementSibling;
      const paint = () => paintAnnotations(canvas, photo.annotations, image.naturalWidth, image.naturalHeight, true);
      if (image.complete) requestAnimationFrame(paint);
      else image.addEventListener('load', paint, { once: true });
    });
  }

  function startAnnotation(id) {
    const plan = currentPlan();
    const photo = plan.photos.find((item) => item.id === id);
    annotation = { photoId: id, planId: plan.id, tool: 'pen', items: clone(photo.annotations), undo: [], redo: [], stroke: null, textPoint: null };
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey));
      if (saved?.photoId === id && saved?.planId === plan.id && Array.isArray(saved.items)) {
        annotation.items = saved.items;
        toast('已恢复上次的批注草稿');
      }
    } catch { /* The active editing session works even when draft storage is unavailable. */ }
    byId('annotation-title').textContent = photo.name || '参考照片';
    byId('annotation-image').src = photo.source;
    byId('annotation-image').onload = drawAnnotation;
    byId('annotation-dialog').showModal();
    document.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('selected', button.dataset.tool === 'pen'));
    requestAnimationFrame(drawAnnotation);
  }

  function drawAnnotation() {
    if (!annotation) return;
    const image = byId('annotation-image');
    const items = annotation.stroke ? [...annotation.items, annotation.stroke] : annotation.items;
    paintAnnotations(byId('annotation-canvas'), items, image.naturalWidth, image.naturalHeight);
    byId('annotation-undo').disabled = !annotation.undo.length;
    byId('annotation-redo').disabled = !annotation.redo.length;
  }

  function saveAnnotationDraft() {
    try { localStorage.setItem(draftKey, JSON.stringify({ photoId: annotation.photoId, planId: annotation.planId, items: annotation.items })); } catch { byId('annotation-hint').textContent = '批注草稿保留在当前窗口，请完成后保存'; }
  }

  function annotationChange() {
    annotation.undo.push(clone(annotation.items));
    annotation.redo = [];
  }

  function annotationPoint(event) {
    const rect = byId('annotation-canvas').getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  }

  function closeAnnotation(commit) {
    if (!annotation) return;
    if (commit) {
      rememberChange();
      const plan = store.plans.find((item) => item.id === annotation.planId);
      const photo = plan?.photos.find((item) => item.id === annotation.photoId);
      if (photo) photo.annotations = clone(annotation.items);
      save();
    }
    try { localStorage.removeItem(draftKey); } catch { /* The current session already holds its state. */ }
    annotation = null;
    byId('annotation-text-entry').hidden = true;
    byId('annotation-dialog').close();
    render();
    if (commit) toast('批注已收进这张照片', true);
  }

  function handleAction(action) {
    if (action === 'new') startWriting();
    if (action === 'add-schedule' || action === 'add-checklist') {
      const plan = currentPlan();
      const isSchedule = action === 'add-schedule';
      const scope = isSchedule ? 'schedule' : 'checklist';
      const item = isSchedule ? { id: uid(), time: '', title: '', detail: '' } : { id: uid(), label: '', checked: false };
      rememberChange();
      plan[scope].push(item);
      const fieldName = isSchedule ? 'title' : 'label';
      render({ planId: plan.id, key: `${scope}/${item.id}/${fieldName}`, start: 0, end: 0 });
      save();
    }
    if (action === 'upload') selectPhotos();
    if (action === 'retry-upload') { uploadError = false; selectPhotos(); }
    if (action === 'add-page') addPage();
    if (action === 'trash') { state.trash = !state.trash; state.spread = 0; state.query = ''; render(); }
    if (action === 'undo' || action === 'redo') {
      const history = action === 'undo' ? writingHistory : writingFuture;
      const destination = action === 'undo' ? writingFuture : writingHistory;
      if (!history.length) { toast(action === 'undo' ? '当前没有可撤销的修改' : '当前没有可重做的修改'); return; }
      destination.push({ store: clone(store), anchor: captureInlineSelection() });
      const previous = history.pop();
      store = previous.store;
      if (!currentPlan()) state.planId = null;
      save(); render(previous.anchor); toast(action === 'undo' ? '已撤销上一次修改' : '已重做上一次修改');
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.action) handleAction(button.dataset.action);
    if (button.dataset.open) openPlan(button.dataset.open);
    if (button.dataset.annotate) startAnnotation(button.dataset.annotate);
    if (button.dataset.removeSchedule || button.dataset.removeChecklist) {
      const scope = button.dataset.removeSchedule ? 'schedule' : 'checklist';
      const id = button.dataset.removeSchedule || button.dataset.removeChecklist;
      rememberChange();
      currentPlan()[scope] = currentPlan()[scope].filter((item) => item.id !== id);
      finishChange(scope === 'schedule' ? '拍摄安排已删除' : '准备事项已删除');
    }
    if (button.dataset.removeExtra) {
      const extra = currentPlan().extraPages.find((item) => item.id === button.dataset.removeExtra);
      confirmAction('删除资料页', `“${extra.title || '拍摄资料'}”及其全部续页内容将一起删除，可通过撤销恢复。`, () => {
        rememberChange({ planId: state.planId, key: `extraPages/${extra.id}/text`, pageId: `${extra.id}-0`, start: 0, end: 0 });
        currentPlan().extraPages = currentPlan().extraPages.filter((item) => item.id !== extra.id);
        finishChange('资料页及其续页已删除');
      });
    }
    if (button.dataset.deletePlan) {
      const plan = store.plans.find((item) => item.id === button.dataset.deletePlan);
      confirmAction('移入回收夹', `“${plan.title}”及其全部文字、图片和批注将移入回收夹，可以从目录恢复。`, () => {
        rememberChange();
        store.trash.push(plan);
        store.plans = store.plans.filter((item) => item.id !== plan.id);
        finishChange('计划已移入回收夹');
      });
    }
    if (button.dataset.restore) {
      rememberChange();
      const plan = store.trash.find((item) => item.id === button.dataset.restore);
      store.plans.push(plan);
      store.trash = store.trash.filter((item) => item.id !== plan.id);
      finishChange('计划已恢复到目录');
    }
    if (button.dataset.section) {
      const pages = makePlanPages(currentPlan());
      const target = Math.floor(pages.findIndex((item) => item.section === button.dataset.section) / 2);
      if (target !== state.spread) turn(() => { state.spread = target; }, target > state.spread ? 1 : -1);
    }
    if (button.dataset.page !== undefined) {
      const target = Math.floor(Number(button.dataset.page) / 2);
      turn(() => { state.spread = target; }, target > state.spread ? 1 : -1);
    }
    if (button.dataset.removePhoto) {
      confirmAction('移除图片', '这次插入的图片与批注会一起移除，随后可点击提示中的“撤销”恢复。', () => {
        rememberChange();
        currentPlan().photos = currentPlan().photos.filter((photo) => photo.id !== button.dataset.removePhoto);
        finishChange('图片已移除');
      });
    }
    if (button.dataset.tool && annotation) {
      annotation.tool = button.dataset.tool;
      document.querySelectorAll('[data-tool]').forEach((item) => item.classList.toggle('selected', item === button));
      byId('annotation-hint').textContent = { pen: '按住并拖动画笔', arrow: '拖动确定箭头的方向', text: '点击图片，写入文字批注' }[annotation.tool];
    }
    if (button.dataset.preview) {
      byId('about-dialog').close();
      previewState(button.dataset.preview);
    }
  });

  document.addEventListener('beforeinput', (event) => {
    if (event.target.matches('[data-inline]')) inlineBeforeInput = captureInlineSelection(event.target);
  });
  document.addEventListener('compositionstart', (event) => {
    if (event.target.matches('[data-inline]')) inlineComposition = { input: event.target, recorded: false };
  });
  document.addEventListener('compositionend', (event) => {
    if (!inlineComposition) return;
    updateInlineField(event.target);
    const anchor = captureInlineSelection(event.target);
    inlineComposition = null;
    save();
    render(anchor);
  });
  document.addEventListener('input', (event) => {
    if (event.target.matches('[data-inline]') && byId('spread').contains(event.target)) {
      updateInlineField(event.target);
      return;
    }
    if (event.target.matches('[data-plan-search]')) {
      const position = event.target.selectionStart;
      state.query = event.target.value;
      state.spread = 0;
      render();
      byId('plan-search-1').focus();
      try { byId('plan-search-1').setSelectionRange(position, position); } catch { /* Search inputs can omit selection controls. */ }
    }
  });
  document.addEventListener('change', (event) => {
    if (event.target.dataset.check !== undefined) {
      rememberChange();
      currentPlan().checklist.find((item) => item.id === event.target.dataset.check).checked = event.target.checked;
      save();
    }
  });

  byId('writing-form').addEventListener('submit', commitWriting);
  byId('writing-cancel').addEventListener('click', () => byId('writing-dialog').close());
  byId('confirm-cancel').addEventListener('click', () => byId('confirm-dialog').close());
  byId('confirm-done').addEventListener('click', () => { byId('confirm-dialog').close(); pendingConfirm?.(); pendingConfirm = null; });
  byId('back-button').addEventListener('click', backToIndex);
  byId('brand').addEventListener('click', (event) => { event.preventDefault(); state.closed = false; backToIndex(); });
  byId('previous-page').addEventListener('click', () => { if (!byId('previous-page').disabled) turn(() => state.spread--, -1); });
  byId('next-page').addEventListener('click', () => { if (!byId('next-page').disabled) turn(() => state.spread++); });
  byId('close-book').addEventListener('click', () => { state.closed = true; state.planId = null; state.spread = 0; state.thumbs = false; render(); });
  byId('open-book').addEventListener('click', () => { state.closed = false; state.planId = null; state.spread = 0; state.query = ''; state.trash = false; render(); });
  byId('thumb-toggle').addEventListener('click', () => { state.thumbs = !state.thumbs; render(); });
  byId('save-status').addEventListener('click', () => { forceSaveFailure = false; save(true); });
  byId('about-button').addEventListener('click', () => byId('about-dialog').showModal());
  byId('about-close').addEventListener('click', () => byId('about-dialog').close());
  byId('photo-input').addEventListener('change', (event) => uploadPhotos(Array.from(event.target.files)));
  byId('reset-demo').addEventListener('click', () => {
    byId('about-dialog').close();
    confirmAction('恢复示例内容', '当前浏览器中的原型计划会替换为三份初始示例。', () => { store = seedStore(); state.planId = null; state.query = ''; state.spread = 0; state.trash = false; uploadError = false; forceSaveFailure = false; save(); render(); });
  });

  const annotationCanvas = byId('annotation-canvas');
  annotationCanvas.addEventListener('pointerdown', (event) => {
    if (!annotation) return;
    const point = annotationPoint(event);
    if (annotation.tool === 'text') {
      annotation.textPoint = point;
      byId('annotation-text-entry').hidden = false;
      byId('annotation-text').value = '';
      byId('annotation-text').focus();
      return;
    }
    annotationCanvas.setPointerCapture(event.pointerId);
    annotation.stroke = { type: annotation.tool, color: byId('annotation-color').value, points: [point] };
  });
  annotationCanvas.addEventListener('pointermove', (event) => {
    if (!annotation?.stroke) return;
    const point = annotationPoint(event);
    if (annotation.stroke.type === 'arrow') annotation.stroke.points[1] = point;
    else annotation.stroke.points.push(point);
    drawAnnotation();
  });
  const finishStroke = () => {
    if (!annotation?.stroke) return;
    if (annotation.stroke.points.length > 1) {
      annotationChange();
      annotation.items.push(annotation.stroke);
    }
    annotation.stroke = null;
    saveAnnotationDraft(); drawAnnotation();
  };
  annotationCanvas.addEventListener('pointerup', finishStroke);
  annotationCanvas.addEventListener('pointercancel', finishStroke);
  byId('annotation-text-add').addEventListener('click', () => {
    const text = byId('annotation-text').value.trim();
    if (text && annotation?.textPoint) {
      annotationChange();
      annotation.items.push({ type: 'text', color: byId('annotation-color').value, ...annotation.textPoint, text });
      saveAnnotationDraft(); drawAnnotation();
    }
    byId('annotation-text-entry').hidden = true;
  });
  byId('annotation-undo').addEventListener('click', () => {
    if (!annotation?.undo.length) return;
    annotation.redo.push(clone(annotation.items)); annotation.items = annotation.undo.pop(); saveAnnotationDraft(); drawAnnotation();
  });
  byId('annotation-redo').addEventListener('click', () => {
    if (!annotation?.redo.length) return;
    annotation.undo.push(clone(annotation.items)); annotation.items = annotation.redo.pop(); saveAnnotationDraft(); drawAnnotation();
  });
  byId('annotation-clear').addEventListener('click', () => { annotationChange(); annotation.items = []; saveAnnotationDraft(); drawAnnotation(); });
  byId('annotation-cancel').addEventListener('click', () => closeAnnotation(false));
  byId('annotation-done').addEventListener('click', () => closeAnnotation(true));
  byId('annotation-dialog').addEventListener('cancel', (event) => {
    event.preventDefault();
    if (!byId('annotation-text-entry').hidden) { byId('annotation-text-entry').hidden = true; return; }
    closeAnnotation(false);
  });

  function previewState(kind) {
    if (kind === 'empty') {
      rememberChange();
      const plan = blankPlan('新的拍摄计划');
      store.plans.push(plan); state.planId = plan.id; state.spread = 0; state.closed = false; save(); render();
    }
    if (kind === 'long') {
      if (!currentPlan()) state.planId = store.plans[0]?.id;
      if (!currentPlan()) { const plan = blankPlan('长文续页示例'); store.plans.push(plan); state.planId = plan.id; }
      rememberChange();
      currentPlan().notes = Array.from({ length: 12 }, (_, index) => `第${index + 1}段拍摄记录\n沿着江岸慢慢观察，先确定前景与远景的关系，再等待人物进入画面。把栏杆留在画面边缘，用水面的亮光连接不同层次。每一次改变机位，都记录下构图和光线的变化。`).join('\n\n');
      const pages = makePlanPages(currentPlan());
      state.spread = Math.floor(pages.findIndex((item) => item.id === 'notes-0') / 2);
      state.closed = false; save(); render(); toast('长文已自动接续到固定纸页');
    }
    if (kind === 'save-error') { forceSaveFailure = true; save(true); toast('保存失败状态预览，点击右下角可重试'); }
    if (kind === 'upload-error') {
      if (!currentPlan()) state.planId = store.plans[0]?.id;
      if (!currentPlan()) return;
      uploadError = true;
      state.spread = Math.floor(makePlanPages(currentPlan()).findIndex((item) => item.id === 'upload-error') / 2);
      state.closed = false; render();
    }
  }

  document.addEventListener('keydown', (event) => {
    if (event.isComposing || inlineComposition || document.querySelector('dialog[open]')) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && (event.target.matches('[data-inline]') || !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))) {
      event.preventDefault();
      handleAction(event.shiftKey ? 'redo' : 'undo');
      return;
    }
    if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.key === 'ArrowLeft') byId('previous-page').click();
    if (event.key === 'ArrowRight') byId('next-page').click();
    if (event.key === 'Escape' && currentPlan()) backToIndex();
  });
  window.addEventListener('resize', () => { scaleBook(); drawVisibleAnnotations(); if (annotation) drawAnnotation(); });
  window.addEventListener('pagehide', () => { clearTimeout(saveTimer); if (!forceSaveFailure) { try { localStorage.setItem(storageKey, JSON.stringify(store)); } catch { /* The last confirmed browser copy remains available. */ } } });
  document.fonts?.ready.then(render);
  render();
})();
