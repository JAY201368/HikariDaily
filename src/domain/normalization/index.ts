import type { Metric } from "../types";
import { AIR_FIELDS, SOURCE_IDS, SourceSnapshotSchema, WEATHER_FIELDS, emptyHours } from "./snapshot";
import type { SourceHour, SourceSnapshot, SourceTarget } from "./snapshot";
export * from "./snapshot";

export type SourceRiskInput = Pick<SourceSnapshot, "source"> & Pick<SourceHour, "weather" | "air">;
export type NormalizedHour = SourceHour & {
  /** T06 must assess EACH source before ranking merged values. */
  riskInputs: SourceRiskInput[];
  /** Strictly the primary source, including missing values; never fill from MET. */
  primaryWeather: SourceHour["weather"];
};
export type NormalizedDay = { target: SourceTarget; sources: SourceSnapshot["source"][]; hours: NormalizedHour[] };
function usable(snapshot: SourceSnapshot) { return snapshot.source.status === "ok" || snapshot.source.status === "stale"; }
function metricAt(snapshot: SourceSnapshot | undefined, epoch: number, group: "weather" | "air", name: string): Metric<number> | undefined {
  if (!snapshot || !usable(snapshot)) return;
  const hour = snapshot.hours.find((h) => Date.parse(h.start) === epoch);
  const metric = hour && (hour[group] as Record<string, Metric<number>>)[name];
  if (!metric) return;
  return metric.value !== null && snapshot.source.status === "stale"
    ? { ...metric, state: "stale", notes: [...metric.notes, "来源为允许使用的旧缓存"] } : metric;
}
function conflict(name: string, a: number, b: number) {
  return name === "temperature" ? Math.abs(a - b) >= 5
    : name === "windSpeed" ? Math.abs(a - b) >= 4
    : name === "cloudTotal" ? Math.abs(a - b) >= 30
    : name === "precipitation" ? (a >= 1 && b <= 0.1) || (b >= 1 && a <= 0.1) : false;
}
export function normalizeSources(target: SourceTarget, snapshots: SourceSnapshot[]): NormalizedDay {
  snapshots.forEach((snapshot) => {
    SourceSnapshotSchema.parse(snapshot);
    if (snapshot.target.locationId !== target.locationId || snapshot.target.localDate !== target.localDate ||
      snapshot.target.latitude !== target.latitude || snapshot.target.longitude !== target.longitude) throw new RangeError("源快照目标不匹配");
  });
  if (new Set(snapshots.map((s) => s.source.id)).size !== snapshots.length) throw new RangeError("重复来源");
  const primary = snapshots.find((s) => s.source.id === SOURCE_IDS.weather);
  const backup = snapshots.find((s) => s.source.id === SOURCE_IDS.crosscheck);
  const air = snapshots.find((s) => s.source.id === SOURCE_IDS.air);
  const hours = emptyHours(target.localDate, "所有兼容来源均缺失").map((hour): NormalizedHour => {
    const epoch = Date.parse(hour.start);
    const primaryWeather = { ...hour.weather };
    for (const name of WEATHER_FIELDS) {
      const p = metricAt(primary, epoch, "weather", name);
      const b = metricAt(backup, epoch, "weather", name);
      (primaryWeather as Record<string, Metric<number>>)[name] = p ?? hour.weather[name];
      // Different cloud layer definitions must never be mixed, even on fallback.
      const layer = ["cloudLow", "cloudMid", "cloudHigh"].includes(name);
      const chosen = p?.value !== null && p?.value !== undefined ? p : !layer && b?.value !== null && b?.value !== undefined
        ? { ...b, notes: [...b.notes, "主源缺失，使用MET兼容字段回退", ...(p?.notes ?? [])] } : p ?? hour.weather[name];
      if (p?.value !== null && p?.value !== undefined && b?.value !== null && b?.value !== undefined && conflict(name, p.value, b.value)) {
        (hour.weather as Record<string, Metric<number>>)[name] = { ...chosen, state: chosen.state === "stale" || b.state === "stale" ? "stale" : "conflict",
          notes: [...chosen.notes, "多源达到显著分歧阈值", ...(b.state === "stale" ? ["对比来源为旧缓存"] : [])],
          alternatives: [{ sourceId: backup!.source.id, value: b.value }] };
      } else (hour.weather as Record<string, Metric<number>>)[name] = chosen;
    }
    for (const name of AIR_FIELDS) hour.air[name] = metricAt(air, epoch, "air", name) ?? hour.air[name];
    const riskInputs = snapshots.filter(usable).map((s) => ({ source: s.source,
      weather: Object.fromEntries(WEATHER_FIELDS.map((n) => [n, metricAt(s, epoch, "weather", n)!])) as SourceHour["weather"],
      air: Object.fromEntries(AIR_FIELDS.map((n) => [n, metricAt(s, epoch, "air", n)!])) as SourceHour["air"],
    }));
    return { ...hour, primaryWeather, riskInputs };
  });
  return { target, sources: snapshots.map((s) => s.source), hours };
}
