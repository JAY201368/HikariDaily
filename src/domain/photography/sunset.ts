import { SUNSET_WORDS } from "../../content/interpret/sunset-words";
import type { NormalizedDay } from "../normalization";
import { SOURCE_IDS } from "../normalization";
import { calculateSolarPosition } from "../solar";
import { toEpoch } from "../time";
import { HOUR_MS } from "../schemas";
import type { Opportunity, SolarEvents } from "../types";
import { hasConflict, unique } from "./shared";
import { createSunsetSamplingPlan, SUNSET_MODEL_VERSION, SUNSET_SOURCE_ID, SunsetCloudFieldSchema } from "./sunset-input";
import type { SunsetCloudField, SunsetCloudHour, SunsetSamplePoint } from "./sunset-input";

export const SUNSET_LIMITATION = "按约9公里网格和小时云场估计受光；云量不等同云的光学厚度，低、中、高云分别用1.5、5、10公里代表高度。";
const SPATIAL_LIMITATION = "检查日落方向前方400公里、左右各25°的云场；未计算山体、建筑遮挡和更细的云缝。";
const EARTH_KM = 6371;
const MAX_AGE_MS = 3 * HOUR_MS;
const WINDOW_OFFSETS_MS = [-30, -15, 0, 15, 30].map(minutes => minutes * 60_000);
const layers = [
  { field: "cloudLow", height: 1.5, bottom: 0, top: 3, weight: 0.55 },
  { field: "cloudMid", height: 5, bottom: 3, top: 8, weight: 1 },
  { field: "cloudHigh", height: 10, bottom: 8, top: 15, weight: 1 },
] as const;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const radians = (value: number) => value * Math.PI / 180;
const sameCoordinate = (a: number, b: number) => Math.abs(a - b) < 0.000_001;
type CompleteCloudHour = SunsetCloudHour & { cloudLow: number; cloudMid: number; cloudHigh: number };
type Sample = { point: SunsetSamplePoint; hour: CompleteCloudHour };

function hourAt(point: SunsetSamplePoint, instant: number) {
  const start = Math.floor(instant / HOUR_MS) * HOUR_MS;
  return point.hours.find(hour => Date.parse(hour.time) === start);
}
function hasClouds(hour: SunsetCloudHour | undefined): hour is CompleteCloudHour {
  return hour !== undefined && hour.cloudLow !== null && hour.cloudMid !== null && hour.cloudHigh !== null;
}
function sourceMatches(field: SunsetCloudField, day: NormalizedDay, sunset: number) {
  const { target, source } = field;
  return field.modelVersion === SUNSET_MODEL_VERSION && source.id === SUNSET_SOURCE_ID && source.model === "ecmwf_ifs" && source.kind === "forecast" &&
    target.locationId === day.target.locationId && target.localDate === day.target.localDate &&
    target.latitude === day.target.latitude && target.longitude === day.target.longitude &&
    field.sunsetTime !== null && Date.parse(field.sunsetTime) === sunset;
}
function matchesPlan(field: SunsetCloudField, sunsetTime: string) {
  const plan = createSunsetSamplingPlan(field.target, sunsetTime);
  return plan.length === 16 && field.points.length === plan.length && plan.every(expected =>
    field.points.some(point => point.distanceKm === expected.distanceKm && sameCoordinate(point.bearing, expected.bearing) &&
      sameCoordinate(point.latitude, expected.latitude) && sameCoordinate(point.longitude, expected.longitude) && point.grid !== null));
}

/** Samples of one layer are correlated: maximum obstruction avoids a sampling-density penalty. */
function openness(samples: Sample[], rayHeight: (distanceKm: number) => number) {
  const blocked = layers.map(() => 0);
  for (const { point, hour } of samples) {
    const height = rayHeight(point.distanceKm);
    if (height < 0) return 0;
    layers.forEach((layer, index) => {
      if (height >= layer.bottom && height < layer.top) blocked[index] = Math.max(blocked[index], hour[layer.field] / 100);
    });
  }
  return blocked.reduce((open, fraction) => open * (1 - fraction), 1);
}
function cloudSuitability(fraction: number) {
  return Math.min(1, fraction / 0.3) * (1 - 0.45 * clamp((fraction - 0.75) / 0.25));
}
function localAir(hour: SunsetCloudHour) {
  const visibility = Math.min(1, hour.visibility! / 20_000);
  const rain = hour.precipitation! >= 1 ? 0.15 : hour.precipitation! > 0.5 ? 0.4 : hour.precipitation! > 0.1 ? 0.75 : 1;
  return visibility * rain;
}

/** Coarse spherical-Earth light paths; coefficients describe conditions, never occurrence probability. */
function assessFrame(samples: Sample[], instant: number) {
  const center = samples.find(sample => sample.point.distanceKm === 0)!;
  const qualities: number[] = [];
  let maximumCarrier = 0;
  let bestSunOpen = 0;
  let bestViewOpen = 0;
  let bestQuality = 0;
  const localAltitude = calculateSolarPosition(instant, center.point).altitude!;
  const colorWindow = localAltitude > 1 ? clamp(1 - (localAltitude - 1) / 6)
    : localAltitude < -3 ? clamp(1 - (-localAltitude - 3) / 4) : 1;
  for (const receiver of samples) {
    const distance = receiver.point.distanceKm;
    const radial = samples.filter(sample => sample.point.distanceKm === 0 || sameCoordinate(sample.point.bearing, receiver.point.bearing));
    const solarAltitude = calculateSolarPosition(instant, receiver.point).altitude!;
    for (const layer of layers) {
      const fraction = receiver.hour[layer.field] / 100;
      if (distance > 0 && (EARTH_KM + layer.height) * Math.cos(distance / EARTH_KM) <= EARTH_KM) continue;
      const horizonDip = Math.acos(EARTH_KM / (EARTH_KM + layer.height)) * 180 / Math.PI;
      const sunVisible = solarAltitude + horizonDip > 0;
      const sunOpen = sunVisible ? openness(radial.filter(sample => sample.point.distanceKm > distance), nextDistance => {
        const gap = nextDistance - distance;
        return layer.height + gap * Math.tan(radians(solarAltitude)) + gap * gap / (2 * EARTH_KM);
      }) : 0;
      const viewOpen = distance === 0 ? layers.filter(other => other.height < layer.height)
        .reduce((open, other) => open * (1 - center.hour[other.field] / 100), 1)
        : openness(radial.filter(sample => sample.point.distanceKm < distance), previousDistance =>
          layer.height * previousDistance / distance - previousDistance * (distance - previousDistance) / (2 * EARTH_KM));
      const quality = cloudSuitability(fraction) * sunOpen * viewOpen * layer.weight * localAir(center.hour) * colorWindow;
      maximumCarrier = Math.max(maximumCarrier, fraction * layer.weight);
      qualities.push(quality);
      if (quality > bestQuality) { bestQuality = quality; bestSunOpen = sunOpen; bestViewOpen = viewOpen; }
    }
  }
  qualities.sort((a, b) => b - a);
  const strongest = qualities.slice(0, 3);
  const quality = 0.8 * (strongest[0] ?? 0) + 0.2 * strongest.reduce((sum, value) => sum + value, 0) / Math.max(1, strongest.length);
  return { quality, maximumCarrier, sunOpen: bestSunOpen, viewOpen: bestViewOpen };
}

export function assessSunsetOpportunity(day: NormalizedDay, solar: SolarEvents, now: string | number, input?: SunsetCloudField): Opportunity {
  const current = toEpoch(now);
  const targetTime = solar.sunset;
  const passed = targetTime !== null && current >= Date.parse(targetTime);
  const limitations = [SUNSET_LIMITATION, SPATIAL_LIMITATION,
    ...(passed ? ["今天的日落已经过去，这里保留当时的云场预报。"] : [])];
  const unknown = (reason: string): Opportunity => ({ status: "unknown", level: null, confidence: null,
    label: SUNSET_WORDS.unknown.label, targetTime, reasons: [reason], limitations,
    sourceIds: input?.source?.id === SUNSET_SOURCE_ID ? [SUNSET_SOURCE_ID] : [] });
  if (!targetTime || !Number.isFinite(Date.parse(targetTime))) return unknown("今天的日落时间算不出来。");
  const parsed = SunsetCloudFieldSchema.safeParse(input);
  if (!parsed.success) return unknown("日落方向的云场数据没有取得或不完整，暂时判断不了。");
  const field = parsed.data;
  const sunset = Date.parse(targetTime);
  if (!sourceMatches(field, day, sunset) || !matchesPlan(field, targetTime)) return unknown("云场地点、时刻或采样范围没有匹配当前日落，暂时判断不了。");
  const source = field.source;
  const fetchedAt = source.fetchedAt === null ? NaN : Date.parse(source.fetchedAt);
  const instants = WINDOW_OFFSETS_MS.map(offset => sunset + offset);
  const from = Math.floor(instants[0] / HOUR_MS) * HOUR_MS;
  const to = Math.floor(instants.at(-1)! / HOUR_MS) * HOUR_MS + HOUR_MS;
  if (!["ok", "stale"].includes(source.status) || !Number.isFinite(fetchedAt) || fetchedAt > current || current - fetchedAt > MAX_AGE_MS ||
    source.validFrom === null || source.validTo === null || Date.parse(source.validFrom) > from || Date.parse(source.validTo) < to) {
    return unknown("日落方向的云场预报太旧或没有覆盖日落前后，暂时判断不了。");
  }
  const frames: ReturnType<typeof assessFrame>[] = [];
  for (const instant of instants) {
    const samples: Sample[] = [];
    for (const point of field.points) {
      const hour = hourAt(point, instant);
      if (!hasClouds(hour) || point.distanceKm === 0 && (hour.visibility === null || hour.precipitation === null)) {
        return unknown("日落前后缺少分层云场、本地能见度或降水，暂时判断不了。");
      }
      samples.push({ point, hour });
    }
    frames.push(assessFrame(samples, instant));
  }
  const best = frames.reduce((chosen, frame) => frame.quality > chosen.quality ? frame : chosen);
  let level: NonNullable<Opportunity["level"]> = best.quality < 0.15 ? 1 : best.quality < 0.35 ? 2 : best.quality < 0.55 ? 3 : best.quality < 0.75 ? 4 : 5;
  const center = field.points.find(point => point.distanceKm === 0)!;
  const local = hourAt(center, sunset)!;
  if (best.maximumCarrier < 0.1 || local.cloudLow! >= 80 || local.precipitation! >= 1) level = Math.min(level, 2) as typeof level;
  const sourceIds: string[] = [SUNSET_SOURCE_ID];
  const weatherHour = day.hours.find(hour => Date.parse(hour.start) <= sunset && sunset < Date.parse(hour.end));
  const gfsSource = day.sources.find(item => item.id === SOURCE_IDS.weather);
  const gfsFresh = gfsSource && ["ok", "stale"].includes(gfsSource.status) && gfsSource.fetchedAt !== null &&
    Date.parse(gfsSource.fetchedAt) <= current && current - Date.parse(gfsSource.fetchedAt) <= MAX_AGE_MS;
  const gfs = weatherHour?.primaryWeather;
  const directConflict = gfsFresh && gfs !== undefined && ((local.cloudTotal !== null && gfs.cloudTotal.value !== null && Math.abs(local.cloudTotal - gfs.cloudTotal.value) >= 30) ||
    (gfs.precipitation.value !== null && ((local.precipitation! >= 1 && gfs.precipitation.value <= 0.1) || (gfs.precipitation.value >= 1 && local.precipitation! <= 0.1))));
  const existingConflict = weatherHour !== undefined && [weatherHour.weather.cloudTotal, weatherHour.weather.precipitation].some(hasConflict);
  const conflict = Boolean(directConflict || existingConflict);
  const stale = source.status === "stale";
  if (conflict || stale) level = Math.min(level, 3) as typeof level;
  if (directConflict) sourceIds.push(SOURCE_IDS.weather);
  if (existingConflict) sourceIds.push(...[weatherHour!.weather.cloudTotal, weatherHour!.weather.precipitation].flatMap(metric =>
    [...metric.sourceIds, ...(metric.alternatives ?? []).map(alternative => alternative.sourceId)]));
  const words = SUNSET_WORDS[level];
  const bearing = Math.round(createSunsetSamplingPlan(field.target, targetTime)[0].bearing);
  const cause = best.maximumCarrier < 0.1 ? "日落方向缺少可着色的云，" : local.precipitation! >= 1 ? "日落前后有雨，"
    : local.cloudLow! >= 80 ? "本地低云遮挡较多，" : best.sunOpen < 0.35 ? "日落方向的光路遮挡较多，"
    : best.viewOpen < 0.35 ? "前方云层挡住了一部分受光云，" : level >= 4 ? "日落方向有云，夕阳有机会照到它们，" : "";
  const reasons = [passed ? `${words.retrospective}。` : `${cause}${words.prospect}。`,
    `按日落方位${bearing}°，检查本地和前方25–400公里、左右各25°的16个云场采样点，并比较日落前后半小时的受光。`,
    best.maximumCarrier < 0.1 ? "可见方向缺少能被夕阳染色的云。" : "可见方向有可被夕阳染色的云，云层是否受光同时取决于远处遮挡。",
    best.sunOpen < 0.35 ? "夕阳来向的云层遮挡较多，光不容易照到可见云层。" : "日落方向仍有让夕阳照到云层的光路。",
    best.viewOpen < 0.35 ? "前方较低的云层会遮住一部分受光云层。" : "较低云层对可见受光云层的遮挡较少。",
    `本地能见度约${Math.round(local.visibility! / 1000)}公里，日落所在小时降水约${Math.round(local.precipitation! * 10) / 10}毫米。`,
    ...(conflict ? ["天气预报对日落时的总云量或降水存在明显分歧，判断按较低把握处理。"] : []),
    ...(stale ? ["云场来自允许使用的旧缓存，原始获取时间没有更新，判断按较低把握处理。"] : []),
  ];
  return { status: "assessed", level, label: words.label, targetTime, confidence: conflict || stale ? "low" : "medium",
    reasons, limitations, sourceIds: unique(sourceIds) };
}
