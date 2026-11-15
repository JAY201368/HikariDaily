import type { Hour, Location, RecommendedWindow, SolarEvents } from "../../domain/types";
import { calculateSolarPosition } from "../../domain/solar";
import { toEpoch } from "../../domain/time";

export type LightContext = { solar?: SolarEvents; now?: string | number; location?: Pick<Location, "latitude" | "longitude"> };
/** Copy examines the whole remaining interval, without changing scored slices. Events use
 * SunCalc's apparent solar limb; geometric altitude zero is checked separately. */
export function twilightKey(window: Pick<RecommendedWindow, "start" | "end">, phase: string, context: LightContext = {}): string {
  const start = Math.max(Date.parse(window.start), context.now === undefined ? -Infinity : toEpoch(context.now));
  const end = Date.parse(window.end) - 1;
  const { solar, location } = context;
  const morning = solar?.sunrise ? end <= Date.parse(solar.sunrise) : false;
  if (phase === "blue") return morning ? "morning-blue" : solar?.sunset && start >= Date.parse(solar.sunset) ? "blue" : "twilight";
  if (phase !== "golden") return phase;
  if (location && start <= end) {
    const first = calculateSolarPosition(start, location), last = calculateSolarPosition(end, location);
    if (first.altitude !== null && last.altitude !== null) {
      if (first.altitude < 0 && last.altitude < 0) return first.azimuth !== null && last.azimuth !== null
        ? first.azimuth < 180 && last.azimuth < 180 ? "dawn" : first.azimuth >= 180 && last.azimuth >= 180 ? "afterglow" : "golden-transition" : "golden-transition";
      if (first.altitude >= 0 && last.altitude >= 0) return "golden";
    }
  }
  if (morning) return "dawn";
  if (solar?.sunset && start >= Date.parse(solar.sunset)) return "afterglow";
  return "golden-transition";
}
export function nightNow(hours: Hour[], solar: SolarEvents, now: string | number): boolean {
  const current = toEpoch(now);
  const end = solar.eveningBlue?.end ?? (solar.sunset ? new Date(Date.parse(solar.sunset) + 1800000).toISOString() : null);
  if (end !== null) return current >= Date.parse(end);
  return hours.some(hour => Date.parse(hour.start) <= current && current < Date.parse(hour.end) && hour.light.phase === "night");
}
export const solarTimesKnown = (solar: SolarEvents) => [solar.sunrise, solar.sunset, solar.morningBlue,
  solar.morningGolden, solar.eveningGolden, solar.eveningBlue].some(Boolean);
export const NIGHT_LIGHT = "夜里自然光很暗，拍摄要靠现场灯光或补光。";
export const TWILIGHT_LIGHT: Record<string, string> = {
  dawn: "太阳还在地平线下，天边渐亮，人物要靠天光或补光。",
  afterglow: "太阳在地平线下，天边还有余光，人物要靠天光或补光。",
  "golden-transition": "晨昏光线在变化。",
  "morning-blue": "日出前天空渐亮，光很暗，手持注意拿稳。",
  blue: "日落后天空转暗，手持注意拿稳。",
  twilight: "晨昏天光偏暗，手持注意拿稳。",
};
