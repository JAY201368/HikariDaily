import "server-only";
import { ADAPTER_VERSIONS } from "../../domain/normalization/snapshot";
import type { SourceSnapshot, SourceTarget } from "../../domain/normalization/snapshot";
import { sourceCacheKey } from "../cache/source-key";
import type { SourceName } from "../cache/source-key";
import { SourceRecordSchema, SourceErrorSchema, recordTtlSeconds } from "../cache/source-store";
import type { SourceError, SourceRecord } from "../cache/source-store";
import { abortable } from "./abortable";
import { emptyHourlySource, sameHourlyTarget, reuseHourlyRecord, nextHourlyRecord } from "./hourly-policy";
import { fetchHourlySource } from "./hourly-fetch";
import { SOURCE_BASES, SOURCE_FETCHERS } from "./registry";
import type { HourlySourceLoaded, SourceLoaderDependencies, SourceGraphRuntime } from "./types";

/** A single source's cache/transport lifecycle; no orchestration of other providers. */
export async function loadHourlySource(name: SourceName, target: SourceTarget,
  deps: SourceLoaderDependencies, runtime: SourceGraphRuntime): Promise<HourlySourceLoaded> {
  const { clock, started, requestId } = runtime;
  const warnings = new Set<string>();
  let degraded = !deps.store;
  const degrade = (code: SourceError) => {
    degraded = true;
    warnings.add(`共享源缓存降级：${code}；无跨实例缓存/冷却保证`);
  };
  const log = (name: SourceName, source: SourceSnapshot, errorCode: SourceError | null) => {
    // Fixed field allowlist: never pass targets, contacts, exceptions or upstream messages.
    deps.logger?.({ requestId, duration: Math.max(0, clock() - started), sourceStatus: `${name}:${source.source.status}`, errorCode });
  };
  let record: SourceRecord | null = null;
  let store = deps.store;
  let error: SourceError | null = store ? null : "CACHE_UNAVAILABLE";
  const finish = (s: SourceSnapshot, code: SourceError | null = error) => {
    const reason = SourceErrorSchema.safeParse(s.notes.at(-1));
    log(name, s, code ?? (reason.success ? reason.data : null));
    return { snapshot: s, warnings: [...warnings], degraded };
  };
  if (!deps.config.enabled[name]) return finish(emptyHourlySource(name, target, "SOURCE_DISABLED", true), "SOURCE_DISABLED");
  if (name === "crosscheck" && !deps.config.metUserAgent) return finish(emptyHourlySource(name, target, "MET_IDENTITY_REQUIRED", true), "MET_IDENTITY_REQUIRED");
  const key = sourceCacheKey(name, target);
  if (store) {
    try {
      const raw = await abortable(store.get(key), runtime.signal);
      if (raw !== null) {
        const parsed = SourceRecordSchema.safeParse(raw);
        if (!parsed.success || parsed.data.checkedAt > clock() || (parsed.data.snapshot &&
          (!sameHourlyTarget(parsed.data.snapshot, target) || parsed.data.snapshot.source.id !== SOURCE_BASES[name].id || parsed.data.snapshot.adapterVersion !== ADAPTER_VERSIONS[name]))) {
          error = "CACHE_INVALID"; store = null; degrade(error);
        } else record = parsed.data;
      }
    } catch {
      if (runtime.signal.aborted) return finish(emptyHourlySource(name, target, "AGGREGATE_TIMEOUT"), "AGGREGATE_TIMEOUT");
      error = "CACHE_READ_FAILED"; store = null; degrade(error);
    }
  }
  if (name === "crosscheck" && !store) return finish(emptyHourlySource(name, target, "CACHE_UNAVAILABLE", true), error ?? "CACHE_UNAVAILABLE");
  let now = clock();
  if (record && now < record.nextAllowedAt) return finish(reuseHourlyRecord(name, target, record, now), record.lastError);
  if (runtime.signal.aborted) return finish(emptyHourlySource(name, target, "AGGREGATE_TIMEOUT"), "AGGREGATE_TIMEOUT");
  const result = await fetchHourlySource(name, target, record,
    deps.fetchers?.[name] ?? SOURCE_FETCHERS[name], deps.config.metUserAgent, runtime);
  now = clock();
  if (runtime.signal.aborted) return finish(record ? reuseHourlyRecord(name, target, { ...record, lastError: "AGGREGATE_TIMEOUT" }, now) : emptyHourlySource(name, target, "AGGREGATE_TIMEOUT"), "AGGREGATE_TIMEOUT");
  const next = nextHourlyRecord(name, target, record, result, now);
  if (store) {
    try { await abortable(store.set(key, next, recordTtlSeconds(next, now)), runtime.signal); }
    catch { error = "CACHE_WRITE_FAILED"; degrade(error); }
  }
  const snapshot = reuseHourlyRecord(name, target, next, clock());
  if (!store || error === "CACHE_WRITE_FAILED") snapshot.notes.push("共享缓存降级；本次数据未获得后续跨实例复用/冷却保证");
  return finish(snapshot, error ?? next.lastError);
}
