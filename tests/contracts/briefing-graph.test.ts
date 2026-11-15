import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createBriefingGraph } from "../../src/server/briefing-service/graph";
import { createBriefingService } from "../../src/server/briefing-service/service";
import type { BriefingResult } from "../../src/server/briefing-service/service";
import { demoSourceSnapshots, demoSunsetField } from "../../src/server/source-loader/fixtures";
import { createSourceLoader } from "../../src/server/source-loader/loader";
import { readSourceConfig } from "../../src/server/source-loader/config";
import type { LoadedSources } from "../../src/server/source-loader/loader";
import { analyzeGenreAdvice, analyzePhotography } from "../../src/domain/photography";
import { normalizeSources } from "../../src/domain/normalization";
import type { NormalizedDay, SourceTarget } from "../../src/domain/normalization";
import { calculateSolarEvents } from "../../src/domain/solar";
import { BriefingSchema } from "../../src/domain/schemas";
import { createInterpretation } from "../../src/content/interpret";
import type { InterpretationInput } from "../../src/content/interpret";
import { createSummary } from "../../src/content/summary";
import type { Genre, GenreAdvice, Location, Opportunity, SolarEvents, Summary } from "../../src/domain/types";
import { syntheticBriefing } from "../fixtures/domain-synthetic";

const now = Date.parse("2026-10-23T12:00:00+08:00");
const location = syntheticBriefing().location;
const genres = ["landscape", "portrait", "street"] as const;
const nodeNames = [
  "validate_request", "resolve_location", "prepare_target", "load_sources", "calculate_solar", "refresh_time",
  "normalize_weather", "analyze_light", "analyze_risks", "assess_sunset", "assemble_hours",
  "advise_landscape", "advise_portrait", "advise_street", "collect_advice", "interpret", "summarize",
  "collect_provenance", "classify_quality", "assemble_briefing", "validate_briefing", "build_result",
];
type AdviceInput = {
  day: NormalizedDay; solar: SolarEvents; location: Location; now: string | number;
  sunsetOpportunity: Opportunity; genre: Genre;
};
type SummaryInput = {
  hours: InterpretationInput["hours"]; advice: InterpretationInput["advice"];
  interpretation: ReturnType<typeof createInterpretation>;
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function sources(target: SourceTarget, at = now): LoadedSources {
  return { snapshots: demoSourceSnapshots(target, at), sunset: demoSunsetField(target, at),
    mode: "fixture", cacheStatus: "unused", warnings: [] };
}
function setup() {
  const clock = vi.fn(() => now);
  const resolveLocation = vi.fn(async () => location);
  const loadSources = vi.fn(async (target: SourceTarget) => sources(target, clock()));
  return { clock, resolveLocation, loadSources };
}
async function updates(graph: ReturnType<typeof createBriefingGraph>, place: unknown) {
  const visits: string[] = [];
  let result: BriefingResult | undefined;
  for await (const update of await graph.stream({ place }, { streamMode: "updates" })) {
    for (const [name, value] of Object.entries(update)) {
      visits.push(name);
      const patch = value as { result?: BriefingResult };
      if (patch.result) result = patch.result;
    }
  }
  return { visits, result };
}

describe("Briefing LangGraph execution contracts (artificial sources)", () => {
  it("runs the real source graph through the Briefing graph and SSR facade with explicit fixtures", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fixture must not fetch"));
    const fixture = vi.fn(demoSourceSnapshots);
    const sunsetFixture = vi.fn(demoSunsetField);
    const loadSources = vi.fn(createSourceLoader({
      config: readSourceConfig({ NODE_ENV: "test", HIKARI_SOURCE_MODE: "fixture" }), clock: () => now,
      fixture, sunsetFixture,
    }));
    const deps = { clock: () => now, resolveLocation: async () => location, loadSources };
    try {
      const { result } = await createBriefingGraph(deps).invoke({ place: location.id });
      expect(result).toMatchObject({ status: 200, error: null });
      const briefing = BriefingSchema.parse(result.data);
      expect(await createBriefingService(deps)(location.id)).toEqual(result);
      expect(briefing.hours).toHaveLength(24);
      expect(briefing.sunsetOpportunity.status).toBe("assessed");
      expect(briefing.warnings.join(" ")).toContain("演示数据");
      expect(briefing.sources.map(source => source.id)).toEqual([
        "open-meteo-gfs", "met-norway", "open-meteo-cams", "open-meteo-ecmwf-sunset", "suncalc",
      ]);
      expect(loadSources).toHaveBeenCalledTimes(2);
      expect(fixture).toHaveBeenCalledTimes(2);
      expect(sunsetFixture).toHaveBeenCalledTimes(2);
      expect(upstream).not.toHaveBeenCalled();
    } finally { upstream.mockRestore(); }
  });

  it("matches the facade and existing pure domain analysis without changing the public document", async () => {
    const deps = setup();
    const graph = createBriefingGraph(deps);
    const { result } = await graph.invoke({ place: location.id });
    expect(result).toEqual(await createBriefingService(setup())(location.id));
    expect(result).toMatchObject({ status: 200, error: null });
    const briefing = BriefingSchema.parse(result?.data);
    const target = { locationId: location.id, latitude: location.latitude, longitude: location.longitude, localDate: "2026-10-23" };
    const loaded = sources(target);
    const expected = analyzePhotography(normalizeSources(target, loaded.snapshots),
      calculateSolarEvents(target.localDate, location), location, now, loaded.sunset);
    expect(briefing).toMatchObject(expected);
    expect(briefing.warnings.join(" ")).toContain("演示数据");
    expect(deps.loadSources).toHaveBeenCalledExactlyOnceWith(target);
  });

  it("executes every mapped responsibility as a real graph node exactly once", async () => {
    const deps = setup();
    const { visits, result } = await updates(createBriefingGraph(deps), location.id);
    expect([...visits].sort()).toEqual([...nodeNames].sort());
    expect(new Set(visits).size).toBe(visits.length);
    expect(result?.status).toBe(200);
    BriefingSchema.parse(result?.data);
    expect(deps.resolveLocation).toHaveBeenCalledOnce();
    expect(deps.loadSources).toHaveBeenCalledOnce();
  });

  it("short-circuits invalid location input before resolution, loading or analysis", async () => {
    const deps = setup();
    const { visits, result } = await updates(createBriefingGraph(deps), "https://invalid-location.test");
    expect(result).toMatchObject({ status: 400, data: null, error: { code: "INVALID_LOCATION" } });
    expect(visits).toContain("validate_request");
    expect(visits).not.toContain("resolve_location");
    expect(visits).not.toContain("load_sources");
    expect(visits).not.toContain("analyze_light");
    expect(deps.resolveLocation).not.toHaveBeenCalled();
    expect(deps.loadSources).not.toHaveBeenCalled();
  });

  it("runs three asynchronous genre nodes concurrently and joins their single results", async () => {
    const gate = deferred();
    const calls: AdviceInput[] = [];
    const advise = vi.fn(async (input: AdviceInput) => {
      calls.push(input);
      await gate.promise;
      return { ...analyzeGenreAdvice(input.day, input.solar, input.location, input.genre, input.now, input.sunsetOpportunity),
        timing: `异步${input.genre}建议` };
    });
    const graph = createBriefingGraph(setup(), { genreAdvice: { landscape: advise, portrait: advise, street: advise } });
    const pending = graph.invoke({ place: location.id });
    try {
      await vi.waitFor(() => expect(calls.map(input => input.genre).sort()).toEqual([...genres].sort()));
    } finally { gate.resolve(); }
    const { result } = await pending;
    const briefing = BriefingSchema.parse(result?.data);
    expect(advise).toHaveBeenCalledTimes(3);
    for (const genre of genres) {
      expect(calls.filter(input => input.genre === genre)).toHaveLength(1);
      expect(briefing.advice[genre].timing).toBe(`异步${genre}建议`);
    }
    expect(calls.every(input => input.now === now && input.location.id === location.id && input.day.hours.length === 24)).toBe(true);
  });

  it("passes awaited capability outputs into interpretation, summary and final schema validation", async () => {
    const interpretation = vi.fn(async (input: InterpretationInput) => {
      await Promise.resolve();
      return { ...createInterpretation(input), headline: "异步解释节点结果" };
    });
    const summary = vi.fn(async (input: SummaryInput) => {
      await Promise.resolve();
      return { ...createSummary(input.hours, input.advice, input.interpretation),
        opportunities: [input.advice.landscape.timing] };
    });
    const graph = createBriefingGraph(setup(), {
      genreAdvice: { landscape: async input => ({
        ...analyzeGenreAdvice(input.day, input.solar, input.location, input.genre, input.now, input.sunsetOpportunity),
        timing: "异步风光建议结果",
      }) }, interpretation, summary,
    });
    const { result } = await graph.invoke({ place: location.id });
    const briefing = BriefingSchema.parse(result?.data);
    expect(interpretation).toHaveBeenCalledOnce();
    expect(summary).toHaveBeenCalledOnce();
    expect(interpretation.mock.calls[0][0].advice.landscape.timing).toBe("异步风光建议结果");
    expect(summary.mock.calls[0][0].interpretation.headline).toBe("异步解释节点结果");
    expect(briefing.summary).toMatchObject({ headline: "异步解释节点结果", opportunities: ["异步风光建议结果"] });
    expect(briefing.interpretation.headline).toBe("异步解释节点结果");
  });

  it("isolates capability input mutations and late output writes from sibling nodes and the final document", async () => {
    const baseline = await createBriefingService(setup())(location.id);
    const returnedAdvice: GenreAdvice[] = [];
    let returnedInterpretation: ReturnType<typeof createInterpretation> | undefined;
    let returnedSummary: Summary | undefined;
    const advise = vi.fn(async (input: AdviceInput) => {
      const output = analyzeGenreAdvice(input.day, input.solar, input.location, input.genre, input.now, input.sunsetOpportunity);
      returnedAdvice.push(output);
      input.day.hours[0].weather.temperature.value = -90;
      input.day.hours[0].riskInputs[0].weather.weatherCode.value = 95;
      input.day.sources[0].id = "mutated-advice-source";
      input.solar.sunset = null;
      input.location.name = "变更后的扩展输入地点";
      input.location.longitude = 0;
      input.sunsetOpportunity.level = 1;
      input.sunsetOpportunity.reasons.push("扩展内部变更");
      return output;
    });
    const interpretation = vi.fn(async (input: InterpretationInput) => {
      const output = createInterpretation(input);
      returnedInterpretation = output;
      input.hours[0].weather.temperature.value = -80;
      input.hours[0].risks.push({ code: "thunderstorm", start: input.hours[0].start, end: input.hours[0].end,
        message: "扩展内部增加的风险", sourceIds: ["mutated-interpretation-source"] });
      input.advice.landscape.timing = "解释扩展内部变更";
      input.solar.sunset = null;
      input.sources[0].id = "mutated-interpretation-source";
      input.sunsetOpportunity.reasons.length = 0;
      if (input.location) input.location.latitude = 0;
      return output;
    });
    const summary = vi.fn(async (input: SummaryInput) => {
      const output = createSummary(input.hours, input.advice, input.interpretation);
      returnedSummary = output;
      input.hours[0].weather.temperature.value = -70;
      input.hours[0].risks.length = 0;
      input.advice.portrait.timing = "摘要扩展内部变更";
      input.interpretation.headline = "摘要扩展修改了解释输入";
      return output;
    });
    const graph = createBriefingGraph(setup(), {
      genreAdvice: { landscape: advise, portrait: advise, street: advise }, interpretation, summary,
    });
    const { result } = await graph.invoke({ place: location.id });
    expect(result).toEqual(baseline);
    expect(advise).toHaveBeenCalledTimes(3);
    expect(interpretation).toHaveBeenCalledOnce();
    expect(summary).toHaveBeenCalledOnce();
    for (const output of returnedAdvice) output.timing = "返回之后的建议变更";
    returnedInterpretation!.headline = "返回之后的解释变更";
    returnedSummary!.headline = "返回之后的摘要变更";
    expect(result).toEqual(baseline);
    BriefingSchema.parse(result.data);
  });

  it("rejects an invalid capability result instead of returning a malformed public Briefing", async () => {
    const summary = async (input: SummaryInput) => {
      const result = createSummary(input.hours, input.advice, input.interpretation);
      result.temperatureRange.coveredHours = 25;
      return result;
    };
    const graph = createBriefingGraph(setup(), { summary });
    await expect(graph.invoke({ place: location.id })).rejects.toMatchObject({ name: "ZodError" });
    expect(await createBriefingService(setup(), { summary })(location.id))
      .toMatchObject({ status: 503, data: null, error: { code: "BRIEFING_UNAVAILABLE" } });
  });

  it("isolates location, source target and completion clock across concurrent invocations", async () => {
    const firstGate = deferred();
    const secondGate = deferred();
    const other = { ...location, id: "geonames:1804651", name: "另一人工合成地点", latitude: 31.06, longitude: 112.2 };
    let current = now;
    const loadSources = vi.fn(async (target: SourceTarget) => {
      await (target.locationId === location.id ? firstGate : secondGate).promise;
      return sources(target, current);
    });
    const graph = createBriefingGraph({ clock: () => current,
      resolveLocation: async id => id === location.id ? location : other, loadSources });
    const first = graph.invoke({ place: location.id });
    await vi.waitFor(() => expect(loadSources).toHaveBeenCalledTimes(1));
    current = now + 1_000;
    const second = graph.invoke({ place: other.id });
    try {
      await vi.waitFor(() => expect(loadSources).toHaveBeenCalledTimes(2));
      current = now + 2_000;
      secondGate.resolve();
      const secondResult = (await second).result;
      current = now + 3_000;
      firstGate.resolve();
      const firstResult = (await first).result;
      const a = BriefingSchema.parse(firstResult?.data);
      const b = BriefingSchema.parse(secondResult?.data);
      expect(a.location).toEqual(location);
      expect(b.location).toEqual(other);
      expect(Date.parse(a.generatedAt)).toBe(now + 3_000);
      expect(Date.parse(b.generatedAt)).toBe(now + 2_000);
      expect(loadSources.mock.calls.map(([target]) => target.locationId)).toEqual([location.id, other.id]);
      expect(a.solar.sunset).not.toBe(b.solar.sunset);
      expect(Date.parse(a.sources.find(source => source.id === "open-meteo-gfs")!.fetchedAt!)).toBe(Date.parse(a.generatedAt));
      expect(Date.parse(b.sources.find(source => source.id === "open-meteo-gfs")!.fetchedAt!)).toBe(Date.parse(b.generatedAt));
    } finally { firstGate.resolve(); secondGate.resolve(); }
  });

  it("stops the graph after loading crosses Shanghai midnight without relabelling the previous day", async () => {
    const deps = setup();
    deps.clock.mockReturnValue(Date.parse("2026-10-23T23:59:59+08:00"));
    deps.loadSources.mockImplementation(async target => {
      deps.clock.mockReturnValue(Date.parse("2026-10-24T00:00:01+08:00"));
      return sources(target, now);
    });
    const { visits, result } = await updates(createBriefingGraph(deps), location.id);
    expect(result).toMatchObject({ status: 503, data: null, error: { code: "BRIEFING_UNAVAILABLE" } });
    expect(visits).toContain("refresh_time");
    expect(visits).not.toContain("advise_landscape");
    expect(visits).not.toContain("interpret");
    expect(deps.loadSources.mock.calls[0][0].localDate).toBe("2026-10-23");
  });
});
