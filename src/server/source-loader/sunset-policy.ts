import "server-only";
import type { SourceTarget } from "../../domain/normalization/snapshot";
import { SUNSET_MODEL_VERSION, SUNSET_SOURCE_ID, SunsetCloudFieldSchema, createSunsetSamplingPlan } from "../../domain/photography/sunset-input";
import type { SunsetCloudField } from "../../domain/photography/sunset-input";
import { calculateSolarEvents } from "../../domain/solar";
import { shanghaiDayBounds } from "../../domain/time";
import { ECMWF_SUNSET_SOURCE, emptySunsetField } from "../providers/sunset-ecmwf";
import type { SunsetProviderResult } from "../providers/sunset-ecmwf";
import { EMPTY_HTTP } from "../providers/shared/http";
import { MAX_SOURCE_AGE_MS, SourceErrorSchema, retryAfterTime } from "../cache/source-store";
import type { SourceError } from "../cache/source-store";
import { SunsetSourceRecordSchema, SUNSET_REVALIDATE_MS, SUNSET_FAILURE_COOLDOWN_MS } from "../cache/sunset-store";
import type { SunsetSourceRecord } from "../cache/sunset-store";

export function sameSunsetField(field: SunsetCloudField, target: SourceTarget, now: number) {
  const age = field.source.fetchedAt === null ? Infinity : now - Date.parse(field.source.fetchedAt);
  const sunset = calculateSolarEvents(target.localDate, target).sunset;
  const plan = createSunsetSamplingPlan(target, sunset);
  return field.target.locationId === target.locationId && field.target.localDate === target.localDate &&
    field.target.latitude === target.latitude && field.target.longitude === target.longitude &&
    field.modelVersion === SUNSET_MODEL_VERSION && field.source.id === SUNSET_SOURCE_ID &&
    field.source.model === ECMWF_SUNSET_SOURCE.model && field.sunsetTime === sunset &&
    ["ok", "stale"].includes(field.source.status) && age >= 0 &&
    field.points.length === plan.length && plan.length > 0 && field.points.every((point, i) =>
      point.latitude === plan[i].latitude && point.longitude === plan[i].longitude &&
      point.bearing === plan[i].bearing && point.distanceKm === plan[i].distanceKm);
}
export function reuseSunsetRecord(record: SunsetSourceRecord, target: SourceTarget, now: number): SunsetCloudField {
  const field = record.field;
  if (!field || !sameSunsetField(field, target, now)) return emptySunsetField(target, record.lastError ?? "CACHE_INVALID");
  const age = now - Date.parse(field.source.fetchedAt!);
  if (age > MAX_SOURCE_AGE_MS) return emptySunsetField(target, "CACHE_EXPIRED");
  const stale = field.source.status === "stale" || record.lastError !== null || now >= record.nextAllowedAt;
  const bounds = shanghaiDayBounds(target.localDate);
  if (stale && (field.source.validFrom === null || field.source.validTo === null ||
    Date.parse(field.source.validFrom) > bounds.start || Date.parse(field.source.validTo) < bounds.end)) return emptySunsetField(target, "CACHE_EXPIRED");
  const copy = structuredClone(field);
  copy.source.status = stale ? "stale" : "ok";
  if (stale) copy.notes.push("使用允许期限内的ECMWF空间云场旧缓存；原抓取时间未改写。", ...(record.lastError ? [record.lastError] : []));
  return copy;
}

/** Validate a response and decide the persisted entity and its cooldown. */
export function nextSunsetRecord(target: SourceTarget, record: SunsetSourceRecord | null,
  result: SunsetProviderResult, now: number): SunsetSourceRecord {
  let error: SourceError | null = null;
  const parsed = SunsetCloudFieldSchema.safeParse(result.field);
  if (result.code !== null) error = SourceErrorSchema.safeParse(result.code).success ? result.code as SourceError : "INVALID_RESPONSE";
  else if (!parsed.success || !sameSunsetField(parsed.data, target, now) ||
    now - Date.parse(parsed.data.source.fetchedAt!) > MAX_SOURCE_AGE_MS) error = "INVALID_RESPONSE";
  const next: SunsetSourceRecord = { version: "sunset-record-2026-10", field: !error && parsed.success ? parsed.data : record?.field ?? null,
    http: { ...result.http }, checkedAt: now, nextAllowedAt: now + (error ? SUNSET_FAILURE_COOLDOWN_MS : SUNSET_REVALIDATE_MS), lastError: error };
  if (result.http.status === 429) {
    next.lastError = "RETRY_AFTER";
    next.nextAllowedAt = Math.max(next.nextAllowedAt, retryAfterTime(result.http.retryAfter, now) ?? 0);
  }
  if (!SunsetSourceRecordSchema.safeParse(next).success) {
    next.http = EMPTY_HTTP; next.lastError = "INVALID_RESPONSE";
  }
  return next;
}
