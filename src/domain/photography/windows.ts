import type { NormalizedDay, NormalizedHour } from "../normalization";
import type { Genre, LightAssessment, Location, RecommendedWindow, RiskNote, SolarEvents } from "../types";
import { shanghaiIso, toEpoch, windowStatus } from "../time";
import { calculateSolarPosition } from "../solar";
import { windLevel } from "../../content/interpret/levels";
import { HAZARD_WORDS } from "../../content/interpret/hazard-words";
import { assessLight } from "./light";
import { assessHourRisks, excludesOutdoor } from "./risks";
import { freezingRain, metricLimitations, present, unique } from "./shared";

export type Components = { D: number; W: number; V: number | null; L: number };
/** Internal score only; never included in the public RecommendedWindow. */
export type ScoredWindow = RecommendedWindow & { score: number; components: Components; eligible: boolean };
export const GENRES: Genre[] = ["landscape", "portrait", "street"];

/** P6.3 ordered predicates are intentionally explicit, including unknown probability. */
export function scoreConditions(genre: Genre, hour: NormalizedHour, light: LightAssessment):
  { score: number; components: Components; reasonCodes: string[]; reasons: string[] } | null {
  const w = hour.weather;
  if ([w.cloudTotal, w.windSpeed, w.precipitation, w.weatherCode].some((metric) => !present(metric)) ||
    (genre === "landscape" && !present(w.visibility)) || light.altitude === null || light.altitude < -6 ||
    light.phase === "night" || light.phase === "unknown") return null;
  const probability = present(w.precipitationProbability) ? w.precipitationProbability.value : null;
  const rain = w.precipitation.value!;
  const freeze = freezingRain(w.weatherCode);
  const D = freeze ? 0 : rain <= 0.1 && probability !== null && probability < 40 ? 2
    : rain < 1 && (probability === null || probability < 70) ? 1 : 0;
  const average = w.windSpeed.value!;
  const gust = present(w.windGust) ? w.windGust.value : null;
  const wAvg = average <= 3 ? 2 : average <= 6 ? 1 : 0;
  const wGust = gust === null || gust <= 7.9 ? 2 : gust <= 10.7 ? 1 : 0;
  const W = Math.min(wAvg, wGust);
  const averageLevel = windLevel(average), gustLevel = gust === null ? null : windLevel(gust);
  const strongerGust = gustLevel !== null && gustLevel > 1 && gustLevel > averageLevel;
  const V = present(w.visibility) ? w.visibility.value >= 20000 ? 2 : w.visibility.value >= 10000 ? 1 : 0 : null;
  const golden = light.phase === "golden" && light.altitude >= 0 && w.cloudTotal.value! < 75;
  const blue = light.phase === "blue";
  const day = light.phase === "day";
  const lowDirect = light.character === "direct" && light.altitude <= 30;
  const strongDirect = light.character === "direct" && light.altitude > 30;
  const L = genre === "landscape" ? (w.cloudTotal.value! < 75 && (blue || light.phase === "golden") ? 2 : day && light.character === "diffuse" && w.cloudTotal.value! >= 90 ? 0 : 1)
    : genre === "portrait" ? golden || (day && light.character === "diffuse") ? 2
      : blue || lowDirect || light.character === "variable" ? 1 : 0
    : golden || (day && (strongDirect || light.character === "variable")) ? 2 : 1;
  const score = genre === "landscape" ? 40 * L / 2 + 30 * V! / 2 + 15 * D / 2 + 15 * W / 2
    : genre === "portrait" ? 50 * L / 2 + 25 * D / 2 + 25 * W / 2
    : 60 * L / 2 + 30 * D / 2 + 10 * W / 2;
  const lightReason = genre === "landscape" ? L === 2 ? "太阳低、天色有变化，远景层次分明。" : L === 0 ? "厚云遮住阳光，白天是灰白的平光，远景缺少明暗层次。" : "自然光够用，可以拍远景和地形。"
    : genre === "portrait" ? light.altitude < 0 ? "太阳在地平线下，只有晨昏余光，人物要靠天光或补光。" : L === 2 ? light.phase === "golden" ? "暖光从侧面照来，人物轮廓好看。" : "柔光均匀，人物肤色干净。"
      : L === 1 ? "光线一般，要调整人物朝向，控制脸上的明暗。" : "阳光太硬，人物脸上会有浓重的影子，可以找阴影处拍。"
    : L === 2 ? "光影对比强，适合拍街头的明暗和影子。" : "光线平和，可以多留意街头的色彩和人物关系。";
  const snow = present(w.weatherCode) && [71, 73, 75, 77, 85, 86].includes(w.weatherCode.value);
  const rainReason = freeze ? `${HAZARD_WORDS.sleet.detail}。` : snow ? "正在下雪，注意防滑和电池保暖。" : rain > 0 ? D === 0 ? "会下雨，拍摄受影响。" : "有雨，带好伞并做好防水。"
    : probability === null ? "预报雨量为 0，没有下雨概率的预报。" : probability >= 40 ? `有 ${Math.round(probability)}% 可能下雨，带好伞。`
    : probability >= 20 ? `下雨可能不大（${Math.round(probability)}%）。` : "基本不会下雨。";
  return { score, components: { D, W, V, L },
    reasonCodes: [`${genre}:L${L}`, `phase:${light.phase}`, `D${D}`, `W${W}`,
      ...(genre === "landscape" ? [`V${V}`] : [])].sort(),
    reasons: [...(freeze ? [] : [lightReason]), rainReason,
      `平均风 ${averageLevel} 级${strongerGust ? `，阵风 ${gustLevel} 级` : ""}，${W === 2 ? gust !== null && gust > 5.4 ? "脚架和反光板要压稳" : "拍摄基本不受影响" : W === 1 ? "头发衣角会动，脚架和反光板要压稳" : "器材要压稳，避开空旷处"}。`,
      ...(!freeze && genre === "landscape" ? [V === 2 ? "远处很通透，远山和天际线清楚。" : V === 1 ? "远景还算清楚。" : "远处发灰，可以改拍近景或雾里的层次。"] : [])] };
}

function windowLimitations(hour: NormalizedHour, risks: RiskNote[]) {
  return unique([...metricLimitations([...Object.values(hour.weather), ...Object.values(hour.air)]),
    ...(!present(hour.weather.precipitationProbability) ? ["没有下雨概率的预报。"] : []),
    ...(!present(hour.air.referenceAqi) ? ["这段时间没有空气质量预报。"] : []),
    ...risks.map((risk) => risk.message)]);
}

/** Find geometric altitude=0 inside an hour, independently of refracted sunrise/sunset.
 * Bisection stops with a <=1-second bracket; no SolarEvents fields are added. */
function horizonCut(start: number, end: number, location: Location): number[] {
  const altitude = (time: number) => calculateSolarPosition(time, location).altitude;
  const first = altitude(start), last = altitude(end);
  if (first === null || last === null || first * last >= 0) return [];
  let low = start, high = end;
  for (let iteration = 0; iteration < 32 && high - low > 1000; iteration += 1) {
    const mid = (low + high) / 2, value = altitude(mid);
    if (value === null) return [];
    if ((value >= 0) === (first >= 0)) low = mid;
    else high = mid;
  }
  return [Math.round((low + high) / 2)];
}

/** Retain even short slices here: adjacent blue slices can form a useful window. */
export function createScoredSlices(day: NormalizedDay, solar: SolarEvents, location: Location,
  genre: Genre, now: string | number): ScoredWindow[] {
  toEpoch(now);
  const boundaries = [solar.morningBlue, solar.morningGolden, solar.eveningGolden, solar.eveningBlue]
    .flatMap((range) => range ? [Date.parse(range.start), Date.parse(range.end)] : []);
  return day.hours.flatMap((hour) => {
    const risks = assessHourRisks(hour);
    if (excludesOutdoor(risks)) return [];
    const start = Date.parse(hour.start), end = Date.parse(hour.end);
    const cuts = unique([start, ...horizonCut(start, end, location), ...boundaries.filter((epoch) => epoch > start && epoch < end), end]).sort((a, b) => a - b);
    return cuts.slice(0, -1).flatMap((from, index) => {
      const to = cuts[index + 1];
      const light = assessLight((from + to) / 2, location, hour.weather.cloudTotal, solar);
      const scoring = scoreConditions(genre, hour, light);
      if (!scoring) return [];
      return [{ start: shanghaiIso(from), end: shanghaiIso(to), status: windowStatus(from, to, now),
        score: scoring.score, components: scoring.components,
        eligible: scoring.components.L >= 1 && !freezingRain(hour.weather.weatherCode) &&
          (!present(hour.weather.windGust) || hour.weather.windGust.value <= 10.7), reasons: scoring.reasons, reasonCodes: scoring.reasonCodes,
        limitations: windowLimitations(hour, risks),
        sourceIds: unique([...(genre === "landscape" ? [hour.weather.visibility] : []), hour.weather.cloudTotal,
          hour.weather.precipitation, hour.weather.precipitationProbability, hour.weather.windSpeed,
          hour.weather.windGust, hour.weather.weatherCode, hour.air.referenceAqi].flatMap((metric) => metric.sourceIds)) }];
    });
  });
}

/** P6.3: exact reason SET equality; worst slice score survives merging. */
export function mergeScoredWindows(slices: ScoredWindow[], now: string | number): ScoredWindow[] {
  const merged: ScoredWindow[] = [];
  for (const slice of [...slices].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))) {
    const previous = merged.at(-1);
    const codes = unique(slice.reasonCodes).sort();
    if (previous && previous.eligible === slice.eligible && Date.parse(previous.end) === Date.parse(slice.start) &&
      Date.parse(slice.end) - Date.parse(previous.start) <= 2 * 3600000 &&
      JSON.stringify(unique(previous.reasonCodes).sort()) === JSON.stringify(codes)) {
      previous.end = slice.end;
      previous.score = Math.min(previous.score, slice.score);
      previous.components = { D: Math.min(previous.components.D, slice.components.D), W: Math.min(previous.components.W, slice.components.W),
        L: Math.min(previous.components.L, slice.components.L), V: previous.components.V === null || slice.components.V === null ? null : Math.min(previous.components.V, slice.components.V) };
      previous.status = windowStatus(previous.start, previous.end, now);
      previous.reasons = unique([...previous.reasons, ...slice.reasons]);
      previous.limitations = unique([...previous.limitations, ...slice.limitations]);
      previous.sourceIds = unique([...previous.sourceIds, ...slice.sourceIds]);
    } else merged.push({ ...slice, reasonCodes: codes, status: windowStatus(slice.start, slice.end, now),
      reasons: [...slice.reasons], limitations: [...slice.limitations], sourceIds: [...slice.sourceIds] });
  }
  return merged;
}

export function selectRecommendedWindows(windows: ScoredWindow[], now: string | number): ScoredWindow[] {
  const current = toEpoch(now);
  const eligible = windows.filter((window) => window.eligible && window.components.L >= 1 && window.score >= 50 && Date.parse(window.end) > current)
    .map((window) => ({ ...window, start: shanghaiIso(Math.max(Date.parse(window.start), current)),
      status: windowStatus(window.start, window.end, now) as RecommendedWindow["status"] }))
    .filter((window) => Date.parse(window.end) - Date.parse(window.start) >= 15 * 60000)
    .sort((a, b) => b.score - a.score || Date.parse(a.start) - Date.parse(b.start));
  const selected: ScoredWindow[] = [];
  for (const window of eligible) {
    if (selected.every((other) => Date.parse(window.end) <= Date.parse(other.start) || Date.parse(window.start) >= Date.parse(other.end))) {
      selected.push(window);
      if (selected.length === 3) break;
    }
  }
  return selected;
}
export function publicWindow(window: ScoredWindow): RecommendedWindow {
  return { start: window.start, end: window.end, status: window.status, reasons: window.reasons,
    reasonCodes: window.reasonCodes, limitations: window.limitations, sourceIds: window.sourceIds };
}
