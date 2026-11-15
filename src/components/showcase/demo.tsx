'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { Briefing } from '@/domain/types';
import { pageHtml } from '../prototype-frontend/adapter';
import { mountPrototype } from '../prototype-frontend/runtime';
import { requestPeer } from '../prototype-frontend/peer-objects';
import { DemoPlanner } from './demo-planner';
import './demo.css';

export type DemoView = 'journey' | 'handbook' | 'planner';

export function ShowcaseDemo({ briefing, view }: { briefing: Briefing; view: DemoView }) {
  const host = useRef<HTMLDivElement>(null);
  const html = useMemo(() => pageHtml(briefing, 15), [briefing]);
  useEffect(() => {
    document.body.classList.add('showcase-demo');
    document.body.dataset.showcaseView = view;
    const abort = new AbortController();
    let runtime: ReturnType<typeof mountPrototype> | undefined;
    if (view !== 'planner') {
      host.current!.innerHTML = html;
      runtime = mountPrototype(briefing, 15, 0, () => {}, () => {});
    }
    const send = (message: object) => { if (window.parent !== window) window.parent.postMessage({ channel: 'hikari-showcase', ...message }, location.origin); };
    let progress = 0;
    function position(value: number) {
      progress = Math.max(0, Math.min(.46, value));
      if (!runtime || document.querySelector('dialog[open]')) return;
      const journey = document.getElementById('journey')!;
      if (runtime.isStatic()) {
        document.getElementById(progress < .22 ? 'newspaper' : 'instruments')?.scrollIntoView({ block: 'start' });
      } else {
        window.scrollTo({ top: progress === 0 ? 0 : journey.offsetTop + Number(journey.dataset.readingDistance) * progress, behavior: 'instant' });
      }
    }
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== window.parent || event.data?.channel !== 'hikari-showcase') return;
      if (event.data.type === 'progress' && Number.isFinite(event.data.value)) position(event.data.value);
      if (event.data.type === 'motion' && typeof event.data.reduced === 'boolean') {
        document.body.dataset.showcaseMotion = event.data.reduced ? 'reduced' : 'full';
        if (runtime && runtime.isStatic() !== event.data.reduced) {
          document.getElementById('motion-toggle')?.click(); position(progress);
        }
      }
      if (event.data.type === 'open-handbook') requestPeer('handbook', document.querySelector<HTMLElement>('.handbook-pull'));
    }, { signal: abort.signal });
    window.addEventListener('wheel', event => {
      // Preserve native book turns, editing and dialog scrolling inside each exhibit.
      if (event.ctrlKey || event.defaultPrevented) return;
      const dialog = document.querySelector('dialog[open]');
      if (dialog && !(view === 'handbook' && dialog.id === 'peer-reader')) return;
      if (event.composedPath().some(node => node instanceof Element && node.matches('input,textarea,select,.annotation-dialog,.thumbnail-strip'))) return;
      if (window.parent === window) return;
      event.preventDefault();
      send({ type: 'wheel', delta: event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1) });
    }, { passive: false, signal: abort.signal });
    if (view === 'handbook') requestPeer('handbook', document.querySelector<HTMLElement>('.handbook-pull'), true);
    const reportReady = () => {
      if (document.querySelector('.shooting-reader-host[data-ready="true"]')) send({ type: 'ready' });
    };
    window.addEventListener('hikari:showcase-planner-ready', reportReady, { signal: abort.signal });
    reportReady();
    return () => {
      abort.abort(); runtime?.destroy(); document.body.classList.remove('showcase-demo'); delete document.body.dataset.showcaseView; delete document.body.dataset.showcaseMotion;
    };
  }, [briefing, html, view]);

  if (view === 'planner') return <DemoPlanner inline />;
  return <>
    <button id="motion-toggle" className="sr-only" type="button" aria-pressed="false">减少动态</button>
    <div ref={host} data-frontend="prototype" dangerouslySetInnerHTML={{ __html: html }} />
    <DemoPlanner />
  </>;
}
