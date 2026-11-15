'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useWorkspaceAccount } from '../account/account';
import { activePeer, dockLift, forgetPeer, objectMotion, preparePeerDock, rectTransform, registerPeer, requestPeer } from '../prototype-frontend/peer-objects';
import { lockModalPage, unlockModalPage } from '../shared/modal-lock';
import type { Briefing, Genre } from '@/domain/types';
import type { AdviceEnhancementResult } from '@/domain/workspace/advice';
import type { Reference } from '@/domain/planner';
import { shanghaiIso } from '@/domain/time';
import { PlannerStorage, localGet, localPut, type LocalRecord } from './storage';
import { mountPlanner, type PlannerRuntime } from './runtime.js';
import { plannerHtml } from './template';
import './shell.css';

type Props = { briefing?: Briefing; hour: number | null; genre: Genre; advice: AdviceEnhancementResult | null };
export function ShootingPlanner({ briefing, hour, genre, advice }: Props) {
  const { owner, openAccount, registerPlannerSync } = useWorkspaceAccount();
  const dialog = useRef<HTMLDialogElement>(null);
  const syncDialog = useRef<HTMLDialogElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const root = useRef<ShadowRoot | null>(null);
  const runtime = useRef<PlannerRuntime | null>(null);
  const storage = useRef<PlannerStorage | null>(null);
  const pendingReference = useRef<Reference | null>(null);
  const holder = useRef(Symbol('planner-reader'));
  const [enabledOwner, setEnabledOwner] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [message, setMessage] = useState('正在载入本机计划');
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [remoteChanged, setRemoteChanged] = useState(false);
  const ownerRef = useRef(owner?.id);
  useLayoutEffect(() => { ownerRef.current = owner?.id; }, [owner?.id]);
  const [guestCount, setGuestCount] = useState(0);
  const scope = owner && enabledOwner === owner.id ? owner.id : null;

  useLayoutEffect(() => {
    let disposed = false;
    let loadFailed = false;
    runtime.current?.destroy(); runtime.current = null;
    storage.current?.destroy(); storage.current = null;
    if (!host.current) return;
    root.current ||= host.current.attachShadow({ mode: 'open' });
    root.current.replaceChildren();
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/planner/planner.css';
    const loaded = new Promise<void>((resolve, reject) => { link.onload = () => resolve(); link.onerror = () => reject(new Error('计划本样式读取失败，请重试')); });
    root.current.append(link);
    const content = document.createElement('div'); content.innerHTML = plannerHtml; root.current.append(content);
    const session = new PlannerStorage(scope);
    storage.current = session;
    const online = () => void session.retry();
    const focus = () => void session.checkForUpdates();
    session.onRemoteChange = () => { if (!disposed) setRemoteChanged(true); };
    window.addEventListener('focus', focus);
    const refreshTimer = window.setInterval(() => { if (document.visibilityState === 'visible' && dialog.current?.open) focus(); }, 30000);
    window.addEventListener('online', online);
    session.onStatus = (text, error = false) => { if (disposed) return; if (error) loadFailed = true; setMessage(text); setFailed(error); };
    queueMicrotask(() => { if (!disposed) { setReady(false); setRemoteChanged(false); setMessage('正在载入计划'); setFailed(false); } });
    void (async () => {
      try {
        const [notebook, draft, view] = await Promise.all([session.load(), session.draft(), session.view(), loaded]);
        if (disposed) return;
        const controller = mountPlanner(root.current!, { notebook, draft, view, storage: session, onClose: () => requestPeer(null), onStatus: session.onStatus });
        runtime.current = controller;
        setReady(true);
        if (!loadFailed) session.onStatus(scope ? '账户计划 · 已载入本机副本' : '本机计划 · 自动保存到此浏览器');
        if (pendingReference.current) { controller.receiveReference(pendingReference.current); pendingReference.current = null; }
        void session.sync();
      } catch (error) { session.onStatus((error as Error).message, true); }
    })();
    return () => { disposed = true; window.removeEventListener('online', online); window.removeEventListener('focus', focus); window.clearInterval(refreshTimer); runtime.current?.destroy(); runtime.current = null; session.destroy(); };
  }, [scope, reload]);

  useLayoutEffect(() => { if (ready) runtime.current?.refresh(); }, [ready]);

  useEffect(() => {
    let disposed = false;
    syncDialog.current?.close();
    if (!owner) return;
    void localGet<boolean>('settings', `sync:${owner.id}`).then(enabled => { if (!disposed && enabled) setEnabledOwner(owner.id); });
    return () => { disposed = true; };
  }, [owner]);

  useEffect(() => {
    const reader = dialog.current!;
    const lock = holder.current;
    let trigger: HTMLElement | null = null;
    let disposed = false;
    const cover = () => root.current?.getElementById('cover');
    const book = () => root.current?.getElementById('book');
    async function open(opener: HTMLElement | null, immediate: boolean) {
      if (disposed) return;
      preparePeerDock();
      trigger = opener?.matches('.planner-pull') ? opener : document.querySelector('.planner-pull');
      lockModalPage(lock);
      let raised: DOMRect | undefined;
      if (trigger) {
        const lift = dockLift(trigger);
        await objectMotion(trigger, [{ transform: lift.pose }, { transform: lift.raised }], 220, immediate);
        trigger.style.transform = lift.raised; raised = trigger.getBoundingClientRect(); trigger.style.visibility = 'hidden';
      }
      if (disposed) return;
      if (!reader.open) reader.showModal();
      runtime.current?.showIndex();
      const jacket = cover(), paper = book();
      if (jacket && paper) {
        jacket.hidden = false; paper.style.opacity = '0';
        if (raised) await objectMotion(jacket, [{ transform: rectTransform(raised, jacket.getBoundingClientRect()) }, { transform: 'none' }], 260, immediate);
        paper.style.opacity = ''; paper.style.clipPath = 'inset(0 0 0 50%)';
        await Promise.all([
          objectMotion(jacket, [{ transform: 'rotateY(0deg)' }, { transform: 'perspective(1800px) rotateY(-180deg)' }], 280, immediate),
          objectMotion(paper, [{ clipPath: 'inset(0 0 0 50%)' }, { clipPath: 'inset(0)' }], 280, immediate),
        ]);
        jacket.hidden = true; paper.style.clipPath = '';
      }
      reader.dataset.phase = 'reading';
      root.current?.querySelector<HTMLElement>('.search-field input')?.focus({ preventScroll: true });
      if (pendingReference.current && runtime.current) { runtime.current.receiveReference(pendingReference.current); pendingReference.current = null; }
    }
    async function close(immediate: boolean) {
      const jacket = cover(), paper = book();
      if (jacket && paper && reader.open) {
        jacket.hidden = false;
        await objectMotion(jacket, [{ transform: 'perspective(1800px) rotateY(-180deg)' }, { transform: 'none' }], 240, immediate);
        paper.style.opacity = '0';
        const target = document.querySelector<HTMLElement>('.planner-pull');
        if (target) {
          target.style.transform = '';
          const lift = dockLift(target); target.style.transform = lift.raised;
          await objectMotion(jacket, [{ transform: 'none' }, { transform: rectTransform(target.getBoundingClientRect(), jacket.getBoundingClientRect()) }], 260, immediate);
          reader.close(); target.style.visibility = '';
          await objectMotion(target, [{ transform: lift.raised }, { transform: lift.pose }], 220, immediate);
          target.style.transform = '';
        }
        jacket.hidden = true; paper.style.opacity = '';
      }
      reader.close(); unlockModalPage(lock);
      if (trigger?.isConnected) { trigger.style.transform = ''; trigger.style.visibility = ''; trigger.focus({ preventScroll: true }); }
      else document.querySelector<HTMLButtonElement>('.planner-pull')?.focus({ preventScroll: true });
    }
    const unregister = registerPeer('planner', { open, close });
    const click = (event: MouseEvent) => {
      const target = (event.target as Element).closest<HTMLElement>('[data-peer="planner"]');
      if (target) requestPeer('planner', target);
    };
    document.addEventListener('click', click);
    const observer = new MutationObserver(() => {
      const dock = document.querySelector<HTMLElement>('.planner-pull');
      if (dock && reader.open) dock.style.visibility = 'hidden';
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { disposed = true; observer.disconnect(); unregister(); forgetPeer('planner'); document.removeEventListener('click', click); reader.close(); unlockModalPage(lock); };
  }, []);

  const syncChoices = useCallback(async () => {
    if (!owner) { openAccount(); return; }
    try {
      await storage.current?.flush();
      const guest = await localGet<LocalRecord>('notebooks', 'guest');
      setGuestCount((guest?.notebook.plans.length ?? 0) + (guest?.notebook.trash.length ?? 0));
      setSyncMessage('');
    } catch (error) { setSyncMessage((error as Error).message); }
    syncDialog.current?.showModal();
  }, [owner, openAccount]);
  useEffect(() => registerPlannerSync(() => { void syncChoices(); }), [registerPlannerSync, syncChoices]);
  async function enableSync(importLocal: boolean) {
    if (!owner || busy) return;
    const ownerId = owner.id;
    setBusy(true); setSyncMessage('');
    const session = new PlannerStorage(ownerId);
    try {
      await storage.current?.flush();
      await storage.current?.sync();
      await session.load();
      if (importLocal) await session.importGuest();
      await session.flush();
      if (ownerRef.current !== ownerId) return;
      await localPut('settings', `sync:${ownerId}`, true);
      setEnabledOwner(ownerId); setReload(value => value + 1); syncDialog.current?.close();
    } catch (error) { setSyncMessage((error as Error).message); }
    finally { session.destroy(); setBusy(false); }
  }
  async function retryOrMerge() {
    try {
      if (!ready) { setReload(value => value + 1); return; }
      if (message.includes('另一')) {
        const notebook = await storage.current!.merge(); runtime.current?.replace(notebook);
      } else await storage.current?.retry();
    } catch (error) { setFailed(true); setMessage((error as Error).message); }
  }
  function makeReference(): Reference | null {
    if (!briefing) return null;
    const selectedHour = hour ?? Number(shanghaiIso(briefing.generatedAt).slice(11, 13));
    const names = { landscape: '风光', portrait: '人像', street: '街拍' };
    const narrative = advice?.enhancement[genre].full;
    const body = [briefing.interpretation.weatherLine, ...briefing.interpretation.hours[selectedHour].sentences,
      briefing.interpretation.genres[genre].when, briefing.interpretation.genres[genre].line,
      ...(narrative ? Object.values(narrative).map(item => item.text) : []),
      ...briefing.interpretation.risks.map(risk => risk.text), briefing.interpretation.dataNote ?? ''].filter(Boolean).join('\n\n');
    return {
      id: crypto.randomUUID(), label: `${briefing.location.name} · ${selectedHour}时 · ${names[genre]}建议`,
      location: briefing.location.name, placeId: briefing.location.id, localDate: briefing.localDate, generatedAt: briefing.generatedAt, body,
      sources: [...briefing.sources.map(source => ({ name: source.provider, kind: source.kind === 'astronomical' ? '天文计算' : source.kind === 'forecast' ? '预报' : '观测', fetchedAt: source.fetchedAt, status: source.status })), { name: narrative ? '逐光摄影规则与账户 AI 建议' : '逐光摄影规则', kind: '摄影推断', fetchedAt: briefing.generatedAt, status: '已生成' }],
    };
  }
  function collectReference() {
    pendingReference.current = makeReference();
    if (!pendingReference.current) return;
    requestPeer('planner');
    if (activePeer() === 'planner' && dialog.current?.open && runtime.current) { runtime.current.receiveReference(pendingReference.current); pendingReference.current = null; }
  }
  useEffect(() => {
    runtime.current?.setReference(makeReference());
    const collect = (event: MouseEvent) => {
      if ((event.target as Element).closest('[data-collect-planner]')) collectReference();
    };
    document.addEventListener('click', collect);
    return () => document.removeEventListener('click', collect);
  });
  const visibleMessage = !owner && message === '本机计划 · 自动保存到此浏览器' ? '未登录，计划保存到本地' : message;
  function closeOnGlassClick(event: ReactMouseEvent<HTMLDialogElement>) {
    if (root.current?.querySelector('dialog[open]')) return;
    const path = event.nativeEvent.composedPath();
    const scene = root.current?.querySelector('.book-scene');
    const statuses = event.currentTarget.querySelectorAll('.shooting-storage-status');
    if ((scene && path.includes(scene)) || Array.from(statuses).some(status => path.includes(status))) return;
    requestPeer(null);
  }
  return <>
    {!briefing && <div className="planner-entry-actions">
      <button className="text-button" data-peer="planner">打开拍摄计划本 ↗</button>
    </div>}
    <dialog ref={dialog} className="shooting-reader" aria-label="拍摄计划本" onClick={closeOnGlassClick} onCancel={event => { event.preventDefault(); requestPeer(null); }}>
      <p className={`shooting-storage-status${failed ? ' error' : ''}`} role="status">{visibleMessage}{failed && <button onClick={() => void retryOrMerge()}>{message.includes('另一') ? '保留两份并合并' : '重试'}</button>}</p>
      {remoteChanged && <p className="shooting-storage-status">另一处有更新 <button onClick={() => void storage.current?.flush().then(() => { setRemoteChanged(false); setReload(value => value + 1); }).catch(error => { setFailed(true); setMessage(error.message); })}>载入最新计划</button></p>}
      <div ref={host} className="shooting-reader-host" hidden={!ready} />
    </dialog>
    <dialog ref={syncDialog} className="shooting-sync" aria-label="导入与同步">
      <h2>同步到 {owner?.username}</h2><p>本机共有 {guestCount} 份计划。导入后，本机原稿继续保留，账户副本自动同步。</p>
      <button disabled={busy} onClick={() => void enableSync(true)}>导入本机计划并开启同步</button>
      <button disabled={busy} onClick={() => void enableSync(false)}>仅开启账户同步</button>
      {syncMessage && <p role="alert">{syncMessage}</p>}
      {scope && <button disabled={busy} onClick={() => void storage.current?.flush().then(async () => { await localPut('settings', `sync:${scope}`, false); setEnabledOwner(null); syncDialog.current?.close(); }).catch(error => setSyncMessage(error.message))}>使用本机计划</button>}
      <button disabled={busy} onClick={() => syncDialog.current?.close()}>{scope ? '返回账户计划' : '继续本机使用'}</button>
    </dialog>
  </>;
}
