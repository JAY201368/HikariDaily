import { assetIds, emptyNotebook, importNotebook, notebookSchema, type Notebook, type NotebookSnapshot } from '@/domain/planner';

export type LocalRecord = NotebookSnapshot & {
  clock: number; pending: boolean; editId: string;
  attempt?: { baseVersion: number; operationId: string; notebook: Notebook; editId: string };
};
const databaseName = 'hikari-shooting-planner';
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('notebooks');
      request.result.createObjectStore('assets');
      request.result.createObjectStore('settings');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('本机存储无法打开，请检查浏览器存储权限'));
  });
}
export async function localGet<T>(table: string, key: string): Promise<T | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(table, 'readonly');
    const request = tx.objectStore(table).get(key);
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
function ownerForKey(table: string, key: string) {
  if (table === 'notebooks') return key;
  if (table === 'assets') return key.split(':')[0];
  return /^(?:draft|view|sync):(.+)$/.exec(key)?.[1] ?? null;
}
function permitWrite(tx: IDBTransaction, owner: string | null, write: () => void) {
  if (!owner || owner === 'guest') { write(); return; }
  const check = tx.objectStore('settings').get(`deleted:${owner}`);
  check.onsuccess = () => { if (check.result) tx.abort(); else write(); };
}
export async function localPut(table: string, key: string, value: unknown) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([...new Set([table, 'settings'])], 'readwrite');
    permitWrite(tx, ownerForKey(table, key), () => tx.objectStore(table).put(value, key));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(new Error('本机保存失败，请检查账户和存储空间后重试')); };
  });
}
async function writeRecord(key: string, value: LocalRecord, expectedClock: number) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['notebooks', 'settings'], 'readwrite');
    const table = tx.objectStore('notebooks');
    let conflict = false;
    permitWrite(tx, key, () => {
    const read = table.get(key);
    read.onsuccess = () => {
      if ((read.result?.clock ?? 0) !== expectedClock) { conflict = true; tx.abort(); }
      else table.put(value, key);
    };
    });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(new Error(conflict ? '另一窗口已修改本机计划，请合并保存' : '本机保存失败，请检查存储空间后重试')); };
  });
}
class SyncError extends Error { constructor(message: string, readonly code: string) { super(message); } }
async function api<T>(owner: string, path = '', body?: unknown, signal?: AbortSignal): Promise<T> {
  const binary = body instanceof Blob;
  const response = await fetch(`/api/workspace/planner${path}`, {
    method: body === undefined ? 'GET' : 'PUT', credentials: 'same-origin', cache: 'no-store', signal,
    headers: { 'X-Planner-Owner': owner, ...(body === undefined ? {} : { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' }) },
    body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new SyncError(result.error?.message || '账户同步失败，请重试', result.error?.code || 'NETWORK');
  return result.data;
}
export class PlannerStorage {
  readonly scope: string;
  private record: LocalRecord;
  private clock = 0;
  private queue: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private request = new AbortController();
  private syncing = false;
  private syncWork?: Promise<void>;
  private stopped = false;
  private localFailed = false;
  private urls = new Map<string, string>();
  private uploaded = new Set<string>();
  private settingsQueue: Promise<void> = Promise.resolve();
  onStatus: (message: string, error?: boolean) => void = () => {};
  onRemoteChange: () => void = () => {};
  constructor(readonly owner: string | null) {
    this.scope = owner ?? 'guest';
    this.record = { notebook: emptyNotebook(), revision: 0, operationId: null, clock: 0, pending: false, editId: crypto.randomUUID() };
  }
  async load() {
    const saved = await localGet<LocalRecord>('notebooks', this.scope);
    if (saved) { this.record = { ...saved, notebook: notebookSchema.parse(saved.notebook) }; this.clock = saved.clock; }
    if (this.owner && !this.record.pending) {
      try {
        const remote = await api<NotebookSnapshot>(this.owner, '', undefined, this.request.signal);
        this.record = { ...this.record, ...remote };
        await this.persist();
      } catch (error) { this.onStatus(saved ? '已载入本机副本 · 账户连接失败，可重试' : (error as Error).message, true); if (!saved) throw error; }
    }
    return this.hydrate(this.record.notebook);
  }
  private async persist() {
    const next = { ...this.record, clock: this.clock + 1 };
    await writeRecord(this.scope, next, this.clock);
    this.clock = next.clock;
    this.record.clock = next.clock;
  }
  save(value: Notebook) {
    const notebook = notebookSchema.parse(value);
    this.record = { ...this.record, notebook, editId: crypto.randomUUID(), pending: true };
    this.onStatus('正在保存到本机');
    this.queue = this.queue.catch(() => {}).then(async () => {
      try { await this.persist(); this.localFailed = false; this.onStatus(this.owner ? '已保存到本机 · 等待同步' : '已保存到本机'); }
      catch (error) { this.localFailed = true; this.onStatus((error as Error).message, true); }
    });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync(), 900);
    return this.queue;
  }
  sync(): Promise<void> {
    if (this.syncWork) return this.syncWork;
    this.syncWork = this.performSync().finally(() => { this.syncWork = undefined; });
    return this.syncWork;
  }
  private async performSync() {
    await this.queue.catch(() => {});
    if (!this.owner || this.stopped || this.syncing || this.localFailed || !this.record.pending) return;
    this.syncing = true;
    try {
      if (!this.record.attempt) {
        this.queue = this.queue.catch(() => {}).then(async () => {
          this.record.attempt = { baseVersion: this.record.revision, operationId: crypto.randomUUID(), notebook: structuredClone(this.record.notebook), editId: this.record.editId };
          try { await this.persist(); }
          catch (error) { this.localFailed = true; throw error; }
        });
        await this.queue;
      }
      const attempt = this.record.attempt!;
      const ids = assetIds(attempt.notebook);
      for (const [index, id] of ids.entries()) {
        if (this.uploaded.has(id)) continue;
        const blob = await localGet<Blob>('assets', `${this.scope}:${id}`);
        if (blob) {
          this.onStatus(`正在上传图片 ${index + 1} / ${ids.length}`);
          await api(this.owner, `/images/${id}`, blob, this.request.signal);
        }
        this.uploaded.add(id);
      }
      this.onStatus('正在同步到账户');
      const result = await api<NotebookSnapshot>(this.owner, '', { baseVersion: attempt.baseVersion, operationId: attempt.operationId, notebook: attempt.notebook }, this.request.signal);
      if (this.stopped) return;
      this.queue = this.queue.catch(() => {}).then(async () => {
        this.record.revision = result.revision;
        this.record.operationId = result.operationId;
        this.record.pending = this.record.editId !== attempt.editId;
        delete this.record.attempt;
        await this.persist();
      });
      await this.queue;
      this.onStatus(this.record.pending ? '已保存到本机 · 等待同步' : '已同步到账户');
    } catch (error) {
      if (!this.stopped) this.onStatus(error instanceof SyncError && error.code === 'PLANNER_CONFLICT' ? '另一处已更新计划 · 点击合并' : `${(error as Error).message || '网络连接中断'} · 点击重试`, true);
    } finally {
      this.syncing = false;
      if (!this.stopped && this.record.pending && !this.record.attempt && !this.localFailed) this.timer = setTimeout(() => void this.sync(), 900);
    }
  }
  async flush() {
    await this.settingsQueue;
    await this.queue.catch(() => {});
    if (this.localFailed) throw new Error('本机保存失败，请重试后再切换计划本');
  }
  async retry() {
    if (this.localFailed) await this.save(this.record.notebook);
    this.queue = this.queue.catch(() => {});
    await this.sync();
  }
  async checkForUpdates() {
    await this.queue.catch(() => {});
    if (this.stopped || (this.owner && this.record.pending) || this.syncing) return;
    try {
      const remote = this.owner
        ? await api<NotebookSnapshot>(this.owner, '', undefined, this.request.signal)
        : await localGet<LocalRecord>('notebooks', this.scope);
      if (this.stopped || !remote) return;
      const changed = this.owner ? remote.revision !== this.record.revision : (remote as LocalRecord).clock !== this.clock;
      if (changed) this.onRemoteChange();
    } catch (error) { if (!this.stopped) this.onStatus((error as Error).message, true); }
  }
  async merge() {
    await this.queue.catch(() => {});
    const local = await localGet<LocalRecord>('notebooks', this.scope);
    const remote = this.owner ? await api<NotebookSnapshot>(this.owner, '', undefined, this.request.signal) : local ?? this.record;
    const combined = importNotebook(remote.notebook, this.record.notebook, 'conflict');
    this.clock = local?.clock ?? 0;
    this.record = { ...this.record, ...remote, attempt: undefined, pending: true };
    await this.save(combined);
    await this.flush();
    return this.hydrate(combined);
  }
  async importGuest() {
    const guest = await localGet<LocalRecord>('notebooks', 'guest');
    if (!guest) return this.hydrate(this.record.notebook);
    for (const id of assetIds(guest.notebook)) {
      const blob = await localGet<Blob>('assets', `guest:${id}`);
      if (blob) await localPut('assets', `${this.scope}:${id}`, blob);
    }
    const combined = importNotebook(this.record.notebook, guest.notebook);
    await this.save(combined);
    await this.flush();
    return this.hydrate(combined);
  }
  async addImage(file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) throw new Error('请选择15 MB以内的 JPEG、PNG 或 WebP 图片');
    const bytes = await file.arrayBuffer();
    const id = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
    const decoded = await createImageBitmap(file);
    const pixels = decoded.width * decoded.height;
    decoded.close();
    if (pixels > 40_000_000) throw new Error('图片最多4000万像素');
    await localPut('assets', `${this.scope}:${id}`, file);
    return { assetId: id, source: await this.imageUrl(id) };
  }
  private async imageUrl(id: string) {
    if (this.urls.has(id)) return this.urls.get(id)!;
    let blob = await localGet<Blob>('assets', `${this.scope}:${id}`);
    if (!blob && this.owner) {
      const response = await fetch(`/api/workspace/planner/images/${id}?owner=${this.owner}`, { credentials: 'same-origin', cache: 'no-store', signal: this.request.signal });
      if (!response.ok) throw new Error('图片读取失败，请重试');
      blob = await response.blob();
      await localPut('assets', `${this.scope}:${id}`, blob);
    }
    if (!blob) throw new Error('本机图片缺失，请重新贴入');
    const url = URL.createObjectURL(blob);
    this.urls.set(id, url);
    return url;
  }
  async hydrate(notebook: Notebook) {
    const result = structuredClone(notebook);
    for (const plan of [...result.plans, ...result.trash]) for (const photo of plan.photos) {
      try { Object.assign(photo, { source: await this.imageUrl(photo.assetId) }); }
      catch (error) { Object.assign(photo, { source: '', imageError: (error as Error).message }); }
    }
    return result;
  }
  async retryImage(id: string) { return this.imageUrl(id); }
  async draft(value?: unknown) {
    if (value !== undefined) {
      this.settingsQueue = this.settingsQueue.catch(() => {}).then(() => localPut('settings', `draft:${this.scope}`, value));
      await this.settingsQueue;
      return value;
    }
    return localGet('settings', `draft:${this.scope}`);
  }
  async view(value?: unknown) {
    if (value !== undefined) {
      this.settingsQueue = this.settingsQueue.catch(() => {}).then(() => localPut('settings', `view:${this.scope}`, value));
      await this.settingsQueue;
      return value;
    }
    return localGet('settings', `view:${this.scope}`);
  }
  destroy() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.request.abort();
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}

/** Delete one account's browser copies; guest originals and other accounts survive. */
export async function purgePlannerAccount(ownerId: string) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['notebooks', 'assets', 'settings'], 'readwrite');
    tx.objectStore('settings').put(true, `deleted:${ownerId}`);
    tx.objectStore('notebooks').delete(ownerId);
    const assets = tx.objectStore('assets').openCursor();
    assets.onsuccess = () => { const cursor = assets.result; if (!cursor) return; if (String(cursor.key).startsWith(`${ownerId}:`)) cursor.delete(); cursor.continue(); };
    for (const key of [`sync:${ownerId}`, `draft:${ownerId}`, `view:${ownerId}`]) tx.objectStore('settings').delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(new Error('账户本机缓存清理失败，请重试')); };
  });
}
