import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { SUNSET_MODEL_VERSION, SunsetCloudFieldSchema, createSunsetSamplingPlan } from "../../domain/photography/sunset-input";
import type { SourceTarget } from "../../domain/normalization/snapshot";
import { calculateSolarEvents } from "../../domain/solar";
import { coordinate } from "../providers/shared/values";
import { SUNSET_FIELDS } from "../providers/sunset-ecmwf";
import { HttpMetadataSchema, SourceErrorSchema, MAX_SOURCE_AGE_MS } from "./source-store";

export const SUNSET_REVALIDATE_MS = 60 * 60_000;
export const SUNSET_FAILURE_COOLDOWN_MS = 15 * 60_000;
export const SunsetSourceRecordSchema = z.strictObject({
  version: z.literal("sunset-record-2026-10"), field: SunsetCloudFieldSchema.nullable(),
  http: HttpMetadataSchema, checkedAt: z.number().finite().nonnegative(),
  nextAllowedAt: z.number().finite().nonnegative(), lastError: SourceErrorSchema.nullable(),
});
export type SunsetSourceRecord = z.infer<typeof SunsetSourceRecordSchema>;
export interface SunsetSourceStore {
  get(key: string): Promise<unknown | null>;
  set(key: string, record: SunsetSourceRecord, ttlSeconds: number): Promise<void>;
}
export function sunsetCacheKey(target: SourceTarget): string {
  const plan = createSunsetSamplingPlan(target, calculateSolarEvents(target.localDate, target).sunset);
  return `sunset-2026-10:${createHash("sha256").update(JSON.stringify([
    SUNSET_MODEL_VERSION, "ecmwf_ifs", target.locationId, coordinate(target.latitude), coordinate(target.longitude),
    target.localDate, plan, Object.values(SUNSET_FIELDS).map((f) => f.field).sort(), "Asia/Shanghai",
  ])).digest("hex")}`;
}
export function sunsetRecordTtlSeconds(record: SunsetSourceRecord, now: number): number {
  return Math.max(1, Math.ceil((Math.max(now + MAX_SOURCE_AGE_MS, record.nextAllowedAt) - now) / 1000));
}
