import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { emptyNotebook, importNotebook, notebookSchema, planSchema, photoSchema } from '@/domain/planner';
import { PlannerStorage, localGet, type LocalRecord } from '@/components/shooting-planner/storage';

const sessions: PlannerStorage[] = [];
const plan = (id = 'plan-one') => planSchema.parse({ id, title: '沿江拍摄', date: '', location: '', genre: '街拍', intent: '', notes: '', createdAt: 1, updatedAt: 1, schedule: [], checklist: [], photos: [], extraPages: [] });
const notebook = () => ({ ...emptyNotebook(), plans: [plan()] });
const session = (owner: string | null = null) => { const value = new PlannerStorage(owner); sessions.push(value); return value; };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(status === 200 ? { data } : { error: data }), { status });
function server() {
  let revision = 0;
  let document = emptyNotebook();
  let operationId: string | null = null;
  const writes: Record<string, unknown>[] = [];
  const fetch = vi.fn(async (_url: string, options: RequestInit) => {
    if (options.method === 'GET') return response({ revision, operationId, notebook: document });
    const input = JSON.parse(options.body as string);
    writes.push(input);
    if (input.operationId !== operationId) {
      if (input.baseVersion !== revision) return response({ code: 'PLANNER_CONFLICT', message: '另一处已更新计划' }, 409);
      revision++; document = input.notebook; operationId = input.operationId;
    }
    return response({ revision, operationId, notebook: document });
  });
  vi.stubGlobal('fetch', fetch);
  return { fetch, writes, read: () => ({ revision, notebook: document }) };
}
beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
afterEach(() => { sessions.splice(0).forEach(item => item.destroy()); vi.unstubAllGlobals(); });

describe('shooting planner local persistence and sync', () => {
  it('persists guests without contacting account services', async () => {
    const network = server();
    const local = session(); await local.load(); await local.save(notebook());
    await local.sync();
    expect((await session().load()).plans[0].title).toBe('沿江拍摄');
    expect(network.fetch).not.toHaveBeenCalled();
  });
  it('retains an in-memory edit after local storage failure and retries it', async () => {
    const local = session(); await local.load();
    const database = globalThis.indexedDB;
    vi.stubGlobal('indexedDB', { open() { throw new Error('storage full'); } });
    await local.save(notebook());
    await expect(local.flush()).rejects.toThrow('保存失败');
    vi.stubGlobal('indexedDB', database);
    await local.retry(); await local.flush();
    expect((await session().load()).plans[0].title).toBe('沿江拍摄');
  });
  it('coalesces concurrent sync requests and sends only one revision', async () => {
    const network = server(); const account = session('owner-a');
    await account.load(); await account.save(notebook());
    await Promise.all([account.sync(), account.sync(), account.retry()]);
    expect(network.writes).toHaveLength(1);
  });
  it('syncs the notebook envelope without local retry metadata', async () => {
    const network = server(); const account = session('owner-a');
    await account.load(); await account.save(notebook()); await account.sync();
    expect(Object.keys(network.writes[0]).sort()).toEqual(['baseVersion', 'notebook', 'operationId']);
    expect(network.read().revision).toBe(1);
    expect((await localGet<LocalRecord>('notebooks', 'owner-a'))?.pending).toBe(false);
  });
  it('replays an ambiguous response with the same operation identity after reload', async () => {
    const network = server(); const base = network.fetch.getMockImplementation()!;
    let lose = true;
    network.fetch.mockImplementation(async (url, options) => {
      const result = await base(url, options);
      if (options.method === 'PUT' && lose) { lose = false; throw new Error('connection lost'); }
      return result;
    });
    const first = session('owner-a'); await first.load(); await first.save(notebook()); await first.sync(); first.destroy();
    const next = session('owner-a'); await next.load(); await next.sync();
    expect(network.writes[0].operationId).toBe(network.writes[1].operationId);
    expect(network.read().revision).toBe(1);
  });
  it('keeps a newer edit pending when an older request finishes', async () => {
    const network = server(); const base = network.fetch.getMockImplementation()!;
    let release!: () => void;
    let started!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const sent = new Promise<void>(resolve => { started = resolve; });
    network.fetch.mockImplementation(async (url, options) => {
      const result = await base(url, options);
      if (options.method === 'PUT') { started(); await held; }
      return result;
    });
    const account = session('owner-a'); await account.load(); await account.save(notebook());
    const syncing = account.sync(); await sent;
    const changed = notebook(); changed.plans[0].title = '更晚的修改';
    await account.save(changed); release(); await syncing;
    expect((await localGet<LocalRecord>('notebooks', 'owner-a'))?.pending).toBe(true);
    await account.sync();
    expect(network.read().notebook.plans[0].title).toBe('更晚的修改');
    expect(network.read().revision).toBe(2);
  });
  it('detects other-tab writes and retains both divergent plans on merge', async () => {
    const first = session(), second = session(); await first.load(); await second.load();
    await first.save(notebook());
    const changed = notebook(); changed.plans[0].title = '另一窗口'; changed.plans[0].updatedAt = 2;
    await second.save(changed);
    await expect(second.flush()).rejects.toThrow('保存失败');
    const merged = await second.merge();
    expect(merged.plans.map(item => item.title)).toEqual(['沿江拍摄', '另一窗口']);
  });
  it('imports images and plans once and leaves guest originals available', async () => {
    server(); const local = session(); await local.load(); await local.save(notebook());
    const account = session('owner-a'); await account.load(); await account.importGuest(); await account.importGuest();
    expect((await localGet<LocalRecord>('notebooks', 'owner-a'))?.notebook.plans).toHaveLength(1);
    expect((await localGet<LocalRecord>('notebooks', 'guest'))?.notebook.plans).toHaveLength(1);
  });
  it('keeps text readable when an image is missing and separates account scopes', async () => {
    const value = notebook(); value.plans[0].photos.push(photoSchema.parse({ id: 'photo', assetId: 'a'.repeat(64), name: '参考图', caption: '', annotations: [] }));
    const local = session(); await local.load(); await local.save(value);
    expect((await session().load()).plans[0]).toMatchObject({ title: '沿江拍摄', photos: [{ imageError: expect.any(String) }] });
    server(); expect((await session('owner-b').load()).plans).toHaveLength(0);
  });
  it('reports newer remote revisions without replacing active edits', async () => {
    const network = server(); const account = session('owner-a'); await account.load();
    account.onRemoteChange = vi.fn();
    await network.fetch('', { method: 'PUT', body: JSON.stringify({ baseVersion: 0, operationId: crypto.randomUUID(), notebook: notebook() }) });
    await account.checkForUpdates(); expect(account.onRemoteChange).toHaveBeenCalledOnce();
    expect((await localGet<LocalRecord>('notebooks', 'owner-a'))?.notebook.plans).toHaveLength(0);
  });
  it('preserves both local and remote account edits after a revision conflict', async () => {
    const network = server(); const account = session('owner-a'); await account.load(); await account.save(notebook());
    const remote = notebook(); remote.plans[0].title = '远端修改'; remote.plans[0].updatedAt = 3;
    await network.fetch('', { method: 'PUT', body: JSON.stringify({ baseVersion: 0, operationId: crypto.randomUUID(), notebook: remote }) });
    await account.sync();
    const merged = await account.merge(); await account.sync();
    expect(merged.plans.map(item => item.title)).toEqual(['远端修改', '沿江拍摄']);
    expect(network.read().notebook.plans).toHaveLength(2);
  });
});

describe('planner document contracts', () => {
  it('imports long IDs with bounded new identities and remaps manual breaks', () => {
    const local = notebook(); local.plans[0].id = 'x'.repeat(200);
    local.plans[0].breaks[`plan/${local.plans[0].id}/notes`] = [3];
    const imported = importNotebook(emptyNotebook(), local);
    expect(imported.plans[0].breaks[`plan/${imported.plans[0].id}/notes`]).toEqual([3]);
    expect(importNotebook(imported, local).plans).toHaveLength(1);
    expect(importNotebook(imported, imported, 'conflict').plans).toHaveLength(1);
  });
  it('rejects malformed annotations, out-of-image crops and duplicate plan identities', () => {
    const photo = { id: 'p', assetId: 'a'.repeat(64), name: '', caption: '', annotations: [{ type: 'text', color: '#123456' }] };
    expect(photoSchema.safeParse(photo).success).toBe(false);
    expect(photoSchema.safeParse({ ...photo, annotations: [], crop: { x: .9, y: 0, width: .2, height: 1 } }).success).toBe(false);
    expect(notebookSchema.safeParse({ ...notebook(), trash: [plan()] }).success).toBe(false);
  });
  it('removes runtime URLs from persisted images', () => {
    expect(photoSchema.parse({ id: 'p', assetId: 'a'.repeat(64), name: '', caption: '', annotations: [], source: 'blob:private' })).not.toHaveProperty('source');
  });
});
