import type { Metric, RecommendedWindow } from "../types";
import { shanghaiIso } from "../time";

export const unique = <T>(values: T[]): T[] => [...new Set(values)];
export const present = (metric: Metric<number>): metric is Metric<number> & { value: number } =>
  metric.state !== "missing" && metric.value !== null && Number.isFinite(metric.value);
export const hasConflict = (metric: Metric<number>) => metric.state === "conflict" ||
  metric.notes.some((note) => /分歧|冲突/.test(note));
/** Plain notes only; raw per-metric notes stay on the metric for the source detail view. */
export function metricLimitations(metrics: Metric<number>[]): string[] {
  return unique([
    ...(metrics.some((metric) => metric.state === "stale") ? ["部分预报是几小时前存下的旧缓存。"] : []),
    ...(metrics.some(hasConflict) ? ["两家天气预报在这段时间说法不一（有分歧）。"] : []),
  ]);
}
export function timeLabel(instant: string): string { return shanghaiIso(instant).slice(11, 16); }
export function rangeLabel(range: Pick<RecommendedWindow, "start" | "end">): string {
  return `${timeLabel(range.start)}–${timeLabel(range.end)}`;
}

/** Merged weather-code predicate only; this does not extend the public risk protocol. */
export const freezingRain = (code: Metric<number>): boolean => present(code) && [56, 57, 66, 67].includes(code.value);
