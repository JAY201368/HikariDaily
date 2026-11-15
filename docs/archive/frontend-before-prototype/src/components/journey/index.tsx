"use client";
import { useEffect, useRef } from "react";
import { useScroll, useMotionValueEvent } from "motion/react";
import type { Genre } from "../../domain/types";
import { bookPose, decorativeCopy, foldPose, mix, phase, slipPose } from "./geometry";
import styles from "./journey.module.css";
const genres: Genre[] = ["landscape", "portrait", "street"];
type Rect = { x: number; y: number; width: number; height: number };
const rect = (el: HTMLElement): Rect => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top + window.scrollY, width: r.width, height: r.height }; };
const pose = (el: HTMLElement, r: Rect, x: number, y: number, s = 1) => { el.style.position = "fixed"; el.style.left = "0"; el.style.top = "0"; el.style.width = `${r.width}px`; el.style.margin = "0"; el.style.transformOrigin = "0 0"; el.style.transform = `translate(${x}px,${y}px) scale(${s})`; };
export function useJourney(simple: boolean, genre: Genre, onGenre: (g: Genre) => void) {
  const root = useRef<HTMLElement>(null);
  const currentGenre = useRef(genre);
  useEffect(() => { currentGenre.current = genre; }, [genre]);
  const draw = useRef<() => void>(() => {}), selection = useRef(onGenre);
  useEffect(() => { selection.current = onGenre; }, [onGenre]);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", () => draw.current());
  useEffect(() => {
    if (!root.current || simple) return;
    const host: HTMLElement = root.current;
    const previousRestoration = history.scrollRestoration; history.scrollRestoration = "manual";
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) { history.scrollRestoration=previousRestoration; return; }
    const get = (s: string) => host.querySelector<HTMLElement>(s)!;
    const paper = get("#newspaper"), pack = get("[data-bag]"), bag = get("#instruments"), dial = get("[data-dial-home]").firstElementChild as HTMLElement;
    const packHome = pack.parentElement!;
    const foldRun = get('[data-scene-run="fold"]'), bookRun = get('[data-scene-run="book"]');
    const handbook = get("#handbook"), coverSource = get('#handbook [data-decoration="book-cover"]');
    const pocket = get("[data-pocket-book]"), pocketPaper = get("[data-pocket-paper]");
    const slip = get("[data-loose-slip]"), slipRun = get('[data-scene-run="slip"]'), epilogue = get("[data-epilogue]");
    const bookNav = get("#handbook nav");
    const reader = get("[data-book-reader]"), spreads = [...reader.querySelectorAll<HTMLElement>("[data-genre]")];
    const dialHome = dial.parentElement!; const dialMarker = document.createComment("dial home"); dialHome.insertBefore(dialMarker, dial);
    const slipHome = slip.parentElement!, epilogueHome = epilogue.parentElement!, readerHome = reader.parentElement!;
    const owned = [bookNav, slipHome, epilogueHome, readerHome, paper, packHome, pack, dial, bag, handbook, pocket, pocketPaper, coverSource, slip, epilogue, reader, ...spreads];
    const original = new Map(owned.map(el => [el, {
      style: el.getAttribute("style"), inert: el.getAttribute("inert"), ariaHidden: el.getAttribute("aria-hidden"),
    }]));
    const restore = (el: HTMLElement) => {
      const saved = original.get(el)!;
      if (saved.style === null) el.removeAttribute("style"); else el.setAttribute("style", saved.style);
      if (spreads.includes(el)) {
        // React may keep the same genre props across a mode switch. Restore the
        // latest semantic selection, never the active page captured at mount.
        el.inert = el.dataset.active !== "true";
        el.setAttribute("aria-hidden", String(el.inert));
      } else {
        if (saved.inert === null) el.removeAttribute("inert"); else el.setAttribute("inert", saved.inert);
        if (saved.ariaHidden === null) el.removeAttribute("aria-hidden"); else el.setAttribute("aria-hidden", saved.ariaHidden);
      }
    };
    const fold = document.createElement("div"); fold.className = styles.fold; fold.inert = true; fold.setAttribute("aria-hidden", "true"); fold.dataset.fold = "true";
    const rows: HTMLElement[] = [], rights: HTMLElement[] = [];
    const cover = document.createElement("div"); cover.className = styles.cover; cover.inert = true; cover.setAttribute("aria-hidden", "true"); cover.dataset.movingBook = "true";
    const coverFace = document.createElement("div"); coverFace.className = styles.coverFace; coverFace.append(decorativeCopy(coverSource)); cover.append(coverFace);
    const leaf = document.createElement("div"); leaf.className = styles.leaf; leaf.inert = true; leaf.setAttribute("aria-hidden", "true"); leaf.dataset.turnLeaf = "true";
    const leafFront = document.createElement("div"), leafBack = document.createElement("div"); leafFront.className = styles.leafFace; leafBack.className = `${styles.leafFace} ${styles.leafBack}`; leaf.append(leafFront, leafBack);
    const caption = document.createElement("p"); caption.className = styles.caption; caption.setAttribute("aria-hidden", "true");
    const discovery = document.createElement("div"); discovery.className = styles.discovery; discovery.inert = true; discovery.setAttribute("aria-hidden", "true"); discovery.dataset.discoveryPage = "true";
    pack.append(fold); host.append(cover, leaf, discovery, caption);
    let slipHomeHeight=0, epilogueHomeHeight=0, readerHomeHeight=0;
    let pw = 0, ph = 0, pr: Rect, br: Rect, dr: Rect, cr: Rect, sr: Rect, rr: Rect, er: Rect;
    let fs = 0, fe = 0, bs = 0, be = 0, ss = 0, se = 0, readerStart = 0, readDistance = 0, pageHeight = 0;
    let measuring = false, lastLeaf = "", readingTop = 100;
    const mobile = () => matchMedia("(max-width:48rem)").matches;
    function buildFolds() {
      fold.replaceChildren(); rows.length = rights.length = 0;
      for (let row = 0; row < 2; row++) {
        const r = document.createElement("div"); r.className = `${styles.row} ${row ? styles.lower : ""}`; rows.push(r);
        for (let col = 0; col < 2; col++) {
          const panel = document.createElement("div"); panel.className = `${styles.panel} ${col ? styles.right : ""}`; if (col) rights.push(panel);
          const face = document.createElement("div"), back = document.createElement("div"); face.className = styles.face; back.className = `${styles.face} ${styles.back}`;
          const copy = decorativeCopy(paper); copy.style.width = `${pw}px`; copy.style.height = `${ph}px`; copy.style.left = `${-col * pw / 2}px`; copy.style.top = `${-row * ph / 2}px`; face.append(copy); panel.append(face, back); r.append(panel);
        }
        if (row) { const back = document.createElement("div"); back.className = styles.bottomBack; r.append(back); }
        fold.append(r);
      }
    }
    function measure(renderAfter = true) {
      if (measuring) return; measuring = true;
      for (const el of owned) restore(el);
      host.dataset.scene = "measuring";
      const vh = innerHeight;
      foldRun.style.height = `${vh * 3.6}px`; bookRun.style.height = `${vh * 2.6}px`; slipRun.style.height = `${vh * 2.5}px`;
      pr = rect(paper); pw = pr.width; ph = pr.height;
      br = rect(pack); dr = rect(dial); cr = rect(coverSource);
      // The scene ends where the real bag naturally sits: no replacement bag or crossfade.
      fe = rect(foldRun).y + foldRun.offsetHeight; fs = pr.y + ph - vh + 45;
      bs = rect(bookRun).y - vh + Math.min(130, vh * .12); be = rect(bookRun).y + bookRun.offsetHeight;
      if (!mobile()) {
        spreads.forEach(el => { el.style.display = "grid"; el.style.position = "relative"; });
        pageHeight = Math.max(...spreads.map(el => el.offsetHeight));
        readDistance = Math.max(vh * 1.2, pageHeight - vh + vh * .8);
        reader.style.height = `${3 * readDistance + 2 * vh * .6}px`;
      }
      rr = rect(reader); readingTop = mobile() ? 195 : Math.max(100, (vh - pageHeight) / 2 + 18); readerStart = rr.y - readingTop; be = readerStart;
      sr = rect(slip); er = rect(epilogue); slipHomeHeight=slipHome.offsetHeight;epilogueHomeHeight=epilogueHome.offsetHeight;readerHomeHeight=readerHome.offsetHeight;
      se = rect(slipRun).y + slipRun.offsetHeight; ss = rect(slipRun).y - vh + 50;
      fold.style.width = `${pw}px`; fold.style.height = `${ph}px`;
      buildFolds(); lastLeaf=""; measuring = false; if (renderAfter) render();
    }
    function render() {
      if (measuring || !pr) return;
      const y = window.scrollY, vh = innerHeight;
      leaf.style.display = "none"; discovery.style.display = "none";
      const f = phase(y, fs, fe), b = phase(y, bs, be), s = phase(y, ss, se);
      host.dataset.scene = y < fs ? "newspaper" : y < fe ? "fold" : y < bs ? "instruments" : y < be ? "extract" : y < ss ? "handbook" : y < se ? "slip" : "epilogue";
      host.dataset.foldStart = String(fs); host.dataset.foldEnd = String(fe); host.dataset.bookStart = String(bs); host.dataset.bookEnd = String(be); host.dataset.slipStart = String(ss); host.dataset.slipEnd = String(se); host.dataset.readerStart = String(readerStart); host.dataset.readDistance = String(readDistance); host.dataset.pageHeight = String(pageHeight);
      const fp = foldPose(f); fold.dataset.first = fp.first.toFixed(4); fold.dataset.second = fp.second.toFixed(4); fold.dataset.align = fp.align.toFixed(4); fold.dataset.descend = fp.descend.toFixed(4);
      const activeFold = f > 0 && f < 1;
      paper.style.visibility = y >= fs ? "hidden" : "visible"; paper.inert = y >= fs; paper.setAttribute("aria-hidden", String(y >= fs));
      fold.style.display = activeFold ? "block" : "none"; pocketPaper.style.visibility = f >= .85 ? "visible" : "hidden";
      if (activeFold) {
        packHome.style.height = `${br.height}px`;
        const bagTop = br.y - fe, enter = phase(f, .3, .67), packY = mix(vh + 100, bagTop, enter);
        pose(pack, br, br.x, packY); pack.style.zIndex = "40"; pack.inert = true;
        // Shared 1359×1157 asset canvas: main front lip is near 60% of its height.
        const rotated = mobile() && ph > pw;
        const angle = (rotated ? 90 : 0) * fp.align, radians = angle * Math.PI / 180;
        const fw = pw / 2, fh = ph / 2;
        const targetScale = Math.min(br.width * .24 / (rotated ? fh : fw), br.height * .24 / (rotated ? fw : fh));
        const frameScale = mix(1, Math.min(1, (vh - 180) / ph), phase(f, 0, .08));
        const scale = mix(frameScale, targetScale, fp.align);
        const targetX = br.width * .325, lip = br.height * .60;
        const finalWidth = (rotated ? fh : fw) * targetScale, finalHeight = (rotated ? fw : fh) * targetScale;
        const overlap = Math.min(br.height * .04, finalHeight * .25);
        const foldedHeight = (fw * Math.sin(radians) + fh * Math.cos(radians)) * scale;
        const x = mix(pr.x - br.x, targetX, fp.align) + fh * Math.sin(radians) * scale;
        const startY = mix(vh - ph - 45, 90, phase(f, 0, .08));
        const py = mix(startY - packY, lip - foldedHeight - 16, fp.align) + (finalHeight + 16 - overlap) * fp.descend;
        pocketPaper.style.width = `${finalWidth}px`; pocketPaper.style.height = `${finalHeight}px`;
        pocketPaper.style.top = `${lip - overlap}px`;
        fold.style.transform = `translate(${x}px,${py}px) scale(${scale}) rotate(${angle}deg)`;
        fold.dataset.rotation = String(angle); fold.dataset.storedWidth = String(finalWidth); fold.dataset.storedHeight = String(finalHeight);
        fold.style.zIndex = fp.align === 1 ? "30" : "50";
        rights.forEach(el => el.style.transform = `rotateY(${-180 * fp.first}deg)`);
        rows[1].style.transform = `rotateX(${180 * fp.second}deg)`; rows[1].style.zIndex = fp.second > 0 ? "5" : "1";
        // Same interactive dial. Lift finishes before any horizontal travel or growth.
        const startX = br.x + br.width * .43, startYDial = packY + br.height * .48;
        const tiny = Math.min(.44, br.width * .18 / dr.width), clearY = packY + br.height * .25 - dr.height * tiny;
        dialHome.style.height = `${dr.height}px`; if (dial.parentElement !== pack) pack.append(dial);
        pose(dial, dr, mix(startX, dr.x, fp.travel) - br.x, mix(mix(startYDial, clearY, fp.lift), dr.y - fe, fp.travel) - packY, mix(tiny, 1, fp.travel)); dial.style.position = "absolute";
        dial.style.zIndex = fp.lift === 1 ? "65" : "32"; dial.inert = true;
        dial.dataset.lift = fp.lift.toFixed(4); dial.dataset.travel = fp.travel.toFixed(4);
      } else { restore(packHome); restore(pack); if (dial.parentElement !== dialHome) dialMarker.after(dial); dialHome.style.height = ""; restore(dial); }
      const bp = bookPose(phase(b, .15, 1)); cover.dataset.lift = bp.lift.toFixed(4); cover.dataset.travel = bp.travel.toFixed(4); cover.dataset.open = bp.open.toFixed(4);
      const extracting = b > 0 && b < 1;
      cover.style.display = extracting ? "block" : "none"; pocket.style.visibility = y >= bs ? "hidden" : "visible";
      if (extracting) {
        spreads.forEach(el=>{el.style.position="";el.style.transform="";el.style.width="";el.style.margin="";el.style.clipPath="none";el.style.display="";});
        if (mobile()) { restore(reader);restore(readerHome); }
        packHome.style.height = `${br.height}px`;
        // Keep the actual bag visible while the same yellow cover clears its rear inner pocket.
        const packTop = mix(br.y - bs, Math.max(40, vh * .12), phase(b, 0, .15)), endExit = phase(b, .75, 1);
        pose(pack, br, br.x, packTop + endExit * vh); pack.style.zIndex = "40"; pack.inert = true;
        const tiny = br.width * .10925 / cr.width, startX = br.x + br.width * .61875, startY = packTop + br.height * .3015;
        const clearY = packTop + br.height * .17 - cr.height * tiny;
        const endY = readingTop, endX = rr.x + (mobile() ? 0 : rr.width / 2), endScale = rr.width / (mobile() ? 1 : 2) / cr.width;
        cover.style.height = `${cr.height}px`;
        if (bp.lift < 1) { if (cover.parentElement !== pack) pack.append(cover); pose(cover, cr, startX - br.x, mix(startY, clearY, bp.lift) - packTop, tiny); cover.style.position = "absolute"; cover.style.zIndex = "24"; } else { if (cover.parentElement !== host) host.append(cover); pose(cover, cr, mix(startX, endX, bp.travel), mix(clearY, endY, bp.travel), mix(tiny, endScale, bp.travel)); cover.style.zIndex = "60"; }
        cover.style.transform += ` rotate(${3 * (1 - bp.travel)}deg)`;
        coverFace.style.transform = `rotateY(${-180 * bp.open}deg)`;
        coverSource.style.visibility = "hidden";
        if (bp.open > 0) {
          const active = spreads.find(el=>el.dataset.active === "true") || spreads[0];
          if (mobile()) { readerHome.style.height=`${readerHomeHeight}px`; pose(reader,rr,rr.x,endY);reader.style.height=`${rr.height}px`;reader.style.zIndex="49";reader.inert=true; }
          else { pose(active,{...rr,height:pageHeight},rr.x,endY); active.style.zIndex="49";active.style.clipPath=`inset(0 0 0 ${50 * (1-bp.open)}%)`;active.inert=true; }
        }
      } else { if (mobile()) { reader.style.height=""; spreads.forEach(el=>{el.style.position="";el.style.transform="";el.style.width="";el.style.margin="";el.style.zIndex="";el.inert=el.dataset.active!=="true";el.setAttribute("aria-hidden",String(el.inert));}); } restore(coverSource); coverSource.style.visibility = y >= bs ? "hidden" : "visible"; }
      handbook.inert = false; reader.inert = extracting;
      bookNav.inert = extracting && b < .95; bookNav.style.visibility = bookNav.inert ? "hidden" : "visible";
      if (!mobile()) {
        const local = y - readerStart, turnD = vh * .6, stride = readDistance + turnD;
        const index = Math.max(0, Math.min(2, Math.floor(local / stride)));
        const read = phase(local - index * stride, 0, readDistance);
        const turning = phase(local - index * stride, readDistance, stride);
        const reading = y >= readerStart && y < readerStart + 3 * readDistance + 2 * turnD;
        if (reading) {
          pose(bookNav, { ...rr, height: 44 }, rr.x, Math.min(vh - 60, readingTop + pageHeight + 35)); bookNav.style.zIndex="70";
          spreads.forEach((el, i) => { el.style.display = i === index ? "grid" : "none"; el.inert = i !== index || turning > 0; el.setAttribute("aria-hidden", String(i !== index)); if (i === index) { pose(el, { ...rr, height: pageHeight }, rr.x, readingTop - read * Math.max(0, pageHeight - vh + 160)); el.style.zIndex = "45"; } else { el.style.position = "relative"; el.style.transform = "none"; } });
          const g = genres[index]; if (currentGenre.current !== g) { currentGenre.current = g; selection.current(g); }
          spreads.forEach(el=>el.style.clipPath="none");
          if (turning > 0 && index < 2) {
            const next = spreads[index+1]; next.style.display="grid"; pose(next,{...rr,height:pageHeight},rr.x,readingTop - Math.max(0, pageHeight - vh + 160));next.style.zIndex="44";next.inert=true;next.setAttribute("aria-hidden","true");
            spreads[index].style.clipPath = "inset(0 50% 0 0)";
            next.style.clipPath = "inset(0 0 0 50%)";
          }
          reader.dataset.page = String(index); reader.dataset.turn = turning.toFixed(4);
          showLeaf(turning, spreads[index], `genre-${index}`, spreads[index+1]);
        } else if (!extracting) {
          restore(bookNav);
          spreads.forEach(el => { el.style.clipPath="none"; el.style.position = "relative"; el.style.transform = "none"; el.style.width = ""; el.style.margin = ""; el.style.display = ""; el.inert = el.dataset.active !== "true"; el.setAttribute("aria-hidden", String(el.inert)); });
          leaf.style.display = "none";
        }
      }
      const sp = slipPose(s); slip.dataset.lift = sp.lift.toFixed(4); slip.dataset.travel = sp.travel.toFixed(4); slip.dataset.settle = sp.settle.toFixed(4);
      const extractingSlip = s > 0 && s < 1;
      if (extractingSlip) {
        slipHome.style.height=`${slipHomeHeight}px`;epilogueHome.style.height=`${epilogueHomeHeight}px`;
        // The real open book stays behind the loose sheet, and leaves by translation.
        if (mobile()) { readerHome.style.height=`${readerHomeHeight}px`; pose(reader, rr, rr.x, readingTop - Math.max(0, rr.height - vh + 180) - sp.travel * vh * 1.1); reader.style.zIndex = "44"; reader.style.clipPath="none"; reader.inert = true; }
        else { const last = spreads[2]; spreads.forEach((el,i)=>{el.style.display = i===2 ? "grid" : "none";el.inert=true;}); pose(last,{...rr,height:pageHeight},rr.x,readingTop-Math.max(0,pageHeight-vh+160)+sp.travel*vh);last.style.zIndex="44"; }
        const currentPage = (mobile() ? spreads.find(el=>el.dataset.active === "true") || spreads[0] : spreads[2]).lastElementChild as HTMLElement;
        const surface = currentPage.getBoundingClientRect(), leave = sp.travel * vh * (mobile() ? -1.1 : 1);
        const visibleTop = Math.max(mobile() ? 132 : 100, surface.top - leave), visibleBottom = Math.min(vh - 70, surface.bottom - leave);
        const scale = Math.min(.76, (surface.width - 40) / sr.width, Math.max(120, visibleBottom - visibleTop - 40) / sr.height);
        const startX = surface.left + (surface.width - sr.width * scale) / 2, startY = visibleTop + (visibleBottom - visibleTop - sr.height * scale) / 2;
        pose(discovery, {x:surface.left,y:surface.top,width:surface.width,height:surface.height}, surface.left, surface.top); discovery.style.height=`${surface.height}px`; discovery.style.display="block";
        pose(slip, sr, mix(startX + sp.lift * 12, sr.x, sp.travel), mix(startY - 65 * sp.lift, sr.y - se, sp.travel), mix(scale * (1 + .06 * sp.lift), 1, sp.travel)); slip.style.zIndex = "50"; slip.inert = true;
        slip.style.transform += ` rotate(${-2.5 * sp.lift * (1-sp.travel)}deg)`;
        slip.style.boxShadow = `3px ${5 + sp.lift * 15}px ${20 + sp.lift * 30}px #40321b44`;
        showLeaf(sp.turn, mobile() ? (spreads.find(el=>el.dataset.active === "true") || spreads[0]) : spreads[2], "extra");
        if (sp.turn === 1) leaf.style.display = "none";
        pose(epilogue, er, er.x, er.y - se); epilogue.style.zIndex = "51";
        [...epilogue.children].forEach((el, i) => { const e = el as HTMLElement, p = phase(s, .62 + i * .07, .78 + i * .06); e.style.opacity = String(p); e.style.transform = `translateY(${(1 - p) * 18}px)`; });
      } else {
        restore(slipHome);restore(epilogueHome);if (!extracting) restore(readerHome);restore(slip); if (mobile() && !extracting) { reader.style.clipPath=""; reader.style.position = ""; reader.style.transform = ""; reader.style.width = ""; reader.style.margin = ""; reader.style.zIndex = ""; reader.inert = false; } restore(epilogue); [...epilogue.children].forEach(el => (el as HTMLElement).removeAttribute("style"));
      }
      if (y >= ss) { bookNav.inert = true; bookNav.style.visibility = "hidden"; }
      caption.style.display = activeFold || extracting || extractingSlip ? "block" : "none";
      caption.textContent = activeFold ? f < .44 ? "向下折好日报 · 向上可展开" : f < .82 ? "对准主仓 · 沿袋口收纳" : "先提清表盘 · 再移到手边" : extracting ? "先提清手册 · 移位 · 展开" : "翻过一页 · 取出完整纸单";
    }
    function showLeaf(t: number, source: HTMLElement, key: string, next?: HTMLElement) {
      if (t <= 0 || t >= 1) { leaf.style.display = "none"; return; }
      if (key !== lastLeaf) {
        const copy = decorativeCopy(source.lastElementChild as HTMLElement); copy.style.height="100%"; leafFront.replaceChildren(copy);
        leafBack.replaceChildren();
        if (next) { const back = decorativeCopy(next.firstElementChild as HTMLElement); back.style.height="100%"; leafBack.append(back); }
        leaf.dataset.back = next ? "next-page" : "blank-paper"; lastLeaf = key;
      }
      const page = (source.lastElementChild as HTMLElement).getBoundingClientRect();
      leaf.style.display="block"; leaf.style.left=`${page.left}px`; leaf.style.top=`${page.top}px`; leaf.style.width=`${page.width}px`; leaf.style.height=`${page.height}px`; leaf.style.transform=`perspective(1800px) rotateY(${-180*t}deg)`;
    }
    const onFocus = (event: FocusEvent) => { const target = event.target as HTMLElement; if (bookNav.contains(target) && window.scrollY < be + 24) { window.scrollTo(0,be+24); render(); } if (bag.contains(target) && window.scrollY < fe) { window.scrollTo(0,fe+2); render(); } };
    const onClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
      if (!target || !host.contains(target)) return;
      const id = target.hash;
      if (!["#newspaper", "#instruments", "#handbook", "#future-slip-heading"].includes(id)) return;
      // Hour details can resize the bag just before a chapter click. Resolve
      // those measured anchors before jumping, including when RAF is paused.
      measure(false);
      const map: Record<string, number> = { "#newspaper": Math.max(0, pr.y - (mobile() ? 133 : 138)), "#instruments": fe + 2, "#handbook": be + 2, "#future-slip-heading": se + 2 };
      if (id in map) { event.preventDefault(); window.scrollTo({ top: map[id], behavior: "instant" }); render(); }
    };
    const jumpGenre = (event: Event) => { measure(false); if (mobile()) { if (window.scrollY < be + 24) window.scrollTo({top:be + 24,behavior:"instant"}); render(); return; } if (!mobile()) { const g = (event as CustomEvent<Genre>).detail, index = genres.indexOf(g); currentGenre.current = g; window.scrollTo({ top: readerStart + index * (readDistance + innerHeight * .6) + 2, behavior: "instant" }); render(); } };
    const popGenre = () => { if (mobile()) return; const g = new URL(location.href).searchParams.get("genre") as Genre; if (genres.includes(g)) jumpGenre(new CustomEvent("journey-genre", {detail:g})); };
    window.addEventListener("popstate", popGenre);
    let raf = 0;
    const scheduleMeasure = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => measure()); };
    const observer = new ResizeObserver(scheduleMeasure); observer.observe(paper); observer.observe(bag);
    host.addEventListener("focusin", onFocus); host.addEventListener("click", onClick); host.addEventListener("journey-genre", jumpGenre); host.addEventListener("toggle", scheduleMeasure, true); window.addEventListener("resize", scheduleMeasure);
    draw.current = render; measure();
    return () => { draw.current = () => {}; history.scrollRestoration=previousRestoration; cancelAnimationFrame(raf); observer.disconnect(); host.removeEventListener("focusin", onFocus); host.removeEventListener("click", onClick); host.removeEventListener("journey-genre", jumpGenre); host.removeEventListener("toggle", scheduleMeasure, true); window.removeEventListener("resize", scheduleMeasure); window.removeEventListener("popstate", popGenre); if (dial.parentElement !== dialHome) dialMarker.after(dial); dialMarker.remove(); dialHome.style.height = ""; owned.forEach(restore); fold.remove(); cover.remove(); leaf.remove(); discovery.remove(); caption.remove(); [foldRun, bookRun, slipRun].forEach(el => el.removeAttribute("style")); delete host.dataset.scene; };
  }, [simple]);
  return root;
}
export function JourneyRun({ kind }: { kind: "fold" | "book" | "slip" }) { return <div className={styles.run} data-scene-run={kind} aria-hidden="true" inert />; }
export function Epilogue() { return <div className={styles.epilogueHome}><div className={styles.epilogue} data-epilogue><p>04 / 把下一份天气留给明天</p><h3>一份简报，<br />一个出发的理由。</h3><p>把今天的判断带到现场，也为变化留一点余地。</p><p>未来可通过微信订阅号接收地点摘要与网页入口；纸单仅说明第二阶段能力。</p></div></div>; }
