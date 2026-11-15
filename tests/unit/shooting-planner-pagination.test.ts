import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

function harness() {
  const source = readFileSync('src/components/shooting-planner/runtime.js', 'utf8');
  const nodes = new Map();
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const height = (value: string) => Math.max(1, value.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 20)), 0)) * 20;
  const node = () => ({ textContent: '', value: '', style: {}, dataset: {}, classList: { toggle() {}, remove() {} },
    addEventListener() {}, querySelectorAll: () => [], contains: () => true,
    get scrollHeight() { return height(this.value); },
  });
  const root = { activeElement: null, host: node(),
    getElementById(id: string) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener(type: string, callback: (event: unknown) => void) { listeners.set(type, [...listeners.get(type) || [], callback]); },
  };
  const context = vm.createContext({ root, AbortController, setTimeout() {}, clearTimeout() {},
    document: { createElement: node }, window: { crypto, addEventListener() {} },
    options: { notebook: { version: 1, plans: [], trash: [] }, storage: { save() {} } }, renders: [],
  });
  const start = source.replace(/^import[^\n]+\n/, '').replace('export function', 'function');
  const end = start.indexOf("  const unbindPaper =");
  vm.runInContext(start.slice(0, end) + `
    render = (anchor) => { globalThis.renders.push(anchor); };
    measureMarkup = markup => {
      const values = [...markup.matchAll(/<textarea[^>]*>([\\s\\S]*?)<\\/textarea>/g)].map(match => match[1]);
      return (markup.includes('weather-slip') ? 330 : 100) + values.reduce((sum, value) => sum + value.length * 2, 0);
    };
    return { uploadPhotos, blankPlan, splitText, textSegments, makePlanPages, indexPages, state, toggleBreak, shiftBreaks,
      updateInlineField, store, history: () => writingHistory, composition: () => inlineComposition,
      setSelection(value) { logicalSelection = value; }, replaceLogicalSelection };
  }
  globalThis.api = mountPlanner(root, options);`, context);
  return { storage: context.options.storage, api: context.api, root, nodes, height, renders: context.renders, emit(type: string, event: unknown) { for (const listener of listeners.get(type) || []) listener(event); } };
}

describe('planner paper flow', () => {
  it('keeps delayed uploads attached to the original plan without moving the current page', async () => {
    const { api, storage } = harness();
    const first = api.blankPlan(), second = api.blankPlan();
    api.store.plans.push(first, second); api.state.planId = first.id;
    let complete!: (asset: unknown) => void;
    storage.addImage = () => new Promise(resolve => { complete = resolve; });
    const upload = api.uploadPhotos([{ name: 'reference.png' }]);
    api.state.planId = second.id; api.state.spread = 3;
    complete({ assetId: 'a'.repeat(64), source: 'blob:test' }); await upload;
    expect(first.photos).toHaveLength(1); expect(second.photos).toHaveLength(0);
    expect(api.state.planId).toBe(second.id); expect(api.state.spread).toBe(3);
  });
  it('keeps newlines, surrogate pairs and absolute offsets through fixed-height pages', () => {
    const { api, height } = harness();
    for (const text of ['每行摄影正文\n'.repeat(90), '\n\n' + '🙂📷\n'.repeat(80), '自然光'.repeat(500)]) {
      const parts = api.textSegments(text, 200, 240);
      expect(parts.map((part: {text: string}) => part.text).join('')).toBe(text);
      let offset = 0;
      for (const [index, part] of parts.entries()) {
        expect(part.start).toBe(offset); offset += part.text.length;
        expect(part.text.isWellFormed()).toBe(true);
        expect(height(part.text)).toBeLessThanOrEqual(index ? 240 : 200);
      }
    }
  });
  it('honors manual boundaries and adjusts them with preceding edits', () => {
    const { api } = harness(); const plan = api.blankPlan(); api.store.plans.push(plan); api.state.planId = plan.id;
    expect(api.splitText('甲乙丙丁', 500, 500, [2])).toEqual(['甲乙', '丙丁']);
    const key = `plan/${plan.id}/notes`; plan.breaks[key] = [2, 4];
    api.shiftBreaks(key, 0, 0, 3); expect(plan.breaks[key]).toEqual([5, 7]);
    api.shiftBreaks(key, 1, 6, -5); expect(plan.breaks[key]).toEqual([2]);
  });
  it('flows all idea pages before schedules and adds no continuation headings', () => {
    const { api } = harness(); const plan = api.blankPlan(); plan.intent = '连续想法。'.repeat(300); plan.notes = '备注。'.repeat(300);
    const pages = api.makePlanPages(plan);
    const scheduleIndex = pages.findIndex((page: {id: string}) => page.id === 'schedule');
    expect(scheduleIndex).toBeGreaterThan(1);
    expect(pages.slice(1, scheduleIndex).every((page: {id: string, content: string}) => page.id.startsWith('intent-') && !page.content.includes('<h2'))).toBe(true);
    expect(pages.filter((page: {id: string}) => page.id.startsWith('notes-')).slice(1).every((page: {content: string}) => !page.content.includes('<h2'))).toBe(true);
  });
  it('places the second directory page on the left and leaves an absent right page blank', () => {
    const { api } = harness(); const plans = Array.from({ length: 8 }, (_, index) => ({ ...api.blankPlan(), id: `p${index}`, title: `计划${index + 1}` }));
    api.state.spread = 0; expect(api.indexPages(plans)[0]).toContain('index-title');
    api.state.spread = 1; const pages = api.indexPages(plans);
    expect(pages[0]).toContain('计划5'); expect(pages[0]).toContain('class="page left"');
    expect(pages[1]).toContain('index-blank'); expect(pages[0]).not.toContain('index-title');
  });
  it('replaces a cross-page range with IME input as one undo operation', () => {
    const { api, root, nodes, emit, renders } = harness();
    const plan = api.blankPlan(); plan.notes = '甲乙丙丁戊'; api.store.plans.push(plan); api.state.planId = plan.id;
    const key = `plan/${plan.id}/notes`;
    const input = { dataset: { inline: 'plan', inlineKey: key, field: 'notes', target: plan.id, start: '3', end: '5' },
      value: '丁戊', selectionStart: 0, selectionEnd: 1, selectionDirection: 'none', style: {}, scrollHeight: 20,
      matches: () => true, closest: () => ({ dataset: { pageId: 'notes-1' } }),
      setSelectionRange(start: number, end: number) { this.selectionStart = start; this.selectionEnd = end; },
    };
    Object.assign(root, { activeElement: input }); nodes.get('spread').querySelectorAll = () => [input];
    api.setSelection({ key, scope: 'plan', target: plan.id, field: 'notes', anchor: 1, focus: 4 });
    emit('compositionstart', { target: input });
    input.value = '中'; input.setSelectionRange(1, 1); emit('input', { target: input });
    input.value = '中文'; input.setSelectionRange(2, 2); emit('input', { target: input });
    expect(plan.notes).toBe('甲中文戊'); expect(renders).toHaveLength(0);
    emit('compositionend', { target: input });
    expect(api.history()).toHaveLength(1); expect(api.history()[0].store.plans[0].notes).toBe('甲乙丙丁戊');
    expect(renders).toHaveLength(1); expect(renders[0].start).toBe(3);
  });
});
