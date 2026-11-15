import "server-only";
import { z } from "zod";
import { SourceSnapshotSchema } from "../../domain/normalization/snapshot";

export const REVALIDATE_MS = 15 * 60_000;
export const MAX_SOURCE_AGE_MS = 3 * 60 * 60_000;
export const SourceErrorSchema = z.enum([
  "OUTSIDE_FORECAST_COVERAGE", "HTTP_ERROR", "INVALID_JSON", "TIMEOUT", "ABORTED", "NETWORK_ERROR", "INVALID_RESPONSE",
  "SOURCE_DISABLED", "MET_IDENTITY_REQUIRED", "CACHE_UNAVAILABLE", "CACHE_READ_FAILED",
  "CACHE_WRITE_FAILED", "CACHE_INVALID", "CACHE_EXPIRED", "CACHE_TARGET_MISMATCH",
  "RETRY_AFTER", "NOT_MODIFIED_WITHOUT_DATA", "AGGREGATE_TIMEOUT",
]);
export type SourceError = z.infer<typeof SourceErrorSchema>;
export const HttpMetadataSchema = z.strictObject({
  status: z.number().int().min(100).max(599).nullable(),
  expires: z.string().max(512).nullable(), lastModified: z.string().max(512).nullable(), retryAfter: z.string().max(512).nullable(),
});
export const SourceRecordSchema = z.strictObject({
  version: z.literal("source-record-v1"), snapshot: SourceSnapshotSchema.nullable(),
  http: HttpMetadataSchema, checkedAt: z.number().finite().nonnegative(),
  nextAllowedAt: z.number().finite().nonnegative(), lastError: SourceErrorSchema.nullable(),
});
export type SourceRecord = z.infer<typeof SourceRecordSchema>;
/** Implementations return unknown because cached records can outlive code versions. */
export interface SharedSourceStore {
  get(key: string): Promise<unknown | null>;
  set(key: string, record: SourceRecord, ttlSeconds: number): Promise<void>;
}

/** HTTP-date or integer delay; malformed/past values cannot authorize a retry loop. */
export function retryAfterTime(value: string | null, now: number): number | null {
  if (!value || /[\r\n]/.test(value)) return null;
  const parsed = /^\d+$/.test(value.trim()) ? now + Number(value.trim()) * 1000 : Date.parse(value);
  return Number.isFinite(parsed) && parsed >= now && parsed <= 8.64e15 ? parsed : null;
}
export function expiresTime(value: string | null): number | null {
  if (!value || /[\r\n]/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
export function recordTtlSeconds(record: SourceRecord, now: number): number {
  // Keep the original fetch-time age bound independent from physical cache retention.
  return Math.max(1, Math.ceil((Math.max(now + MAX_SOURCE_AGE_MS, record.nextAllowedAt) - now) / 1000));
}
