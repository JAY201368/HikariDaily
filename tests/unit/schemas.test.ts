import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AIR_UNITS, BriefingSchema, createMetricSchema, InstantSchema, NumberMetricSchema, OpportunitySchema,
  SourceSchema, WEATHER_UNITS, WeatherMetricNameSchema } from "../../src/domain/schemas";
import { fixtureProvenance, missingMetric, syntheticBriefing } from "../fixtures/domain-synthetic";

describe("complete public domain contract", () => {
  it("accepts the explicitly artificial full nested Briefing without fabricating missing values", () => {
    const briefing = syntheticBriefing();
    expect(fixtureProvenance.kind).toContain("人工合成");
    expect(BriefingSchema.parse(briefing)).toEqual(briefing);
    expect(briefing.hours[0].weather.visibility.value).toBeNull();
    expect(Object.keys(WEATHER_UNITS)).toEqual(WeatherMetricNameSchema.options);
    expect(AIR_UNITS).toEqual({ pm25: "μg/m³", pm10: "μg/m³", referenceAqi: "US_EPA" });
  });
  it("enforces missing iff null, preserves zero and notes/alternatives for stale conflicts", () => {
    expect(NumberMetricSchema.parse(missingMetric()).value).toBeNull();
    expect(NumberMetricSchema.parse({ ...missingMetric(), value: 0, state: "ok" }).value).toBe(0);
    for (const state of ["ok", "stale", "conflict"]) expect(NumberMetricSchema.safeParse({ ...missingMetric(), state }).success).toBe(false);
    expect(NumberMetricSchema.safeParse({ ...missingMetric(), value: 0 }).success).toBe(false);
    expect(NumberMetricSchema.safeParse({ ...missingMetric(), value: NaN, state: "ok" }).success).toBe(false);
    const metric = { value: 12, state: "stale", sourceIds: ["a"], notes: ["旧数据", "与b分歧"],
      alternatives: [{ sourceId: "b", value: 20 }] };
    expect(NumberMetricSchema.parse(metric)).toEqual(metric);
    expect(createMetricSchema(z.string()).parse({ ...metric, value: "cloudy", alternatives: [] }).value).toBe("cloudy");
  });
  it.each(["2026-10-22T12:00:00", "2026-02-30T00:00:00Z", "2026-10-22", "not ISO"])("rejects invalid absolute ISO: %s", (value) => {
    expect(InstantSchema.safeParse(value).success).toBe(false);
  });
  it("accepts Z and offset instants and retains unknown source metadata as null", () => {
    expect(InstantSchema.parse("2026-10-22T04:00:00Z")).toContain("Z");
    const source = syntheticBriefing().sources[0];
    expect(SourceSchema.parse(source).issuedAt).toBeNull();
    expect(SourceSchema.safeParse({ ...source, validFrom: "2026-10-23T00:00:00Z", validTo: "2026-10-22T00:00:00Z" }).success).toBe(false);
    expect(SourceSchema.safeParse({ ...source, attributionUrl: "javascript:alert(1)" }).success).toBe(false);
  });
  it.each([23, 25])("rejects %i hours", (count) => {
    const briefing = syntheticBriefing();
    briefing.hours = Array.from({ length: count }, (_, index) => briefing.hours[index % 24]);
    expect(BriefingSchema.safeParse(briefing).success).toBe(false);
  });
  it("rejects duplicate, skipped, wrong-date, partial-hour and reversed slots", () => {
    for (const mutate of [
      (b: ReturnType<typeof syntheticBriefing>) => { b.hours[1] = b.hours[0]; },
      (b: ReturnType<typeof syntheticBriefing>) => { b.localDate = "2026-10-23"; },
      (b: ReturnType<typeof syntheticBriefing>) => { b.hours[0].end = b.hours[0].start; },
      (b: ReturnType<typeof syntheticBriefing>) => { b.hours[0].start = "2026-10-22T00:01:00+08:00"; },
    ]) {
      const briefing = syntheticBriefing(); mutate(briefing);
      expect(BriefingSchema.safeParse(briefing).success).toBe(false);
    }
  });
  it("rejects incomplete nesting, unknown fields/versions/codes, impossible ranges and mismatched genres", () => {
    const base = syntheticBriefing();
    for (const patch of [{ schemaVersion: "1" }, { schemaVersion: "3" }, { interpretation: undefined }, { rulesVersion: "other" }, { advice: { landscape: base.advice.landscape } },
      { unexpected: "not public" }, { location: { ...base.location, latitude: 91 } }]) {
      expect(BriefingSchema.safeParse({ ...base, ...patch }).success).toBe(false);
    }
    for (const [name, value] of [["humidity", 101], ["precipitation", -1], ["weatherCode", 999], ["windFrom", 360]]) {
      const b = syntheticBriefing();
      Object.assign(b.hours[0].weather, { [name]: { value, state: "ok", sourceIds: ["synthetic-weather"], notes: [] } });
      expect(BriefingSchema.safeParse(b).success).toBe(false);
    }
    const b = syntheticBriefing(); b.advice.street.genre = "portrait";
    expect(BriefingSchema.safeParse(b).success).toBe(false);
    b.advice.street.genre = "street"; b.summary.temperatureRange.coveredHours = 1;
    expect(BriefingSchema.safeParse(b).success).toBe(false);
  });
  it("separates unknown from all five assessed levels and disallows high confidence/probability fields", () => {
    const unknown = syntheticBriefing().sunsetOpportunity;
    expect(OpportunitySchema.safeParse({ ...unknown, level: 1 }).success).toBe(false);
    for (const level of [1, 2, 3, 4, 5]) {
      const value = { ...unknown, status: "assessed", level, targetTime: "2026-10-22T17:30:00+08:00", confidence: "medium" };
      expect(OpportunitySchema.safeParse(value).success).toBe(true);
      expect(OpportunitySchema.safeParse({ ...value, confidence: "high" }).success).toBe(false);
      expect(OpportunitySchema.safeParse({ ...value, probability: 0.5 }).success).toBe(false);
    }
  });
  it("reports malformed nested dates through safeParse without throwing", () => {
    const briefing = syntheticBriefing();
    briefing.localDate = "2026-02-30";
    expect(BriefingSchema.safeParse(briefing).success).toBe(false);
    briefing.localDate = "2026-10-22";
    briefing.solar.sunrise = "not ISO";
    expect(BriefingSchema.safeParse(briefing).success).toBe(false);
  });
  it("preserves overall unavailable/stale/failure precedence independently of solar success", () => {
    const briefing = syntheticBriefing();
    briefing.solar.sunrise = "2026-10-22T06:00:00+08:00";
    expect(BriefingSchema.safeParse(briefing).success).toBe(true);
    briefing.state = "ready";
    expect(BriefingSchema.safeParse(briefing).success).toBe(false);
    briefing.hours[0].weather.temperature = { value: 15, state: "stale", notes: ["旧缓存"], sourceIds: ["synthetic-weather"] };
    briefing.state = "partial";
    expect(BriefingSchema.safeParse(briefing).success).toBe(false);
    briefing.state = "stale";
    expect(BriefingSchema.safeParse(briefing).success).toBe(true);
    briefing.hours[0].weather.temperature.state = "ok";
    briefing.state = "ready";
    expect(BriefingSchema.safeParse(briefing).success).toBe(false);
    briefing.state = "partial";
    expect(BriefingSchema.safeParse(briefing).success).toBe(true);
  });
});
