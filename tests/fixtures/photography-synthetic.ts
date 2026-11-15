import { createSnapshot, normalizeSources, SOURCE_IDS } from "../../src/domain/normalization";
import type { SourceTarget } from "../../src/domain/normalization";
import type { Metric, LightAssessment, Source, WeatherMetricName } from "../../src/domain/types";
import { syntheticBriefing } from "./domain-synthetic";
import { calculateSolarEvents } from "../../src/domain/solar";
import { createDayHours } from "../../src/domain/time";
import { createSunsetSamplingPlan, SUNSET_MODEL_VERSION, SUNSET_SOURCE_ID } from "../../src/domain/photography/sunset-input";
import type { SunsetCloudField } from "../../src/domain/photography/sunset-input";

/** Artificial rule inputs only, not observed weather or a production fallback. */
export const PHOTOGRAPHY_FIXTURE_NOTICE = "人工合成规则fixture；不验证真实气象、许可、覆盖或晚霞准确率。";
export const PHOTO_DATE = "2026-10-23";
export const PHOTO_NOW = "2026-10-23T12:00:00+08:00";
export const photoLocation = { ...syntheticBriefing().location, name: "人工合成上海规则样例" };
export const photoSolar = calculateSolarEvents(PHOTO_DATE, photoLocation);
export function photoMetric<T extends number>(value: T | null, sourceId: string = SOURCE_IDS.weather): Metric<T> {
  return { value, state: value === null ? "missing" : "ok", sourceIds: value === null ? [] : [sourceId], notes: [] };
}
export function photoDay(now = PHOTO_NOW) {
  const target = { locationId: photoLocation.id, localDate: PHOTO_DATE, latitude: photoLocation.latitude, longitude: photoLocation.longitude };
  const source: Source = { ...syntheticBriefing().sources[0], id: SOURCE_IDS.weather, status: "ok", fetchedAt: now,
    validFrom: `${PHOTO_DATE}T00:00:00+08:00`, validTo: "2026-10-24T00:00:00+08:00" };
  const snapshot = createSnapshot(source, "artificial-rule-v1", target, PHOTOGRAPHY_FIXTURE_NOTICE);
  const air = createSnapshot({ ...source, id: SOURCE_IDS.air }, "artificial-air-v1", target, PHOTOGRAPHY_FIXTURE_NOTICE);
  const values: Partial<Record<WeatherMetricName, number>> = { temperature: 20, humidity: 50, weatherCode: 1,
    precipitation: 0, precipitationProbability: 10, windSpeed: 2, windGust: 3, cloudTotal: 20,
    cloudLow: 10, cloudMid: 50, cloudHigh: 20, visibility: 25000 };
  snapshot.hours.forEach((hour) => {
    Object.entries(values).forEach(([name, value]) => { Object.assign(hour.weather, { [name]: photoMetric(value) }); });
  });
  air.hours.forEach((hour) => { hour.air.referenceAqi = photoMetric(30, SOURCE_IDS.air); });
  return normalizeSources(target, [snapshot, air]);
}
/** Independent synthetic IFS input: cloud over the observer, clear incoming light paths. */
export function photoSunsetField(now = PHOTO_NOW, target: SourceTarget = photoDay(now).target): SunsetCloudField {
  const sunsetTime = calculateSolarEvents(target.localDate, target).sunset;
  return { modelVersion: SUNSET_MODEL_VERSION, target: { ...target }, sunsetTime,
    source: { ...photoDay(now).sources[0], id: SUNSET_SOURCE_ID, provider: "人工合成云场",
      dataset: "人工合成ECMWF云场", model: "ecmwf_ifs", nativeResolution: "人工合成9km云场，非真实预报" },
    points: createSunsetSamplingPlan(target, sunsetTime).map(point => ({ ...point,
      grid: { latitude: point.latitude, longitude: point.longitude },
      hours: createDayHours(target.localDate).map(hour => ({ time: hour.start,
        cloudTotal: point.distanceKm === 0 ? 20 : 0, cloudLow: point.distanceKm === 0 ? 10 : 0,
        cloudMid: point.distanceKm === 0 ? 50 : 0, cloudHigh: point.distanceKm === 0 ? 20 : 0,
        visibility: 25_000, precipitation: 0, humidity: 50 })),
    })), notes: [PHOTOGRAPHY_FIXTURE_NOTICE] };
}
export function photoLight(phase: LightAssessment["phase"] = "day", character: LightAssessment["character"] = "direct", altitude = 40): LightAssessment {
  return { phase, character, altitude, azimuth: 180, description: "人工合成光照", reasons: [], limitations: [], sourceIds: [SOURCE_IDS.weather] };
}
