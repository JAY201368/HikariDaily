import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const cacheCalls = vi.hoisted(() => [] as { keys: string[]; options: unknown }[]);
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown, keys: string[], options: unknown) => { cacheCalls.push({ keys, options }); return fn; } }));
import {
  createLocationProvider, createLocationUpstream, normalizeLocation, parseLocationQuery,
  LOCATION_ATTRIBUTION, LOCATION_CACHE_SECONDS, LOCATION_FALLBACK_NOTE,
} from "../../src/server/providers/geocoding/adapter";
import { LocationError, locationErrorResponse } from "../../src/server/http/errors";
import { GET } from "../../src/app/api/locations/route";

// Artificial contract records, not captured upstream responses or coverage evidence.
const district = { id: 1809104, name: "海淀", country_code: "CN", feature_code: "PPLA3", latitude: 39.99064, longitude: 116.28868, timezone: "Asia/Shanghai", admin1_id: 2038349, admin1: "北京市", admin2: "北京市" };
const cityCases = [
  [1816670, "北京", "PPLC", 2038349, "北京市"],
  [1796236, "上海", "PPLA", 1796231, "上海市"],
  [1809858, "广州", "PPLA", 1809935, "广东"],
  [1815286, "成都", "PPLA", 1794299, "四川"],
  [2037013, "哈尔滨", "PPLA", 2036965, "黑龙江"],
] as const;
function fetchStub(body: unknown, status = 200) { return vi.fn<typeof fetch>().mockImplementation(async () => Response.json(body, { status })); }
beforeEach(() => { vi.unstubAllGlobals(); });
describe("mainland administrative normalization (synthetic)", () => {
  it.each(cityCases)("accepts city %s/%s", (id, name, feature_code, admin1_id, admin1) => {
    expect(normalizeLocation({ ...district, id, name, feature_code, admin1_id, admin1 })?.granularity).toBe("city");
  });
  it("retains Haidian and distinct same-name administrative paths", () => {
    expect(normalizeLocation(district)).toMatchObject({ id: "geonames:1809104", granularity: "district", administrativePath: ["北京市", "海淀"] });
    const a = normalizeLocation({ ...district, name: "朝阳" });
    const b = normalizeLocation({ ...district, id: 1794779, name: "朝阳", admin1_id: 1795912, admin1: "山西", admin2: "晋中市" });
    expect(a?.administrativePath).not.toEqual(b?.administrativePath);
  });
  it.each([
    { country_code: "US" }, { country_code: "HK" }, { country_code: "MO" }, { country_code: "TW" },
    { admin1_id: 1819730 }, { admin1_id: 999 }, { admin1: undefined }, { admin2: undefined },
    { feature_code: "PPL" }, { feature_code: "PPLA4" }, { feature_code: "ADM4" }, { feature_code: "ADMD" }, { feature_code: "constructor" }, { feature_code: "__proto__" },
    { latitude: 100 }, { longitude: null }, { name: "<script>" }, { timezone: "Europe/Berlin" },
  ])("filters unsupported or invalid record %j", (override) => { expect(normalizeLocation({ ...district, ...override })).toBeNull(); });
  it("uses Beijing product time for a supported Xinjiang source timezone", () => {
    expect(normalizeLocation({ ...district, feature_code: "PPLA", admin1_id: 1529047, admin1: "新疆", timezone: "Asia/Urumqi" })?.timezone).toBe("Asia/Shanghai");
  });
  it.each(["ADM3", "PPLA3", "ADM2", "PPLA2"])("maps explicit code %s", (feature_code) => { expect(normalizeLocation({ ...district, feature_code })).not.toBeNull(); });
});
describe("fixed upstream boundary", () => {
  it("encodes input only into fixed search parameters and enforces limit/dedup", async () => {
    const fetcher = fetchStub({ results: Array.from({ length: 20 }, (_, i) => ({ ...district, id: i + 1 })) });
    expect(await createLocationUpstream(fetcher).search("海淀")).toMatchObject({ data: expect.any(Array) });
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://geocoding-api.open-meteo.com/v1/search?name=%E6%B5%B7%E6%B7%80&countryCode=CN&count=10&language=zh&format=json");
    expect(init).toMatchObject({ cache: "no-store", redirect: "error", signal: expect.any(AbortSignal) });
    expect((await createLocationUpstream(fetcher).search("https://x.test/?url=a")).data).toHaveLength(10);
    expect(await createLocationUpstream(fetchStub({ results: [district, district] })).search("海淀")).toMatchObject({ data: [normalizeLocation(district)] });
  });
  it("empty district search stays empty, keeps city fallback/attribution metadata", async () => {
    expect((await createLocationUpstream(fetchStub({})).search("不存在区县")).data).toEqual([]);
    expect(LOCATION_FALLBACK_NOTE).toContain("所属城市"); expect(LOCATION_ATTRIBUTION.dataset).toBe("GeoNames");
  });
  it("resolves ID using fixed get endpoint and checks returned identity", async () => {
    const fetcher = fetchStub(district);
    expect((await createLocationUpstream(fetcher).resolve("geonames:1809104")).data).toEqual(normalizeLocation(district));
    expect(String(fetcher.mock.calls[0][0])).toBe("https://geocoding-api.open-meteo.com/v1/get?id=1809104&language=zh&format=json");
    await expect(createLocationUpstream(fetcher).resolve("geonames:123")).rejects.toMatchObject({ code: "LOCATION_UNAVAILABLE" });
  });
  it.each([{}, null])("missing resolve %j maps to 404", async (raw) => {
    const provider = createLocationProvider(createLocationUpstream(fetchStub(raw)));
    await expect(provider.resolveLocation("geonames:123")).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND" });
  });
  it("observed upstream missing-ID 400 maps to not-found, other 400 is a fault", async () => {
    await expect(createLocationProvider(createLocationUpstream(fetchStub({ error: true, reason: "Location ID not found." }, 400))).resolveLocation("geonames:123")).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND" });
    await expect(createLocationUpstream(fetchStub({ error: true, reason: "other" }, 400)).resolve("geonames:123")).rejects.toMatchObject({ code: "LOCATION_UNAVAILABLE" });
  });
  it("unsupported resolve maps to 404; upstream 404 also does", async () => {
    await expect(createLocationProvider(createLocationUpstream(fetchStub({ ...district, feature_code: "PPL" }))).resolveLocation("geonames:1809104")).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND" });
    await expect(createLocationProvider(createLocationUpstream(fetchStub({ ...district, country_code: "HK", admin1: undefined, admin1_id: undefined }))).resolveLocation("geonames:1809104")).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND" });
    await expect(createLocationProvider(createLocationUpstream(fetchStub({}, 404))).resolveLocation("geonames:123")).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND" });
  });
  it.each([{ error: true, reason: "secret" }, { results: "bad" }, null])("bad search payload becomes unavailable %j", async (raw) => {
    await expect(createLocationUpstream(fetchStub(raw)).search("海淀")).rejects.toMatchObject({ code: "LOCATION_UNAVAILABLE" });
  });
  it("does not expose thrown upstream errors or immediately retry", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("private url/token"));
    await expect(createLocationUpstream(fetcher).search("海淀")).rejects.toMatchObject({ code: "LOCATION_UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("cancels at four seconds", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))); }));
      const pending = expect(createLocationUpstream(fetcher).search("海淀")).rejects.toMatchObject({ code: "LOCATION_UNAVAILABLE" });
      await vi.advanceTimersByTimeAsync(4000); await pending;
    } finally { vi.useRealTimers(); }
  });
});
describe("input, shared cache and HTTP envelopes", () => {
  it.each(["北", " ", "北".repeat(41), "<script>", "a\nxx"])("rejects query %j", (q) => { expect(() => parseLocationQuery(q)).toThrow(LocationError); });
  it("trims query and measures Unicode code points", () => { expect(parseLocationQuery(" 海淀 ")).toBe("海淀"); expect(() => parseLocationQuery("😀")).toThrow(); });
  it("uses versioned Next shared cache with 24h revalidation", () => {
    expect(LOCATION_CACHE_SECONDS).toBe(86400); expect(cacheCalls).toHaveLength(2);
    for (const call of cacheCalls) { expect(call.keys).toContain("geocoding-v1"); expect(call.options).toEqual({ revalidate: 86400 }); }
  });
  it("rejects an expired Next cache entry instead of unlimited stale reuse", async () => {
    const loader = { search: vi.fn().mockResolvedValue({ fetchedAt: 0, data: [] }), resolve: vi.fn().mockResolvedValue({ fetchedAt: 0, data: normalizeLocation(district) }) };
    expect(await createLocationProvider(loader, () => 86399999).searchLocations("海淀")).toEqual([]);
    await expect(createLocationProvider(loader, () => 86400000).searchLocations("海淀")).rejects.toMatchObject({ code: "LOCATION_UNAVAILABLE" });
    await expect(createLocationProvider(loader, () => 86400001).resolveLocation("geonames:1809104")).rejects.toMatchObject({ code: "LOCATION_UNAVAILABLE" });
  });
  it.each(["geonames:0", "geonames:-1", "geonames:01", "geonames:9007199254740992", "https://x.test", "39,116"])("rejects invalid ID before network %s", async (id) => {
    const fetcher = fetchStub(district); await expect(createLocationUpstream(fetcher).resolve(id)).rejects.toMatchObject({ code: "INVALID_LOCATION" }); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["", "?q=北", "?q=海淀&q=上海", "?q=海淀&url=https://x.test", "?latitude=1&longitude=2"])("400 on invalid API parameters %s", async (query) => {
    const response = await GET(new Request(`https://local.test/api/locations${query}`)); expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ data: null, error: { code: "INVALID_LOCATION" } });
  });
  it("200 results/empty and 503 consistent envelope, no upstream exception", async () => {
    for (const raw of [{ results: [district] }, {}]) {
      vi.stubGlobal("fetch", fetchStub(raw)); const response = await GET(new Request("https://local.test/api/locations?q=海淀")); expect(response.status).toBe(200); expect(await response.json()).toEqual({ data: "results" in raw ? [normalizeLocation(district)] : [], error: null });
    }
    vi.stubGlobal("fetch", fetchStub({}, 503)); const response = await GET(new Request("https://local.test/api/locations?q=海淀")); expect(response.status).toBe(503); expect(await response.json()).toEqual({ data: null, error: { code: "LOCATION_UNAVAILABLE", message: "地点服务暂时不可用，请稍后重试。" } });
    const missing = locationErrorResponse(new LocationError("LOCATION_NOT_FOUND")); expect(missing.status).toBe(404);
    expect(JSON.stringify(await locationErrorResponse(new Error("private token")).json())).not.toContain("private");
  });
});
