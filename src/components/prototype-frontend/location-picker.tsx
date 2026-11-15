"use client";
import { useEffect,useRef,useState } from "react";
import type { Location } from "../../domain/types";
import { fetchLocations } from "../briefing-client/controller";
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
  return <section className="picker" aria-labelledby="location-picker-heading">
    <h2 id="location-picker-heading">选择拍摄地点</h2>
    <label htmlFor="location-query">中国大陆城市或区县</label>
    <input id="location-query" type="search" placeholder="搜索城市或区县" maxLength={40} value={query} autoComplete="off" aria-describedby="location-search-help" onChange={(event) => change(event.target.value)} />
    <p id="location-search-help">输入至少两个字（最多 40 字）后搜索。区域查不到时，请选择所属城市。</p>
    <p role="status">{status === "loading" ? "正在搜索地点…" : status === "error" ? "地点搜索暂不可用，请修改关键词重试。" : status === "ready" ? results.length ? `找到 ${results.length} 个地点，请核对行政上下文。` : "没有找到城市或区县，请尝试所属城市名称。" : "尚未搜索地点。"}</p>
    {results.length > 0 && <ul className="results" aria-label="地点搜索结果">{results.map((location) => <li key={location.id}>
      <button type="button" onClick={() => { onSelect(location.id); change(""); }}><strong>{location.name}</strong><span>{location.administrativePath.join(" / ")} · {location.granularity === "city" ? "城市级" : "区县级"}</span></button>
    </li>)}</ul>}
    <p className="hint">地点：Open-Meteo Geocoding / GeoNames。仅在此浏览器记住最近地点与题材。</p>
  </section>;
}
