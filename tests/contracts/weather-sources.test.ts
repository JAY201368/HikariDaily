import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseGfs, fetchGfs } from "../../src/server/providers/open-meteo";
import { parseCams, fetchCams } from "../../src/server/providers/air-quality";
import { MET_SYMBOLS, MET_UNREPRESENTABLE_SYMBOLS, fetchMet, metWeatherCode, parseMet, validMetUserAgent } from "../../src/server/providers/met-norway";
import { fetchSource } from "../../src/server/providers/shared/http";
import { SourceSnapshotSchema, normalizeSources } from "../../src/domain/normalization";
import { FETCHED_AT, SOURCE_TARGET, metFixture, openMeteoFixture } from "../fixtures/weather-sources";
const options = (body: unknown) => ({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body))), clock: () => FETCHED_AT });
const gfs = () => parseGfs(openMeteoFixture(), SOURCE_TARGET, FETCHED_AT);
const met = () => parseMet(metFixture(), SOURCE_TARGET, FETCHED_AT);
afterEach(() => vi.useRealTimers());

describe("hourly source contracts (synthetic, never live coverage evidence)", () => {
  it("shifts preceding-hour rain/probability/gust, leaving instant values at start; next 00 only fills last interval", () => {
    const raw = openMeteoFixture();
    for (const field of ["precipitation", "precipitation_probability", "wind_gusts_10m", "temperature_2m"]) raw.hourly[field] = Array.from({ length: 48 }, (_, i) => i);
    const s = parseGfs(raw, SOURCE_TARGET, FETCHED_AT);
    expect(s.hours).toHaveLength(24);
    expect(s.hours[0].weather.precipitation.value).toBe(1);
    expect(s.hours[0].weather.precipitationProbability.value).toBe(1);
    expect(s.hours[0].weather.windGust.value).toBe(1);
    expect(s.hours[0].weather.temperature.value).toBe(0);
    expect(s.hours[23].weather.precipitation.value).toBe(24);
    expect(s.hours[23].weather.temperature.value).toBe(23);
    expect(s.source.issuedAt).toBeNull();
    expect(s.source.fetchedAt).toBe(new Date(FETCHED_AT).toISOString());
    expect(SourceSnapshotSchema.safeParse(s).success).toBe(true);
  });
  it("retains 24 slots when times are absent, without assigning by array position", () => {
    const raw = openMeteoFixture(24);
    const s = parseGfs(raw, SOURCE_TARGET, FETCHED_AT);
    expect(s.hours[23].weather.precipitation.value).toBeNull();
    expect(s.hours[23].weather.temperature.value).toBe(20);
    raw.hourly.time = raw.hourly.time.map((t) => t + 3600);
    const shifted = parseGfs(raw, SOURCE_TARGET, FETCHED_AT);
    expect(shifted.hours[0].weather.temperature.value).toBeNull();
    expect(shifted.hours[1].weather.temperature.value).toBe(20);
  });
  it.each(["temperature_2m", "precipitation", "wind_gusts_10m"])("invalid %s array is wholly missing, never truncated", (field) => {
    const raw = openMeteoFixture(); raw.hourly[field] = [1];
    const s = parseGfs(raw, SOURCE_TARGET, FETCHED_AT);
    expect(s.hours.every((h) => h.weather[field === "temperature_2m" ? "temperature" : field === "precipitation" ? "precipitation" : "windGust"].value === null)).toBe(true);
  });
  it("checks units, ranges, missing fields, numeric strings, unknown codes and north bearing", () => {
    const raw = openMeteoFixture();
    raw.hourly_units.wind_speed_10m = "km/h";
    raw.hourly.relative_humidity_2m = Array(48).fill(101);
    raw.hourly.weather_code = Array(48).fill(999);
    raw.hourly.wind_direction_10m = Array(48).fill(360);
    raw.hourly.visibility = Array(48).fill("1000"); delete raw.hourly.cloud_cover_low;
    const h = parseGfs(raw, SOURCE_TARGET, FETCHED_AT).hours[0];
    for (const name of ["windSpeed", "humidity", "weatherCode", "visibility", "cloudLow"] as const) {
      expect(h.weather[name].value).toBeNull(); expect(h.weather[name].notes.length).toBeGreaterThan(0);
    }
    expect(h.weather.windFrom.value).toBe(0);
  });
  it.each(["duplicate", "unsorted", "half-hour", "bad-coordinate", "bad-zone", "time-unit"])("rejects unsafe structural response: %s", (problem) => {
    const raw = openMeteoFixture();
    if (problem === "duplicate") raw.hourly.time[1] = raw.hourly.time[0];
    if (problem === "unsorted") raw.hourly.time.reverse();
    if (problem === "half-hour") raw.hourly.time[0] += 1800;
    if (problem === "bad-coordinate") raw.latitude = 100;
    if (problem === "bad-zone") raw.timezone = "UTC";
    if (problem === "time-unit") raw.hourly_units.time = "iso8601";
    expect(() => parseGfs(raw, SOURCE_TARGET, FETCHED_AT)).toThrow();
  });
  it("MET next_1_hours stays forward, never splits six-hour data; keeps independent cloud and issue metadata", () => {
    const raw = metFixture();
    const s = parseMet(raw, SOURCE_TARGET, FETCHED_AT);
    expect(s.hours[1].weather.precipitation.value).toBe(0.1);
    expect(s.hours[23].weather.precipitation.value).toBe(2.3);
    expect(s.source.issuedAt).toBe(raw.properties.meta.updated_at);
    expect(s.hours[0].weather.windFrom.value).toBe(0);
    expect(s.hours[0].weather.windGust.value).toBeNull();
    expect(s.hours[0].weather.precipitationProbability.value).toBeNull();
    const body = JSON.parse(JSON.stringify(raw)); delete body.properties.timeseries[0].data.next_1_hours;
    expect(parseMet(body, SOURCE_TARGET, FETCHED_AT).hours[0].weather.precipitation.value).toBeNull();
    body.properties.timeseries[0].data.next_1_hours = { summary: { symbol_code: "alien_day" } };
    expect(parseMet(body, SOURCE_TARGET, FETCHED_AT).hours[0].weather.weatherCode.value).toBeNull();
  });
  it("MET validates units, bad values, geometry and time sorting", () => {
    const body = metFixture(); body.properties.meta.units.wind_speed = "knots";
    body.properties.timeseries[0].data.instant.details.relative_humidity = -1;
    const s = parseMet(body, SOURCE_TARGET, FETCHED_AT);
    expect(s.hours[0].weather.windSpeed.value).toBeNull(); expect(s.hours[0].weather.humidity.value).toBeNull();
    body.properties.timeseries.reverse(); expect(() => parseMet(body, SOURCE_TARGET, FETCHED_AT)).toThrow();
    body.geometry.coordinates[0] = 181; expect(() => parseMet(body, SOURCE_TARGET, FETCHED_AT)).toThrow();
  });
  it.each(Object.keys(MET_SYMBOLS))("explicit MET symbol %s maps with valid suffixes", (symbol) => {
    for (const suffix of ["", "_day", "_night", "_polartwilight"]) expect(metWeatherCode(symbol + suffix)).toBe(MET_SYMBOLS[symbol]);
  });
  it("supports documented GFS heavy thunderstorm97; future unknown codes stay missing", () => {
    const raw = openMeteoFixture(); raw.hourly.weather_code = Array(48).fill(97);
    expect(parseGfs(raw, SOURCE_TARGET, FETCHED_AT).hours[0].weather.weatherCode.value).toBe(97);
    raw.hourly.weather_code = Array(48).fill(100);
    expect(parseGfs(raw, SOURCE_TARGET, FETCHED_AT).hours[0].weather.weatherCode.state).toBe("missing");
  });
  it.each(MET_UNREPRESENTABLE_SYMBOLS)("does not mislabel MET mixed precipitation %s as freezing rain", (symbol) => {
    const raw = metFixture(); raw.properties.timeseries[0].data.next_1_hours.summary.symbol_code = symbol;
    const m = parseMet(raw, SOURCE_TARGET, FETCHED_AT).hours[0].weather.weatherCode;
    expect(m.value).toBeNull(); expect(m.notes.join()).toContain("无等价类型");
  });
  it("unknown MET symbols are missing, including arbitrary suffixes", () => {
    expect(metWeatherCode("clearsky_alien")).toBeNull(); expect(metWeatherCode("unknown")).toBeNull(); expect(metWeatherCode(null)).toBeNull();
    expect(metWeatherCode("toString")).toBeNull(); expect(metWeatherCode("__proto__")).toBeNull();
  });
  it("CAMS retains US_EPA, interpolation and coarse grid, without deriving other metrics", () => {
    const raw = openMeteoFixture(); raw.hourly.pm2_5 = Array(48).fill(null);
    const s = parseCams(raw, SOURCE_TARGET, FETCHED_AT);
    expect(s.hours[0].air.referenceAqi.value).toBe(40);
    expect(s.hours[0].air.referenceAqi.notes.join()).toContain("US_EPA");
    expect(s.hours[0].air.pm25.value).toBeNull(); expect(s.hours[0].weather.visibility.value).toBeNull();
    expect(s.notes.join()).toContain("插值"); expect(s.source.nativeResolution).toContain("45km");
  });
});

describe("source merging", () => {
  it("uses primary fields, retains every source's risk inputs, and preserves primary-only sunset inputs", () => {
    const p = gfs(), b = met();
    b.hours[0].weather.windSpeed.value = 20;
    b.hours[0].weather.weatherCode.value = 95;
    p.hours[0].weather.cloudLow = { value: null, state: "missing", notes: ["missing"], sourceIds: [] };
    const h = normalizeSources(SOURCE_TARGET, [p, b, parseCams(openMeteoFixture(), SOURCE_TARGET, FETCHED_AT)]).hours[0];
    expect(h.weather.windSpeed.value).toBe(2);
    expect(h.riskInputs.find((r) => r.source.id === b.source.id)?.weather.windSpeed.value).toBe(20);
    expect(h.riskInputs.find((r) => r.source.id === b.source.id)?.weather.weatherCode.value).toBe(95);
    expect(h.primaryWeather.cloudLow.value).toBeNull(); expect(h.weather.cloudLow.value).toBeNull();
    expect(h.weather.cloudMid.sourceIds).toEqual([p.source.id]);
  });
  it.each([["temperature", 20, 25], ["windSpeed", 2, 6], ["cloudTotal", 30, 60], ["precipitation", 0.1, 1]] as const)("marks exact threshold conflict for %s", (field, a, b) => {
    const p = gfs(), backup = met();
    p.hours[0].weather[field].value = a; backup.hours[0].weather[field].value = b;
    const h = normalizeSources(SOURCE_TARGET, [p, backup]).hours[0];
    expect(h.weather[field].value).toBe(a); expect(h.weather[field].state).toBe("conflict");
    expect(h.weather[field].alternatives).toEqual([{ sourceId: backup.source.id, value: b }]);
  });
  it("does not conflict below thresholds or compare incompatible cloud layers", () => {
    const p = gfs(), b = met(); b.hours[0].weather.temperature.value = 24.99; b.hours[0].weather.cloudLow.value = 99;
    expect(normalizeSources(SOURCE_TARGET, [p, b]).hours[0].weather.temperature.state).toBe("ok");
    expect(normalizeSources(SOURCE_TARGET, [p, b]).hours[0].weather.cloudLow.state).toBe("ok");
  });
  it("falls back per supported field, leaving visibility/gust/probability/layers missing", () => {
    const p = gfs(), b = met(); p.source.status = "failed";
    const h = normalizeSources(SOURCE_TARGET, [p, b]).hours[0];
    expect(h.weather.temperature.value).toBe(21); expect(h.weather.temperature.notes.join()).toContain("回退");
    for (const n of ["visibility", "windGust", "precipitationProbability", "cloudLow", "cloudMid", "cloudHigh"] as const) expect(h.weather[n].value).toBeNull();
    expect(h.primaryWeather.temperature.value).toBeNull();
    expect(h.riskInputs).toHaveLength(1);
  });
  it("stale outranks conflict, preserving both notes; unavailable still has 24 slots", () => {
    const p = gfs(), b = met(); p.source.status = "stale"; b.hours[0].weather.temperature.value = 30;
    const h = normalizeSources(SOURCE_TARGET, [p, b]).hours[0];
    expect(h.weather.temperature.state).toBe("stale"); expect(h.weather.temperature.notes.join()).toContain("分歧");
    expect(h.primaryWeather.temperature.state).toBe("stale");
    const empty = normalizeSources(SOURCE_TARGET, []); expect(empty.hours).toHaveLength(24); expect(empty.hours[0].weather.temperature.value).toBeNull();
  });
  it("rejects mismatched target and duplicate sources", () => {
    expect(() => normalizeSources({ ...SOURCE_TARGET, localDate: "2026-10-24" }, [gfs()])).toThrow();
    expect(() => normalizeSources(SOURCE_TARGET, [gfs(), gfs()])).toThrow();
  });
});

describe("fixed upstream request boundary", () => {
  it("uses fixed endpoint/model/target-date/timezone/ms without forwarding arbitrary target fields", async () => {
    const o = options(openMeteoFixture()); const result = await fetchGfs(SOURCE_TARGET, o);
    expect(result.kind).toBe("snapshot");
    const [url, init] = o.fetcher.mock.calls[0]; const u = new URL(String(url));
    expect(u.origin + u.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ models: "gfs_seamless", timezone: "Asia/Shanghai", timeformat: "unixtime", wind_speed_unit: "ms", start_date: SOURCE_TARGET.localDate, end_date: "2026-10-24", start_hour: "2026-10-23T00:00", end_hour: "2026-10-24T00:00" });
    expect(init?.redirect).toBe("error"); expect(init?.cache).toBe("no-store");
    const air = options(openMeteoFixture()); await fetchCams(SOURCE_TARGET, air);
    const airParams = new URL(String(air.fetcher.mock.calls[0][0])).searchParams;
    expect(airParams.get("domains")).toBe("cams_global");
    expect(airParams.get("start_date")).toBe(SOURCE_TARGET.localDate);
    expect(airParams.get("end_hour")).toBe("2026-10-23T23:00");
    expect(airParams.has("forecast_days")).toBe(false);
  });
  it("disables MET before any request without a non-placeholder contact", async () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const userAgent of [undefined, "", "HikariDaily", "Hikari/1 https://example.com"]) {
      const r = await fetchMet(SOURCE_TARGET, { userAgent, fetcher });
      expect(r.kind).toBe("unavailable"); if (r.kind === "unavailable") expect(r.snapshot.source.status).toBe("disabled");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps MET conditional/304/Expires/Last-Modified metadata, no snapshot time fabricated", async () => {
    // Synthetic contact only goes to the injected mock fetcher, never live MET.
    const userAgent = "SyntheticContract/1 contact@fixture.invalid";
    expect(validMetUserAgent(userAgent)).toBe(true);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 304, headers: { Expires: "Fri, 23 Oct 2026 04:00:00 GMT", "Last-Modified": "Fri, 23 Oct 2026 01:00:00 GMT" } }));
    const r = await fetchMet(SOURCE_TARGET, { userAgent, ifModifiedSince: "Fri, 23 Oct 2026 01:00:00 GMT", fetcher });
    expect(r.kind).toBe("not-modified"); expect(r.http.expires).toContain("04:00");
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ "If-Modified-Since": "Fri, 23 Oct 2026 01:00:00 GMT" });
  });
  it("returns stable schema/HTTP/JSON errors and Retry-After without immediate retries", async () => {
    const bad = await fetchGfs(SOURCE_TARGET, options({ error: true })); expect(bad.kind).toBe("unavailable");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 429, headers: { "Retry-After": "120" } }));
    const result = await fetchGfs(SOURCE_TARGET, { fetcher });
    expect(result.kind).toBe("unavailable"); expect(result.http.retryAfter).toBe("120"); expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await fetchSource("air", new URLSearchParams(), { fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response("{")) })).kind).toBe("failure");
  });
  it("applies timeout budget to body consumption and sanitizes network failures", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      signal = init?.signal;
      return { status: 200, ok: true, headers: new Headers(), json: () => new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new Error("body aborted")), { once: true })) } as Response;
    });
    const result = fetchSource("weather", new URLSearchParams(), { fetcher });
    await vi.advanceTimersByTimeAsync(4000);
    expect(await result).toMatchObject({ kind: "failure", code: "TIMEOUT" });
    expect(await fetchSource("air", new URLSearchParams(), { fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error("private details")) })).toMatchObject({ kind: "failure", code: "NETWORK_ERROR" });
  });
  it("cancels at four seconds and accepts caller cancellation", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const pending = fetchSource("weather", new URLSearchParams(), { fetcher });
    await vi.advanceTimersByTimeAsync(3999); expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1); expect(await pending).toMatchObject({ kind: "failure", code: "TIMEOUT" });
    const controller = new AbortController();
    const next = fetchSource("air", new URLSearchParams(), { fetcher, signal: controller.signal }); controller.abort();
    expect(await next).toMatchObject({ kind: "failure", code: "ABORTED" });
    const pre = await fetchSource("air", new URLSearchParams(), { fetcher, signal: controller.signal }); expect(pre).toMatchObject({ code: "ABORTED" });
  });
});
