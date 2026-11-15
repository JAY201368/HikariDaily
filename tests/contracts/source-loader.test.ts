import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const sdk = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), getCache: vi.fn() }));
vi.mock("@vercel/functions", () => ({ getCache: sdk.getCache }));
import { createSourceLoader } from "../../src/server/source-loader/loader";
import { readSourceConfig } from "../../src/server/source-loader/config";
import { demoSourceSnapshots, demoSunsetField, DEMO_SOURCE_NOTE } from "../../src/server/source-loader/fixtures";
import { createVercelSourceStore } from "../../src/server/cache/vercel-source-store";
import { sourceCacheKey } from "../../src/server/cache/source-key";
import { MAX_SOURCE_AGE_MS, REVALIDATE_MS, recordTtlSeconds, retryAfterTime, SourceRecordSchema } from "../../src/server/cache/source-store";
import type { SharedSourceStore, SourceRecord } from "../../src/server/cache/source-store";
import type { SourceFetcher } from "../../src/server/source-loader/loader";
import type { SourceSnapshot } from "../../src/domain/normalization/snapshot";
import { SourceSnapshotSchema, normalizeSources } from "../../src/domain/normalization";
import { parseGfs } from "../../src/server/providers/open-meteo";
import { parseMet } from "../../src/server/providers/met-norway";
import { parseCams } from "../../src/server/providers/air-quality";
import { EMPTY_HTTP } from "../../src/server/providers/shared/http";
import { FETCHED_AT, SOURCE_TARGET, metFixture, openMeteoFixture } from "../fixtures/weather-sources";

const contact = "HikariContract/1.0 contact@hikaridaily.invalid"; // synthetic; never used on a live request
const liveConfig = () => readSourceConfig({ NODE_ENV: "test", MET_NO_USER_AGENT: contact, HIKARI_SUNSET_ENABLED: "false" });
const snapshots = () => [parseGfs(openMeteoFixture(), SOURCE_TARGET, FETCHED_AT), parseMet(metFixture(), SOURCE_TARGET, FETCHED_AT), parseCams(openMeteoFixture(), SOURCE_TARGET, FETCHED_AT)];
function record(snapshot: SourceSnapshot | null, extra: Partial<SourceRecord> = {}): SourceRecord {
  return { version: "source-record-v1", snapshot, http: { ...EMPTY_HTTP, status: 200 }, checkedAt: FETCHED_AT, nextAllowedAt: FETCHED_AT + REVALIDATE_MS, lastError: null, ...extra };
}
/** In-memory fake only for deterministic business contracts, never the production adapter. */
function fakeStore(initial: SourceRecord[] = []) {
  const map = new Map(initial.map((r, i) => [sourceCacheKey((["weather", "crosscheck", "air"] as const)[i], SOURCE_TARGET), structuredClone(r)]));
  const store: SharedSourceStore = {
    get: vi.fn(async (key) => structuredClone(map.get(key) ?? null)),
    set: vi.fn(async (key, value) => { map.set(key, structuredClone(value)); }),
  };
  return { store, map };
}
function setup(initial: SourceRecord[] = []) {
  let now = FETCHED_AT;
  const { store, map } = fakeStore(initial);
  const good = snapshots();
  const fetchers = Object.fromEntries((["weather", "crosscheck", "air"] as const).map((name, i) => [name, vi.fn<SourceFetcher>(async (target, options) => {
    const s = structuredClone(good[i]); s.target = target; s.source.fetchedAt = new Date(options.clock!()).toISOString();
    return { kind: "snapshot", snapshot: s, http: { ...EMPTY_HTTP, status: 200 } };
  })])) as Record<"weather" | "crosscheck" | "air", ReturnType<typeof vi.fn<SourceFetcher>>>;
  const logger = vi.fn();
  const loader = createSourceLoader({ config: liveConfig(), store, clock: () => now, fetchers, logger });
  return { loader, store, map, fetchers, logger, setNow: (value: number) => { now = value; } };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("source cache policy with controlled clock (synthetic)", () => {
  it("loads the dedicated spatial field beside the three weather sources", async () => {
    const s = setup();
    const sunsetLoader = vi.fn(async () => ({ field: demoSunsetField(SOURCE_TARGET, FETCHED_AT), warnings: [] }));
    const loader = createSourceLoader({ config: readSourceConfig({ NODE_ENV: "test", MET_NO_USER_AGENT: contact }),
      store: s.store, clock: () => FETCHED_AT, fetchers: s.fetchers, sunsetLoader });
    const result = await loader(SOURCE_TARGET);
    expect(sunsetLoader).toHaveBeenCalledWith(SOURCE_TARGET, { signal: expect.any(AbortSignal), enabled: true });
    expect(result.sunset?.source.model).toBe("ecmwf_ifs");
    expect(result.sunset?.points).toHaveLength(16);
    expect(result.snapshots).toHaveLength(3);
  });
  it("keeps weather when the spatial loader ignores cancellation past the aggregate deadline", async () => {
    vi.useFakeTimers();
    const s = setup();
    const loader = createSourceLoader({ config: readSourceConfig({ NODE_ENV: "test", MET_NO_USER_AGENT: contact }),
      store: s.store, clock: () => FETCHED_AT, fetchers: s.fetchers,
      sunsetLoader: () => new Promise(() => {}) });
    const result = loader(SOURCE_TARGET);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(await result).toMatchObject({ snapshots: expect.any(Array), sunset: { source: { status: "failed" }, notes: ["AGGREGATE_TIMEOUT"] } });
    expect((await result).snapshots[0].source.status).toBe("ok");
  });
  it("cold fetches all sources concurrently and fresh reuse never changes fetchedAt", async () => {
    const s = setup();
    const a = await s.loader(SOURCE_TARGET);
    expect(a.snapshots.map((v) => v.source.status)).toEqual(["ok", "ok", "ok"]);
    expect(a.cacheStatus).toBe("shared-configured");
    s.setNow(FETCHED_AT + REVALIDATE_MS - 1);
    const b = await s.loader(SOURCE_TARGET);
    expect(b.snapshots.map((v) => v.source.fetchedAt)).toEqual(a.snapshots.map((v) => v.source.fetchedAt));
    for (const fetcher of Object.values(s.fetchers)) expect(fetcher).toHaveBeenCalledTimes(1);
    expect(s.store.set).toHaveBeenCalledTimes(3);
  });
  it("refreshes at exactly 15 minutes", async () => {
    const s = setup(snapshots().map((v) => record(v)));
    s.setNow(FETCHED_AT + REVALIDATE_MS);
    const r = await s.loader(SOURCE_TARGET);
    expect(r.snapshots.every((v) => v.source.fetchedAt === new Date(FETCHED_AT + REVALIDATE_MS).toISOString())).toBe(true);
  });
  it.each([MAX_SOURCE_AGE_MS, MAX_SOURCE_AGE_MS + 1])("failed refresh original age %i only admits stale through 3h", async (elapsed) => {
    const s = setup(snapshots().map((v) => record(v)));
    for (const f of Object.values(s.fetchers)) f.mockRejectedValue(new Error("private upstream details"));
    s.setNow(FETCHED_AT + elapsed);
    const r = await s.loader(SOURCE_TARGET);
    for (const v of r.snapshots) {
      expect(v.source.status).toBe(elapsed === MAX_SOURCE_AGE_MS ? "stale" : "failed");
      expect(v.hours[0].weather.temperature.value).toEqual(elapsed === MAX_SOURCE_AGE_MS && v.source.id !== "open-meteo-cams" ? expect.any(Number) : null);
      if (elapsed === MAX_SOURCE_AGE_MS) expect(v.source.fetchedAt).toBe(new Date(FETCHED_AT).toISOString());
      else expect(v.hours.flatMap((h) => [...Object.values(h.weather), ...Object.values(h.air)]).every((m) => m.value === null)).toBe(true);
    }
    expect(JSON.stringify(s.logger.mock.calls)).not.toContain("private upstream details");
  });
  it("rejects stale data with partial target coverage, including allowed age", async () => {
    const ss = snapshots(); ss[0].source.validTo = ss[0].hours[22].end;
    const s = setup(ss.map((v) => record(v)));
    s.fetchers.weather.mockRejectedValue(new Error("no")); s.setNow(FETCHED_AT + REVALIDATE_MS);
    const r = await s.loader(SOURCE_TARGET);
    expect(r.snapshots[0].source.status).toBe("failed");
    expect(r.snapshots[0].hours[0].weather.temperature.value).toBeNull();
  });
  it("does not trust very old values even when physical cache expiry is later", async () => {
    const s = setup(snapshots().map((v) => record(v, { nextAllowedAt: FETCHED_AT + 99_000_000 })));
    s.setNow(FETCHED_AT + MAX_SOURCE_AGE_MS + 1);
    expect((await s.loader(SOURCE_TARGET)).snapshots.every((v) => v.source.status === "failed")).toBe(true);
    expect(s.fetchers.weather).not.toHaveBeenCalled();
  });
  it("validates persisted schema/target and fails MET closed on invalid cache", async () => {
    const s = setup();
    const bad = record(snapshots()[1]); bad.snapshot!.target.latitude++;
    s.map.set(sourceCacheKey("crosscheck", SOURCE_TARGET), bad);
    const r = await s.loader(SOURCE_TARGET);
    expect(r.cacheStatus).toBe("degraded");
    expect(r.snapshots[1].source.status).toBe("disabled");
    expect(s.fetchers.crosscheck).not.toHaveBeenCalled();
    expect(SourceRecordSchema.safeParse({ ...bad, lastError: "raw secret exception" }).success).toBe(false);
  });
  it("rebinds same four-decimal cache cell to exact target for accepted normalization", async () => {
    const s = setup(snapshots().map((v) => record(v)));
    const target = { ...SOURCE_TARGET, latitude: SOURCE_TARGET.latitude + 0.000001 };
    const r = await s.loader(target);
    expect(() => normalizeSources(target, r.snapshots)).not.toThrow();
    expect(s.fetchers.weather).not.toHaveBeenCalled();
  });
});

describe("MET HTTP cache and source cooldown", () => {
  it("connects the actual MET adapter to store policy, Expires and HTTP 304 without a live request", async () => {
    let now = FETCHED_AT;
    const { store } = fakeStore();
    const modified = "Fri, 23 Oct 2026 01:00:00 GMT";
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(metFixture()), { headers: { Expires: new Date(FETCHED_AT + 2 * REVALIDATE_MS).toUTCString(), "Last-Modified": modified } }))
      .mockResolvedValueOnce(new Response(null, { status: 304, headers: { Expires: new Date(FETCHED_AT + 3 * REVALIDATE_MS).toUTCString() } }));
    vi.stubGlobal("fetch", fetcher);
    const config = readSourceConfig({ NODE_ENV: "test", MET_NO_USER_AGENT: contact, HIKARI_GFS_ENABLED: "false", HIKARI_CAMS_ENABLED: "false", HIKARI_SUNSET_ENABLED: "false" });
    const load = createSourceLoader({ config, store, clock: () => now });
    const a = await load(SOURCE_TARGET);
    now += REVALIDATE_MS; await load(SOURCE_TARGET); expect(fetcher).toHaveBeenCalledTimes(1);
    now += REVALIDATE_MS;
    const b = await load(SOURCE_TARGET);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetcher.mock.calls[0][0])).host).toBe("api.met.no");
    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({ "If-Modified-Since": modified, "User-Agent": contact });
    expect(b.snapshots[1].source.fetchedAt).toBe(a.snapshots[1].source.fetchedAt);
    expect(b.snapshots[1].source.status).toBe("ok");
  });
  it("honors Expires beyond 15min, then sends the exact Last-Modified and preserves fetchedAt on 304", async () => {
    const initial = snapshots().map((v) => record(v));
    const modified = "Fri, 23 Oct 2026 01:00:00 GMT";
    initial[1].http = { status: 200, expires: new Date(FETCHED_AT + 2 * REVALIDATE_MS).toUTCString(), lastModified: modified, retryAfter: null };
    initial[1].nextAllowedAt = FETCHED_AT + 2 * REVALIDATE_MS;
    const s = setup(initial);
    s.fetchers.crosscheck.mockResolvedValue({ kind: "not-modified", http: { ...EMPTY_HTTP, status: 304, expires: new Date(FETCHED_AT + 3 * REVALIDATE_MS).toUTCString() } });
    s.setNow(FETCHED_AT + REVALIDATE_MS);
    const before = await s.loader(SOURCE_TARGET); expect(s.fetchers.crosscheck).not.toHaveBeenCalled();
    expect(before.snapshots[1].source.status).toBe("ok");
    s.setNow(FETCHED_AT + 2 * REVALIDATE_MS);
    const r = await s.loader(SOURCE_TARGET);
    expect(s.fetchers.crosscheck.mock.calls[0][1].ifModifiedSince).toBe(modified);
    expect(r.snapshots[1].source.fetchedAt).toBe(new Date(FETCHED_AT).toISOString());
    expect(r.snapshots[1].source.status).toBe("ok");
    expect(s.map.get(sourceCacheKey("crosscheck", SOURCE_TARGET))?.nextAllowedAt).toBe(FETCHED_AT + 3 * REVALIDATE_MS);
  });
  it("304 cannot extend the original download past 3h", async () => {
    const initial = snapshots().map((v) => record(v)); initial[1].http.lastModified = "Fri, 23 Oct 2026 01:00:00 GMT";
    const s = setup(initial); s.setNow(FETCHED_AT + MAX_SOURCE_AGE_MS + 1);
    s.fetchers.crosscheck.mockResolvedValue({ kind: "not-modified", http: { ...EMPTY_HTTP, status: 304 } });
    expect((await s.loader(SOURCE_TARGET)).snapshots[1].source.status).toBe("failed");
  });
  it("304 without prior entity fails without a second request", async () => {
    const s = setup(); s.fetchers.crosscheck.mockResolvedValue({ kind: "not-modified", http: { ...EMPTY_HTTP, status: 304 } });
    const r = await s.loader(SOURCE_TARGET);
    expect(r.snapshots[1].notes).toContain("NOT_MODIFIED_WITHOUT_DATA");
    expect(s.fetchers.crosscheck).toHaveBeenCalledTimes(1);
  });
  it.each(["3600", new Date(FETCHED_AT + 3_600_000).toUTCString()])("persists 429 Retry-After %s and suppresses subsequent requests", async (retryAfter) => {
    const s = setup();
    s.fetchers.weather.mockResolvedValue({ kind: "unavailable", snapshot: snapshots()[0], code: "HTTP_ERROR", http: { ...EMPTY_HTTP, status: 429, retryAfter } });
    const a = await s.loader(SOURCE_TARGET);
    expect(a.snapshots[0].source.status).toBe("failed");
    s.setNow(FETCHED_AT + REVALIDATE_MS);
    await s.loader(SOURCE_TARGET);
    expect(s.fetchers.weather).toHaveBeenCalledTimes(1);
    s.setNow(FETCHED_AT + 3_600_000); await s.loader(SOURCE_TARGET);
    expect(s.fetchers.weather).toHaveBeenCalledTimes(2);
  });
  it("preserves last good entity on 429 and retains cooldown longer than stale budget", async () => {
    const s = setup(snapshots().map((v) => record(v))); s.setNow(FETCHED_AT + REVALIDATE_MS);
    s.fetchers.weather.mockResolvedValue({ kind: "unavailable", snapshot: snapshots()[0], code: "HTTP_ERROR", http: { ...EMPTY_HTTP, status: 429, retryAfter: "14400" } });
    expect((await s.loader(SOURCE_TARGET)).snapshots[0].source.status).toBe("stale");
    const saved = s.map.get(sourceCacheKey("weather", SOURCE_TARGET))!;
    expect(recordTtlSeconds(saved, FETCHED_AT + REVALIDATE_MS)).toBe(14400);
    s.setNow(FETCHED_AT + MAX_SOURCE_AGE_MS + 1);
    expect((await s.loader(SOURCE_TARGET)).snapshots[0].source.status).toBe("failed");
    expect(s.fetchers.weather).toHaveBeenCalledTimes(1);
  });
  it.each([null, "nonsense", "-1", "Infinity", "1\r\nX: bad", "99999999999999999999"])("invalid Retry-After %s is ignored", (value) => {
    expect(retryAfterTime(value, FETCHED_AT)).toBeNull();
  });
});

describe("timeouts, failures, explicit operating modes", () => {
  it("starts three fetches together, returns partial values at 4s, aborts slow source without retry", async () => {
    vi.useFakeTimers();
    const s = setup();
    let signal: AbortSignal | undefined;
    s.fetchers.crosscheck.mockImplementation(async (_t, o) => { signal = o.signal; return await new Promise(() => {}); });
    const p = s.loader(SOURCE_TARGET);
    await vi.advanceTimersByTimeAsync(0);
    for (const f of Object.values(s.fetchers)) expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4_000);
    const r = await p;
    expect(signal!.aborted).toBe(true);
    expect(r.snapshots.map((v) => v.source.status)).toEqual(["ok", "failed", "ok"]);
    expect(r.snapshots[1].notes).toContain("TIMEOUT");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds hanging cache reads at aggregate 6s and never starts late upstream work", async () => {
    vi.useFakeTimers(); const s = setup();
    vi.mocked(s.store.get).mockImplementation(async () => await new Promise(() => {}));
    const p = s.loader(SOURCE_TARGET); await vi.advanceTimersByTimeAsync(6_000);
    expect((await p).snapshots.every((v) => v.notes.includes("AGGREGATE_TIMEOUT"))).toBe(true);
    for (const f of Object.values(s.fetchers)) expect(f).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("aggregate deadline aborts upstream still running after a delayed cache read", async () => {
    vi.useFakeTimers(); const s = setup();
    vi.mocked(s.store.get).mockImplementation(async () => await new Promise((resolve) => setTimeout(() => resolve(null), 3_000)));
    let upstreamSignal: AbortSignal | undefined;
    s.fetchers.weather.mockImplementation(async (_t, o) => { upstreamSignal = o.signal; return await new Promise(() => {}); });
    const p = s.loader(SOURCE_TARGET); await vi.advanceTimersByTimeAsync(6_000);
    const r = await p;
    expect(upstreamSignal?.aborted).toBe(true);
    expect(r.snapshots[0].notes).toContain("AGGREGATE_TIMEOUT");
    expect(s.fetchers.weather).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds hanging writes at 6s while retaining newly obtained data with degradation", async () => {
    vi.useFakeTimers(); const s = setup();
    vi.mocked(s.store.set).mockImplementation(async () => await new Promise(() => {}));
    const p = s.loader(SOURCE_TARGET); await vi.advanceTimersByTimeAsync(6_000);
    const r = await p;
    expect(r.cacheStatus).toBe("degraded"); expect(r.snapshots.every((v) => v.source.status === "ok")).toBe(true);
  });
  it.each(["absent", "reject"])("cache %s explicitly degrades GFS/CAMS and closes MET", async (how) => {
    const s = setup();
    if (how === "reject") vi.mocked(s.store.get).mockRejectedValue(new Error("cache credentials and internal stack"));
    const load = createSourceLoader({ config: liveConfig(), store: how === "absent" ? null : s.store, fetchers: s.fetchers, clock: () => FETCHED_AT, logger: s.logger });
    const r = await load(SOURCE_TARGET);
    expect(r.cacheStatus).toBe("degraded"); expect(r.warnings.join()).toContain("无跨实例");
    expect(r.snapshots.map((v) => v.source.status)).toEqual(["ok", "disabled", "ok"]);
    expect(s.fetchers.crosscheck).not.toHaveBeenCalled();
    expect(JSON.stringify(s.logger.mock.calls)).not.toMatch(/credentials|internal stack|contact@|39\.9075/);
    for (const [event] of s.logger.mock.calls) expect(Object.keys(event).sort()).toEqual(["duration", "errorCode", "requestId", "sourceStatus"]);
  });
  it("failed writes preserve current successful data and explicitly warn", async () => {
    const s = setup(); vi.mocked(s.store.set).mockRejectedValue(new Error("secret cache"));
    const r = await s.loader(SOURCE_TARGET);
    expect(r.snapshots.every((v) => v.source.status === "ok")).toBe(true);
    expect(r.warnings.join()).toContain("CACHE_WRITE_FAILED");
    expect(JSON.stringify(s.logger.mock.calls)).not.toContain("secret cache");
  });
  it("disabled sources and missing MET identity do not fetch or read cache", async () => {
    const s = setup(); const config = readSourceConfig({ HIKARI_GFS_ENABLED: "false", HIKARI_CAMS_ENABLED: "false", HIKARI_SUNSET_ENABLED: "false" });
    const r = await createSourceLoader({ config, store: s.store, fetchers: s.fetchers })(SOURCE_TARGET);
    expect(r.snapshots.map((v) => v.source.status)).toEqual(["disabled", "disabled", "disabled"]);
    expect(s.store.get).not.toHaveBeenCalled();
    for (const f of Object.values(s.fetchers)) expect(f).not.toHaveBeenCalled();
  });
  it("fixture is explicit and labelled on every source, with no cache/upstream calls", async () => {
    const s = setup(); const config = readSourceConfig({ HIKARI_SOURCE_MODE: "fixture", NODE_ENV: "test" });
    const load = createSourceLoader({ config, store: s.store, fetchers: s.fetchers, fixture: demoSourceSnapshots, sunsetFixture: demoSunsetField, clock: () => FETCHED_AT });
    const r = await load(SOURCE_TARGET);
    expect(r.mode).toBe("fixture"); expect(r.cacheStatus).toBe("unused");
    expect(r.sunset?.source.provider).toContain("人工合成");
    expect(r.sunset?.points).toHaveLength(16);
    for (const source of r.snapshots) { expect(source.notes).toContain(DEMO_SOURCE_NOTE); expect(SourceSnapshotSchema.safeParse(source).success).toBe(true); }
    expect(s.store.get).not.toHaveBeenCalled(); for (const f of Object.values(s.fetchers)) expect(f).not.toHaveBeenCalled();
    expect(() => readSourceConfig({ HIKARI_SOURCE_MODE: "fixture", NODE_ENV: "production" })).toThrow("PRODUCTION_FIXTURE_FORBIDDEN");
  });
});

describe("keys, environment gates and real SDK call shape (mocked transport)", () => {
  it("wires the production entry through the actual public SDK adapter when every gate is declared (mocked SDK)", async () => {
    vi.useFakeTimers(); vi.setSystemTime(FETCHED_AT);
    for (const [name, value] of Object.entries({
      HIKARI_SOURCE_CACHE: "vercel", HIKARI_SHARED_CACHE_VERIFIED: "true", VERCEL: "1", VERCEL_PROJECT_ID: "prj_contract", VERCEL_ENV: "preview",
      HIKARI_SOURCE_MODE: "live", HIKARI_GFS_ENABLED: "true", HIKARI_MET_ENABLED: "false", HIKARI_CAMS_ENABLED: "false",
      HIKARI_SUNSET_ENABLED: "false",
    })) vi.stubEnv(name, value);
    sdk.getCache.mockReturnValue({ get: sdk.get, set: sdk.set }); sdk.get.mockResolvedValue(null); sdk.set.mockResolvedValue(undefined);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(openMeteoFixture())));
    vi.stubGlobal("fetch", fetcher);
    const { loadSources } = await import("../../src/server/source-loader");
    const r = await loadSources(SOURCE_TARGET);
    expect(r.cacheStatus).toBe("shared-configured");
    expect(r.snapshots[0].source.status).toBe("ok");
    expect(sdk.get).toHaveBeenCalledWith(sourceCacheKey("weather", SOURCE_TARGET));
    expect(sdk.set).toHaveBeenCalledWith(sourceCacheKey("weather", SOURCE_TARGET), expect.objectContaining({ version: "source-record-v1" }), expect.objectContaining({ name: "", ttl: 10800 }));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("production entry never calls SDK under ordinary local defaults", async () => {
    const prior = sdk.getCache.mock.calls.length;
    vi.stubEnv("HIKARI_SOURCE_CACHE", "disabled");
    vi.stubEnv("HIKARI_GFS_ENABLED", "false"); vi.stubEnv("HIKARI_MET_ENABLED", "false"); vi.stubEnv("HIKARI_CAMS_ENABLED", "false");
    vi.stubEnv("HIKARI_SUNSET_ENABLED", "false");
    const { loadSources } = await import("../../src/server/source-loader");
    expect((await loadSources(SOURCE_TARGET)).cacheStatus).toBe("degraded");
    expect(sdk.getCache.mock.calls.length).toBe(prior);
  });
  it("keys separate source, date, location and coordinates, truncate at 4 decimals, expose no coordinates", () => {
    const key = sourceCacheKey("weather", SOURCE_TARGET);
    expect(key).toMatch(/^source-v1:[a-f0-9]{64}$/);
    expect(sourceCacheKey("air", SOURCE_TARGET)).not.toBe(key);
    for (const change of [{ localDate: "2026-10-24" }, { locationId: "geonames:123" }, { latitude: 39.908 }]) expect(sourceCacheKey("weather", { ...SOURCE_TARGET, ...change })).not.toBe(key);
    expect(sourceCacheKey("weather", { ...SOURCE_TARGET, latitude: 39.907501 })).toBe(key);
  });
  it("platform is disabled by default and requires opt-in, official environment AND verified declaration", () => {
    const platform = { HIKARI_SOURCE_CACHE: "vercel", VERCEL: "1", VERCEL_PROJECT_ID: "prj_contract", VERCEL_ENV: "preview" };
    expect(readSourceConfig({}).cacheNamespace).toBeNull();
    expect(readSourceConfig(platform).cacheNamespace).toBeNull();
    expect(readSourceConfig({ ...platform, HIKARI_SHARED_CACHE_VERIFIED: "true" }).cacheNamespace).toBe("hikari:prj_contract:preview:sources-v1");
    expect(readSourceConfig({ ...platform, HIKARI_SHARED_CACHE_VERIFIED: "true", VERCEL: "0" }).cacheNamespace).toBeNull();
    expect(() => readSourceConfig({ HIKARI_GFS_ENABLED: "yes", MET_NO_USER_AGENT: contact })).toThrow(/^INVALID_SOURCE_CONFIG$/);
  });
  it("actual Vercel adapter uses public getCache/get/set with namespace and TTL; no positional observability name", async () => {
    sdk.getCache.mockReturnValue({ get: sdk.get, set: sdk.set }); sdk.get.mockResolvedValue(null); sdk.set.mockResolvedValue(undefined);
    const store = createVercelSourceStore("hikari:prj_contract:preview:sources-v1");
    const key = sourceCacheKey("weather", SOURCE_TARGET); const r = record(snapshots()[0]);
    expect(await store.get(key)).toBeNull(); await store.set(key, r, 10800);
    expect(sdk.getCache.mock.calls[0][0].namespace).toBe("hikari:prj_contract:preview:sources-v1");
    expect(sdk.set).toHaveBeenCalledWith(key, r, { ttl: 10800, name: "", tags: ["hikari-sources-v1"] });
    sdk.get.mockRejectedValueOnce(new Error("SDK reject")); await expect(store.get(key)).rejects.toThrow("SDK reject");
  });
});
