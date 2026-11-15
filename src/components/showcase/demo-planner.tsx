'use client';

import { useEffect, useRef, useState } from 'react';
import { mountPlanner } from '../shooting-planner/runtime';
import { plannerHtml } from '../shooting-planner/template';
import { dockLift, forgetPeer, objectMotion, preparePeerDock, rectTransform, registerPeer, requestPeer } from '../prototype-frontend/peer-objects';
import { lockModalPage, unlockModalPage } from '../shared/modal-lock';
import { createDemoStorage } from './demo-storage';
import '../shooting-planner/shell.css';

export function DemoPlanner({ inline = false }: { inline?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState('正在载入示例计划…');

  useEffect(() => {
    const node = host.current!;
    const root = node.shadowRoot ?? node.attachShadow({ mode: 'open' });
    const abort = new AbortController();
    const session = createDemoStorage(setStatus);
    const holder = Symbol('showcase-planner');
    let controller: ReturnType<typeof mountPlanner> | undefined;
    let trigger: HTMLElement | null = null;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/planner/planner.css';
    const content = document.createElement('div'); content.innerHTML = plannerHtml;
    root.replaceChildren(link, content);
    link.onload = () => {
      if (abort.signal.aborted) return;
      controller = mountPlanner(root, {
        notebook: session.notebook, storage: session.storage, draft: null, view: {},
        onClose: () => requestPeer(null), onStatus: setStatus,
        reducedMotion: () => document.body.dataset.showcaseMotion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches,
      });
      node.dataset.ready = 'true';
      setStatus('示例计划 · 编辑保留在本次页面会话');
      window.dispatchEvent(new Event('hikari:showcase-planner-ready'));
    };
    link.onerror = () => setStatus('计划本样式读取失败，请刷新重试');

    async function open(opener: HTMLElement | null, immediate: boolean) {
      if (inline || abort.signal.aborted) return;
      preparePeerDock();
      trigger = opener?.matches('.planner-pull') ? opener : document.querySelector('.planner-pull');
      lockModalPage(holder);
      let raised: DOMRect | undefined;
      if (trigger) {
        const lift = dockLift(trigger);
        await objectMotion(trigger, [{ transform: lift.pose }, { transform: lift.raised }], 220, immediate);
        trigger.style.transform = lift.raised;
        raised = trigger.getBoundingClientRect(); trigger.style.visibility = 'hidden';
      }
      if (abort.signal.aborted) return;
      const reader = dialog.current!;
      reader.showModal(); controller?.showIndex();
      const cover = root.getElementById('cover')!;
      const book = root.getElementById('book')!;
      cover.hidden = false; book.style.opacity = '0';
      if (raised) await objectMotion(cover, [{ transform: rectTransform(raised, cover.getBoundingClientRect()) }, { transform: 'none' }], 260, immediate);
      book.style.opacity = ''; book.style.clipPath = 'inset(0 0 0 50%)';
      await Promise.all([
        objectMotion(cover, [{ transform: 'rotateY(0deg)' }, { transform: 'perspective(1800px) rotateY(-180deg)' }], 280, immediate),
        objectMotion(book, [{ clipPath: 'inset(0 0 0 50%)' }, { clipPath: 'inset(0)' }], 280, immediate),
      ]);
      cover.hidden = true; book.style.clipPath = ''; reader.dataset.phase = 'reading';
      root.querySelector<HTMLInputElement>('.search-field input')?.focus({ preventScroll: true });
    }
    async function close(immediate: boolean) {
      if (inline) return;
      const reader = dialog.current;
      const cover = root.getElementById('cover');
      const book = root.getElementById('book');
      if (reader?.open && cover && book && !abort.signal.aborted) {
        cover.hidden = false;
        await objectMotion(cover, [{ transform: 'perspective(1800px) rotateY(-180deg)' }, { transform: 'none' }], 240, immediate);
        book.style.opacity = '0';
        if (trigger) {
          trigger.style.transform = '';
          const lift = dockLift(trigger); trigger.style.transform = lift.raised;
          await objectMotion(cover, [{ transform: 'none' }, { transform: rectTransform(trigger.getBoundingClientRect(), cover.getBoundingClientRect()) }], 260, immediate);
          reader.close(); trigger.style.visibility = '';
          await objectMotion(trigger, [{ transform: lift.raised }, { transform: lift.pose }], 220, immediate);
          trigger.style.transform = '';
        }
        cover.hidden = true; book.style.opacity = '';
      }
      reader?.close(); unlockModalPage(holder); trigger?.focus({ preventScroll: true });
    }
    const unregister = inline ? () => {} : registerPeer('planner', { open, close });
    return () => {
      abort.abort(); unregister();
      if (!inline) forgetPeer('planner');
      controller?.destroy(); session.destroy(); dialog.current?.close(); unlockModalPage(holder);
    };
  }, [inline]);

  const contents = <><div ref={host} className="shooting-reader-host" /><p className="demo-planner-status" role="status">{status}</p></>;
  if (inline) return <section className="demo-planner-inline" aria-label="拍摄计划本交互样例">{contents}</section>;
  return <dialog ref={dialog} className="shooting-reader" aria-label="拍摄计划本交互样例"
    onCancel={event => { event.preventDefault(); requestPeer(null); }}
    onClick={event => {
      const root = host.current?.shadowRoot;
      if (root?.querySelector('dialog[open]')) return;
      const scene = root?.querySelector('.book-scene');
      if (scene && event.nativeEvent.composedPath().includes(scene)) return;
      if ((event.target as Element).closest('.demo-planner-status')) return;
      requestPeer(null);
    }}>{contents}</dialog>;
}
