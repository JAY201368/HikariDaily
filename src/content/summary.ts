import type { Hour, GenreAdvice, Summary } from "../domain/types";
import { hasConflict, present, rangeLabel, unique } from "../domain/photography/shared";
import type { Interpretation } from "./interpret";
import { GENRE_NAMES } from "./interpret";

const STATUS_WORD = { past: "已经过去", current: "现在", future: "接下来" } as const;

/** P6.5: risk-first; headline and changes come from the shared plain-language interpretation. */
export function createSummary(hours: Hour[], advice: Record<"landscape" | "portrait" | "street", GenreAdvice>,
  interpretation: Pick<Interpretation, "headline" | "periods">): Summary {
  const temperatures = hours.map((hour) => hour.weather.temperature).filter(present).map((metric) => metric.value);
  const changes = interpretation.periods.map((period) => `${period.name} ${rangeLabel(period)}（${STATUS_WORD[period.status]}）：${period.summary}${
    period.temperature ? `，${period.temperature.min === period.temperature.max ? period.temperature.min : `${period.temperature.min}–${period.temperature.max}`}°C` : ""}`);
  const opportunities = (["landscape", "portrait", "street"] as const).map((genre) => `${GENRE_NAMES[genre]}：${advice[genre].timing}`);
  const metrics = hours.flatMap((hour) => [...Object.values(hour.weather), ...Object.values(hour.air)]);
  const limitations = unique([
    ...(temperatures.length < 24 ? [`气温只有 ${temperatures.length}/24 小时有预报，最高最低温可能不完整。`] : []),
    ...(hours.some((hour) => !present(hour.air.referenceAqi)) ? ["有几个小时没有空气质量预报。"] : []),
    ...(hours.some((hour) => !present(hour.weather.visibility)) ? ["有几个小时没有能见度预报。"] : []),
    ...(metrics.some((metric) => metric.state === "stale") ? ["部分预报是几小时前存下的旧缓存。"] : []),
    ...(metrics.some(hasConflict) ? ["两家天气预报有几个小时说法不一（有分歧）。"] : []),
  ]);
  return { headline: interpretation.headline, changes, opportunities, limitations,
    temperatureRange: { min: temperatures.length ? Math.min(...temperatures) : null,
      max: temperatures.length ? Math.max(...temperatures) : null, coveredHours: temperatures.length, totalHours: 24 } };
}
