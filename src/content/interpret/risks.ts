import { HAZARD_WORDS } from "./hazard-words";
import type { Hour, RiskNote } from "../../domain/types";
import { present } from "../../domain/photography/shared";
import { windowStatus } from "../../domain/time";
import { airLevel, rainAmountText, windLevel } from "./levels";
import { dayHour } from "./periods";

export type RiskCode = RiskNote["code"];
export type InterpretedRisk = { start: string; end: string; code: RiskCode; status: "past" | "current" | "future"; text: string };

/** "16 时" / "16–17 时" / "22 时到午夜", with hour labels inclusive. */
export function hourSpan(dayStart: number, start: string, end: string): string {
  const from = Math.round(dayHour(dayStart, start)), to = Math.round(dayHour(dayStart, end));
  if (from <= 0 && to >= 24) return "全天";
  if (to >= 24 && to - from > 1) return `${from} 时到午夜`;
  return to - from <= 1 ? `${from} 时` : `${from}–${to - 1} 时`;
}

function riskBody(code: RiskCode, span: string, hours: Hour[]): string {
  const values = (pick: (hour: Hour) => number | null) => hours.map(pick).filter((value): value is number => value !== null);
  if (code === "thunderstorm") return `${span}${HAZARD_WORDS.thunderstorm.label}`;
  if (code === "heavy-rain") {
    const rain = values((hour) => present(hour.weather.precipitation) ? hour.weather.precipitation.value : null);
    const peak = rain.length ? Math.max(...rain) : 0;
    return peak >= 5 ? `${span}雨势较大（最大${rainAmountText(peak)}）` : `${span}可能有较大的雨`;
  }
  if (code === "strong-wind") {
    const levels = values((hour) => Math.max(present(hour.weather.windSpeed) ? windLevel(hour.weather.windSpeed.value) : 0,
      present(hour.weather.windGust) ? windLevel(hour.weather.windGust.value) : 0));
    const peak = levels.length ? Math.max(...levels) : 0;
    return peak >= 8 ? `${span}风很大（最大 ${peak} 级）` : `${span}可能起大风`;
  }
  const aqi = values((hour) => present(hour.air.referenceAqi) ? hour.air.referenceAqi.value : null);
  const peak = aqi.length ? Math.round(Math.max(...aqi)) : 0;
  return peak >= 151 ? `${span}空气${airLevel(peak).label}（美国标准 AQI 最高 ${peak}）` : `${span}空气可能变差`;
}

/** Consecutive hours with the same hazard become one note; upcoming hazards first, air last. */
export function groupRisks(hours: Hour[], now: string | number): InterpretedRisk[] {
  const dayStart = Date.parse(hours[0].start);
  const groups: { code: RiskCode; hours: Hour[] }[] = [];
  const codes: RiskCode[] = ["thunderstorm", "heavy-rain", "strong-wind", "air-quality"];
  for (const code of codes) {
    hours.forEach((hour, index) => {
      if (!hour.risks.some((risk) => risk.code === code)) return;
      const last = groups.at(-1);
      if (last && last.code === code && hours.indexOf(last.hours.at(-1)!) === index - 1) last.hours.push(hour);
      else groups.push({ code, hours: [hour] });
    });
  }
  return groups.map(({ code, hours: slice }): InterpretedRisk => {
    const start = slice[0].start, end = slice.at(-1)!.end;
    const status = windowStatus(start, end, now);
    const body = riskBody(code, hourSpan(dayStart, start, end), slice);
    return { start, end, code, status, text: `${body}${status === "past" ? "，已经过去" : `，${HAZARD_WORDS[code].action}`}` };
  }).sort((a, b) => Number(a.status === "past") - Number(b.status === "past") ||
    Number(a.code === "air-quality") - Number(b.code === "air-quality") || Date.parse(a.start) - Date.parse(b.start));
}
