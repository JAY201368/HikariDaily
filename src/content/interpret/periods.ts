import type { Hour, SolarEvents } from "../../domain/types";
import { present } from "../../domain/photography/shared";
import { windowStatus } from "../../domain/time";
import { HOUR_MS } from "../../domain/schemas/primitives";
import type { HourReadings, RainClass, Reading, SkyKey } from "./levels";
import { RAIN_NAMES, RAIN_ORDER, SKY_NAMES, SKY_SEVERITY, rainClass, windLevel } from "./levels";

export const PERIOD_NAMES = ["天亮前", "清晨", "上午", "下午", "傍晚", "入夜"] as const;
export type PeriodName = typeof PERIOD_NAMES[number];
const FIXED = [0, 5, 8, 12, 17, 19, 24];

/** Fractional Beijing-time hour of an instant within the target day. */
export const dayHour = (dayStart: number, instant: string) => (Date.parse(instant) - dayStart) / HOUR_MS;

/** Boundaries follow the sun, so a place where the sun sets after 19:30 is not called "evening" at 17:00. */
export function periodBoundaries(dayStart: number, solar: SolarEvents): number[] {
  if (!solar.sunrise || !solar.sunset) return FIXED;
  const rise = dayHour(dayStart, solar.sunrise), set = dayHour(dayStart, solar.sunset);
  const raw = [0,
    Math.round(solar.morningBlue ? dayHour(dayStart, solar.morningBlue.start) : rise - 0.5),
    Math.round(rise + 2), Math.round((rise + set) / 2), Math.round(set - 1.5),
    Math.round(solar.eveningBlue ? dayHour(dayStart, solar.eveningBlue.end) : set + 0.5), 24];
  return raw.map((value, index) => index === 0 ? 0 : index === raw.length - 1 ? 24 : Math.min(24, Math.max(0, value)))
    .map((value, index, all) => Math.max(value, ...all.slice(0, index)));
}

export type RainState = RainClass | "unknown";
export function hourRain(hour: Hour): RainState {
  return present(hour.weather.precipitation) ? rainClass(hour.weather.precipitation.value) : "unknown";
}
export const wet = (state: RainState) => state !== "unknown" && RAIN_ORDER.indexOf(state) >= RAIN_ORDER.indexOf("light");
export const WET_SKIES: SkyKey[] = ["thunder", "snow", "sleet", "rain", "showers", "drizzle"];

export function dominantSky(readings: HourReadings[]): SkyKey {
  const counts = new Map<SkyKey, number>();
  readings.forEach((reading) => counts.set(reading.sky.key as SkyKey, (counts.get(reading.sky.key as SkyKey) ?? 0) + 1));
  const known = [...counts].filter(([key]) => key !== "unknown");
  if (!known.length) return "unknown";
  for (const hazard of ["thunder", "sleet"] as const) if (counts.has(hazard)) return hazard;
  return known.sort((a, b) => b[1] - a[1] || SKY_SEVERITY.indexOf(a[0]) - SKY_SEVERITY.indexOf(b[0]))[0][0];
}
export function maxRain(hours: Hour[]): RainState {
  const known = hours.map(hourRain).filter((state): state is RainClass => state !== "unknown");
  return known.length ? known.reduce((a, b) => RAIN_ORDER.indexOf(b) > RAIN_ORDER.indexOf(a) ? b : a) : "unknown";
}

/** The word used when a stretch of the day is described in one breath. */
export function conditionPhrase(sky: SkyKey, rain: RainState): string {
  if (sky === "thunder" || sky === "snow" || sky === "sleet") return SKY_NAMES[sky];
  if (wet(rain)) return sky === "showers" ? "阵雨" : RAIN_NAMES[rain as RainClass];
  return SKY_NAMES[sky === "showers" || sky === "rain" || sky === "drizzle" ? "drizzle" : sky];
}

export type Period = {
  name: PeriodName; start: string; end: string; status: "past" | "current" | "future";
  sky: Reading; temperature: { min: number; max: number } | null; summary: string;
};
export function createPeriods(hours: Hour[], readings: HourReadings[], solar: SolarEvents, now: string | number): Period[] {
  const dayStart = Date.parse(hours[0].start);
  const bounds = periodBoundaries(dayStart, solar);
  return PERIOD_NAMES.flatMap((name, index) => {
    const from = bounds[index], to = bounds[index + 1];
    if (to <= from) return [];
    const slice = hours.slice(from, to), sliceReadings = readings.slice(from, to);
    const sky = dominantSky(sliceReadings);
    const rain = maxRain(slice);
    const temperatures = slice.map((hour) => hour.weather.temperature).filter(present).map((metric) => metric.value);
    const maximum = (name: "windSpeed" | "windGust") => {
      const values = slice.map(hour => hour.weather[name]).filter(present).map(metric => windLevel(metric.value));
      return values.length ? Math.max(...values) : null;
    };
    const wind = maximum("windSpeed"), gust = maximum("windGust");
    const falling = sliceReadings.filter(reading => !["none", "unknown"].includes(reading.rain.key));
    const snowHours = falling.filter(reading => reading.rain.key === "snow").length;
    const snowPhrase = snowHours ? snowHours === falling.length ? "雪" : "雨雪" : null;
    const phrase = !["thunder", "sleet"].includes(sky) && snowPhrase ? snowPhrase : conditionPhrase(sky, rain);
    const rainPart = wet(rain) && !phrase.includes("雨") && !phrase.includes("雪") ? `，有${RAIN_NAMES[rain as RainClass]}` : "";
    const windPart = gust !== null && gust >= 6 && (wind === null || gust > wind) ? `，阵风 ${gust} 级`
      : wind !== null && wind >= 4 ? `，风 ${wind} 级` : "";
    const codes = new Set(slice.flatMap(hour => hour.risks.map(risk => risk.code)));
    const hazards = [codes.has("thunderstorm") && sky !== "thunder" ? "可能有雷雨" : "",
      sliceReadings.some(reading => reading.sky.key === "sleet") && sky !== "sleet" ? "有冻雨" : "",
      codes.has("heavy-rain") ? "雨势较大" : "", codes.has("strong-wind") ? "风很大" : ""].filter(Boolean);
    const hazardPart = hazards.length ? `，${hazards.join("、")}` : "";
    const sample = sliceReadings.find((reading) => reading.sky.key === sky) ?? sliceReadings[0];
    return [{ name, start: slice[0].start, end: slice.at(-1)!.end, status: windowStatus(slice[0].start, slice.at(-1)!.end, now),
      sky: { label: SKY_NAMES[sky], key: sky, detail: sample.sky.detail },
      temperature: temperatures.length ? { min: Math.round(Math.min(...temperatures)), max: Math.round(Math.max(...temperatures)) } : null,
      summary: sky === "unknown" && rain === "unknown" && !hazards.length ? "没有天气预报" : `${phrase}${rainPart}${windPart}${hazardPart}` }];
  });
}

/** "上午阴，下午转小雨，傍晚转中雨" — consecutive periods with the same condition are merged. */
export function weatherLine(periods: Period[], hours: Hour[], readings: HourReadings[]): string {
  // Period summaries already preserve exceptional skies and each source's hazards.
  void hours; void readings;
  const phrases = periods.map(period => period.summary);
  const groups: { names: PeriodName[]; phrase: string }[] = [];
  phrases.forEach((phrase, index) => {
    const last = groups.at(-1);
    if (last && last.phrase === phrase) last.names.push(periods[index].name);
    else groups.push({ names: [periods[index].name], phrase });
  });
  if (groups.length === 1) return `全天${groups[0].phrase}`;
  return groups.map((group, index) => `${group.names.length === 1 ? group.names[0] : `${group.names[0]}到${group.names.at(-1)}`}${index ? "转" : ""}${group.phrase}`).join("，");
}
