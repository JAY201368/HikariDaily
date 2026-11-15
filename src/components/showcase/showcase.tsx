'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import './showcase.css';

type Exhibit = 'journey' | 'handbook' | 'planner';
const titles: Record<Exhibit, string> = {
  journey: '日报折叠与随身仪表交互', handbook: '摄影手册翻页交互', planner: '拍摄计划本编辑与图片批注',
};

function ExhibitFrame({ kind, register }: { kind: Exhibit; register: (kind: Exhibit, node: HTMLIFrameElement | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const bind = useCallback((node: HTMLIFrameElement | null) => { frame.current = node; register(kind, node); }, [kind, register]);
  useEffect(() => {
    const node = box.current!;
    const resize = new ResizeObserver(([entry]) => node.style.setProperty('--exhibit-scale', String(entry.contentRect.width / 1440)));
    resize.observe(node);
    const loaded = (event: MessageEvent) => {
      if (event.origin === location.origin && event.source === frame.current?.contentWindow && event.data?.channel === 'hikari-showcase' && event.data.type === 'ready') {
        setReady(true); setFailed(false);
      }
    };
    window.addEventListener('message', loaded);
    return () => { resize.disconnect(); window.removeEventListener('message', loaded); };
  }, []);
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setFailed(true), 20000);
    return () => window.clearTimeout(timer);
  }, [ready, attempt]);
  return <div ref={box} className={`exhibit-frame exhibit-${kind}`} data-ready={ready}>
    {/* Native product screenshots are the loading and no-script surface. */}
    <img className="exhibit-poster" src={`/showcase/${kind}.webp`} alt={titles[kind]} width={1440} height={1000} />
    <iframe key={attempt} ref={bind} src={`/showcase/demo?view=${kind}`} title={titles[kind]} loading={kind === 'journey' ? 'eager' : 'lazy'} tabIndex={0} />
    {!ready && <div className="exhibit-status" role="status">
      <span>{failed ? '交互内容载入失败' : '正在载入交互内容'}</span>
      {failed && <button onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>重新载入 ↻</button>}
    </div>}
  </div>;
}

export function Showcase({ repositoryUrl }: { repositoryUrl?: string } = {}) {
  const journey = useRef<HTMLElement>(null);
  const frames = useRef<Partial<Record<Exhibit, HTMLIFrameElement>>>({});
  const [reduced, setReduced] = useState(false);
  const [inBag, setInBag] = useState(false);
  const [staticBag, setStaticBag] = useState(false);
  const register = useCallback((kind: Exhibit, frame: HTMLIFrameElement | null) => {
    if (frame) frames.current[kind] = frame;
    else delete frames.current[kind];
  }, []);
  const post = useCallback((kind: Exhibit, message: object) => {
    frames.current[kind]?.contentWindow?.postMessage({ channel: 'hikari-showcase', ...message }, location.origin);
  }, []);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(media.matches);
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    let animation = 0;
    function update() {
      const node = journey.current!;
      const available = Math.max(1, node.offsetHeight - innerHeight + 64);
      const fraction = Math.max(0, Math.min(1, (64 - node.getBoundingClientRect().top) / available));
      const progress = reduced ? (staticBag ? .46 : 0) : fraction * .46;
      setInBag(progress > .34);
      post('journey', { type: 'progress', value: progress });
    }
    const schedule = () => { cancelAnimationFrame(animation); animation = requestAnimationFrame(update); };
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.data?.channel !== 'hikari-showcase') return;
      const kind = (Object.keys(frames.current) as Exhibit[]).find(key => frames.current[key]?.contentWindow === event.source);
      if (!kind) return;
      if (event.data.type === 'wheel' && Number.isFinite(event.data.delta)) window.scrollBy({ top: Math.max(-1000, Math.min(1000, event.data.delta)), behavior: 'instant' });
      if (event.data.type === 'ready') { post(kind, { type: 'motion', reduced }); update(); }
    };
    window.addEventListener('message', receive);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    for (const kind of Object.keys(frames.current) as Exhibit[]) post(kind, { type: 'motion', reduced });
    update();
    return () => { cancelAnimationFrame(animation); window.removeEventListener('message', receive); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, [post, reduced, staticBag]);

  function showScene(bag: boolean) {
    if (reduced) setStaticBag(bag);
    else {
      const node = journey.current!;
      window.scrollTo({ top: node.offsetTop - 64 + (bag ? node.offsetHeight - innerHeight + 64 : 0), behavior: 'instant' });
    }
  }

  return <div className="showcase" data-reduced={reduced}>
    <noscript><style>{`.showcase-journey{height:auto}.showcase-sticky{position:relative}.showcase .exhibit-status,.showcase iframe,.showcase button,.journey-instruction{display:none}`}</style></noscript>
    <a className="showcase-skip" href="#handbook-showcase">跳到摄影手册</a>
    <header className="showcase-header">
      <a className="showcase-wordmark" href="#daily-showcase">逐光日刊 <span>HIKARI DAILY</span></a>
      <nav aria-label="展示章节">
        <a href="#daily-showcase" onClick={event => { event.preventDefault(); showScene(false); }}>日报</a>
        <a href="#daily-showcase" onClick={event => { event.preventDefault(); showScene(true); }}>背包</a>
        <a href="#handbook-showcase">手册</a>
        <a href="#planner-showcase">计划本</a>
      </nav>
      <a className="showcase-enter" href={repositoryUrl ?? '/'}>{repositoryUrl ? '获取源码 ↗' : '打开应用 ↗'}</a>
    </header>

    <main>
      <section ref={journey} id="daily-showcase" className="showcase-journey" aria-label="日报与摄影背包">
        <div className="showcase-sticky">
          <div className="exhibit-heading">
            <h1>{inBag ? '随身仪表' : '摄影天气日报'}</h1>
            <p>{inBag ? '拨针选时 · 点击物件' : '上海 · 2026.11.16 · 人工天气样例'}</p>
          </div>
          <ExhibitFrame kind="journey" register={register} />
          <div className="journey-controls">
            <div className="scene-buttons" aria-label="切换物件场景">
              <button aria-pressed={!inBag} onClick={() => showScene(false)}>日报</button>
              <span aria-hidden="true">—</span>
              <button aria-pressed={inBag} onClick={() => showScene(true)}>背包</button>
            </div>
            <span className="journey-instruction">{inBag ? '风 · 太阳位置 · 光线 · 天色与空气' : '向下滚动，收起报纸 ↓'}</span>
            <button className="motion-preference" aria-pressed={reduced} onClick={() => { setStaticBag(inBag); setReduced(value => !value); }}>{reduced ? '开启动效' : '减少动态'}</button>
          </div>
        </div>
      </section>

      <section id="handbook-showcase" className="showcase-chapter">
        <div className="chapter-heading">
          <div><p className="chapter-context">风光 / 人像 / 街拍</p><h2>外拍手册</h2></div>
          <p>时段、用光、构图与胶片。<br />点击题材或在书页上滚动翻页。</p>
        </div>
        <ExhibitFrame kind="handbook" register={register} />
        <div className="chapter-footnote"><p>可连接自己的模型，结合天气与摄影知识生成建议。</p><button onClick={() => post('handbook', { type: 'open-handbook' })}>翻开手册 ↗</button></div>
      </section>

      <section id="planner-showcase" className="showcase-chapter showcase-planner">
        <div className="chapter-heading">
          <div><p className="chapter-context">想法 / 安排 / 准备 / 参考</p><h2>拍摄计划本</h2></div>
          <p>从目录打开「江边的午后」。<br />直接写在纸上，或给参考图做批注。</p>
        </div>
        <ExhibitFrame kind="planner" register={register} />
        <div className="chapter-footnote"><p>应用支持本机自动保存与账户同步。</p><span>此处为可编辑示例 · 刷新恢复</span></div>
      </section>
    </main>
    <footer className="showcase-footer"><div>逐光日刊 <span>HikariDaily</span></div><a href={repositoryUrl ? `${repositoryUrl}#本地运行` : '/'}>{repositoryUrl ? '本地运行逐光 ↗' : '选择地点，打开今天的日报 ↗'}</a><a href="#daily-showcase">回到报纸 ↑</a></footer>
  </div>;
}
