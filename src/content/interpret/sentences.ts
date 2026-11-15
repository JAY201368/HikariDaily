import { HAZARD_WORDS } from "./hazard-words";
import type { Genre, GenreAdvice, Hour, RiskNote } from "../../domain/types";
import { present, timeLabel } from "../../domain/photography/shared";
import { GENRE_NAMES, rainy } from "./genres";
import { wet } from "./periods";
import { windEffect, windLevel, type RainClass, type HourReadings } from "./levels";

const RISK_ORDER: RiskNote["code"][] = ["thunderstorm", "heavy-rain", "strong-wind", "air-quality"];
const GENRES: Genre[] = ["landscape", "portrait", "street"];

function overlaps(hour: Hour, range: { start: string; end: string }): boolean {
  return Date.parse(range.start) < Date.parse(hour.end) && Date.parse(hour.start) < Date.parse(range.end);
}

/** Describes existing readings and rule results; does not score or create recommendations. */
export function hourSentence(readings: HourReadings, hour: Hour, risks: RiskNote[] = hour.risks,
  advice?: Record<Genre, GenreAdvice>): string[] {
  const { sky, rain, temperature, wind, visibility, light } = readings;
  const missingWeather = sky.key === "unknown" && rain.key === "unknown";
  const precipitationSky = ["rain", "drizzle", "showers", "snow", "sleet", "thunder"].includes(sky.key);
  const weather = missingWeather ? "这一小时没有天气和降水预报"
    // Weather type and hourly accumulation have different sampling contexts.
    : precipitationSky && rain.key === "none" ? sky.label
    : rain.key !== "none" && rain.key !== "unknown" && ["rain", "drizzle", "snow"].includes(sky.key) ? rain.label
    : sky.label === rain.label ? sky.label : `${sky.label}，${rain.label}`;
  const first = `${weather}，${temperature.key === "unknown" ? "气温也没有预报" : `${missingWeather ? "气温 " : ""}${temperature.label}`}。`;
  const w = hour.weather;
  const average = present(w.windSpeed) ? windLevel(w.windSpeed.value) : null;
  const gust = present(w.windGust) ? windLevel(w.windGust.value) : null;
  const windy = (average !== null && average >= 3) || (gust !== null && gust >= 3);
  const windDetail = gust !== null && gust >= 3 && (average === null || gust > average)
    ? `阵风 ${gust} 级，${windEffect(gust)}。` : wind.detail;
  const active = risks.filter((risk) => overlaps(hour, risk));
  const codes = RISK_ORDER.filter((code) => active.some((risk) => risk.code === code));
  const outdoorRisk = codes.find(code => code !== "air-quality");
  const expressed = new Set<RiskNote["code"]>();
  if (sky.key === "thunder") expressed.add("thunderstorm");
  else if (sky.key !== "sleet" && outdoorRisk) expressed.add(outdoorRisk);
  const second = ["thunder", "sleet"].includes(sky.key) ? sky.detail
    : outdoorRisk ? `${HAZARD_WORDS[outdoorRisk].label}，${HAZARD_WORDS[outdoorRisk].action}。`
    : sky.key === "snow" || rain.key === "snow" || wet(rain.key as RainClass) ? rain.detail
    : windy ? windDetail
    : present(w.visibility) && w.visibility.value < 10000 ? visibility.detail : light.short;
  const sentences = [first, second];
  const remaining = codes.filter(code => !expressed.has(code));
  if (remaining.length) sentences.push(`这一小时${remaining.map((code) => `${HAZARD_WORDS[code].label}，${HAZARD_WORDS[code].action}`).join("；")}。`);
  else if (!codes.length && advice && !["thunder", "sleet", "snow"].includes(sky.key) && rain.key !== "snow" && !wet(rain.key as RainClass)) {
    const genres = GENRES.filter((genre) => advice[genre].recommendedWindows.some((range) => !rainy(range) && overlaps(hour, range)));
    const best = genres.filter(genre => advice[genre].recommendedWindows[0] && overlaps(hour, advice[genre].recommendedWindows[0]));
    const suitable = genres.filter(genre => !best.includes(genre));
    if (best.length) {
      const groups = new Map<string, Genre[]>();
      for (const genre of best) {
        const window = advice[genre].recommendedWindows[0];
        const start = Math.max(Date.parse(hour.start), Date.parse(window.start)), end = Math.min(Date.parse(hour.end), Date.parse(window.end));
        const partial = start !== Date.parse(hour.start) || end !== Date.parse(hour.end);
        const span = partial ? `${timeLabel(new Date(start).toISOString())}–${timeLabel(new Date(end).toISOString())}` : "";
        groups.set(span, [...(groups.get(span) ?? []), genre]);
      }
      sentences.push([...groups].map(([span, names]) => `${span ? `${span}是` : "这是"}今天拍${names.map(genre => GENRE_NAMES[genre]).join("、")}最好的时段。`).join(""));
    }
    if (suitable.length) {
      const text = `这一小时适合拍${suitable.map(genre => GENRE_NAMES[genre]).join("、")}。`;
      if (sentences.length < 3) sentences.push(text);
      else sentences[1] += text;
    }
  }
  return sentences;
}
