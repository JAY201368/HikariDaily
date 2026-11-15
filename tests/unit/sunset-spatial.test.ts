import { describe, expect, it } from "vitest";
import { assessSunsetOpportunity, SUNSET_LIMITATION } from "../../src/domain/photography/sunset";
import { createSunsetSamplingPlan, SUNSET_MODEL_VERSION, SUNSET_SOURCE_ID, SunsetCloudFieldSchema } from "../../src/domain/photography/sunset-input";
import type { SunsetCloudField } from "../../src/domain/photography/sunset-input";
import { calculateSolarEvents, calculateSolarPosition } from "../../src/domain/solar";
import { createDayHours } from "../../src/domain/time";
import { HOUR_MS, OpportunitySchema } from "../../src/domain/schemas";
import { SOURCE_IDS } from "../../src/domain/normalization";
import { PHOTO_NOW, photoDay, photoSolar, photoMetric } from "../fixtures/photography-synthetic";

/** Synthetic cloud fields test geometry and failure contracts, not observed forecast accuracy. */
function field(): SunsetCloudField {
  const day = photoDay();
  return { modelVersion: SUNSET_MODEL_VERSION, target: { ...day.target }, sunsetTime: photoSolar.sunset,
    source: { ...day.sources[0], id: SUNSET_SOURCE_ID, provider: "人工合成云场", dataset: "人工合成ECMWF云场", model: "ecmwf_ifs",
      nativeResolution: "人工合成9km云场，非真实预报" },
    points: createSunsetSamplingPlan(day.target, photoSolar.sunset).map(point => ({ ...point,
      grid: { latitude: point.latitude, longitude: point.longitude },
      hours: createDayHours(day.target.localDate).map(hour => ({ time: hour.start,
        cloudTotal: point.distanceKm === 0 ? 20 : 0,
        cloudLow: point.distanceKm === 0 ? 10 : 0,
        cloudMid: point.distanceKm === 0 ? 50 : 0,
        cloudHigh: point.distanceKm === 0 ? 20 : 0,
        visibility: 25_000, precipitation: 0, humidity: 50,
      })),
    })), notes: ["人工合成测试，不验证真实气象准确率。"] };
}
function assess(input = field(), now = PHOTO_NOW) {
  return assessSunsetOpportunity(photoDay(now), photoSolar, now, input);
}

describe("ECMWF sunset sampling geometry", () => {
  it("uses the computed seasonal sunset bearing and canonical four-place coordinates", () => {
    const target = { ...photoDay().target, latitude: 28.68212345, longitude: 115.85898765, localDate: "2026-06-21" };
    const sunset = calculateSolarEvents(target.localDate, target).sunset!;
    const plan = createSunsetSamplingPlan(target, sunset);
    const azimuth = calculateSolarPosition(sunset, target).azimuth!;
    expect(plan).toHaveLength(16);
    expect(plan[0]).toEqual({ latitude: 28.6821, longitude: 115.8589, distanceKm: 0, bearing: azimuth });
    expect(plan.filter(point => point.distanceKm === 400).map(point => point.bearing)).toEqual([azimuth - 25, azimuth, azimuth + 25]);
    expect(Math.abs(azimuth - 270)).toBeGreaterThan(10);
    expect(new Set(plan.map(point => `${point.latitude},${point.longitude}`)).size).toBe(16);
    expect(createSunsetSamplingPlan(target, null)).toEqual([]);
  });
  it("rejects repeated or shifted points, invalid dates and misaligned hourly axes", () => {
    const invalid = field();
    invalid.points[1] = structuredClone(invalid.points[0]);
    expect(SunsetCloudFieldSchema.safeParse(invalid).success).toBe(false);
    const axis = field(); axis.points[0].hours[1].time = axis.points[0].hours[0].time;
    expect(SunsetCloudFieldSchema.safeParse(axis).success).toBe(false);
    const date = field(); date.target.localDate = "2026-99-99";
    expect(SunsetCloudFieldSchema.safeParse(date).success).toBe(false);
    const shifted = field(); shifted.points[1].longitude += 0.01;
    expect(assess(shifted).status).toBe("unknown");
  });
});

describe("formal spatial sunset assessment", () => {
  it("assesses a clear incoming path and reacts to a remote barrier with identical local weather", () => {
    const open = field();
    const blocked = structuredClone(open);
    blocked.points.filter(point => point.distanceKm > 0).forEach(point => point.hours.forEach(hour => {
      hour.cloudTotal = 100; hour.cloudLow = 100; hour.cloudMid = 100; hour.cloudHigh = 100;
    }));
    expect(open.points[0]).toEqual(blocked.points[0]);
    const favorable = assess(open), obstructed = assess(blocked);
    expect(favorable.status).toBe("assessed");
    expect(favorable.level).toBe(5);
    expect(obstructed.level).toBeLessThan(favorable.level!);
    expect(obstructed.level).toBeLessThanOrEqual(2);
    expect(favorable.sourceIds).toEqual([SUNSET_SOURCE_ID]);
    expect(favorable.reasons.join()).toContain("25–400公里");
    expect(favorable.limitations).toContain(SUNSET_LIMITATION);
    OpportunitySchema.parse(favorable);
  });
  it("does not reward cloudless clear weather and keeps substantial rain or local low cloud conservative", () => {
    const clear = field();
    clear.points.forEach(point => point.hours.forEach(hour => {
      hour.cloudTotal = 0; hour.cloudLow = 0; hour.cloudMid = 0; hour.cloudHigh = 0;
    }));
    expect(assess(clear).level).toBe(1);
    for (const [name, value] of [["cloudLow", 80], ["precipitation", 1]] as const) {
      const limited = field(); limited.points[0].hours.forEach(hour => { hour[name] = value; });
      expect(assess(limited).level).toBeLessThanOrEqual(2);
    }
  });
  it("requires the complete event cloud field, with no local GFS fallback", () => {
    expect(assessSunsetOpportunity(photoDay(), photoSolar, PHOTO_NOW)).toMatchObject({ status: "unknown", level: null });
    const incomplete = field(); incomplete.points.splice(3, 1);
    expect(assess(incomplete).status).toBe("unknown");
    const missing = field();
    const endHour = new Date(Date.parse(photoSolar.sunset!) + 30 * 60_000 + 8 * HOUR_MS).getUTCHours();
    missing.points[12].hours[endHour].cloudMid = null;
    expect(assess(missing).status).toBe("unknown");
    const local = field(); local.points[0].hours.forEach(hour => { hour.visibility = null; });
    expect(assess(local).status).toBe("unknown");
    const irrelevant = field(); irrelevant.points[12].hours[0].cloudMid = null;
    expect(assess(irrelevant).status).toBe("assessed");
  });
  it.each(["target", "model", "date", "source", "failed", "disabled", "future"])("rejects %s mismatch or unavailable source", kind => {
    const input = field();
    if (kind === "target") input.target.longitude += 1;
    if (kind === "model") input.source.model = "ecmwf_ifs025";
    if (kind === "date") input.sunsetTime = new Date(Date.parse(input.sunsetTime!) + 1).toISOString();
    if (kind === "source") input.source.id = "other";
    if (kind === "failed" || kind === "disabled") input.source.status = kind;
    if (kind === "future") input.source.fetchedAt = new Date(Date.parse(PHOTO_NOW) + 1).toISOString();
    expect(assess(input).status).toBe("unknown");
  });
  it("honors the 3h original-download boundary and the complete half-hour event window", () => {
    const input = field(); input.source.status = "stale";
    input.source.fetchedAt = new Date(Date.parse(PHOTO_NOW) - 3 * HOUR_MS).toISOString();
    expect(assess(input)).toMatchObject({ status: "assessed", level: 3, confidence: "low" });
    input.source.fetchedAt = new Date(Date.parse(PHOTO_NOW) - 3 * HOUR_MS - 1).toISOString();
    expect(assess(input).status).toBe("unknown");
    const exact = field();
    const to = Math.floor((Date.parse(photoSolar.sunset!) + 30 * 60_000) / HOUR_MS) * HOUR_MS + HOUR_MS;
    exact.source.validTo = new Date(to).toISOString();
    expect(assess(exact).status).toBe("assessed");
    exact.source.validTo = new Date(to - 1).toISOString();
    expect(assess(exact).status).toBe("unknown");
  });
  it("keeps the ECMWF cloud layers independent and reports conflicting GFS totals", () => {
    const day = photoDay();
    day.hours.forEach(hour => { hour.primaryWeather.cloudTotal = photoMetric(90); });
    const result = assessSunsetOpportunity(day, photoSolar, PHOTO_NOW, field());
    expect(result).toMatchObject({ status: "assessed", level: 3, confidence: "low" });
    expect(result.sourceIds).toEqual([SUNSET_SOURCE_ID, SOURCE_IDS.weather]);
    const absentGfs = photoDay(); absentGfs.sources[0].status = "failed";
    absentGfs.hours.forEach(hour => { hour.primaryWeather.cloudMid = photoMetric(null); });
    expect(assessSunsetOpportunity(absentGfs, photoSolar, PHOTO_NOW, field()).status).toBe("assessed");
  });
  it("is immutable, accepts reordered identified samples and uses retrospective wording after sunset", () => {
    const input = field(), day = photoDay();
    const before = JSON.stringify({ input, day });
    const original = assessSunsetOpportunity(day, photoSolar, PHOTO_NOW, input);
    expect(JSON.stringify({ input, day })).toBe(before);
    input.points.reverse(); expect(assess(input)).toEqual(original);
    const now = new Date(Date.parse(photoSolar.sunset!) + 1).toISOString();
    input.source.fetchedAt = now;
    const after = assess(input, now);
    expect(after.reasons[0]).toContain("当时");
    expect(after.limitations.join()).toContain("今天的日落已经过去");
  });
});
