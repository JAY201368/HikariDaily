import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createBriefingService } from "../../src/server/briefing-service/service";
import { buildBriefingSummary } from "../../src/server/briefing-service/summary";
import { demoSourceSnapshots, demoSunsetField } from "../../src/server/source-loader/fixtures";
import { SUNSET_SOURCE_ID } from "../../src/domain/photography/sunset-input";
import { createSnapshot, SOURCE_IDS } from "../../src/domain/normalization";
import { BriefingSchema } from "../../src/domain/schemas";
import { LocationError } from "../../src/server/http/errors";
import { syntheticBriefing } from "../fixtures/domain-synthetic";
import type { LoadedSources } from "../../src/server/source-loader/loader";
import type { SourceSnapshot, SourceTarget } from "../../src/domain/normalization";

const now = Date.parse("2026-10-23T12:00:00+08:00");
const location = syntheticBriefing().location;
function setup(mutate: (snapshots: SourceSnapshot[]) => void = () => {}, mode: LoadedSources["mode"] = "live") {
  const clock = vi.fn(() => now);
  const resolveLocation = vi.fn(async () => location);
  const loadSources = vi.fn(async (target: SourceTarget): Promise<LoadedSources> => {
    const snapshots = demoSourceSnapshots(target, clock());
    mutate(snapshots);
    return { snapshots, sunset: demoSunsetField(target, clock()), mode, cacheStatus: "unused", warnings: [] };
  });
  return { clock, resolveLocation, loadSources, service: createBriefingService({ clock, resolveLocation, loadSources }) };
}
describe("T07 shared request-time Briefing assembly (artificial sources)", () => {
  it("assembles one validated 24h document, three genres and separately attributed solar", async () => {
    const { service, loadSources } = setup();
    const result = await service(location.id);
    expect(result.status).toBe(200); expect(result.error).toBeNull();
    const b = BriefingSchema.parse(result.data);
    expect(b.state).toBe("ready"); expect(b.localDate).toBe("2026-10-23"); expect(b.hours).toHaveLength(24);
    expect(Object.keys(b.advice)).toEqual(["landscape", "portrait", "street"]);
    expect(b.sources.find((s) => s.id === "suncalc")).toMatchObject({ kind: "astronomical", fetchedAt: null });
    expect(loadSources).toHaveBeenCalledWith({ locationId: location.id, latitude: location.latitude, longitude: location.longitude, localDate: b.localDate });
    expect(b.hours[12].light.altitude).not.toBeNull();
    expect(b.sources.find(s => s.id === SUNSET_SOURCE_ID)?.model).toBe("ecmwf_ifs");
    expect(b.sunsetOpportunity.sourceIds).toContain(SUNSET_SOURCE_ID);
    expect(b.sunsetOpportunity.status).toBe("assessed");
  });
  it.each(["failed", "disabled", "stale"] as const)("preserves the dedicated sunset source %s in state and explanations", async status => {
    const deps = setup();
    const loaded = await deps.loadSources({ locationId: location.id, latitude: location.latitude, longitude: location.longitude, localDate: "2026-10-23" });
    loaded.sunset!.source.status = status;
    deps.loadSources.mockResolvedValue(loaded);
    const result = await deps.service(location.id);
    expect(result.data?.sources.find(s => s.id === SUNSET_SOURCE_ID)?.status).toBe(status);
    expect(result.data?.state).toBe(status === "stale" ? "stale" : "partial");
    expect(result.data?.sunsetOpportunity.status).toBe(status === "stale" ? "assessed" : "unknown");
    if (status !== "stale") expect(result.data?.interpretation.dataNote).toContain("日落方向的云场");
  });
  it("does not fall back to the previous local rule when the dedicated field is absent", async () => {
    const deps = setup();
    const loaded = await deps.loadSources({ locationId: location.id, latitude: location.latitude, longitude: location.longitude, localDate: "2026-10-23" });
    delete loaded.sunset;
    deps.loadSources.mockResolvedValue(loaded);
    const result = await deps.service(location.id);
    expect(result.data?.sunsetOpportunity).toMatchObject({ status: "unknown", level: null });
    expect(result.data?.state).toBe("partial");
  });
  it("assesses cold downloads using the completion clock rather than rejecting a later fetchedAt", async () => {
    const deps = setup();
    deps.loadSources.mockImplementation(async target => {
      const finished = now + 2_000;
      deps.clock.mockReturnValue(finished);
      return { snapshots: demoSourceSnapshots(target, finished), sunset: demoSunsetField(target, finished),
        mode: "live", warnings: [], cacheStatus: "unused" };
    });
    const result = await deps.service(location.id);
    expect(result.data?.sunsetOpportunity.status).toBe("assessed");
    expect(Date.parse(result.data!.generatedAt)).toBe(now + 2_000);
  });
  it("does not relabel the previous day's field when loading crosses Shanghai midnight", async () => {
    const deps = setup();
    deps.clock.mockReturnValue(Date.parse("2026-10-23T23:59:59+08:00"));
    deps.loadSources.mockImplementation(async target => {
      deps.clock.mockReturnValue(Date.parse("2026-10-24T00:00:01+08:00"));
      return { snapshots: demoSourceSnapshots(target, now), sunset: demoSunsetField(target, now),
        mode: "live", warnings: [], cacheStatus: "unused" };
    });
    expect(await deps.service(location.id)).toMatchObject({ status: 503, data: null, error: { code: "BRIEFING_UNAVAILABLE" } });
  });
  it.each(["failed", "disabled"] as const)("returns 200 partial for %s MET and preserves reason", async (status) => {
    const result = await setup((s) => { s[1].source.status = status; s[1].notes.push("MET_IDENTITY_REQUIRED"); }).service(location.id);
    expect(result).toMatchObject({ status: 200, data: { state: "partial" } });
    expect(result.data!.warnings.join(" ")).toContain("MET_IDENTITY_REQUIRED");
    if (status === "disabled") expect(result.data!.warnings.join(" ")).toContain("已禁用");
  });
  it("uses stale before partial, including stale crosscheck risk data hidden by primary", async () => {
    const result = await setup((s) => { s[1].source.status = "stale"; s[2].source.status = "failed"; }).service(location.id);
    expect(result).toMatchObject({ status: 200, data: { state: "stale" } });
  });
  it("core missing is partial even when source status is ok", async () => {
    const result = await setup((s) => { s[0].hours[0].weather.visibility = { value: null, state: "missing", sourceIds: [], notes: ["fixture missing"] }; s[1].hours[0].weather.visibility = { value: null, state: "missing", sourceIds: [], notes: ["fixture missing"] }; }).service(location.id);
    expect(result.data?.state).toBe("partial");
  });
  it("all weather AND air missing yields 503 with solar, never astronomical ready", async () => {
    const result = await setup((s) => { s.forEach((snapshot, i) => { s[i] = createSnapshot({ ...snapshot.source, status: "failed" }, snapshot.adapterVersion, snapshot.target, "fixture failure"); }); }).service(location.id);
    expect(result).toMatchObject({ status: 503, error: { code: "WEATHER_UNAVAILABLE" }, data: { state: "unavailable" } });
    expect(result.data!.solar.sunset).not.toBeNull(); BriefingSchema.parse(result.data);
    expect(result.data!.hours.flatMap((h) => [...Object.values(h.weather), ...Object.values(h.air)]).every((m) => m.value === null)).toBe(true);
  });
  it("one air value still means partial rather than unavailable", async () => {
    const result = await setup((s) => { s[0].source.status = "failed"; s[1].source.status = "disabled"; }).service(location.id);
    expect(result).toMatchObject({ status: 200, data: { state: "partial" } });
  });
  it.each([
    ["thunderstorm", 0, "weatherCode", 95],
    ["heavy-rain", 0, "precipitation", 5],
    ["strong-wind", 0, "windGust", 17.2],
    ["air-quality", 2, "referenceAqi", 151],
  ] as const)("T11 artificial %s remains a valid public Briefing without internal hour fields", async (code, source, field, value) => {
    const result = await setup((snapshots) => {
      for (const hour of snapshots[source].hours) {
        const group = source === 2 ? hour.air : hour.weather;
        (group as Record<string, { value: number | null }>)[field].value = value;
      }
    }).service(location.id);
    expect(result.status).toBe(200);
    const b = BriefingSchema.parse(result.data);
    for (const hour of b.hours) {
      const risk = hour.risks.find((r) => r.code === code);
      expect(risk).toBeDefined();
      expect(Object.keys(risk!).sort()).toEqual(["code", "end", "message", "sourceIds", "start"]);
      expect(risk).toMatchObject({ start: hour.start, end: hour.end });
      expect(risk!.message).toMatch(/雷雨|雨势较大|风很大|美国标准 AQI/);
    }
    if (code !== "air-quality") for (const advice of Object.values(b.advice)) expect(advice.recommendedWindows).toEqual([]);
    expect(b.interpretation.risks[0]).toMatchObject({ code, status: "current" });
    if (code !== "air-quality") expect(b.summary.headline).toMatch(/^全天(有雷雨|雨势较大|风很大)/);
    expect(b.interpretation.nextUp[0]).toBe(b.interpretation.risks[0].text);
  });
  it("preserves notes, model grid and fixture notice without changing public schema", async () => {
    const result = await setup((s) => { s[0].grid = { latitude: 31.2, longitude: 121.5 }; s[0].notes.push("SOURCE_FAILURE_NOTE"); }, "fixture").service(location.id);
    expect(result.data!.warnings.join(" ")).toContain("演示数据");
    expect(result.data!.warnings.join(" ")).toContain("模型格点 31.2, 121.5");
    expect(result.data!.warnings.join(" ")).toContain("SOURCE_FAILURE_NOTE");
    expect(result.data!.sources.map((s) => s.id)).toContain(SOURCE_IDS.weather);
  });
  it("does not cache conclusions; captures explicit now and Shanghai midnight per invocation", async () => {
    const deps = setup();
    deps.clock.mockReturnValue(Date.parse("2026-10-23T23:59:59+08:00"));
    const first = await deps.service(location.id);
    deps.clock.mockReturnValue(Date.parse("2026-10-24T00:00:00+08:00"));
    const second = await deps.service(location.id);
    expect(first.data?.localDate).toBe("2026-10-23"); expect(second.data?.localDate).toBe("2026-10-24");
    expect(first.data?.advice.landscape.recommendedWindows).toEqual([]);
    expect(deps.loadSources).toHaveBeenCalledTimes(2);
  });
  it("same now/location/sources is deterministic and summary never promotes past windows", async () => {
    const { service } = setup();
    const a = await service(location.id); const b = await service(location.id);
    expect(a).toEqual(b);
    const summary = buildBriefingSummary(a.data!, "street");
    expect(summary).toMatchObject({ location: location.name, localDate: a.data!.localDate, generatedAt: a.data!.generatedAt });
    expect(summary.link).toContain("genre=street");
    if (summary.opportunity) expect(Date.parse(summary.opportunity.end)).toBeGreaterThan(now);
    const past = structuredClone(a.data!); past.generatedAt = "2026-10-23T23:59:59+08:00";
    expect(buildBriefingSummary(past).opportunity).toBeNull();
  });
  it.each(["https://secret.test", "geonames:0", "31,121", undefined])("invalid input never resolves/loads %s", async (place) => {
    const deps = setup(); expect(await deps.service(place)).toMatchObject({ status: 400, error: { code: "INVALID_LOCATION" }, data: null });
    expect(deps.resolveLocation).not.toHaveBeenCalled(); expect(deps.loadSources).not.toHaveBeenCalled();
  });
  it.each([["LOCATION_NOT_FOUND", 404], ["LOCATION_UNAVAILABLE", 503]] as const)("preserves location failure %s", async (code, status) => {
    const deps = setup(); deps.resolveLocation.mockRejectedValue(new LocationError(code));
    expect(await deps.service(location.id)).toMatchObject({ status, data: null, error: { code } }); expect(deps.loadSources).not.toHaveBeenCalled();
  });
  it("sanitizes unexpected location, source and schema errors", async () => {
    const deps = setup(); deps.resolveLocation.mockRejectedValueOnce(new Error("secret location token"));
    expect(JSON.stringify(await deps.service(location.id))).not.toContain("secret");
    deps.loadSources.mockRejectedValueOnce(new Error("secret source token"));
    expect(await deps.service(location.id)).toMatchObject({ status: 503, data: null, error: { code: "BRIEFING_UNAVAILABLE" } });
    deps.loadSources.mockResolvedValueOnce({ snapshots: [{} as SourceSnapshot], mode: "live", warnings: [], cacheStatus: "unused" });
    expect(await deps.service(location.id)).toMatchObject({ status: 503, data: null, error: { code: "BRIEFING_UNAVAILABLE" } });
  });
});
