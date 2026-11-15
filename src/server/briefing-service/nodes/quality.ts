import "server-only";
import { SUNSET_SOURCE_ID } from "../../../domain/photography/sunset-input";
import type { Briefing } from "../../../domain/types";
import type { BriefingGraphState } from "../state";

export function classifyQuality({ day, loaded, sunsetOpportunity }: BriefingGraphState): { quality: Briefing["state"] } {
  const metrics = day.hours.flatMap((h) => [...Object.values(h.weather), ...Object.values(h.air)]);
  if (!metrics.some((m) => m.value !== null)) return { quality: "unavailable" };
  const sources = loaded.sunset ? [...day.sources, loaded.sunset.source] : day.sources;
  if (sources.some(s => s.id === SUNSET_SOURCE_ID && s.status === "stale") || metrics.some((m) => m.state === "stale") || day.hours.some((h) => h.riskInputs.some((s) =>
    s.source.status === "stale" && [...Object.values(s.weather), ...Object.values(s.air)].some((m) => m.value !== null)))) return { quality: "stale" };
  const coreMissing = day.hours.some((h) => [h.weather.temperature, h.weather.weatherCode, h.weather.precipitation,
    h.weather.windSpeed, h.weather.cloudTotal, h.weather.visibility, ...Object.values(h.air)].some((m) => m.value === null));
  return { quality: sources.some((s) => s.status === "failed" || s.status === "disabled") || coreMissing ||
    sunsetOpportunity.status === "unknown" ? "partial" : "ready" };
}
