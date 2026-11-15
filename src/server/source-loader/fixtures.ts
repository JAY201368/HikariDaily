import "server-only";
import { ADAPTER_VERSIONS, createSnapshot, finishSnapshot } from "../../domain/normalization/snapshot";
import type { SourceSnapshot, SourceTarget } from "../../domain/normalization/snapshot";
import { GFS_SOURCE } from "../providers/open-meteo";
import { MET_SOURCE } from "../providers/met-norway";
import { CAMS_SOURCE } from "../providers/air-quality";
import { validNumber } from "../providers/shared/values";
import { ECMWF_SUNSET_SOURCE } from "../providers/sunset-ecmwf";
import { createSunsetSamplingPlan, SUNSET_MODEL_VERSION } from "../../domain/photography/sunset-input";
import type { SunsetCloudField } from "../../domain/photography/sunset-input";
import { calculateSolarEvents } from "../../domain/solar";
import { createDayHours, shanghaiDayBounds, shanghaiIso } from "../../domain/time";

export const DEMO_SOURCE_NOTE = "演示数据：人工合成，非真实预报或观测，不用于判断当前天气";
export function demoSunsetField(target: SourceTarget, now: number): SunsetCloudField {
  const sunsetTime = calculateSolarEvents(target.localDate, target).sunset;
  const bounds = shanghaiDayBounds(target.localDate);
  return { modelVersion: SUNSET_MODEL_VERSION, target: { ...target }, sunsetTime,
    source: { ...ECMWF_SUNSET_SOURCE, provider: `演示（人工合成） / ${ECMWF_SUNSET_SOURCE.provider}`,
      status: "ok", fetchedAt: shanghaiIso(now), validFrom: shanghaiIso(bounds.start), validTo: shanghaiIso(bounds.end) },
    points: createSunsetSamplingPlan(target, sunsetTime).map(point => ({ ...point,
      grid: { latitude: point.latitude, longitude: point.longitude },
      hours: createDayHours(target.localDate).map(hour => ({ time: hour.start, cloudTotal: 80,
        cloudLow: 40, cloudMid: 60, cloudHigh: 50, visibility: 12_000, precipitation: 0.2, humidity: 65 })) })),
    notes: [DEMO_SOURCE_NOTE, "fetchedAt仅表示本次演示生成时间；issuedAt未知"] };
}
/** Deliberately simple overcast demo, unrelated to prototype fixtures or live fallbacks. */
export function demoSourceSnapshots(target: SourceTarget, now: number): SourceSnapshot[] {
  return ([GFS_SOURCE, MET_SOURCE, CAMS_SOURCE] as const).map((base, index) => {
    const name = (["weather", "crosscheck", "air"] as const)[index];
    const s = createSnapshot({ ...base, provider: `演示（人工合成） / ${base.provider}` }, ADAPTER_VERSIONS[name], target);
    s.notes.push(DEMO_SOURCE_NOTE, "fetchedAt仅表示本次演示生成时间；issuedAt未知");
    for (const [i, hour] of s.hours.entries()) {
      const values = name === "air" ? { pm25: 12, pm10: 20, referenceAqi: 40 } : {
        temperature: 18 + Math.round(3 * Math.sin(i / 24 * Math.PI * 2)), humidity: 65,
        weatherCode: 3, precipitation: 0.2, precipitationProbability: 40,
        windSpeed: 3, windGust: 5, windFrom: 90, cloudTotal: 80,
        cloudLow: 40, cloudMid: 60, cloudHigh: 50, visibility: 12_000,
      };
      for (const [field, value] of Object.entries(values)) {
        const group = name === "air" ? hour.air : hour.weather;
        (group as Record<string, ReturnType<typeof validNumber>>)[field] = validNumber(field, value, base.id, [DEMO_SOURCE_NOTE]);
      }
    }
    return finishSnapshot(s, now);
  });
}
