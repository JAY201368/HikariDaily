"use client";
import { useEffect, useRef } from "react";
import type { Briefing, Genre, RecommendedWindow } from "../../domain/types";
import { Notes, Windows, range } from "../briefing";
import { Epilogue, JourneyRun } from "../journey";
import styles from "./handbook.module.css";
const genres = ["landscape", "portrait", "street"] as const;
const labels = { landscape: "风光", portrait: "人像", street: "街拍" };
export function BookCover({ pocket = false }: { pocket?: boolean }) {
  return <div className={styles.cover} data-decoration={pocket ? "pocket-cover" : "book-cover"} aria-hidden="true"><small>逐光 · 随身丛书 01</small><strong>外拍<br />手册</strong><span>读懂天气<br />把判断带到现场</span><svg viewBox="0 0 300 110"><path d="M15 88H285M48 88V57H83V88M102 88V25H131V88M155 88V45H185V88M208 88V12H233V88M15 98H285"/><circle cx="75" cy="23" r="14"/></svg><small>风光 / 人像 / 街拍</small></div>;
}
function HandbookDiagram({ genre }: { genre: Genre }) {
  return <figure className={styles.diagram}><svg viewBox="0 0 370 205" aria-hidden="true">{genre === "landscape" && <><path d="M15 143H355M20 151H350M40 143V116H72V143M260 143V102H284V143"/><path d="M40 143Q185-45 330 143" strokeDasharray="4 5" opacity=".4"/><path d="M192 65H273M214 50H300M78 82H146" stroke="#943b2d" strokeWidth="6" strokeLinecap="round"/><circle cx="301" cy="115" r="15" fill="#d7b33e"/><path d="M285 126L193 145M283 116L100 132" stroke="#943b2d" strokeDasharray="4 4"/><text x="19" y="175">东</text><text x="319" y="175">西 · 日落</text><text x="126" y="25">本地云层 ≠ 远方光路</text></>}{genre === "portrait" && <><circle cx="183" cy="78" r="28"/><path d="M183 106V148M183 121L145 144M183 121L217 144M169 148L157 171M193 148L204 171"/><circle cx="303" cy="43" r="20" fill="#d7b33e"/><path d="M279 61L211 88M271 44L211 65M284 76L219 112" stroke="#943b2d" strokeDasharray="5 4"/><path d="M57 41L91 148H126L91 41Z" fill="#27251f" opacity=".12"/><text x="24" y="24">开放阴影 · 柔光备选</text><text x="226" y="174">太阳可见时再用侧逆光</text></>}{genre === "street" && <><path d="M28 20V150H345M64 20V118H131V20M181 20V90H235V20M290 20V125H333V20"/><path d="M131 118L216 164H162L64 118M235 90L340 144H301L181 90" fill="#27251f" opacity=".15"/><circle cx="172" cy="104" r="9"/><path d="M172 113V139M172 120L159 130M172 120L187 129M172 138L163 153M172 138L183 153"/><path d="M41 171L308 171" stroke="#943b2d" strokeDasharray="4 5"/><text x="31" y="193">云隙直射出现时，等主体走入亮处</text></>}</svg><figcaption>{{ landscape: "方向关系示意，非现场机位或完整太阳光路验证。", portrait: "受光关系示意；光的软硬仍取决于现场云层。", street: "条件性构图示意，不预设每个街口都有长影。" }[genre]}</figcaption></figure>;
}
function WindowPreview({ windows }: { windows: RecommendedWindow[] }) {
  return windows.length ? <ol className={styles.windows}>{windows.map(w => <li key={`${w.start}-${w.end}`}><time>{range(w)}</time><div><strong>{{ past: "已过", current: "进行中", future: "将来" }[w.status]}</strong><p>{w.reasons[0]}</p></div></li>)}</ol> : <p>没有符合条件的窗口；请阅读限制与替代方向。</p>;
}
export function Handbook({ briefing: b, genre, onSelectGenre }: {
    briefing: Briefing;
    genre: Genre;
    onSelectGenre: (genre: Genre) => void;
}) {
    const reader = useRef<HTMLDivElement>(null);
    const swipeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (swipeTimer.current) clearTimeout(swipeTimer.current); }, []);
    useEffect(() => { const el = reader.current; if (el && window.matchMedia("(max-width:48rem)").matches)
        el.scrollTo({ left: genres.indexOf(genre) * el.clientWidth, behavior: "instant" }); }, [genre]);
    return <section className={styles.handbook} id="handbook" aria-labelledby="advice-heading"><header className={styles.heading}><div><p>03 / 逐光 · 随身丛书</p><h2 id="advice-heading">三题材摄影建议</h2><p>当前题材：{labels[genre]}。建议属于当天，不随所选小时改写。</p></div><BookCover/></header>
 <nav aria-label="摄影题材" className={styles.nav}><button type="button" aria-label="上一题材" disabled={genre === "landscape"} onClick={() => onSelectGenre(genres[Math.max(0, genres.indexOf(genre) - 1)])}>←</button>{genres.map(g => <button type="button" key={g} aria-pressed={genre === g} onClick={() => onSelectGenre(g)}>{labels[g]}</button>)}<button type="button" aria-label="下一题材" disabled={genre === "street"} onClick={() => onSelectGenre(genres[Math.min(2, genres.indexOf(genre) + 1)])}>→</button></nav><p className={styles.swipe}>手机可横向滑动切换题材，也可用上方按钮；每页可自然向下阅读。</p>

 <div className={styles.readerHome} data-reader-home><div className={styles.reader} data-book-reader ref={reader} onScroll={e => {
    const el = e.currentTarget;
    if (!window.matchMedia("(max-width:48rem)").matches) return;
    if (swipeTimer.current) clearTimeout(swipeTimer.current);
    swipeTimer.current = setTimeout(() => {
      const scene = el.closest<HTMLElement>("article")?.dataset.scene;
      if (scene === "measuring" || el.inert || el.closest("[inert]")) return;
      const index = Math.round(el.scrollLeft / el.clientWidth);
      if (index >= 0 && index < 3 && genres[index] !== genre) onSelectGenre(genres[index]);
    }, 100);
 }}>
 {genres.map((g, index) => { const a = b.advice[g], active = g === genre; return <section key={g} className={styles.spread} data-active={active} data-genre={g} inert={!active} aria-hidden={!active} aria-labelledby={active ? `advice-${g}` : undefined}><div className={styles.page}><div className={styles.running}><span>逐光 / 外拍手册</span><span>{b.localDate}</span></div><div className={styles.genre}><b>0{index + 1}</b><h3 id={active ? `advice-${g}` : undefined}>{labels[g]}<small>{g.toUpperCase()}</small></h3></div><h4 className={styles.chapterTitle}>{{ landscape: <>看远景层次，<br/>也看云的变化。</>, portrait: <>让人物，<br/>走进合适的光。</>, street: <>在街头，<br/>等光影与人相遇。</> }[g]}</h4><div className={styles.timing}>{a.recommendedWindows[0] ? range(a.recommendedWindows[0]) : "暂无优先窗口"}<small>尚未结束的主推荐 · 北京时间</small></div><p className={styles.light}>{a.light}</p><WindowPreview windows={a.recommendedWindows}/><details><summary>主推荐的全部依据与限制</summary><Windows windows={a.recommendedWindows}/></details><details><summary>全天窗口（含已过时段）</summary><p>{a.timing}</p><Windows windows={a.allWindows}/></details><footer>当天建议 · 现场判断<span>{String(index * 2 + 1).padStart(2, "0")}</span></footer></div><div className={styles.page}><div className={styles.running}><span>看光的方法</span><span>FIELD NOTES</span></div><HandbookDiagram genre={g}/><div className={styles.film}><span aria-hidden="true">{g === "street" ? "B&W" : "COLOR"}</span><div><h4>胶片的性格 / 不是曝光答案</h4><strong>{a.film.sensitivity}{a.film.type}</strong><p>{a.film.reason}</p></div></div><div className={styles.limit}><strong>现场复核 / </strong>{a.limitations.filter(item => !item.includes("演示数据")).join("；")}</div><details><summary>画面机会、替代方向与胶片说明</summary><h4>画面机会</h4><Notes items={a.opportunities}/><h4>限制与替代方向</h4><Notes items={a.limitations}/><Notes items={a.alternatives}/><p>{a.film.caveat}</p></details><footer>通用胶片类别 · 无商品推荐<span>{String(index * 2 + 2).padStart(2, "0")}</span></footer></div></section>; })}
 </div></div>

 <JourneyRun kind="slip"/><div className={styles.ending}><Epilogue/><div className={styles.slipHome} data-slip-home><aside data-loose-slip className={styles.slip} aria-labelledby="future-slip-heading"><p>逐 光 日 刊 · 预 留 纸 单</p><h3 id="future-slip-heading">把下一份天气留给明天。</h3><dl><div><dt>未来渠道</dt><dd>微信订阅号 · 摘要与对应地点网页入口</dd></div><div><dt>关注地点</dt><dd>{b.location.name}</dd></div><div><dt>未来时段</dt><dd>每日 07:00 或 12:00 · 北京时间</dd></div></dl><strong>第二阶段预留</strong><p>这里仅说明未来能力，不收集微信身份，不保存订阅设置，不创建订阅或发送消息。</p></aside></div></div>
 </section>;
}
