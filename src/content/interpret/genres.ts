import { HAZARD_WORDS } from "./hazard-words";
import type { Genre, GenreAdvice, Hour, RecommendedWindow, SolarEvents } from "../../domain/types";
import { freezingRain, present, timeLabel } from "../../domain/photography/shared";
import { toEpoch } from "../../domain/time";
import type { HourReadings } from "./levels";
import { hourRain, wet } from "./periods";
import { nightNow, twilightKey, type LightContext } from "./light-context";
import { windLevel } from "./levels";

export const GENRE_NAMES: Record<Genre, string> = { landscape: "风光", portrait: "人像", street: "街拍" };
export type GenreStatus = "now" | "upcoming" | "maybe" | "passed" | "none";
export type GenreLine = { status: GenreStatus; when: string; line: string };

const LINES: Record<Genre, Record<string, string>> = {
  landscape: { golden: "太阳低，云和远山有层次", blue: "天空深蓝，适合拍城市天际线", hard: "阳光足，远景清楚",
    "low-sun": "斜射阳光让地形有立体感", soft: "光线平，适合拍近景细节和色彩", mixed: "云影在地面移动，可以等光漏下来",
    day: "留意近处的纹理和远处的层次" },
  portrait: { golden: "暖光从侧后方照来，轮廓好看", blue: "天色好看，人物要靠补光", hard: "光很硬，找树荫或楼影拍",
    "low-sun": "斜射光有立体感，注意别让人眯眼", soft: "柔光均匀，肤色干净", mixed: "光说变就变，抓云缝透光的瞬间",
    day: "根据光向安排人物朝向" },
  street: { golden: "长影子和暖光，街景有戏", blue: "灯刚亮，天还是蓝的", hard: "楼影切出强烈明暗",
    "low-sun": "斜阳拉长行人的影子", soft: "光线平和，多留意色彩和人物关系", mixed: "街面忽明忽暗，等人走进光里",
    day: "边走边看，留意光和人的关系" },
};

for (const genre of Object.keys(LINES) as Genre[]) Object.assign(LINES[genre], {
  dawn: genre === "portrait" ? "清晨太阳仍在地平线下，靠天光或补光" : "清晨太阳仍在地平线下，留意天边的颜色和轮廓",
  afterglow: genre === "portrait" ? "没有直射光了，人物要靠天光或补光" : genre === "landscape" ? "天边还有余光，适合拍天际线和剪影" : "天色转暗，留意橱窗和路灯",
  "golden-transition": "晨昏光线在变化",
  "morning-blue": "日出前天空渐亮，拍摄注意拿稳",
  twilight: "晨昏天光偏暗，手持注意拿稳",
});

export const rangeText = (window: Pick<RecommendedWindow, "start" | "end">) => `${timeLabel(window.start)}–${timeLabel(window.end)}`;
export function whenText(window: RecommendedWindow): string {
  return window.status === "current" ? `现在到 ${timeLabel(window.end)}` : rangeText(window);
}

function hourOf(hours: Hour[], instant: string) {
  const epoch = Date.parse(instant);
  return hours.findIndex((hour) => Date.parse(hour.start) <= epoch && epoch < Date.parse(hour.end));
}
/** Preserve the scored phase, then describe the whole remaining solar interval. */
export function windowLightKey(window: RecommendedWindow, readings: HourReadings[], hours: Hour[], context: LightContext = {}): string {
  const phase = window.reasonCodes.find((code) => code.startsWith("phase:"))?.slice(6);
  if (phase === "golden" || phase === "blue") return twilightKey(window, phase, context);
  const index = hourOf(hours, window.start);
  const key = index >= 0 ? readings[index].light.key : "day";
  return ["hard", "low-sun", "soft", "mixed"].includes(key) ? key : "day";
}

function limitingFactors(window: RecommendedWindow, genre: Genre): string {
  const codes = new Set(window.reasonCodes);
  const factors = [codes.has("D0") ? "有雨" : codes.has("D1") ? "可能下雨" : "",
    codes.has("W0") ? "风大" : codes.has("W1") && genre !== "street" ? "有风" : "",
    codes.has("V0") ? "远处发灰" : "",
    codes.has(`${genre}:L0`) ? "光线不讨喜" : codes.has(`${genre}:L1`) && genre === "landscape" ? "光线一般" : ""].filter(Boolean);
  return factors.length ? factors.slice(0, 2).join("、") : "条件一般";
}

/** A slot the rules kept despite expected rain is worth a try, not worth heading out for. */
export const rainy = (window: RecommendedWindow) => window.reasonCodes.includes("D0");
export const overlappingHours = (window: Pick<RecommendedWindow, "start" | "end">, hours: Hour[]) => hours.filter(hour =>
  Date.parse(hour.start) < Date.parse(window.end) && Date.parse(window.start) < Date.parse(hour.end));
export const snowing = (hour: Pick<Hour, "weather">) => present(hour.weather.weatherCode) && [71, 73, 75, 77, 85, 86].includes(hour.weather.weatherCode.value);
/** D1 also includes absent probability; only actual rain evidence justifies preparation. */
export const showery = (window: RecommendedWindow, hours: Hour[]) => overlappingHours(window, hours).some(({ weather: w }) =>
  (present(w.precipitation) && w.precipitation.value > 0) || (present(w.precipitationProbability) && w.precipitationProbability.value >= 40));
export const snowy = (window: RecommendedWindow, hours: Hour[]) => overlappingHours(window, hours).some(snowing);

/** First contiguous future frozen-precipitation span; ordinary hours remain usable. */
export function freezingRange(hours: Pick<Hour, "start" | "end" | "weather">[], now: string | number) {
  const ahead = hours.filter(hour => Date.parse(hour.end) > toEpoch(now));
  const index = ahead.findIndex(hour => freezingRain(hour.weather.weatherCode));
  if (index < 0) return null;
  const range = { start: ahead[index].start, end: ahead[index].end };
  for (const hour of ahead.slice(index + 1)) {
    if (hour.start !== range.end || !freezingRain(hour.weather.weatherCode)) break;
    range.end = hour.end;
  }
  return range;
}

export function eveningOver(solar: SolarEvents, now: string | number): boolean {
  const current = toEpoch(now);
  const end = solar.eveningBlue?.end ?? (solar.sunset ? new Date(Date.parse(solar.sunset) + 1800000).toISOString() : null);
  return end !== null && current >= Date.parse(end);
}

export function nightLine(genre: Genre, rainAhead: boolean, windy = false): string {
  if (windy) return "夜里风较大，避开空旷处，改在允许拍摄的室内取景";
  if (genre === "landscape") return rainAhead ? "雨夜远景发灰，不如明早再看" : "可以拍城市夜景，记得带三脚架";
  if (genre === "portrait") return "天黑了，要靠路灯、橱窗或补光灯";
  return rainAhead ? "雨夜留意灯光，地面确实湿了再拍反光" : "夜里可以拍街灯和霓虹";
}

export function genreLine(genre: Genre, advice: GenreAdvice, hours: Hour[], readings: HourReadings[],
  solar: SolarEvents, now: string | number, location?: LightContext["location"]): GenreLine {
  const current = toEpoch(now);
  const ahead = hours.filter(hour => Date.parse(hour.end) > current);
  const hazard = ahead.flatMap(hour => hour.risks).find(risk => risk.code !== "air-quality" && Date.parse(risk.end) > current);
  const freeze = freezingRange(hours, now);
  const freezeLine = `${HAZARD_WORDS.sleet.detail}`;
  const night = eveningOver(solar, now) || ((solar.sunrise === null || current >= Date.parse(solar.sunrise)) && !advice.allWindows.some(window => Date.parse(window.end) > current) && nightNow(hours, solar, now));
  if (night && freeze) return { status: "none", when: "户外停拍", line: freezeLine };
  if (night && hazard) return { status: "none", when: "今天不推荐", line: `接下来${HAZARD_WORDS[hazard.code].label}，${HAZARD_WORDS[hazard.code].action}` };
  const rainAhead = ahead.some(hour => wet(hourRain(hour)));
  const windy = ahead.some(hour => [hour.weather.windSpeed, hour.weather.windGust].some(metric => present(metric) && windLevel(metric.value) >= 6));
  if (night) return { status: advice.allWindows.length ? "passed" : "none", when: advice.allWindows.length ? "今天已过" : "当前是夜间", line: nightLine(genre, rainAhead, windy) };
  const best = [...advice.recommendedWindows].filter((window) => !rainy(window))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
  if (best) return { status: best.status === "current" ? "now" : "upcoming", when: whenText(best),
    line: LINES[genre][windowLightKey(best, readings, hours, { solar, now, location })] };
  const future = advice.allWindows.filter((window) => Date.parse(window.end) > current);
  if (freeze && !best) return { status: "none", when: "户外停拍", line: freezeLine };
  if (future.length) {
    const next = future[0];
    return { status: "maybe", when: whenText(next), line: `${limitingFactors(next, genre)}，可以试试` };
  }
  if (advice.allWindows.length) return { status: "passed", when: "今天已过",
    line: eveningOver(solar, now) ? nightLine(genre, rainAhead) : "今天剩下的时间不太适合" };
  const required = [["cloudTotal", "云量"], ["windSpeed", "风"], ["precipitation", "降水"], ["weatherCode", "天气类型"],
    ...(genre === "landscape" ? [["visibility", "能见度"]] : [])] as [keyof Hour["weather"], string][];
  const missing = required.filter(([name]) => hours.some(hour => Date.parse(hour.end) > current && !present(hour.weather[name])))
    .map(([, label]) => label);
  const risky = ahead.some((hour) => hour.risks.some((risk) => risk.code !== "air-quality" && Date.parse(risk.end) > current));
  return { status: "none", when: missing.length ? "暂时排不出" : "今天不推荐",
    line: missing.length ? `缺${missing.join("、")}预报，排不出时间` : risky ? "白天有风雨风险，户外先放一放"
      : eveningOver(solar, now) ? nightLine(genre, rainAhead) : "今天没有合适的自然光" };
}
