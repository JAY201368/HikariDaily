import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { SUNSET_MODEL_VERSION, SUNSET_SOURCE_ID, createSunsetSamplingPlan } from "../../src/domain/photography/sunset-input";
import { calculateSolarEvents } from "../../src/domain/solar";
import { shanghaiDayBounds } from "../../src/domain/time";
import { ECMWF_SUNSET_SOURCE, SUNSET_FIELDS, emptySunsetField, fetchSunsetField, parseSunsetField } from "../../src/server/providers/sunset-ecmwf";
import type { SunsetProviderResult } from "../../src/server/providers/sunset-ecmwf";
import { createSunsetLoader } from "../../src/server/source-loader/sunset";
import { SUNSET_REVALIDATE_MS, SunsetSourceRecordSchema, sunsetCacheKey } from "../../src/server/cache/sunset-store";
import type { SunsetSourceRecord, SunsetSourceStore } from "../../src/server/cache/sunset-store";
import { MAX_SOURCE_AGE_MS } from "../../src/server/cache/source-store";
import { EMPTY_HTTP } from "../../src/server/providers/shared/http";

const target = { locationId: "geonames:1800163", latitude: 28.68, longitude: 115.85, localDate: "2026-10-26" };
const fetchedAt = Date.parse("2026-10-26T12:00:00+08:00");
const solar = calculateSolarEvents(target.localDate, target);
const plan = createSunsetSamplingPlan(target, solar.sunset);
/** Synthetic spatial cloud field; never used as live fallback. */
function body() {
  const start = shanghaiDayBounds(target.localDate).start / 1000;
  return plan.map((point, i) => ({ latitude: point.latitude, longitude: point.longitude, location_id: i,
    timezone: "Asia/Shanghai", utc_offset_seconds: 28800,
    hourly_units: { time: "unixtime", ...Object.fromEntries(Object.values(SUNSET_FIELDS).map((config) => [config.field, config.unit])) } as Record<string, unknown>,
    hourly: { time: Array.from({ length: 48 }, (_, h) => start + h * 3600),
      ...Object.fromEntries(Object.entries(SUNSET_FIELDS).map(([name, config]) => [config.field,
        Array.from({ length: 48 }, (_, h) => name === "visibility" ? 25000 : name === "precipitation" ? h : name === "cloudLow" ? 10 : 50)])),
    } as { time: number[] } & Record<string, unknown>,
  }));
}
function success(now = fetchedAt) {
  return { field: parseSunsetField(body(), target, now), http: { ...EMPTY_HTTP, status: 200 }, code: null };
}
function record(extra: Partial<SunsetSourceRecord> = {}): SunsetSourceRecord {
  return { version: "sunset-record-2026-10", field: success().field, http: { ...EMPTY_HTTP, status: 200 },
    checkedAt: fetchedAt, nextAllowedAt: fetchedAt + SUNSET_REVALIDATE_MS, lastError: null, ...extra };
}
function setup(initial: SunsetSourceRecord | unknown | null = null) {
  let now = fetchedAt;
  let value: unknown | null = initial;
  const store: SunsetSourceStore = { get: vi.fn(async () => structuredClone(value)),
    set: vi.fn(async (_key, next) => { value = structuredClone(next); }) };
  const fetcher = vi.fn<() => Promise<SunsetProviderResult>>(async () => success(now));
  const loader = createSunsetLoader({ store, clock: () => now, fetcher });
  return { loader, store, fetcher, setNow: (time: number) => { now = time; }, stored: () => value };
}
afterEach(() => vi.useRealTimers());

describe("ECMWF sunset spatial provider", () => {
  it("issues one fixed multi-location model request with no credentials or client URL", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body()), { status: 200 }));
    const result = await fetchSunsetField(target, { fetcher, clock: () => fetchedAt });
    expect(result.code).toBeNull();
    expect(result.field).toMatchObject({ modelVersion: SUNSET_MODEL_VERSION, target,
      source: { id: SUNSET_SOURCE_ID, model: "ecmwf_ifs", status: "ok", issuedAt: null } });
    expect(result.field.points).toHaveLength(16);
    const [url, options] = fetcher.mock.calls[0];
    const request = new URL(String(url));
    expect(`${request.origin}${request.pathname}`).toBe("https://api.open-meteo.com/v1/forecast");
    expect(request.searchParams.get("models")).toBe("ecmwf_ifs");
    expect(request.searchParams.get("latitude")!.split(",")).toHaveLength(16);
    expect(request.searchParams.get("start_date")).toBe(target.localDate);
    expect(request.searchParams.get("end_date")).toBe("2026-10-27");
    expect(request.searchParams.get("cell_selection")).toBe("nearest");
    expect(options).toMatchObject({ redirect: "error", cache: "no-store" });
    expect(result.field.source.fetchedAt).toBe("2026-10-26T12:00:00.000+08:00");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("aligns rainfall once to the following hour including midnight, retaining each point's grid", () => {
    const response = body();
    delete (response[0] as { location_id?: number }).location_id; // Open-Meteo omits the first location_id=0.
    const field = parseSunsetField(response, target, fetchedAt);
    expect(field.points[0].hours[0].precipitation).toBe(1);
    expect(field.points[0].hours[23].precipitation).toBe(24);
    expect(field.points[0].hours[23].time).toBe("2026-10-26T23:00:00.000+08:00");
    expect(field.points[1].grid).toEqual({ latitude: plan[1].latitude, longitude: plan[1].longitude });
  });
  it("does not misattach reversed, missing or geographically mismatched model locations", () => {
    expect(() => parseSunsetField(body().reverse(), target, fetchedAt)).toThrow();
    expect(() => parseSunsetField(body().slice(0, 15), target, fetchedAt)).toThrow();
    const distant = body(); distant[3].longitude += 2;
    expect(() => parseSunsetField(distant, target, fetchedAt)).toThrow();
  });
  it("preserves missing/invalid field arrays and values as null, without zero filling", () => {
    const response = body();
    response[0].hourly_units.visibility = "km";
    response[1].hourly.cloud_cover_low = [20];
    (response[2].hourly.cloud_cover_high as unknown[])[5] = "50";
    (response[3].hourly.cloud_cover_mid as unknown[])[5] = 101;
    (response[4].hourly.precipitation as unknown[])[1] = -1;
    const result = parseSunsetField(response, target, fetchedAt);
    expect(result.points[0].hours.every((h) => h.visibility === null)).toBe(true);
    expect(result.points[1].hours.every((h) => h.cloudLow === null)).toBe(true);
    expect(result.points[2].hours[5].cloudHigh).toBeNull();
    expect(result.points[3].hours[5].cloudMid).toBeNull();
    expect(result.points[4].hours[0].precipitation).toBeNull();
  });
  it("rejects broken timestamps/time units and keeps absent next-midnight rainfall null", () => {
    const wrongTime = body(); wrongTime[0].hourly.time[5] = wrongTime[0].hourly.time[4];
    expect(() => parseSunsetField(wrongTime, target, fetchedAt)).toThrow();
    const wrongUnit = body(); wrongUnit[0].hourly_units.time = "iso8601";
    expect(() => parseSunsetField(wrongUnit, target, fetchedAt)).toThrow();
    const response = body().map((entry) => ({ ...entry,
      hourly: Object.fromEntries(Object.entries(entry.hourly).map(([name, data]) => [name, (data as unknown[]).slice(0, 24)])) }));
    expect(parseSunsetField(response, target, fetchedAt).points[0].hours[23].precipitation).toBeNull();
  });
  it("turns upstream errors into structured missing fields without leaking upstream content", async () => {
    const result = await fetchSunsetField(target, { fetcher: async () => new Response("private upstream diagnostic", { status: 503 }) });
    expect(result).toMatchObject({ code: "HTTP_ERROR", field: { source: { status: "failed", fetchedAt: null }, points: [] } });
    expect(JSON.stringify(result)).not.toContain("private upstream diagnostic");
  });
});

describe("sunset source cache and failure boundaries", () => {
  it("reuses fresh results without renewing fetchedAt, then refreshes at one hour", async () => {
    const s = setup();
    const first = await s.loader(target);
    s.setNow(fetchedAt + SUNSET_REVALIDATE_MS - 1);
    const second = await s.loader(target);
    expect(second.field.source.fetchedAt).toBe(first.field.source.fetchedAt);
    expect(s.fetcher).toHaveBeenCalledTimes(1);
    s.setNow(fetchedAt + SUNSET_REVALIDATE_MS);
    expect((await s.loader(target)).field.source.fetchedAt).not.toBe(first.field.source.fetchedAt);
    expect(s.fetcher).toHaveBeenCalledTimes(2);
    expect(SunsetSourceRecordSchema.safeParse(s.stored()).success).toBe(true);
  });
  it.each([MAX_SOURCE_AGE_MS, MAX_SOURCE_AGE_MS + 1])("failed refresh at age %i never extends the original three-hour age limit", async (age) => {
    const s = setup(record());
    s.setNow(fetchedAt + age);
    s.fetcher.mockRejectedValue(new Error("private"));
    const loaded = await s.loader(target);
    expect(loaded.field.source.status).toBe(age === MAX_SOURCE_AGE_MS ? "stale" : "failed");
    expect(loaded.field.source.fetchedAt).toBe(age === MAX_SOURCE_AGE_MS ? success().field.source.fetchedAt : null);
  });
  it("retains 429 cooldown metadata even after the previous field expires", async () => {
    const s = setup(record());
    s.setNow(fetchedAt + SUNSET_REVALIDATE_MS);
    s.fetcher.mockResolvedValue({ field: emptySunsetField(target, "HTTP_ERROR"),
      http: { ...EMPTY_HTTP, status: 429, retryAfter: "14400" }, code: "HTTP_ERROR" });
    expect((await s.loader(target)).field.source.status).toBe("stale");
    s.setNow(fetchedAt + MAX_SOURCE_AGE_MS + 1);
    expect((await s.loader(target)).field.source.status).toBe("failed");
    expect(s.fetcher).toHaveBeenCalledTimes(1);
    expect((s.stored() as SunsetSourceRecord).nextAllowedAt).toBe(fetchedAt + SUNSET_REVALIDATE_MS + 14_400_000);
  });
  it("rejects mismatched cache target, version or sampling plans and uses current source only", async () => {
    const broken = record(); broken.field!.points[3].longitude += 0.2;
    const s = setup(broken);
    const loaded = await s.loader(target);
    expect(s.fetcher).toHaveBeenCalledOnce();
    expect(loaded.field.points[3].longitude).toBe(plan[3].longitude);
    expect(loaded.warnings.join()).toContain("CACHE_INVALID");
    expect(sunsetCacheKey(target)).not.toBe(sunsetCacheKey({ ...target, longitude: target.longitude + 0.01 }));
  });
  it("does not read caches or upstream when disabled, and explicitly marks uncached operation", async () => {
    const s = setup();
    expect((await s.loader(target, { enabled: false })).field.source.status).toBe("disabled");
    expect(s.store.get).not.toHaveBeenCalled(); expect(s.fetcher).not.toHaveBeenCalled();
    const loaded = await createSunsetLoader({ clock: () => fetchedAt, fetcher: async () => success() })(target);
    expect(loaded.field.source).toMatchObject({ id: ECMWF_SUNSET_SOURCE.id, status: "ok" });
    expect(loaded.warnings.join()).toContain("CACHE_UNAVAILABLE");
  });
  it("rejects stale partial-day fields instead of silently reusing incomplete coverage", async () => {
    const old = record(); old.field!.source.validTo = "2026-10-26T23:00:00+08:00";
    const s = setup(old); s.setNow(fetchedAt + SUNSET_REVALIDATE_MS);
    s.fetcher.mockRejectedValue(new Error("offline"));
    expect((await s.loader(target)).field.source.status).toBe("failed");
  });
  it("ends pending work on caller cancellation and never starts a late cache write", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(() => new Promise<ReturnType<typeof success>>(() => {}));
    const store = { get: vi.fn(async () => null), set: vi.fn(async () => {}) };
    const pending = createSunsetLoader({ store, clock: () => fetchedAt, fetcher })(target, { signal: controller.signal });
    await Promise.resolve(); await Promise.resolve();
    controller.abort();
    const loaded = await pending;
    expect(loaded.field.source.status).toBe("failed");
    expect(store.set).not.toHaveBeenCalled();
  });
});
