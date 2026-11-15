"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Briefing, Genre } from "../../domain/types";
import { Newspaper } from "../newspaper";
import { Bag } from "../bag";
import { Handbook } from "../handbook";
import { SourceNotes } from "../source-notes";
import { JourneyRun, useJourney } from "../journey";
import styles from "./objects.module.css";
export function ObjectBriefing({ briefing, genre, selectedHour, onSelectHour, onSelectGenre }: {
    briefing: Briefing;
    genre: Genre;
    selectedHour: number | null;
    onSelectHour: (hour: number) => void;
    onSelectGenre: (genre: Genre) => void;
}) {
    const [simple, setSimple] = useState(false);
    const reduced = useSyncExternalStore(callback => { const m = matchMedia("(prefers-reduced-motion: reduce)"); m.addEventListener("change", callback); return () => m.removeEventListener("change", callback); }, () => matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);
    const root = useJourney(simple || reduced, genre, onSelectGenre);
    useEffect(() => {
      const el = root.current, index = ["landscape", "portrait", "street"].indexOf(genre);
      if (el?.dataset.scene === "handbook" && el.querySelector<HTMLElement>("[data-book-reader]")?.dataset.page !== String(index)) el.dispatchEvent(new CustomEvent("journey-genre", {detail:genre}));
    }, [genre, root]);
    function selectGenre(next: Genre) { onSelectGenre(next); root.current?.dispatchEvent(new CustomEvent("journey-genre", { detail: next })); }
    return <article ref={root} className={styles.objects} data-reading={simple ? "simple" : reduced ? "reduced" : "objects"}><nav className={styles.index} aria-label="简报章节"><a href="#newspaper">01 日报</a><a href="#instruments">02 皮包</a><a href="#handbook">03 手册</a><a href="#future-slip-heading">04 纸单</a><button type="button" aria-pressed={simple} onClick={() => setSimple(!simple)}>简化阅读</button></nav>{briefing.warnings.some(w => w.includes("演示数据")) && <p className={styles.notice} role="note">演示数据：人工合成，非真实预报或观测，不用于判断当前天气。</p>}<Newspaper briefing={briefing}/><JourneyRun kind="fold"/><Bag briefing={briefing} selectedHour={selectedHour} onSelectHour={onSelectHour}/><JourneyRun kind="book"/><Handbook briefing={briefing} genre={genre} onSelectGenre={selectGenre}/><div className={styles.sources}><SourceNotes briefing={briefing}/><p>物件与参考衍生素材仅供本地评审；公开使用许可尚未核实，发布前必须逐项确认或替换。<a href="/PROVENANCE.md">素材出处与发布门禁</a>。</p></div></article>;
}
