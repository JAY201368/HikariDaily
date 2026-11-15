import "server-only";
import { SourceSnapshotSchema, ADAPTER_VERSIONS, createSnapshot } from "../../domain/normalization/snapshot";
import type { SourceSnapshot, SourceTarget } from "../../domain/normalization/snapshot";
import { shanghaiDayBounds } from "../../domain/time";
import { coordinate } from "../providers/shared/values";
import type { ProviderResult } from "../providers/shared/values";
import { EMPTY_HTTP } from "../providers/shared/http";
import type { SourceName } from "../cache/source-key";
import { MAX_SOURCE_AGE_MS, REVALIDATE_MS, SourceRecordSchema, SourceErrorSchema, expiresTime, retryAfterTime } from "../cache/source-store";
import type { SourceError, SourceRecord } from "../cache/source-store";
import { SOURCE_BASES } from "./registry";

export function emptyHourlySource(name: SourceName, target: SourceTarget, code: SourceError, disabled = false): SourceSnapshot {
  const snapshot = createSnapshot({ ...SOURCE_BASES[name], status: disabled ? "disabled" : "failed" }, ADAPTER_VERSIONS[name], target, code);
  snapshot.notes.push(code);
  return snapshot;
}
export function sameHourlyTarget(snapshot: SourceSnapshot, target: SourceTarget) {
  return snapshot.target.locationId === target.locationId && snapshot.target.localDate === target.localDate &&
    coordinate(snapshot.target.latitude) === coordinate(target.latitude) && coordinate(snapshot.target.longitude) === coordinate(target.longitude);
}
export function hourlySourceAge(snapshot: SourceSnapshot, now: number): number {
  const fetched = snapshot.source.fetchedAt === null ? NaN : Date.parse(snapshot.source.fetchedAt);
  return now >= fetched ? now - fetched : Infinity;
}
function covers(snapshot: SourceSnapshot, target: SourceTarget) {
  const bounds = shanghaiDayBounds(target.localDate);
  return snapshot.source.validFrom !== null && snapshot.source.validTo !== null &&
    Date.parse(snapshot.source.validFrom) <= bounds.start && Date.parse(snapshot.source.validTo) >= bounds.end;
}
export function reuseHourlyRecord(name: SourceName, target: SourceTarget, record: SourceRecord, now: number): SourceSnapshot {
  const s = record.snapshot;
  if (!s) return emptyHourlySource(name, target, record.lastError ?? "CACHE_EXPIRED");
  if (!sameHourlyTarget(s, target)) return emptyHourlySource(name, target, "CACHE_TARGET_MISMATCH");
  if (hourlySourceAge(s, now) > MAX_SOURCE_AGE_MS) return emptyHourlySource(name, target, "CACHE_EXPIRED");
  const stale = record.lastError !== null || now >= record.nextAllowedAt;
  if (stale && !covers(s, target)) return emptyHourlySource(name, target, "CACHE_EXPIRED");
  const copy = structuredClone(s);
  // Cache coordinates are truncated; each caller still receives its exact resolved target.
  copy.target = { ...target };
  copy.source.status = stale ? "stale" : "ok";
  if (stale) {
    copy.notes.push("允许使用的旧缓存；原抓取时间未改写", ...(record.lastError ? [record.lastError] : []));
    for (const hour of copy.hours) for (const group of [hour.weather, hour.air]) for (const metric of Object.values(group)) {
      if (metric.value !== null) { metric.state = "stale"; metric.notes.push("来源为允许使用的旧缓存"); }
    }
  }
  return copy;
}

/** Decide a new cache record without performing IO or changing the original entity. */
export function nextHourlyRecord(name: SourceName, target: SourceTarget, record: SourceRecord | null,
  result: ProviderResult, now: number): SourceRecord {
  let next: SourceRecord = {
    version: "source-record-v1", snapshot: record?.snapshot ?? null,
    http: { ...result.http }, checkedAt: now, nextAllowedAt: now + REVALIDATE_MS, lastError: null,
  };
  if (result.kind === "snapshot") {
    const parsed = SourceSnapshotSchema.safeParse(result.snapshot);
    if (parsed.success && sameHourlyTarget(parsed.data, target) && parsed.data.source.id === SOURCE_BASES[name].id &&
      parsed.data.adapterVersion === ADAPTER_VERSIONS[name] && hourlySourceAge(parsed.data, now) <= MAX_SOURCE_AGE_MS) next.snapshot = parsed.data;
    else next.lastError = "INVALID_RESPONSE";
  } else if (result.kind === "not-modified") {
    if (name !== "crosscheck" || !record?.snapshot || !record.http.lastModified) next.lastError = "NOT_MODIFIED_WITHOUT_DATA";
    // 304 validates the same entity, never a new download/fetchedAt.
    next.http = { ...result.http, lastModified: result.http.lastModified ?? record?.http.lastModified ?? null };
  } else next.lastError = SourceErrorSchema.safeParse(result.code).success ? result.code as SourceError : "INVALID_RESPONSE";
  if (next.lastError && record) {
    // A failed HTTP reply does not discard the last good entity's validator/expiry.
    next.http.lastModified = record.http.lastModified;
    next.http.expires = record.http.expires;
  }
  if (name === "crosscheck") next.nextAllowedAt = Math.max(next.nextAllowedAt, expiresTime(next.http.expires) ?? 0);
  if (result.http.status === 429) {
    next.lastError = "RETRY_AFTER";
    next.nextAllowedAt = Math.max(next.nextAllowedAt, retryAfterTime(result.http.retryAfter, now) ?? 0);
  }
  // Validate metadata before it becomes a shared value; never store raw exceptions.
  const parsedRecord = SourceRecordSchema.safeParse(next);
  if (!parsedRecord.success) next = { ...next, http: EMPTY_HTTP, lastError: "INVALID_RESPONSE" };
  return next;
}
