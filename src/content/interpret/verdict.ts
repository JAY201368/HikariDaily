import { HAZARD_WORDS } from "./hazard-words";
import { SUNSET_WORDS } from "./sunset-words";
import type { Genre, GenreAdvice, Hour, Location, Opportunity, RecommendedWindow, SolarEvents, Source } from "../../domain/types";
import { SOURCE_IDS } from "../../domain/normalization";
import { SUNSET_SOURCE_ID } from "../../domain/photography/sunset-input";
import { present, timeLabel } from "../../domain/photography/shared";
import { toEpoch } from "../../domain/time";
import type { HourReadings, RainClass, SkyKey } from "./levels";
import { RAIN_NAMES, RAIN_ORDER, rainAmountText } from "./levels";
import type { Period, PeriodName } from "./periods";
import type { RainState } from "./periods";
import { WET_SKIES, dayHour, dominantSky, hourRain, maxRain, wet } from "./periods";
import type { InterpretedRisk } from "./risks";
import { hourSpan } from "./risks";
import { nightNow, solarTimesKnown } from "./light-context";
import { GENRE_NAMES, eveningOver, freezingRange, rainy, showery, snowy, snowing, whenText, windowLightKey } from "./genres";

export type Tone = "go" | "maybe" | "poor" | "done" | "unknown";
export const HEADLINE_MAX = 28;
const GENRES: Genre[] = ["landscape", "portrait", "street"];

type Context = {
  hours: Hour[]; readings: HourReadings[]; periods: Period[]; risks: InterpretedRisk[];
  advice: Record<Genre, GenreAdvice>; sunset: Opportunity; solar: SolarEvents; sources: Source[]; location?: Pick<Location, "latitude" | "longitude">; now: string | number;
};

const hasWeather = (readings: HourReadings[]) => readings.some((reading) => reading.sky.key !== "unknown" || reading.rain.key !== "unknown");
const nowIndex = (hours: Hour[], now: string | number) =>
  Math.min(24, Math.max(0, Math.floor(dayHour(Date.parse(hours[0].start), new Date(toEpoch(now)).toISOString()))));

function joinNames(names: PeriodName[], all: Period[]): string {
  const order = all.map((period) => period.name);
  const groups: PeriodName[][] = [];
  names.forEach((name) => {
    const last = groups.at(-1);
    if (last && order.indexOf(last.at(-1)!) === order.indexOf(name) - 1) last.push(name);
    else groups.push([name]);
  });
  return groups.map((group) => group.length === 1 ? group[0] : `${group[0]}到${group.at(-1)}`).join("和");
}
function periodHours(period: Period, hours: Hour[]): Hour[] {
  return hours.filter((hour) => Date.parse(hour.start) >= Date.parse(period.start) && Date.parse(hour.end) <= Date.parse(period.end));
}

/** "阴雨一整天，傍晚雨最大" — the shortest honest description of the whole day. */
export function dayLine(hours: Hour[], readings: HourReadings[], periods: Period[], done = false): string {
  if (!hasWeather(readings)) return "天气预报暂缺";
  const daytime = periods.filter((period) => period.name !== "天亮前" && period.name !== "入夜").flatMap((period) => periodHours(period, hours));
  const known = (daytime.length ? daytime : hours).map(hourRain).filter((state) => state !== "unknown");
  const rainyShare = known.length ? known.filter(wet).length / known.length : 0;
  const thunder = readings.some((reading) => reading.sky.key === "thunder");
  const snow = readings.some((reading) => reading.sky.key === "snow");
  const liquidRain = hours.some(hour => !snowing(hour) && wet(hourRain(hour)));
  const peak = maxRain(hours);
  const wetPeriods = periods.filter((period) => wet(maxRain(periodHours(period, hours))));
  const peakPeriod = RAIN_ORDER.indexOf(peak as RainClass) >= RAIN_ORDER.indexOf("moderate") && wetPeriods.length > 1
    && periods.filter((period) => maxRain(periodHours(period, hours)) === peak).length === 1
    ? periods.find((period) => maxRain(periodHours(period, hours)) === peak) : undefined;
  const peakText = peakPeriod ? `，${peakPeriod.name}${snow && !liquidRain ? "雪量最大" : "雨最大"}` : "";
  const hazardPeriods = periods.filter(period => periodHours(period, hours).some(hour => ["thunder", "sleet"].includes(readings[hours.indexOf(hour)].sky.key) || hour.risks.some(risk => risk.code !== "air-quality")));
  if (hazardPeriods.length) return hazardPeriods.map(period => `${period.name}${period.summary}`).join("，");
  const wetWord = snow ? "雪" : thunder ? "雷雨" : "雨";
  if (hours.some(hour => hourRain(hour) === "unknown") && wetPeriods.length) return `雨情不全，已知时段有${snow ? liquidRain ? "雨雪" : "雪" : "雨"}`;
  if (rainyShare >= 0.7) return `${snow ? liquidRain ? "雨雪" : "下雪" : thunder ? "雷雨" : "阴雨"}一整天${peakText}`;
  const drySky = dominantSky(readings.filter((reading) => !WET_SKIES.includes(reading.sky.key as SkyKey)));
  const dryText: Partial<Record<SkyKey, string>> = { clear: "天气晴好", partly: "晴到少云", cloudy: "多云", overcast: "阴天", fog: "有雾" };
  if (wetPeriods.length) return `${dryText[drySky] ?? "云多"}，${joinNames(wetPeriods.map((period) => period.name), periods)}有${wetWord}${peakText}`;
  return drySky === "overcast" ? done ? "阴了一整天" : "全天阴" : dryText[drySky] ?? "天气平稳";
}

type UpcomingGroup = { window: RecommendedWindow; entries: { window: RecommendedWindow; genre: Genre }[] };
function upcomingWindows(advice: Record<Genre, GenreAdvice>): UpcomingGroup[] {
  const list = GENRES.flatMap(genre => advice[genre].recommendedWindows.filter(window => !rainy(window)).map(window => ({ window, genre })))
    .sort((a, b) => Date.parse(a.window.start) - Date.parse(b.window.start));
  const groups: UpcomingGroup[] = [];
  for (const entry of list) {
    const previous = groups.at(-1);
    if (previous && Date.parse(entry.window.start) < Date.parse(previous.window.end)) {
      previous.entries.push(entry);
      if (Date.parse(entry.window.end) > Date.parse(previous.window.end)) previous.window.end = entry.window.end;
    } else groups.push({ window: { ...entry.window }, entries: [entry] });
  }
  return groups;
}
function firstGenreEntries(group: UpcomingGroup) {
  return GENRES.flatMap(genre => {
    const entry = group.entries.find(item => item.genre === genre);
    return entry ? [entry] : [];
  });
}
/** Share wording only for identical intervals; every genre keeps its own endpoints. */
function groupTiming(group: UpcomingGroup): string {
  const buckets: { window: RecommendedWindow; genres: Genre[] }[] = [];
  for (const { window, genre } of firstGenreEntries(group)) {
    const same = buckets.find(item => Date.parse(item.window.start) === Date.parse(window.start) &&
      Date.parse(item.window.end) === Date.parse(window.end));
    if (same) { if (!same.genres.includes(genre)) same.genres.push(genre); }
    else buckets.push({ window, genres: [genre] });
  }
  return buckets.map(item => `${whenText(item.window)}拍${genreList(item.genres)}`).join("，");
}
const genreList = (genres: Genre[]) => genres.length === 3 ? "风光、人像、街拍" : genres.map((genre) => GENRE_NAMES[genre]).join("和");

export function decideTone(context: Context): Tone {
  const { readings, risks, advice, solar, now } = context;
  if (!hasWeather(readings)) return "unknown";
  if (risks.some((risk) => risk.status !== "past" && risk.code !== "air-quality")) return "poor";
  if (freezingRange(context.hours, now)) return "poor";
  if (eveningOver(solar, now) || (nightNow(context.hours, solar, now) && (solar.sunrise === null || toEpoch(now) >= Date.parse(solar.sunrise)) && !GENRES.some(genre => advice[genre].allWindows.some(window => Date.parse(window.end) > toEpoch(now))))) return "done";
  if (upcomingWindows(advice).length) return "go";
  const current = toEpoch(now);
  if (GENRES.some((genre) => advice[genre].allWindows.some((window) => Date.parse(window.end) > current))) return "maybe";
  return "poor";
}

const fit = (prefix: string, rest: string) => `${prefix}${rest}`.length <= HEADLINE_MAX ? `${prefix}${rest}` : rest.replace(/^[，；]/, "");

function missingRanking(context: Context): string[] {
  if (upcomingWindows(context.advice).length || GENRES.some(genre => context.advice[genre].allWindows.some(window => Date.parse(window.end) > toEpoch(context.now)))) return [];
  const ahead = context.hours.filter(hour => Date.parse(hour.end) > toEpoch(context.now));
  return ([ ["cloudTotal", "云量"], ["windSpeed", "风"], ["precipitation", "降水"], ["weatherCode", "天气类型"] ] as const)
    .filter(([name]) => ahead.some(hour => !present(hour.weather[name]))).map(([, label]) => label);
}

export function headline(tone: Tone, context: Context, line: string): string {
  const { risks, advice } = context;
  if (tone === "unknown") return "今天的天气预报暂时拿不到";
  const risk = risks.find((item) => item.status !== "past" && item.code !== "air-quality");
  if (risk) {
    const span = hourSpan(Date.parse(context.hours[0].start), risk.start, risk.end);
    return risk.code === "thunderstorm" ? `${span}有雷雨，户外拍摄先放一放`
      : risk.code === "heavy-rain" ? `${span}雨势较大，别安排户外拍摄` : `${span}风很大，户外拍摄注意安全`;
  }
  const freeze = freezingRange(context.hours, context.now);
  if (freeze) return `${hourSpan(Date.parse(context.hours[0].start), freeze.start, freeze.end)}有冻雨，路面结冰，户外停拍`;
  if (tone === "done" && !solarTimesKnown(context.solar)) return "当前是夜间，拍摄要靠现场灯光";
  if (tone === "done") return `${line}；天黑了，自然光拍摄告一段落`.length <= HEADLINE_MAX
    ? `${line}；天黑了，自然光拍摄告一段落` : "天黑了，今天的自然光拍摄告一段落";
  const missing = missingRanking(context);
  if (missing.length) {
    const message = `缺${missing.join("、")}预报，排不出时间`;
    return message.length <= HEADLINE_MAX ? message : "缺少关键天气预报，排不出拍摄时间";
  }
  if (tone === "go") {
    const windows = upcomingWindows(advice), first = windows[0].entries[0].window;
    if (snowy(first, context.hours)) return fit(line, "，下雪时拍摄注意防滑保暖");
    if (showery(first, context.hours)) return fit(line, first.status === "current" ? "，带上伞现在能拍" : `，带上伞，${timeLabel(first.start)}前后能拍`);
    const special = ["golden", "blue", "dawn", "afterglow", "morning-blue", "golden-transition"].includes(windowLightKey(first, context.readings, context.hours, context));
    const action = first.status === "current" ? special ? "现在出门正好" : "现在能拍" : `${timeLabel(first.start)}前后${special ? "值得拍" : "能拍"}`;
    const later = windows.flatMap(group => group.entries).find(({ window }) => Date.parse(window.start) > Date.parse(first.start) &&
      ["golden", "blue", "dawn", "afterglow", "morning-blue", "golden-transition"].includes(windowLightKey(window, context.readings, context.hours, context)));
    const base = fit(line, `，${action}`);
    const reminder = later ? `，${timeLabel(later.window.start)}前后留意天色` : "";
    return base.length + reminder.length <= HEADLINE_MAX ? base + reminder : base;
  }
  if (tone === "maybe") return fit(line, "，条件一般，可以挑时间试试");
  return fit(line, "，今天不太适合在户外久拍");
}

function lightPhrase(readings: HourReadings[], hours: Hour[], done = false): string {
  const day = readings.filter((reading) => ["soft", "hard", "low-sun", "mixed"].includes(reading.light.key));
  if (!day.length) return "";
  const counts = new Map<string, number>();
  day.forEach((reading) => counts.set(reading.light.key, (counts.get(reading.light.key) ?? 0) + 1));
  const key = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  if (key === "soft") {
    const clouds = hours.filter((_, index) => readings[index].light.key === "soft").map((hour) => hour.weather.cloudTotal)
      .filter(present).map((metric) => metric.value);
    const thick = clouds.length && clouds.reduce((a, b) => a + b, 0) / clouds.length >= 90;
    return done ? thick ? "今天白天云很厚，是灰白的平光" : "今天白天云比较多，光线柔和、影子淡" : thick ? "云很厚，白天是灰白的平光" : "云比较多，白天光线柔和、影子淡";
  }
  if (done) return key === "mixed" ? "今天白天云时多时少，光线忽明忽暗" : "今天白天阳光充足，光线硬、影子清楚";
  return key === "mixed" ? "云时多时少，白天光线忽明忽暗" : "阳光充足，白天光线硬、影子清楚";
}
function sunsetPhrase(sunset: Opportunity, now: string | number): string {
  if (sunset.status === "unknown" || sunset.level === null) return SUNSET_WORDS.unknown.prospect;
  const words = SUNSET_WORDS[sunset.level];
  const passed = sunset.targetTime !== null && toEpoch(now) >= Date.parse(sunset.targetTime);
  return passed ? words.retrospective : words.prospect;
}
const LIGHT_GLOSS: Record<string, string> = {
  golden: "，那时太阳低、光偏暖", blue: "，那时日落后天色转暗",
  dawn: "，那时清晨太阳在地平线下，天边渐亮", afterglow: "，那时太阳在地平线下，天边还有余光",
  "morning-blue": "，那时日出前天空渐亮", twilight: "，那时晨昏天光偏暗", "golden-transition": "，这段晨昏光线会变化", soft: "，光线柔和均匀",
  hard: "，阳光足、明暗分明", "low-sun": "，阳光斜照、有立体感", mixed: "，云缝里会漏下光来", day: "",
};
export function lead(tone: Tone, context: Context): string {
  const { hours, readings, risks, advice, sunset, now } = context;
  if (tone === "unknown") {
    const events = solarTimesKnown(context.solar);
    return `暂时拿不到天气预报，云、雨、风都没法判断。${events ? "已算出的日出日落或光线时刻仍可查看；" : "太阳时刻暂时算不出来；"}天气部分请稍后刷新。`;
  }
  const first = [lightPhrase(readings, hours, tone === "done" || eveningOver(context.solar, now)), sunsetPhrase(sunset, now)].filter(Boolean).join("，");
  const current = toEpoch(now);
  const ahead = hours.filter((hour) => Date.parse(hour.end) > current);
  const rainAhead = maxRain(ahead.filter((hour) => wet(hourRain(hour))));
  const risk = risks.find((item) => item.status !== "past" && item.code !== "air-quality");
  const freeze = freezingRange(hours, now);
  let action: string;
  if (risk) action = `${HAZARD_WORDS[risk.code].detail}。`;
  else if (freeze) action = `${hourSpan(Date.parse(hours[0].start), freeze.start, freeze.end)}${HAZARD_WORDS.sleet.detail}。`;
  else if (tone === "go") {
    const group = upcomingWindows(advice)[0];
    const entries = firstGenreEntries(group);
    const keys = new Set(entries.map(entry => windowLightKey(entry.window, readings, hours, context)));
    action = `${groupTiming(group)}${keys.size === 1 ? LIGHT_GLOSS[[...keys][0]] : "，各题材时段的光线不同，按各自建议安排"}${entries.some(entry => snowy(entry.window, hours)) ? "，下雪时注意防滑和电池保暖" : entries.some(entry => showery(entry.window, hours)) ? "，有降雨可能，带好伞" : ""}。`;
  } else if (tone === "done") action = ahead.some((hour) => wet(hourRain(hour)) && snowing(hour))
    ? "夜里还会下雪，拍摄注意防滑和电池保暖。"
    : wet(rainAhead) ? `夜里还有${RAIN_NAMES[rainAhead as RainClass]}，拍摄先找有遮挡的地方。`
    : "夜里可借路灯或橱窗光照亮主体，避开逆光站位。";
  else if (missingRanking(context).length) action = solarTimesKnown(context.solar)
    ? "已算出的光线时刻仍可查看。" : "已知天气仍可查看。";
  else if (tone === "maybe") action = wet(rainAhead) ? "接下来还有雨，想拍就挑雨小的时候，找有遮挡的地方拍近景和雨天的细节。"
    : "今天剩下的时间条件一般，可以挑个时段试试。";
  else action = wet(rainAhead) ? "想拍可以找有遮挡的地方，拍近景和雨天的细节。" : "想拍可以找有遮挡的地方，拍近景和细节。";
  const air = risks.filter(item => item.status !== "past" && item.code === "air-quality")
    .map(item => `${hourSpan(Date.parse(hours[0].start), item.start, item.end)}${HAZARD_WORDS["air-quality"].detail}。`).join("");
  return `${first ? `${first}。` : ""}${action}${air}`;
}

/** Snow is named as snow; its amount is melted water, so the rain classes stay out of it. */
function fall(hour: Hour, state: RainState) { return snowing(hour) ? "雪" : RAIN_NAMES[state as RainClass]; }
function rainChange(hours: Hour[], start: number): { start: string; text: string } | null {
  const event = (index: number, text: string) => ({ start: hours[index].start, text });
  if (start >= 24) return null;
  const states = hours.map(hourRain);
  const now = states[start];
  if (now === "unknown") return null;
  for (let index = start + 1; index < 24; index += 1) {
    const next = states[index];
    if (next === "unknown") return wet(now) ? event(index, `${index} 时起缺降水预报，之后的雨雪变化暂时判断不了`) : null;
    const amount = hours[index].weather.precipitation.value ?? 0;
    if (!wet(now) && wet(next)) return event(index, snowing(hours[index]) ? `${index} 时起开始下雪` : `${index} 时起开始下${RAIN_NAMES[next as RainClass]}（${rainAmountText(amount)}）`);
    if (wet(now) && !wet(next)) return event(index, `${index} 时前后${snowing(hours[start]) ? "雪" : "雨"}停`);
    if (wet(now) && wet(next) && snowing(hours[start]) !== snowing(hours[index])) {
      return event(index, `${index} 时前后${snowing(hours[start]) ? "雪转雨" : "雨转雪"}`);
    }
    if (wet(now) && !snowing(hours[index]) && RAIN_ORDER.indexOf(next) > RAIN_ORDER.indexOf(now) && RAIN_ORDER.indexOf(next) >= RAIN_ORDER.indexOf("moderate")) {
      return event(index, `${index} 时前后雨变大，转${RAIN_NAMES[next as RainClass]}（${rainAmountText(amount)}）`);
    }
  }
  return wet(now) ? event(start, `${fall(hours[start], now)}会一直下到午夜，出门${snowing(hours[start]) ? "注意防滑" : "带伞"}`) : null;
}

export function nextUp(tone: Tone, context: Context): string[] {
  const { hours, risks, advice, sunset, now } = context;
  if (tone === "unknown") return ["天气预报恢复后，这里会列出接下来要留意的变化。"];
  const items = risks.filter((risk) => risk.status !== "past").slice(0, 2).map((risk) => risk.text);
  const freeze = freezingRange(hours, now);
  if (freeze) items.push(`${hourSpan(Date.parse(hours[0].start), freeze.start, freeze.end)}${HAZARD_WORDS.sleet.detail}。`);
  const rain = freeze ? null : rainChange(hours, nowIndex(hours, now));
  if (rain && !risks.some(risk => risk.code === "heavy-rain" && Date.parse(risk.start) <= Date.parse(rain.start) &&
    Date.parse(rain.start) < Date.parse(risk.end))) items.push(rain.text);
  const window = upcomingWindows(advice)[0];
  if (window) items.push(`${groupTiming(window)}`);
  if (sunset.targetTime && toEpoch(now) < Date.parse(sunset.targetTime)) {
    items.push(`日落 ${timeLabel(sunset.targetTime)}，${sunset.level === null ? SUNSET_WORDS.unknown.prospect : SUNSET_WORDS[sunset.level].prospect}`);
  }
  if (items.length) return items.slice(0, 3);
  const ahead = hours.filter((hour) => Date.parse(hour.end) > toEpoch(now));
  if (!ahead.length) return ["今天的逐小时预报时段已结束。"];
  if (ahead.some((hour) => hourRain(hour) === "unknown")) return ["接下来没有需要特别留意的变化（部分小时缺降水预报）。"];
  return [ahead.every((hour) => hourRain(hour) === "none")
    ? "剩余时段预报雨量为 0，暂未见明显变化。"
    : maxRain(ahead) === "trace" ? "剩余时段有零星雨点，暂未见明显变化。" : "接下来没有需要特别留意的变化。"];
}

const FIELD_NAMES: [keyof Hour["weather"], string][] = [
  ["temperature", "气温"], ["precipitation", "降水"], ["cloudTotal", "云量"], ["windSpeed", "风"], ["visibility", "能见度"], ["weatherCode", "天气类型"],
];
/** One plain sentence about what is missing or weaker than usual; null when nothing is. */
export function dataNote(context: Context): string | null {
  const { hours, sources, now } = context;
  const status = (id: string) => sources.find((source) => source.id === id)?.status;
  const notes: string[] = [];
  if (status(SOURCE_IDS.weather) === "failed") notes.push("主要天气预报暂时连不上");
  const crosscheck = status(SOURCE_IDS.crosscheck);
  if (crosscheck === "failed" || crosscheck === "disabled") notes.push("这份预报只来自一家天气模型，没有经过第二家核对");
  const air = status(SOURCE_IDS.air);
  if (air === "failed" || air === "disabled") notes.push("空气质量预报暂时拿不到");
  const sunset = status(SUNSET_SOURCE_ID);
  if (sunset === "failed" || sunset === "disabled") notes.push("日落方向的云场预报暂时拿不到，晚霞暂时判断不了");
  if (sources.some((source) => source.status === "stale")) notes.push("部分数据是早些时候存下的");
  const current = toEpoch(now);
  const ahead = hours.filter((hour) => Date.parse(hour.end) > current);
  const missing = FIELD_NAMES.filter(([name]) => ahead.some((hour) => !present(hour.weather[name] as Hour["weather"]["temperature"])))
    .map(([, label]) => label);
  if (missing.length && status(SOURCE_IDS.weather) !== "failed") notes.push(`接下来有几个小时缺${missing.join("、")}预报`);
  return notes.length ? notes.join("；") : null;
}
