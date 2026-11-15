"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { BriefingResult } from "../../server/briefing-service";
import type { Genre, Location } from "../../domain/types";
import { ObjectBriefing } from "./object-briefing";
import { BriefingController, fetchLocations, MEMORY_KEY } from "./controller";
import styles from "./interactive.module.css";

export function LocationPicker({ onSelect }: { onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Location[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current, request = new AbortController();
    const value = query.trim();
    if ([...value].length < 2 || [...value].length > 40) return () => request.abort();
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const data = await fetchLocations(window.fetch.bind(window), value, request.signal);
        if (generation.current === current && !request.signal.aborted) { setResults(data); setStatus("ready"); }
      } catch { if (generation.current === current && !request.signal.aborted) setStatus("error"); }
    }, 300);
    return () => { window.clearTimeout(timer); request.abort(); };
  }, [query]);
  function change(value: string) { generation.current++; setQuery(value); setResults([]); setStatus("idle"); }
  return <section className={styles.picker} aria-labelledby="location-picker-heading">
    <h2 id="location-picker-heading">选择拍摄地点</h2>
    <label htmlFor="location-query">中国大陆城市或区县</label>
    <input id="location-query" type="search" placeholder="搜索城市或区县" maxLength={40} value={query} autoComplete="off" aria-describedby="location-search-help" onChange={(event) => change(event.target.value)} />
    <p id="location-search-help">输入至少两个字（最多 40 字）后搜索。区域查不到时，请选择所属城市。</p>
    <p role="status">{status === "loading" ? "正在搜索地点…" : status === "error" ? "地点搜索暂不可用，请修改关键词重试。" : status === "ready" ? results.length ? `找到 ${results.length} 个地点，请核对行政上下文。` : "没有找到城市或区县，请尝试所属城市名称。" : "尚未搜索地点。"}</p>
    {results.length > 0 && <ul className={styles.results} aria-label="地点搜索结果">{results.map((location) => <li key={location.id}>
      <button type="button" onClick={() => { onSelect(location.id); change(""); }}><strong>{location.name}</strong><span>{location.administrativePath.join(" / ")} · {location.granularity === "city" ? "城市级" : "区县级"}</span></button>
    </li>)}</ul>}
    <p className={styles.hint}>地点：Open-Meteo Geocoding / GeoNames。仅在此浏览器记住最近地点与题材。</p>
  </section>;
}

export function BriefingClient({ initialPlace, initialGenre, initialResult }: { initialPlace: string | null; initialGenre: Genre; initialResult: BriefingResult | null }) {
  const [controller] = useState(() => new BriefingController({ place: initialPlace, genre: initialGenre, result: initialResult }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    const stop = controller.start({
      now: Date.now, fetch: window.fetch.bind(window), visible: () => document.visibilityState === "visible",
      timer: (callback, ms) => { const timer = window.setTimeout(callback, ms); return () => window.clearTimeout(timer); },
      readUrl: () => window.location.href,
      writeUrl: ({ place, genre }, replace) => {
        const url = new URL(window.location.href);
        if (place === null) url.searchParams.delete("place"); else url.searchParams.set("place", place);
        url.searchParams.set("genre", genre);
        window.history[replace ? "replaceState" : "pushState"](null, "", url);
      },
      readMemory: () => window.localStorage.getItem(MEMORY_KEY),
      writeMemory: (value) => window.localStorage.setItem(MEMORY_KEY, value),
    });
    const navigate = () => controller.navigate();
    document.addEventListener("visibilitychange", controller.visibilityChanged);
    window.addEventListener("popstate", navigate);
    return () => { document.removeEventListener("visibilitychange", controller.visibilityChanged); window.removeEventListener("popstate", navigate); stop(); };
  }, [controller]);
  return <>
    <div className={styles.toolbar} data-loaded={Boolean(state.result?.data)}>
    <LocationPicker onSelect={(id) => controller.selectPlace(id)} />
    {state.place !== null && <div className={styles.refresh}>
      <button type="button" onClick={controller.retry} disabled={state.loading}>刷新 / 重试简报</button>
      <p role="status">{state.loading ? state.result?.data ? "正在刷新；以下为上次完整简报，时间与来源以其标注为准。" : "正在加载所选地点当天简报…" : "前台每 15 分钟检查；页面隐藏时暂停，恢复后检查日期与时效。全部时间为北京时间。"}</p>
    </div>}
    </div>
    {state.place === null && <section className={styles.empty} aria-labelledby="location-heading">
      <h2 id="location-heading">尚未选择地点</h2>
      <p>请选择中国大陆城市或区域后，阅读当天的 24 小时简报。</p>
      <p>此页没有天气实况、预报或演示数值；不会自动替你选择城市。</p>
    </section>}
    {state.result?.error && <section className={styles.error} role="alert" aria-labelledby="briefing-error-heading">
      <h2 id="briefing-error-heading">简报暂不可用</h2><p>{state.result.error.message}</p><p>错误代码：{state.result.error.code}</p>
      <Link href="/" onClick={(event) => { event.preventDefault(); controller.selectPlace(null); }}>返回地点入口</Link>
    </section>}
    {state.result?.data && <ObjectBriefing briefing={state.result.data} genre={state.genre} selectedHour={state.selectedHour} onSelectHour={(hour) => controller.selectHour(hour)} onSelectGenre={(genre) => controller.selectGenre(genre)} />}
  </>;
}
