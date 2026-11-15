import "server-only";
import type { SourceTarget } from "../../domain/normalization/snapshot";
import type { SunsetCloudField } from "../../domain/photography/sunset-input";
import { emptySunsetField, fetchSunsetField } from "../providers/sunset-ecmwf";
import type { SunsetProviderResult } from "../providers/sunset-ecmwf";
import { EMPTY_HTTP, SOURCE_TIMEOUT_MS } from "../providers/shared/http";
import type { RequestOptions } from "../providers/shared/http";
import { targetSchema } from "../providers/shared/values";
import { SunsetSourceRecordSchema, sunsetCacheKey, sunsetRecordTtlSeconds } from "../cache/sunset-store";
import type { SunsetSourceRecord, SunsetSourceStore } from "../cache/sunset-store";
import { abortable } from "./abortable";
import { sameSunsetField, reuseSunsetRecord, nextSunsetRecord } from "./sunset-policy";

type Dependencies = { store?: SunsetSourceStore | null; clock?: () => number;
  fetcher?: (target: SourceTarget, options?: RequestOptions) => Promise<SunsetProviderResult> };
export type SunsetLoaded = { field: SunsetCloudField; warnings: string[] };

/** Independent weather-field cache; no opportunity grades or fixture substitutions are stored. */
export function createSunsetLoader(deps: Dependencies = {}) {
  const clock = deps.clock ?? Date.now;
  return async function loadSunset(target: SourceTarget, options: { signal?: AbortSignal; enabled?: boolean } = {}): Promise<SunsetLoaded> {
    targetSchema.parse(target);
    if (options.enabled === false) return { field: emptySunsetField(target, "SOURCE_DISABLED", true), warnings: [] };
    const started = clock();
    if (!Number.isFinite(started) || started < 0) throw new Error("INVALID_SOURCE_CLOCK");
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timer = setTimeout(abort, SOURCE_TIMEOUT_MS);
    const warnings: string[] = [];
    let store = deps.store;
    let record: SunsetSourceRecord | null = null;
    const degraded = (code: string) => warnings.push(`晚霞空间云场缓存降级：${code}；无跨实例复用/冷却保证。`);
    try {
      if (!store) degraded("CACHE_UNAVAILABLE");
      if (store && !controller.signal.aborted) {
        try {
          const raw = await abortable(store.get(sunsetCacheKey(target)), controller.signal);
          if (raw !== null) {
            const parsed = SunsetSourceRecordSchema.safeParse(raw);
            if (!parsed.success || parsed.data.checkedAt > clock() ||
              (parsed.data.field && !sameSunsetField(parsed.data.field, target, clock()))) {
              degraded("CACHE_INVALID"); store = null;
            } else record = parsed.data;
          }
        } catch { degraded("CACHE_READ_FAILED"); store = null; }
      }
      if (controller.signal.aborted) return { field: emptySunsetField(target, options.signal?.aborted ? "ABORTED" : "TIMEOUT"), warnings };
      if (record && clock() < record.nextAllowedAt) return { field: reuseSunsetRecord(record, target, clock()), warnings };
      let result: SunsetProviderResult;
      try { result = await abortable((deps.fetcher ?? fetchSunsetField)(target, { clock, signal: controller.signal }), controller.signal); }
      catch {
        const code = controller.signal.aborted ? options.signal?.aborted ? "ABORTED" : "TIMEOUT" : "NETWORK_ERROR";
        result = { field: emptySunsetField(target, code), http: EMPTY_HTTP, code };
      }
      const now = clock();
      const next = nextSunsetRecord(target, record, result, now);
      // A cancelled request must never launch a late write after the caller's aggregate deadline.
      if (store && !controller.signal.aborted) {
        try { await abortable(store.set(sunsetCacheKey(target), next, sunsetRecordTtlSeconds(next, now)), controller.signal); }
        catch { degraded("CACHE_WRITE_FAILED"); }
      }
      return { field: reuseSunsetRecord(next, target, clock()), warnings };
    } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
  };
}
