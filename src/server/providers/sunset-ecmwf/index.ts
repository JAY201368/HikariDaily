import "server-only";
import { z } from "zod";
import type { SourceTarget } from "../../../domain/normalization/snapshot";
import { SUNSET_MODEL_VERSION, SUNSET_SOURCE_ID, SunsetCloudFieldSchema, createSunsetSamplingPlan } from "../../../domain/photography/sunset-input";
import type { SunsetCloudField, SunsetCloudHour } from "../../../domain/photography/sunset-input";
import { calculateSolarEvents } from "../../../domain/solar";
import { createDayHours, shanghaiDayBounds, shanghaiIso } from "../../../domain/time";
import { EMPTY_HTTP, fetchSource } from "../shared/http";
import type { HttpMetadata, RequestOptions } from "../shared/http";
import { OpenMeteoResponseSchema } from "../shared/open-meteo";
import { sourceBase, targetSchema } from "../shared/values";

export const ECMWF_SUNSET_SOURCE = sourceBase(SUNSET_SOURCE_ID, "Open-Meteo / ECMWF", "ECMWF IFS HRES 日落方向空间云场",
  "ecmwf_ifs", "全球9km格点；前90小时原生逐小时；16点日落方向采样", "https://open-meteo.com/en/docs/ecmwf-api");
export const SUNSET_FIELDS = {
  cloudTotal: { field: "cloud_cover", unit: "%", maximum: 100 },
  cloudLow: { field: "cloud_cover_low", unit: "%", maximum: 100 },
  cloudMid: { field: "cloud_cover_mid", unit: "%", maximum: 100 },
  cloudHigh: { field: "cloud_cover_high", unit: "%", maximum: 100 },
  visibility: { field: "visibility", unit: "m", maximum: Infinity },
  precipitation: { field: "precipitation", unit: "mm", maximum: Infinity },
  humidity: { field: "relative_humidity_2m", unit: "%", maximum: 100 },
} as const;
export type SunsetProviderResult = { field: SunsetCloudField; http: HttpMetadata; code: string | null };

export function emptySunsetField(target: SourceTarget, code: string, disabled = false): SunsetCloudField {
  targetSchema.parse(target);
  return { modelVersion: SUNSET_MODEL_VERSION, target: { ...target },
    source: { ...ECMWF_SUNSET_SOURCE, status: disabled ? "disabled" : "failed" },
    sunsetTime: calculateSolarEvents(target.localDate, target).sunset, points: [], notes: [code] };
}

/** Nearest-cell requests should stay inside the 9 km grid's neighbourhood. */
function gridDistanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = (x: number) => x * Math.PI / 180;
  const chord = Math.sin(rad(a.latitude - b.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(a.longitude - b.longitude) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(chord)));
}

/** Preserves nulls and validates each returned location before attaching it to a ray. */
export function parseSunsetField(body: unknown, target: SourceTarget, fetchedAt: number): SunsetCloudField {
  targetSchema.parse(target);
  if (!Number.isFinite(fetchedAt) || fetchedAt < 0) throw new Error("INVALID_SOURCE_CLOCK");
  const sunsetTime = calculateSolarEvents(target.localDate, target).sunset;
  const plan = createSunsetSamplingPlan(target, sunsetTime);
  const entries = Array.isArray(body) ? body : [body];
  if (!plan.length || entries.length !== plan.length) throw new Error("INVALID_LOCATION_COUNT");
  const hours = createDayHours(target.localDate);
  const notes = new Set<string>(["分层云量使用同一ECMWF IFS模型；数据由Open-Meteo提供，CC BY 4.0署名。",
    "降水为对应整点之后一小时累计；云量、能见度及湿度为整点模型值。"]);
  let validFrom = 0;
  let validTo = Infinity;
  const points = entries.map((entry, index) => {
    const raw = OpenMeteoResponseSchema.parse(entry);
    const locationId = z.object({ location_id: z.number().int().nonnegative().optional() }).parse(entry).location_id ?? 0;
    if (locationId !== index || raw.hourly_units.time !== "unixtime" || !raw.hourly.time.length ||
      gridDistanceKm(plan[index], raw) > 20) throw new Error("INVALID_LOCATION_MAPPING");
    validFrom = Math.max(validFrom, raw.hourly.time[0] * 1000);
    validTo = Math.min(validTo, raw.hourly.time.at(-1)! * 1000);
    const epochs = new Map(raw.hourly.time.map((time, i) => [time * 1000, i]));
    const arrays = Object.fromEntries(Object.entries(SUNSET_FIELDS).map(([name, config]) => {
      const values = raw.hourly[config.field];
      const valid = Array.isArray(values) && values.length === raw.hourly.time.length && raw.hourly_units[config.field] === config.unit;
      if (!valid) notes.add(`${config.field}：部分采样点字段缺失、单位不兼容或数组长度不符，保留为空。`);
      return [name, valid ? values : null];
    })) as Record<keyof typeof SUNSET_FIELDS, unknown[] | null>;
    const mapped = hours.map(({ start }): SunsetCloudHour => {
      const result: SunsetCloudHour = { time: start, cloudTotal: null, cloudLow: null, cloudMid: null,
        cloudHigh: null, visibility: null, precipitation: null, humidity: null };
      for (const [name, config] of Object.entries(SUNSET_FIELDS)) {
        const field = name as keyof typeof SUNSET_FIELDS;
        // Upstream precipitation is the preceding hour: advance once, including 23:00 -> next midnight.
        const at = epochs.get(Date.parse(start) + (field === "precipitation" ? 3_600_000 : 0));
        const value = at === undefined ? undefined : arrays[field]?.[at];
        result[field] = typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= config.maximum ? value : null;
      }
      return result;
    });
    return { ...plan[index], grid: { latitude: raw.latitude, longitude: raw.longitude }, hours: mapped };
  });
  if (validTo <= validFrom) throw new Error("INVALID_SOURCE_COVERAGE");
  const bounds = shanghaiDayBounds(target.localDate);
  return SunsetCloudFieldSchema.parse({ modelVersion: SUNSET_MODEL_VERSION, target, sunsetTime, points, notes: [...notes],
    source: { ...ECMWF_SUNSET_SOURCE, fetchedAt: shanghaiIso(fetchedAt), issuedAt: null,
      validFrom: shanghaiIso(Math.max(bounds.start, validFrom)), validTo: shanghaiIso(Math.min(bounds.end, validTo)) } });
}

export async function fetchSunsetField(target: SourceTarget, options: RequestOptions = {}): Promise<SunsetProviderResult> {
  targetSchema.parse(target);
  const sunsetTime = calculateSolarEvents(target.localDate, target).sunset;
  const plan = createSunsetSamplingPlan(target, sunsetTime);
  if (!plan.length) return { field: emptySunsetField(target, "INVALID_RESPONSE"), http: EMPTY_HTTP, code: "INVALID_RESPONSE" };
  const nextDate = shanghaiIso(shanghaiDayBounds(target.localDate).end).slice(0, 10);
  const params = new URLSearchParams({ latitude: plan.map((p) => p.latitude).join(","),
    longitude: plan.map((p) => p.longitude).join(","), models: "ecmwf_ifs", timezone: "Asia/Shanghai", timeformat: "unixtime",
    start_date: target.localDate, end_date: nextDate, cell_selection: "nearest",
    hourly: Object.values(SUNSET_FIELDS).map((field) => field.field).join(",") });
  const result = await fetchSource("ecmwf", params, options);
  if (result.kind !== "data") {
    const code = result.kind === "not-modified" ? "NOT_MODIFIED_WITHOUT_DATA" : result.code;
    return { field: emptySunsetField(target, code), http: result.http, code };
  }
  try { return { field: parseSunsetField(result.body, target, result.fetchedAt), http: result.http, code: null }; }
  catch { return { field: emptySunsetField(target, "INVALID_RESPONSE"), http: result.http, code: "INVALID_RESPONSE" }; }
}
