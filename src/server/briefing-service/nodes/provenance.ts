import "server-only";
import { shanghaiDayBounds, shanghaiIso } from "../../../domain/time";
import type { Source } from "../../../domain/types";
import type { BriefingGraphState } from "../state";

export function solarSource(localDate: string): Source {
  const bounds = shanghaiDayBounds(localDate);
  return { id: "suncalc", provider: "SunCalc", dataset: "太阳位置与事件计算", model: "SunCalc 1.9.0",
    kind: "astronomical", fetchedAt: null, issuedAt: null, validFrom: shanghaiIso(bounds.start),
    validTo: shanghaiIso(bounds.end), nativeResolution: "事件计算到分钟；小时光照参考小时中点",
    attributionUrl: "https://github.com/mourner/suncalc", status: "ok" };
}
export function collectProvenance({ localDate, day, loaded }: BriefingGraphState) {
  const warnings = [...loaded.warnings, ...(loaded.sunset?.notes.map(note => `${loaded.sunset!.source.id}：${note}`) ?? []), ...loaded.snapshots.flatMap((s) => [
    ...s.notes.map((note) => `${s.source.id}：${note}`),
    ...(s.grid ? [`${s.source.id}：模型格点 ${s.grid.latitude}, ${s.grid.longitude}。`] : []),
    ...Object.entries(s.semantics).flatMap(([field, semantics]) => semantics.notes.map((note) => `${s.source.id} / ${field}：${note}`)),
    ...(s.source.status === "disabled" ? [`${s.source.id} 已禁用，无法提供该来源或完成相应交叉检查。`,
      ...(s.notes.includes("MET_IDENTITY_REQUIRED") ? ["MET Norway 未配置真实可联系的项目身份，因此禁用。"] : []),
      ...(s.notes.includes("CACHE_UNAVAILABLE") ? ["MET Norway 因缺少可用共享缓存而禁用。"] : []),
    ] : []),
  ])];
  if (loaded.mode === "fixture") warnings.unshift("演示数据：人工合成，非真实预报或观测，不用于判断当前天气");
  return { sources: [...day.sources, ...(loaded.sunset ? [loaded.sunset.source] : []), solarSource(localDate)], warnings: [...new Set(warnings)] };
}
