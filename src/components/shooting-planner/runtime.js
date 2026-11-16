import { bindPaperGestures } from "../shared/paper-wheel";

export function mountPlanner(root, options) {
  const lifecycle = new AbortController();
  let destroyed = false;
  const document = {
    getElementById: id => root.getElementById(id),
    querySelector: selector => root.querySelector(selector),
    querySelectorAll: selector => root.querySelectorAll(selector),
    createElement: name => globalThis.document.createElement(name),
    get activeElement() { return root.activeElement; },
    get body() { return root.querySelector('.planner-app'); },
    get documentElement() { return root.host; },
    fonts: globalThis.document.fonts,
    addEventListener: (type, listener) => root.addEventListener(type, listener, { signal: lifecycle.signal }),
  };

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const uid = () => window.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const plansPerIndexPage = 4;
  let toastTimer;
  let annotation;
  let pendingConfirm;
  let pendingReference;
  let managedPlanId;
  const pageCounts = new Map();
  let inlineComposition = null;
  let inlineBeforeInput = null;
  let logicalSelection = null;
  let breakTarget = null;
  let pageTurnAnimation = null;
  let writingHistory = [];
  let writingFuture = [];
  const uploadErrors = new Set();
  let directorySpread = 0;
  const readingPositions = new Map(Object.entries(options.view || {}));
  let viewTimer;
  let latestReference = null;
  const savedPlans = new Map();
  let store = clone(options.notebook);
  for (const plan of [...store.plans, ...store.trash]) {
    for (const item of plan.checklist) item.id ||= uid();
  }
  for (const plan of [...store.plans, ...store.trash]) savedPlans.set(plan.id, JSON.stringify({ ...plan, updatedAt: 0 }));
  const state = { planId: null, spread: 0, query: '', trash: false, closed: false, thumbs: false };

  function blankPlan(title = '新的拍摄计划') {
    return {
      id: uid(), title, status: 'draft', date: '', location: '', genre: '街拍', intent: '', notes: '',
      schedule: [], checklist: [], photos: [], extraPages: [], references: [], breaks: {}, createdAt: Date.now(), updatedAt: Date.now(),
    };
  }

  function currentPlan() {
    return store.plans.find((plan) => plan.id === state.planId);
  }

  function setSaveStatus(message, error = false) {
    options.onStatus?.(message, error);
  }

  function save() {
    if (destroyed) return Promise.resolve();
    for (const plan of [...store.plans, ...store.trash]) {
      const content = JSON.stringify({ ...plan, updatedAt: 0 });
      if (savedPlans.has(plan.id) && savedPlans.get(plan.id) !== content) plan.updatedAt = Math.max(Date.now(), plan.updatedAt + 1);
      savedPlans.set(plan.id, content);
    }
    return options.storage.save(clone(store));
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

  function referenceTime(value) {
    if (!value) return '获取时间未知';
    const timestamp = new Date(value);
    if (!Number.isFinite(timestamp.getTime())) return String(value);
    return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' }).format(timestamp);
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
    return [plan.title, plan.date, plan.location, plan.genre, plan.intent, plan.notes, ...plan.checklist.map((item) => item.label), ...plan.schedule.flatMap((entry) => [entry.title, entry.detail]), ...plan.photos.flatMap((photo) => [photo.caption, photo.name, ...photo.annotations.filter((item) => item.type === 'text').map((item) => item.text)]), ...plan.extraPages.flatMap((page) => [page.title, page.text]), ...(plan.references || []).flatMap(item => [item.label, item.body])].join('\n');
  }

  function matchingPlans() {
    const plans = [...(state.trash ? store.trash : store.plans)].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.createdAt - b.createdAt);
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
        const title = `<div class="page-header"><span>HIKARI DAILY</span><span>PHOTOGRAPHY</span></div><h1 class="index-title">拍摄计划本</h1><div class="index-rule"></div><figure class="index-photo"><img src="/textures/riverside-film.webp" alt="江岸光影"><figcaption>江岸光影 · 扉页</figcaption></figure>`;
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
      const deleteButton = state.trash
        ? `<button class="plan-delete" data-purge-plan="${escapeHtml(plan.id)}" aria-label="永久删除计划 ${escapeHtml(plan.title)}">永久删除</button>`
        : `<button class="plan-delete" data-manage-plan="${escapeHtml(plan.id)}" aria-label="管理计划 ${escapeHtml(plan.title)}">管理</button>`;
      let count = pageCounts.get(plan.id);
      if (!count || count.updatedAt !== plan.updatedAt) { count = { updatedAt: plan.updatedAt, pages: makePlanPages(plan).length }; pageCounts.set(plan.id, count); }
      const status = { draft: '草稿', planned: '待拍', done: '已拍' }[plan.status || 'draft'];
      return `<div class="plan-row"><button class="plan-entry" data-${state.trash ? 'restore' : 'open'}="${escapeHtml(plan.id)}"><span class="plan-date">${escapeHtml(date.day)}<small>${escapeHtml(date.month)}</small></span><span><strong>${highlight(plan.title || '未命名拍摄计划')}</strong><span class="plan-meta">${escapeHtml(plan.location || '地点待定')} · ${escapeHtml(plan.genre)} · ${count.pages}页 · ${status}</span>${snippet ? `<span class="search-snippet">${highlight(snippet)}</span>` : ''}</span><span class="page-ref">${state.trash ? '恢复' : String(firstEntry + index + 1).padStart(2, '0')}</span></button>${deleteButton}</div>`;
    }).join('');
    const trashAction = state.trash
      ? '返回全部计划'
      : '<svg aria-hidden="true" viewBox="0 0 18 18"><path d="M2.25 5.25h4.4l1.45 1.5h7.65v6.5a1.5 1.5 0 0 1-1.5 1.5h-10.5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M5.75 9.25h6.5m-6.5 2.25h4.5"/></svg>回收夹';
    return `<div class="index-heading-row"><h2>${state.trash ? '回收夹' : '目录'}</h2><button class="small-link" data-action="trash">${trashAction}</button></div><label class="search-field"><input id="plan-search-${pageNumber}" data-plan-search type="search" aria-label="搜索计划、文字与批注" placeholder="搜索计划、文字与批注" value="${escapeHtml(state.query)}"><span aria-hidden="true">⌕</span></label><div class="plan-list">${list || '<div class="empty-page"><h3>这里还没有计划</h3></div>'}</div>${state.trash ? '' : '<button class="new-plan-button" data-action="new">＋ 新建一份拍摄计划</button>'}<div class="index-bottom"><span>${plans.length} 份${state.trash ? '已删除' : '拍摄'}计划</span><span>${state.query ? '检索标题、正文与文字批注' : '按拍摄日期整理'}</span></div>`;
  }

  function safeTextCut(text, index) {
    const previous = text.charCodeAt(index - 1);
    const next = text.charCodeAt(index);
    if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) return index > 1 ? index - 1 : index + 1;
    return index;
  }

  function splitText(text, maxHeight, continuationHeight = maxHeight, breaks = []) {
    if (breaks.length) {
      const boundaries = [...new Set(breaks.filter(offset => offset >= 0 && offset <= text.length))].sort((a, b) => a - b);
      const segments = [];
      let start = 0;
      for (const end of [...boundaries, text.length]) {
        segments.push(...splitText(text.slice(start, end), segments.length ? continuationHeight : maxHeight, continuationHeight));
        start = end;
      }
      return segments;
    }
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
    const beforeInput = inlineBeforeInput;
    const oldSelectionStart = beforeInput?.key === input.dataset.inlineKey ? beforeInput.start : start;
    const oldSelectionEnd = beforeInput?.key === input.dataset.inlineKey ? beforeInput.end : end;
    shiftBreaks(input.dataset.inlineKey, oldSelectionStart, oldSelectionEnd, after.length - before.length);
    target[fieldName] = after;
    input.dataset.end = String(start + input.value.length);
    currentPlan().updatedAt = Date.now();
    if (inlineComposition) { fitInlineFields(byId('spread')); return; }
    const anchor = captureInlineSelection(input);
    save();
    render(anchor);
  }

  function textSegments(value, firstHeight, continuationHeight = firstHeight, breaks = []) {
    let start = 0;
    return splitText(value, firstHeight, continuationHeight, breaks).map((text) => {
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
      const manualBreaks = plan.breaks?.[`schedule/${entry.id}/detail`] || [];
      if (!manualBreaks.length && measureMarkup(header() + entryMarkup(entry.detail)) <= height) {
        append(entryMarkup(entry.detail));
        continue;
      }
      flush();
      let start = 0;
      for (const end of [...manualBreaks, entry.detail.length]) {
        if (end === start) { append(entryMarkup('', start)); flush(); }
        while (start < end) {
          const text = splitMarkupText(entry.detail.slice(start, end), chunk => header() + entryMarkup(chunk, start), height, 1)[0];
          append(entryMarkup(text, start)); start += text.length; flush();
        }
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
      <div class="weather-slip"><small>天气引用</small><p>${plan.references?.length ? `已收录 ${plan.references.length} 份资料，见笔记页` : plan.date && plan.date > new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date()) ? '暂无该日预报' : '尚未收录天气与拍摄建议'}</p></div>`;
    const intentBreaks = plan.breaks?.[`plan/${plan.id}/intent`] || [];
    const firstIntent = splitMarkupText(plan.intent.slice(0, intentBreaks[0] ?? plan.intent.length), (text) => intro({ text, start: 0 }), 558, 1)[0] || '';
    pages.push({ id: 'overview', section: '概况', title: plan.title || '拍摄计划', content: intro({ text: firstIntent, start: 0 }) });
    const remainingIntent = plan.intent.slice(firstIntent.length);
    const continuations = remainingIntent || intentBreaks.includes(plan.intent.length) ? textSegments(remainingIntent, 538, 538, intentBreaks.filter(offset => offset > firstIntent.length).map(offset => offset - firstIntent.length)).map((segment) => ({ ...segment, start: segment.start + firstIntent.length })) : [];
    continuations.forEach((segment, index) => pages.push({
      id: `intent-${index}`, section: '概况', title: '拍摄想法',
      content: planField('intent', { ...segment, multiline: true, placeholder: '接着写下拍摄想法……', className: 'text-lines' }),
    }));
    pages.push(...makeSchedulePages(plan, date));

    for (const photo of plan.photos) {
      const annotationMatch = photoAnnotationMatch(photo);
      const captions = textSegments(photo.caption, annotationMatch ? 57 : 86, 500, plan.breaks?.[`photos/${photo.id}/caption`] || []);
      const photoField = (name, options) => inlineField('photos', photo.id, name, photo[name], options);
      const matchHint = annotationMatch ? `<p class="annotation-search-hit">文字批注 · ${highlight(annotationMatchSnippet(annotationMatch))}</p>` : '';
      pages.push({
        id: photo.id, section: '参考', title: photo.name || '参考照片',
        content: `<div class="page-header"><span>VISUAL REFERENCES</span><span>参考资料</span></div>
          <h2 class="section-heading">${photoField('name', { placeholder: '图片名称' })}</h2>${matchHint}
          <figure class="photo-card${annotationMatch ? ' search-match' : ''}">
            <button class="photo-button" data-annotate="${escapeHtml(photo.id)}" aria-label="批注${escapeHtml(photo.name || '参考照片')}">
              ${photo.imageError ? `<span class="image-error">${escapeHtml(photo.imageError)}</span>` : ''}<img src="${escapeHtml(photo.source)}" alt="${escapeHtml(photo.name)}"><canvas data-photo-canvas="${escapeHtml(photo.id)}" aria-hidden="true"></canvas>
            </button>
            <figcaption class="photo-meta"><span>${photo.annotations.length} 条批注</span><span>点击照片进行批注</span></figcaption>
          </figure>
          ${photoField('caption', { ...captions[0], multiline: true, placeholder: '写下图片说明……', className: 'photo-caption' })}
          <button class="photo-link" data-annotate="${escapeHtml(photo.id)}">写批注 ↗</button>
          ${photo.imageError ? `<button class="photo-link" data-retry-image="${escapeHtml(photo.id)}">重新读取图片</button>` : ''}<button class="photo-link" data-remove-photo="${escapeHtml(photo.id)}">移除</button>`,
      });
      captions.slice(1).forEach((segment, index) => pages.push({
        id: `${photo.id}-caption-${index}`, section: '参考', title: `${photo.name || '参考照片'} · 说明`,
        content: `${photoField('caption', { ...segment, multiline: true, placeholder: '接着写下图片说明……', className: 'text-lines' })}
          <button class="photo-link" data-annotate="${escapeHtml(photo.id)}">查看原图与批注 ↗</button>`,
      }));
    }
    if (!plan.photos.length) pages.push({ id: 'empty-reference', section: '参考', title: '参考资料', content: '<div class="page-header"><span>VISUAL REFERENCES</span><span>参考资料</span></div><div class="empty-page"><h3>暂无参考照片</h3><button data-action="upload">＋ 添加参考照片</button></div>' });
    if (uploadErrors.has(plan.id)) pages.push({ id: 'upload-error', section: '参考', title: '图片上传失败', content: '<h2 class="continuation-title">参考资料</h2><div class="status-slip"><p>有图片未能读取，请重新选择失败的文件。</p><button data-action="retry-upload">重新选择图片</button></div><div class="empty-page"><h3>图片等待重新读取</h3></div>' });
    if (plan.photos.length && !uploadErrors.has(plan.id)) pages.at(-1).endAction = '<button class="page-end-action" data-action="upload">＋ 贴入参考图片</button>';
    textSegments(plan.notes, 455, 538, plan.breaks?.[`plan/${plan.id}/notes`] || []).forEach((segment, index) => pages.push({
      id: `notes-${index}`, section: '笔记', title: '拍摄备注',
        content: `${index === 0 ? '<div class="page-header"><span>FIELD NOTES</span><span>拍摄备注</span></div>' : ''}
        ${planField('notes', { ...segment, multiline: true, placeholder: '写下拍摄备注……', className: 'text-lines note-field' })}`,
    }));
    for (const reference of plan.references || []) {
      const body = `${reference.location} · ${reference.localDate}\n收录于 ${referenceTime(reference.generatedAt)} 北京时间\n\n${reference.body}\n\n${reference.sources.map(source => `${source.name} · ${source.kind} · ${source.status} · ${referenceTime(source.fetchedAt)}`).join('\n')}`;
      textSegments(body, 405, 538).forEach((segment, index) => pages.push({
        id: `${reference.id}-${index}`, section: '笔记', title: reference.label,
        content: `${index === 0 ? `<h2 class="continuation-title">${escapeHtml(reference.label)}</h2>` : ''}<div class="text-lines">${highlight(segment.text)}</div>${index === 0 && latestReference?.placeId === reference.placeId && latestReference?.localDate === reference.localDate && JSON.stringify(latestReference.body) !== JSON.stringify(reference.body) ? `<button class="small-link" data-update-reference="${escapeHtml(reference.id)}">天气与建议已更新 · 更新这份引用</button>` : ''}`,
      }));
    }
    for (const extra of plan.extraPages) {
      textSegments(extra.text, 455, 500, plan.breaks?.[`extraPages/${extra.id}/text`] || []).forEach((segment, index) => pages.push({
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
    byId('back-button').hidden = !plan || state.closed;
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
      const visible = byId('spread').querySelector('[data-inline]');
      const position = anchor || (visible ? { key: visible.dataset.inlineKey, start: Number(visible.dataset.start), end: Number(visible.dataset.start) } : {});
      readingPositions.set(plan.id, { ...position, pageId: pages[first].id });
      clearTimeout(viewTimer);
      viewTimer = setTimeout(() => { void options.storage.view(Object.fromEntries(readingPositions)).catch(() => {}); }, 300);
    }
    byId('thumbnail-strip').hidden = !state.thumbs || !plan || state.closed;
    byId('thumb-toggle').setAttribute('aria-expanded', String(state.thumbs));
    scaleBook();
  }

  async function turn(change, direction = 1) {
    const old = byId('spread').children[direction > 0 ? 1 : 0]?.cloneNode(true);
    change();
    render();
    if (old && !(options.reducedMotion?.() ?? matchMedia('(prefers-reduced-motion: reduce)').matches)) {
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
      directorySpread = state.spread;
      state.planId = id;
      state.spread = 0;
      state.trash = false;
      const plan = currentPlan();
      const position = readingPositions.get(id);
      if (plan && position) {
        const pages = makePlanPages(plan);
        const template = document.createElement('template');
        const target = pages.findIndex(item => {
          template.innerHTML = item.content;
          return position.key ? Boolean(matchingInlineField(template.content, position)) : item.id === position.pageId;
        });
        if (target >= 0) state.spread = Math.floor(target / 2);
      }
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
    turn(() => { state.planId = null; state.spread = directorySpread; state.thumbs = false; }, -1);
  }

  function scaleBook() {
    const scale = Math.min(1, (window.innerWidth - 200) / 1035, (window.innerHeight - 144) / (state.thumbs ? 920 : 790));
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
    byId('confirm-cancel').textContent = '保留';
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
    uploadErrors.delete(plan.id);
    for (const file of files) {
      try {
        const asset = await options.storage.addImage(file);
        if (destroyed || !store.plans.includes(plan)) return;
        const photo = { id: uid(), ...asset, name: file.name.replace(/\.[^.]+$/, ''), caption: '', annotations: [], rotation: 0, crop: null };
        plan.photos.push(photo);
        firstId ||= photo.id;
      } catch (error) { uploadErrors.add(plan.id); toast(error.message || '图片读取失败'); }
    }
    if (state.planId !== plan.id) {
      plan.updatedAt = Math.max(Date.now(), plan.updatedAt + 1);
      save(); toast(firstId ? '参考图片已保存到原计划' : '原计划有图片读取失败'); return;
    }
    if (firstId) {
      const pages = makePlanPages(plan);
      state.spread = Math.floor(pages.findIndex((item) => item.id === firstId) / 2);
    }
    finishChange(firstId ? '图片已贴进参考资料' : '图片读取失败，可重新选择');
  }

  function paintAnnotations(canvas, items, imageWidth, imageHeight, contain = false, image = null, photo = null) {
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
    let offsetX = (width - drawWidth) / 2;
    let offsetY = (height - drawHeight) / 2;
    if (image && photo) {
      const crop = photo.crop || { x: 0, y: 0, width: 1, height: 1 };
      const cropWidth = imageWidth * crop.width, cropHeight = imageHeight * crop.height;
      const rotation = photo.rotation || 0;
      const scale = Math.min(width / (rotation % 2 ? cropHeight : cropWidth), height / (rotation % 2 ? cropWidth : cropHeight));
      ctx.translate(width / 2, height / 2);
      ctx.rotate(rotation * Math.PI / 2);
      ctx.scale(scale, scale);
      ctx.translate(-cropWidth / 2, -cropHeight / 2);
      ctx.beginPath(); ctx.rect(0, 0, cropWidth, cropHeight); ctx.clip();
      offsetX = -crop.x * imageWidth; offsetY = -crop.y * imageHeight;
      drawWidth = imageWidth; drawHeight = imageHeight;
      ctx.drawImage(image, offsetX, offsetY, imageWidth, imageHeight);
    }
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
      if (item.type === 'rectangle' || item.type === 'crop') {
        const first = item.points[0], last = item.points.at(-1);
        ctx.strokeRect(offsetX + first.x * drawWidth, offsetY + first.y * drawHeight, (last.x - first.x) * drawWidth, (last.y - first.y) * drawHeight);
        continue;
      }
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
      const paint = () => { if (image.naturalWidth && !destroyed) paintAnnotations(canvas, photo.annotations, image.naturalWidth, image.naturalHeight, true, image, photo); };
      if (image.complete) requestAnimationFrame(paint);
      else image.addEventListener('load', paint, { once: true });
    });
  }

  function startAnnotation(id) {
    const plan = currentPlan();
    const photo = plan.photos.find((item) => item.id === id);
    if (photo.imageError) { toast(photo.imageError); return; }
    annotation = { photoId: id, planId: plan.id, tool: 'pen', items: clone(photo.annotations), undo: [], redo: [], stroke: null, textPoint: null, crop: clone(photo.crop || null), rotation: photo.rotation || 0 };
    try {
      const saved = options.draft;
      if (saved?.photoId === id && saved?.planId === plan.id && Array.isArray(saved.items)) {
        annotation.items = saved.items;
        annotation.crop = saved.crop ?? null; annotation.rotation = saved.rotation ?? 0;
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
    const items = annotation.stroke ? [...annotation.items, annotation.stroke] : [...annotation.items];
    if (annotation.crop && annotation.tool === 'crop') {
      const crop = annotation.crop;
      items.push({ type: 'rectangle', color: '#648260', points: [{ x: crop.x, y: crop.y }, { x: crop.x + crop.width, y: crop.y + crop.height }] });
    }
    byId('annotation-hint').textContent = `原图坐标批注 · 旋转 ${annotation.rotation * 90}°${annotation.crop ? ' · 已设置裁剪区域' : ''}`;
    if (!image.naturalWidth) return;
    paintAnnotations(byId('annotation-canvas'), items, image.naturalWidth, image.naturalHeight, true, image, { crop: annotation.tool === 'crop' ? null : annotation.crop, rotation: annotation.rotation });
    byId('annotation-undo').disabled = !annotation.undo.length;
    byId('annotation-redo').disabled = !annotation.redo.length;
  }

  function saveAnnotationDraft() {
    options.draft = { photoId: annotation.photoId, planId: annotation.planId, items: annotation.items, crop: annotation.crop, rotation: annotation.rotation };
    return options.storage.draft(options.draft).catch(() => { byId('annotation-hint').textContent = '批注草稿保存失败，请点击完成重试'; });
  }

  function annotationSnapshot() { return clone({ items: annotation.items, crop: annotation.crop, rotation: annotation.rotation }); }

  function annotationChange() {
    annotation.undo.push(annotationSnapshot());
    annotation.redo = [];
  }

  function annotationPoint(event) {
    const rect = byId('annotation-canvas').getBoundingClientRect();
    const image = byId('annotation-image');
    const crop = annotation.tool === 'crop' ? { x: 0, y: 0, width: 1, height: 1 } : annotation.crop || { x: 0, y: 0, width: 1, height: 1 };
    const width = image.naturalWidth * crop.width, height = image.naturalHeight * crop.height;
    const rotated = annotation.rotation % 2;
    const scale = Math.min(rect.width / (rotated ? height : width), rect.height / (rotated ? width : height));
    const x = (event.clientX - rect.left - rect.width / 2) / scale;
    const y = (event.clientY - rect.top - rect.height / 2) / scale;
    const angle = -annotation.rotation * Math.PI / 2;
    return {
      x: Math.max(0, Math.min(1, crop.x + (x * Math.cos(angle) - y * Math.sin(angle) + width / 2) / image.naturalWidth)),
      y: Math.max(0, Math.min(1, crop.y + (x * Math.sin(angle) + y * Math.cos(angle) + height / 2) / image.naturalHeight)),
    };
  }

  async function closeAnnotation(commit) {
    if (!annotation) return;
    if (commit) {
      rememberChange();
      const plan = store.plans.find((item) => item.id === annotation.planId);
      const photo = plan?.photos.find((item) => item.id === annotation.photoId);
      if (photo) { photo.annotations = clone(annotation.items); photo.crop = clone(annotation.crop); photo.rotation = annotation.rotation; }
      try { await save(); await options.storage.flush(); }
      catch (error) { byId('annotation-hint').textContent = error.message; return; }
    }
    options.draft = null;
    void options.storage.draft(null).catch(() => {});
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
    if (action === 'retry-upload') { uploadErrors.delete(state.planId); selectPhotos(); }
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
    if (button.hasAttribute('data-reference-new') || button.dataset.referencePlan) {
      rememberChange();
      let plan = store.plans.find(item => item.id === button.dataset.referencePlan);
      if (!plan) { plan = blankPlan(pendingReference.label); plan.location = pendingReference.location; plan.date = pendingReference.localDate; store.plans.push(plan); }
      plan.references ||= [];
      plan.references.push(clone(pendingReference));
      plan.updatedAt = Date.now();
      state.planId = plan.id; state.spread = 0;
      byId('reference-dialog').close(); save(); render(); toast('已收进计划');
    }
    if (button.hasAttribute('data-reference-close')) byId('reference-dialog').close();
    if (button.dataset.action) handleAction(button.dataset.action);
    if (button.dataset.open) openPlan(button.dataset.open);
    if (button.dataset.retryImage) {
      const photo = currentPlan().photos.find(item => item.id === button.dataset.retryImage);
      void options.storage.retryImage(photo.assetId).then(source => {
        if (destroyed) return;
        photo.source = source; delete photo.imageError; render();
      }).catch(error => toast(error.message));
    }
    if (button.dataset.updateReference) {
      const plan = currentPlan();
      const index = plan.references.findIndex(item => item.id === button.dataset.updateReference);
      if (latestReference && index >= 0) {
        rememberChange();
        plan.references[index] = { ...clone(latestReference), id: plan.references[index].id };
        finishChange('已更新天气引用');
      }
    }
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
    if (button.dataset.managePlan) {
      const plan = store.plans.find(item => item.id === button.dataset.managePlan);
      managedPlanId = plan.id;
      byId('manage-title').value = plan.title;
      byId('manage-status').value = plan.status || 'draft';
      byId('manage-delete').dataset.deletePlan = plan.id;
      byId('manage-dialog').showModal();
    }
    if (button.dataset.purgePlan) {
      const plan = store.trash.find(item => item.id === button.dataset.purgePlan);
      confirmAction('永久删除计划', `将删除“${plan.title}”的全部文字、图片关联与批注，关闭本次计划本后无法撤销。`, () => {
        rememberChange(); store.trash = store.trash.filter(item => item.id !== plan.id); finishChange('已永久删除计划');
      });
    }
    if (button.dataset.deletePlan) {
      byId('manage-dialog').close();
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
      drawAnnotation();
    }

  });

  document.addEventListener('beforeinput', (event) => {
    if (event.target.matches('[data-inline]')) inlineBeforeInput = captureInlineSelection(event.target);
    if (logicalSelection && event.inputType === 'insertText' && !event.isComposing) {
      event.preventDefault(); replaceLogicalSelection(event.data || '');
    }
  });
  document.addEventListener('compositionstart', (event) => {
    if (!event.target.matches('[data-inline]')) return;
    const input = event.target;
    const target = selectedTarget();
    if (target && logicalSelection.anchor !== logicalSelection.focus) {
      const selection = logicalSelection;
      const start = Math.min(selection.anchor, selection.focus), end = Math.max(selection.anchor, selection.focus);
      rememberChange({ planId: state.planId, key: selection.key, start, end });
      target[selection.field] = target[selection.field].slice(0, start) + target[selection.field].slice(end);
      shiftBreaks(selection.key, start, end, start - end);
      input.value = '';
      input.dataset.start = String(start); input.dataset.end = String(start);
      input.setSelectionRange(0, 0);
      inlineComposition = { input, recorded: true };
    } else inlineComposition = { input, recorded: false };
    logicalSelection = null;
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

  byId('manage-close').addEventListener('click', () => byId('manage-dialog').close());
  byId('manage-save').addEventListener('click', () => {
    const plan = store.plans.find(item => item.id === managedPlanId);
    if (!plan) return;
    rememberChange(); plan.title = byId('manage-title').value; plan.status = byId('manage-status').value;
    byId('manage-dialog').close(); finishChange('已更新计划');
  });
  byId('manage-copy').addEventListener('click', () => {
    const plan = store.plans.find(item => item.id === managedPlanId);
    if (!plan) return;
    rememberChange(); const copy = clone(plan); copy.id = uid(); copy.title += ' · 副本'; copy.createdAt = copy.updatedAt = Date.now();
    delete copy.copiedFrom;
    copy.breaks = Object.fromEntries(Object.entries(copy.breaks || {}).map(([key, offsets]) => [key.replace(`plan/${plan.id}/`, `plan/${copy.id}/`), offsets]));
    store.plans.push(copy); byId('manage-dialog').close(); finishChange('已复制计划');
  });
  byId('writing-form').addEventListener('submit', commitWriting);
  byId('writing-cancel').addEventListener('click', () => byId('writing-dialog').close());
  byId('confirm-cancel').addEventListener('click', () => byId('confirm-dialog').close());
  byId('confirm-done').addEventListener('click', () => { byId('confirm-dialog').close(); pendingConfirm?.(); pendingConfirm = null; });
  byId('back-button').addEventListener('click', backToIndex);
  byId('previous-page').addEventListener('click', () => { if (!byId('previous-page').disabled) turn(() => state.spread--, -1); });
  byId('next-page').addEventListener('click', () => { if (!byId('next-page').disabled) turn(() => state.spread++); });
  byId('open-book').addEventListener('click', () => { state.closed = false; state.planId = null; state.spread = 0; state.query = ''; state.trash = false; render(); });
  byId('thumb-toggle').addEventListener('click', () => { state.thumbs = !state.thumbs; render(); });
  byId('photo-input').addEventListener('change', (event) => uploadPhotos(Array.from(event.target.files)));

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
    if (['arrow', 'rectangle', 'crop'].includes(annotation.stroke.type)) annotation.stroke.points[1] = point;
    else annotation.stroke.points.push(point);
    drawAnnotation();
  });
  const finishStroke = () => {
    if (!annotation?.stroke) return;
    if (annotation.stroke.points.length > 1) {
      annotationChange();
      if (annotation.stroke.type === 'crop') {
        const first = annotation.stroke.points[0], last = annotation.stroke.points.at(-1);
        const width = Math.abs(last.x - first.x), height = Math.abs(last.y - first.y);
        if (width > .01 && height > .01) annotation.crop = { x: Math.min(first.x, last.x), y: Math.min(first.y, last.y), width, height };
      } else annotation.items.push(annotation.stroke);
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
    annotation.redo.push(annotationSnapshot()); Object.assign(annotation, annotation.undo.pop()); saveAnnotationDraft(); drawAnnotation();
  });
  byId('annotation-redo').addEventListener('click', () => {
    if (!annotation?.redo.length) return;
    annotation.undo.push(annotationSnapshot()); Object.assign(annotation, annotation.redo.pop()); saveAnnotationDraft(); drawAnnotation();
  });
  byId('annotation-rotate').addEventListener('click', () => { annotationChange(); annotation.rotation = (annotation.rotation + 1) % 4; saveAnnotationDraft(); drawAnnotation(); });
  byId('annotation-uncrop').addEventListener('click', () => { annotationChange(); annotation.crop = null; saveAnnotationDraft(); drawAnnotation(); });
  byId('annotation-clear').addEventListener('click', () => { annotationChange(); annotation.items = []; saveAnnotationDraft(); drawAnnotation(); });
  byId('annotation-cancel').addEventListener('click', () => closeAnnotation(false));
  byId('annotation-done').addEventListener('click', () => closeAnnotation(true));
  byId('annotation-dialog').addEventListener('cancel', (event) => {
    event.preventDefault();
    if (!byId('annotation-text-entry').hidden) { byId('annotation-text-entry').hidden = true; return; }
    confirmAction('结束图片批注', '完成会保存本次批注，取消可继续编辑。也可使用图片右上方的取消按钮放弃本次修改。', () => void closeAnnotation(true));
    byId('confirm-done').textContent = '完成批注';
    byId('confirm-cancel').textContent = '继续编辑';
  });

  function shiftBreaks(key, start, end, delta) {
    const plan = currentPlan();
    if (!plan.breaks?.[key]) return;
    plan.breaks[key] = [...new Set(plan.breaks[key].filter(offset => offset <= start || offset >= end).map(offset => (offset > start || start === end && offset === start) ? Math.max(start, offset + delta) : offset))].sort((a, b) => a - b);
  }

  function toggleBreak(input) {
    const anchor = captureInlineSelection(input);
    if (!anchor) return;
    rememberChange(anchor);
    const plan = currentPlan();
    plan.breaks ||= {};
    const offsets = plan.breaks[anchor.key] || [];
    plan.breaks[anchor.key] = offsets.includes(anchor.start) ? offsets.filter(offset => offset !== anchor.start) : [...offsets, anchor.start].sort((a, b) => a - b);
    save(); render(anchor);
    toast(offsets.includes(anchor.start) ? '手动分页已取消' : '已从光标处开始新页', true);
  }
  document.addEventListener('contextmenu', event => {
    const input = event.target;
    if (!input.matches('textarea[data-inline]')) return;
    event.preventDefault(); breakTarget = input;
    byId('break-dialog').showModal();
  });
  byId('break-apply').addEventListener('click', () => { byId('break-dialog').close(); toggleBreak(breakTarget); });
  byId('break-cancel').addEventListener('click', () => byId('break-dialog').close());

  function showLogicalSelection(input, start, end) {
    const low = Math.min(start, end), high = Math.max(start, end);
    logicalSelection = { key: input.dataset.inlineKey, scope: input.dataset.inline, target: input.dataset.target, field: input.dataset.field, anchor: start, focus: end };
    const pages = makePlanPages(currentPlan());
    const template = document.createElement('template');
    const index = pages.findIndex(page => {
      template.innerHTML = page.content;
      return [...template.content.querySelectorAll('textarea[data-inline]')].some(field => field.dataset.inlineKey === logicalSelection.key && Number(field.dataset.start) <= end && Number(field.dataset.end) >= end);
    });
    if (index >= 0) state.spread = Math.floor(index / 2);
    render({ planId: state.planId, key: logicalSelection.key, start: end, end, pageId: pages[index]?.id });
    byId('spread').querySelectorAll('textarea[data-inline]').forEach(field => {
      if (field.dataset.inlineKey !== logicalSelection.key) return;
      const offset = Number(field.dataset.start);
      field.setSelectionRange(Math.max(0, low - offset), Math.min(field.value.length, Math.max(0, high - offset)));
      field.classList.toggle('logical-selected', high > offset && low < offset + field.value.length);
    });
  }
  function selectedTarget() {
    if (!logicalSelection) return null;
    const plan = currentPlan();
    return logicalSelection.scope === 'plan' ? plan : plan[logicalSelection.scope].find(item => item.id === logicalSelection.target);
  }
  function replaceLogicalSelection(text) {
    const target = selectedTarget();
    if (!target) return;
    const selection = logicalSelection;
    const start = Math.min(selection.anchor, selection.focus), end = Math.max(selection.anchor, selection.focus);
    rememberChange({ planId: state.planId, key: selection.key, start, end });
    const before = target[selection.field];
    target[selection.field] = before.slice(0, start) + text + before.slice(end);
    shiftBreaks(selection.key, start, end, text.length - (end - start));
    logicalSelection = null;
    save(); render({ planId: state.planId, key: selection.key, start: start + text.length, end: start + text.length });
  }
  for (const eventName of ['copy', 'cut']) document.addEventListener(eventName, event => {
    const target = selectedTarget();
    if (!target || logicalSelection.anchor === logicalSelection.focus) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', target[logicalSelection.field].slice(Math.min(logicalSelection.anchor, logicalSelection.focus), Math.max(logicalSelection.anchor, logicalSelection.focus)));
    if (eventName === 'cut') replaceLogicalSelection('');
  });
  document.addEventListener('paste', event => {
    if (!event.target.matches('input,textarea') && event.clipboardData.files.length && byId('section-tabs').querySelector('[data-section="参考"][aria-current="true"]')) { event.preventDefault(); void uploadPhotos([...event.clipboardData.files]); return; }
    if (selectedTarget()) { event.preventDefault(); replaceLogicalSelection(event.clipboardData.getData('text/plain')); }
  });
  let pointerSelection = null;
  document.addEventListener('pointerdown', event => {
    if (event.target.matches('textarea[data-inline]')) {
      const previous = captureInlineSelection();
      pointerSelection = { key: event.target.dataset.inlineKey, input: event.target, start: event.shiftKey && previous?.key === event.target.dataset.inlineKey ? previous.start : null, crossed: false };
    } else pointerSelection = null;
    if (!event.shiftKey) { logicalSelection = null; byId('spread').querySelectorAll('.logical-selected').forEach(field => field.classList.remove('logical-selected')); }
  });

  // A short-lived text mirror maps pointer positions to the same wrapped lines.
  function pointerOffset(input, event) {
    const rect = input.getBoundingClientRect();
    const style = getComputedStyle(input);
    const mirror = document.createElement('div');
    mirror.style.cssText = `position:fixed;left:0;top:0;visibility:hidden;white-space:pre-wrap;overflow-wrap:anywhere;width:${input.clientWidth}px;font:${style.font};letter-spacing:${style.letterSpacing};line-height:${style.lineHeight};padding:${style.padding};box-sizing:border-box`;
    mirror.textContent = input.value || ' ';
    document.body.append(mirror);
    const text = mirror.firstChild;
    const range = globalThis.document.createRange();
    const scale = rect.width / input.offsetWidth;
    const x = (event.clientX - rect.left) / scale;
    const y = (event.clientY - rect.top) / scale;
    let nearest = 0, distance = Infinity;
    for (let index = 0; index <= input.value.length; index++) {
      range.setStart(text, index); range.setEnd(text, index);
      const position = range.getBoundingClientRect();
      const score = Math.abs(position.top + position.height / 2 - y) * 1000 + Math.abs(position.left - x);
      if (score < distance) { distance = score; nearest = index; }
    }
    mirror.remove();
    return Number(input.dataset.start) + safeTextCut(input.value, nearest);
  }
  document.addEventListener('pointermove', event => {
    if (!pointerSelection || event.buttons !== 1) return;
    if (pointerSelection.start === null) pointerSelection.start = Number(pointerSelection.input.dataset.start) + pointerSelection.input.selectionStart;
    const input = root.elementFromPoint(event.clientX, event.clientY);
    if (!input?.matches('textarea[data-inline]') || input.dataset.inlineKey !== pointerSelection.key || input === pointerSelection.input) return;
    pointerSelection.crossed = true;
    const start = pointerSelection.start, end = pointerOffset(input, event);
    event.preventDefault();
    showLogicalSelection(input, start, end);
  });
  document.addEventListener('pointerup', event => {
    if (pointerSelection && event.shiftKey && event.target.matches('textarea[data-inline]') && pointerSelection.start !== null) {
      const input = event.target;
      showLogicalSelection(input, pointerSelection.start, Number(input.dataset.start) + input.selectionEnd);
    }
    pointerSelection = null;
  });

  document.addEventListener('keydown', (event) => {
    if (event.isComposing || inlineComposition || document.querySelector('dialog[open]')) return;
    const input = event.target;
    if (input.matches('textarea[data-inline]')) {
      const target = inlineTarget(input);
      const value = target[input.dataset.field];
      const offset = Number(input.dataset.start);
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); toggleBreak(input); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); showLogicalSelection(input, 0, value.length); return; }
      if (logicalSelection && !event.shiftKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        const position = event.key === 'ArrowLeft' ? Math.min(logicalSelection.anchor, logicalSelection.focus) : Math.max(logicalSelection.anchor, logicalSelection.focus);
        const key = logicalSelection.key; logicalSelection = null;
        render({ planId: state.planId, key, start: position, end: position }); return;
      }
      if (logicalSelection && ['Backspace', 'Delete'].includes(event.key)) { event.preventDefault(); replaceLogicalSelection(''); return; }
      if (event.shiftKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        const anchor = logicalSelection?.anchor ?? offset + input.selectionStart;
        let focus = logicalSelection?.focus ?? offset + input.selectionEnd;
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        focus = Math.max(0, Math.min(value.length, focus + direction));
        if (focus > 0 && focus < value.length && /[\uDC00-\uDFFF]/.test(value[focus])) focus += direction;
        showLogicalSelection(input, anchor, focus); return;
      }
      if (logicalSelection && event.key.length === 1 && !event.ctrlKey && !event.metaKey) { event.preventDefault(); replaceLogicalSelection(event.key); return; }
      if (!event.shiftKey && ['ArrowLeft', 'ArrowRight', 'Backspace', 'Delete'].includes(event.key) && input.selectionStart === input.selectionEnd) {
        const position = offset + input.selectionStart;
        const backward = event.key === 'ArrowLeft' || event.key === 'Backspace';
        const edge = backward ? input.selectionStart === 0 && position > 0 : input.selectionEnd === input.value.length && position < value.length;
        if (edge) {
          event.preventDefault();
          let destination = position + (backward ? -1 : 1);
          if (destination > 0 && destination < value.length && /[\uDC00-\uDFFF]/.test(value[destination])) destination += backward ? -1 : 1;
          showLogicalSelection(input, position, destination);
          if (event.key === 'Backspace' || event.key === 'Delete') replaceLogicalSelection('');
          else { logicalSelection = null; render({ planId: state.planId, key: input.dataset.inlineKey, start: destination, end: destination }); }
          return;
        }
      }
    }
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
  byId('spread').addEventListener('dragover', event => {
    if (currentPlan() && byId('section-tabs').querySelector('[data-section="参考"][aria-current="true"]')) event.preventDefault();
  });
  byId('spread').addEventListener('drop', event => {
    if (!currentPlan() || !byId('section-tabs').querySelector('[data-section="参考"][aria-current="true"]')) return;
    event.preventDefault(); void uploadPhotos([...event.dataTransfer.files]);
  });
  const unbindPaper = bindPaperGestures(byId('spread'), delta => { const button = byId(delta > 0 ? 'next-page' : 'previous-page'); if (button.disabled) return false; button.click(); return true; });
  window.addEventListener('resize', () => { if (destroyed) return; scaleBook(); drawVisibleAnnotations(); if (annotation) drawAnnotation(); }, { signal: lifecycle.signal });
  window.addEventListener('pagehide', save, { signal: lifecycle.signal });
  document.fonts?.ready.then(() => { if (!destroyed) render(); });
  render();
  return {
    async prepareNavigation() {
      document.activeElement?.blur();
      if (annotation) { saveAnnotationDraft(); await options.storage.draft(options.draft); }
      await options.storage.flush();
    },
    refresh() { pageCounts.clear(); render(); },
    showIndex() { pageCounts.clear(); state.closed = false; state.planId = null; state.spread = 0; state.query = ''; state.trash = false; render(); },
    replace(notebook) { const anchor = captureInlineSelection(); store = clone(notebook); if (!currentPlan()) state.planId = null; writingHistory = []; writingFuture = []; render(anchor); },
    setReference(reference) {
      const changed = latestReference?.body !== reference?.body || latestReference?.placeId !== reference?.placeId || latestReference?.localDate !== reference?.localDate;
      latestReference = reference;
      if (changed && !inlineComposition && !pointerSelection && !annotation && !document.activeElement?.matches('[data-inline]')) render();
    },
    receiveReference(reference) {
      pendingReference = reference;
      byId('reference-choices').innerHTML = '<button class="new-plan-button" data-reference-new>新建计划并收录</button>' + store.plans.map(plan => `<button class="plan-entry" data-reference-plan="${escapeHtml(plan.id)}">${escapeHtml(plan.title || '未命名拍摄计划')}</button>`).join('');
      byId('reference-dialog').showModal();
    },
    destroy() { clearTimeout(viewTimer); void options.storage.view(Object.fromEntries(readingPositions)).catch(() => {}); destroyed = true; unbindPaper(); lifecycle.abort(); clearTimeout(toastTimer); pageTurnAnimation?.cancel(); root.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); }
  };
}
