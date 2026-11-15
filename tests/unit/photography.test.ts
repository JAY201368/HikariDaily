import { describe, expect, it } from "vitest";
import { analyzePhotography, assessHourRisks, assessLightAtPosition, assessSunsetOpportunity } from "../../src/domain/photography";
import { scoreConditions, mergeScoredWindows, selectRecommendedWindows, createScoredSlices, type ScoredWindow } from "../../src/domain/photography/windows";
import { BriefingSchema, GenreAdviceSchema, HourSchema, LightAssessmentSchema, OpportunitySchema, SummarySchema } from "../../src/domain/schemas";
import { missing, normalizeSources, SOURCE_IDS } from "../../src/domain/normalization";
import type { Genre, SolarEvents, WeatherMetricName } from "../../src/domain/types";
import { createGenreAdvice } from "../../src/content/advice";
import { suggestFilm } from "../../src/content/film-types";
import { syntheticBriefing } from "../fixtures/domain-synthetic";
import { PHOTOGRAPHY_FIXTURE_NOTICE, PHOTO_DATE, PHOTO_NOW, photoDay, photoLight, photoLocation, photoMetric, photoSolar, photoSunsetField } from "../fixtures/photography-synthetic";

const genres: Genre[] = ["landscape", "portrait", "street"];
const instant = (hour: number, minute = 0) => `${PHOTO_DATE}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`;
function scored(start: string, end: string, score = 80, reasonCodes = ["same"]): ScoredWindow {
  return { start, end, score, eligible: true, components: { L: 1, D: 2, W: 2, V: null }, status: "future", reasonCodes, reasons: ["人工合成理由"], limitations: [], sourceIds: ["synthetic"] };
}

describe("P6.2 source-first conservative risk screening", () => {
  it.each([95, 96, 97, 99] as const)("retains backup thunderstorm %i despite a clear primary", (code) => {
    const day = photoDay();
    day.hours.forEach((hour) => hour.riskInputs.push({ ...structuredClone(hour.riskInputs[0]),
      source: { ...day.sources[0], id: SOURCE_IDS.crosscheck },
      weather: { ...hour.riskInputs[0].weather, weatherCode: photoMetric(code, SOURCE_IDS.crosscheck) } }));
    expect(assessHourRisks(day.hours[12])).toEqual([expect.objectContaining({ code: "thunderstorm", sourceIds: [SOURCE_IDS.crosscheck], message: expect.stringContaining("分歧") })]);
    for (const genre of genres) expect(createScoredSlices(day, photoSolar, photoLocation, genre, PHOTO_NOW)).toEqual([]);
  });
  it.each([
    ["precipitation", 4.999, false, "heavy-rain"], ["precipitation", 5, true, "heavy-rain"],
    ["windSpeed", 17.199, false, "strong-wind"], ["windSpeed", 17.2, true, "strong-wind"],
    ["windGust", 17.199, false, "strong-wind"], ["windGust", 17.2, true, "strong-wind"],
  ] as const)("checks backup %s=%s at exact risk boundary", (field, value, expected, code) => {
    const hour = photoDay().hours[12];
    const backup = structuredClone(hour.riskInputs[0]);
    backup.source.id = SOURCE_IDS.crosscheck;
    backup.weather[field] = photoMetric(value, SOURCE_IDS.crosscheck);
    hour.riskInputs.push(backup);
    expect(assessHourRisks(hour).some((risk) => risk.code === code)).toBe(expected);
  });
  it("merges duplicate source risks and ignores failed/disabled sources", () => {
    const hour = photoDay().hours[12];
    hour.riskInputs[0].weather.weatherCode = photoMetric(97);
    const backup = structuredClone(hour.riskInputs[0]); backup.source.id = "backup";
    hour.riskInputs.push(backup);
    expect(assessHourRisks(hour)[0].sourceIds).toEqual([SOURCE_IDS.weather, "backup"]);
    backup.source.status = "disabled";
    expect(assessHourRisks(hour)[0].sourceIds).toEqual([SOURCE_IDS.weather]);
    backup.source.status = "failed";
    expect(assessHourRisks(hour)[0].sourceIds).toEqual([SOURCE_IDS.weather]);
  });
  it.each([["precipitation", 5], ["windSpeed", 17.2], ["windGust", 17.2]] as const)("backup %s danger removes every corresponding outdoor slice", (field, value) => {
    const day = photoDay();
    day.hours.forEach((hour) => {
      const backup = structuredClone(hour.riskInputs[0]); backup.source.id = SOURCE_IDS.crosscheck;
      backup.weather[field] = photoMetric(value, SOURCE_IDS.crosscheck); hour.riskInputs.push(backup);
    });
    for (const genre of genres) expect(createScoredSlices(day, photoSolar, photoLocation, genre, PHOTO_NOW)).toEqual([]);
  });
  it.each([150, 151])("AQI %i uses a US EPA warning without automatically removing all windows", (value) => {
    const day = photoDay();
    day.hours.forEach((hour) => { hour.air.referenceAqi = photoMetric(value, SOURCE_IDS.air);
      hour.riskInputs.find((input) => input.source.id === SOURCE_IDS.air)!.air.referenceAqi = hour.air.referenceAqi; });
    const risks = assessHourRisks(day.hours[12]);
    expect(risks.some((risk) => risk.code === "air-quality")).toBe(value === 151);
    if (value === 151) expect(risks[0].message).toContain("美国标准 AQI");
    expect(createScoredSlices(day, photoSolar, photoLocation, "street", PHOTO_NOW).length).toBeGreaterThan(0);
  });
});

describe("P6.2 light is conditional astronomy plus hourly cloud", () => {
  const none: SolarEvents = { sunrise: null, sunset: null, morningBlue: null, morningGolden: null, eveningBlue: null, eveningGolden: null, notes: [] };
  const at = (altitude: number, cloud: number | null, solar = none, time = instant(12)) =>
    assessLightAtPosition(time, { altitude, azimuth: 180, notes: [] }, photoMetric(cloud), solar);
  it.each([[25, "direct"], [25.01, "variable"], [74.99, "variable"], [75, "diffuse"]] as const)("cloud %s => %s", (cloud, character) => {
    expect(at(30, cloud).character).toBe(character);
  });
  it("handles altitude, cloud missing and invalid solar position without fabricated measurements", () => {
    expect(at(-6.01, 0).phase).toBe("night");
    expect(at(0, 25).character).toBe("direct");
    expect(at(30, 0).description).not.toContain("反差较强");
    expect(at(30.01, 0).description).toContain("反差较强");
    expect(at(40, 75).description).toContain("柔光");
    const unknown = at(40, null);
    expect(unknown.character).toBe("unknown"); expect(unknown.description).toContain("没有云量预报");
    expect(assessLightAtPosition(PHOTO_NOW, { altitude: null, azimuth: null, notes: [] }, photoMetric(20), none).phase).toBe("unknown");
    expect(LightAssessmentSchema.safeParse(unknown).success).toBe(true);
    expect(JSON.stringify(unknown)).not.toMatch(/lux|\bEV\b/);
  });
  it("uses half-open blue/golden boundaries and preserves cloud obstruction", () => {
    const solar = { ...none, morningBlue: { start: instant(5, 40), end: instant(6) }, morningGolden: { start: instant(6), end: instant(7) } };
    expect(at(-6, 90, solar, instant(5, 40)).phase).toBe("blue");
    expect(at(-4, 90, solar, instant(6)).phase).toBe("golden");
    expect(at(-4, 90, solar, instant(6)).reasons.join()).toContain("遮挡");
    expect(at(-4, 20, solar, instant(6)).character).toBe("unknown");
    expect(at(6, 20, solar, instant(7)).phase).toBe("day");
  });
});

describe("P6.3 exact components, ordered light rules and weights", () => {
  it.each([
    [0.1, 39.99, 2], [0.1, 40, 1], [0.1001, 10, 1], [0.999, 69.99, 1], [0.999, 70, 0],
    [1, 0, 0], [0, null, 1], [0.999, null, 1], [1, null, 0],
  ])("D: rain %s probability %s => %s", (rain, probability, expected) => {
    const hour = photoDay().hours[12]; hour.weather.precipitation = photoMetric(rain); hour.weather.precipitationProbability = photoMetric(probability);
    expect(scoreConditions("street", hour, photoLight())?.components.D).toBe(expected);
  });
  it.each([[3, 2], [3.001, 1], [6, 1], [6.001, 0]])("W: %s => %s", (wind, expected) => {
    const hour = photoDay().hours[12]; hour.weather.windSpeed = photoMetric(wind);
    expect(scoreConditions("street", hour, photoLight())?.components.W).toBe(expected);
  });
  it.each([[19999, 1], [20000, 2], [10000, 1], [9999, 0]])("V: %s m => %s", (visibility, expected) => {
    const hour = photoDay().hours[12]; hour.weather.visibility = photoMetric(visibility);
    expect(scoreConditions("landscape", hour, photoLight())?.components.V).toBe(expected);
  });
  it.each([
    ["landscape", "blue", "unknown", -5, 74.99, 2], ["landscape", "golden", "unknown", -2, 75, 1],
    ["landscape", "day", "direct", 40, 20, 1],
    ["portrait", "golden", "direct", 5, 74.99, 2], ["portrait", "day", "diffuse", 40, 75, 2],
    ["portrait", "blue", "unknown", -5, 90, 1], ["portrait", "day", "direct", 30, 20, 1],
    ["portrait", "day", "direct", 30.01, 20, 0], ["portrait", "day", "variable", 40, 50, 1],
    ["portrait", "golden", "unknown", -2, 75, 0],
    ["street", "golden", "direct", 5, 20, 2], ["street", "day", "direct", 30.01, 20, 2],
    ["street", "day", "variable", 40, 50, 2], ["street", "day", "diffuse", 40, 75, 1],
    ["street", "blue", "unknown", -5, 20, 1], ["street", "day", "direct", 30, 20, 1],
  ] as const)("%s %s %s light boundary => L=%s", (genre, phase, character, altitude, cloud, expected) => {
    const hour = photoDay().hours[12]; hour.weather.cloudTotal = photoMetric(cloud);
    expect(scoreConditions(genre, hour, photoLight(phase, character, altitude))?.components.L).toBe(expected);
  });
  it("matches all three exact weight formulas, with no public probability", () => {
    const hour = photoDay().hours[12]; hour.weather.visibility = photoMetric(15000); hour.weather.windSpeed = photoMetric(5);
    hour.weather.precipitationProbability = photoMetric(null);
    expect(scoreConditions("landscape", hour, photoLight("golden", "direct", 4))?.score).toBe(70);
    expect(scoreConditions("portrait", hour, photoLight("golden", "direct", 4))?.score).toBe(75);
    expect(scoreConditions("street", hour, photoLight("golden", "direct", 4))?.score).toBe(80);
  });
  it.each(["cloudTotal", "windSpeed", "precipitation", "weatherCode"] as WeatherMetricName[])("missing %s prevents every genre's ranking", (field) => {
    const hour = photoDay().hours[12]; Object.assign(hour.weather, { [field]: missing("人工合成缺失") });
    for (const genre of genres) expect(scoreConditions(genre, hour, photoLight())).toBeNull();
  });
  it("missing visibility only blocks landscape; AQI never supplies it; unknown solar blocks ranking", () => {
    const hour = photoDay().hours[12]; hour.weather.visibility = photoMetric(null);
    expect(scoreConditions("landscape", hour, photoLight())).toBeNull();
    expect(scoreConditions("portrait", hour, photoLight())).not.toBeNull();
    expect(scoreConditions("street", hour, photoLight("unknown"))).toBeNull();
    expect(scoreConditions("street", hour, photoLight("night", "unknown", -6.01))).toBeNull();
  });
});

describe("P6.3 slicing, reason sets, worst-score merging, current recommendations", () => {
  it("cuts at every hour/solar boundary and evaluates midpoint without weather interpolation", () => {
    const day = photoDay();
    const slices = createScoredSlices(day, photoSolar, photoLocation, "landscape", PHOTO_NOW);
    const boundaries = [photoSolar.morningBlue, photoSolar.morningGolden, photoSolar.eveningGolden, photoSolar.eveningBlue]
      .flatMap((range) => range ? [Date.parse(range.start), Date.parse(range.end)] : []);
    for (const slice of slices) {
      expect(Date.parse(slice.end) - Date.parse(slice.start)).toBeLessThanOrEqual(3600000);
      expect(boundaries.some((time) => time > Date.parse(slice.start) && time < Date.parse(slice.end))).toBe(false);
    }
    const midnight = createScoredSlices(day, photoSolar, photoLocation, "street", instant(0));
    expect(midnight.every((slice) => Date.parse(slice.start) > Date.parse(instant(0)))).toBe(true);
  });
  it("does not discard adjacent sub-15min blue slices before merge", () => {
    const solar = { ...photoSolar, morningBlue: { start: instant(5, 50), end: instant(6, 10) }, morningGolden: { start: instant(6, 10), end: instant(7) } };
    const day = photoDay(instant(5, 40));
    // Midpoints use actual Shanghai astronomy; both slices are naturally above -6° on this date.
    const slices = createScoredSlices(day, solar, photoLocation, "street", instant(5, 40));
    const blue = slices.filter((slice) => slice.reasonCodes.includes("phase:blue") && Date.parse(slice.start) < Date.parse(instant(12)));
    // The new geometric-zero boundary adds a third short slice, which still merges whole.
    expect(blue).toHaveLength(3);
    expect(blue.every(slice => Date.parse(slice.end) - Date.parse(slice.start) < 15 * 60000)).toBe(true);
    const merged = mergeScoredWindows(blue, instant(5, 40));
    expect(merged).toHaveLength(1);
    expect(Date.parse(merged[0].end) - Date.parse(merged[0].start)).toBe(20 * 60000);
    expect(selectRecommendedWindows(merged, instant(5, 40))).toHaveLength(1);
  });
  it("merges sets independent of order, never different codes or gaps, and caps two hours", () => {
    const windows = mergeScoredWindows([
      scored(instant(8), instant(9), 95, ["a", "b"]), scored(instant(9), instant(10), 50, ["b", "a"]),
      scored(instant(10), instant(11), 80, ["a", "b"]), scored(instant(11), instant(12), 90, ["b"]),
      scored(instant(13), instant(14), 90, ["b"]),
    ], instant(9, 30));
    expect(windows).toHaveLength(4);
    expect(windows[0]).toMatchObject({ end: instant(10), score: 50, status: "current" });
    expect(windows.every((window) => Date.parse(window.end) - Date.parse(window.start) <= 7200000)).toBe(true);
  });
  it("ranks by minimum score, then start; clips ongoing and filters 15min/50/ended", () => {
    const windows = mergeScoredWindows([scored(instant(8), instant(9), 100), scored(instant(9), instant(10), 50),
      scored(instant(10), instant(11), 60), scored(instant(12), instant(13), 60, ["different"])], instant(9, 45));
    const recommended = selectRecommendedWindows(windows, instant(9, 45));
    expect(recommended.map((window) => window.score)).toEqual([60, 60, 50]);
    expect(recommended[2].start).toBe("2026-10-23T09:45:00.000+08:00");
    expect(selectRecommendedWindows([scored(instant(9), instant(10))], instant(9, 45))).toHaveLength(1);
    expect(selectRecommendedWindows([scored(instant(9), instant(10))], instant(9, 46))).toHaveLength(0);
    expect(selectRecommendedWindows([scored(instant(9), instant(10))], instant(10))).toHaveLength(0);
    expect(selectRecommendedWindows([scored(instant(12), instant(13), 49.99)], PHOTO_NOW)).toHaveLength(0);
  });
  it("selects at most three non-overlapping windows even for overlapping synthetic input", () => {
    const windows = [scored(instant(12), instant(14), 90), scored(instant(13), instant(15), 89),
      scored(instant(14), instant(15), 88), scored(instant(15), instant(16), 87), scored(instant(16), instant(17), 86)];
    expect(selectRecommendedWindows(windows, PHOTO_NOW).map((window) => window.score)).toEqual([90, 88, 87]);
  });
  it("adds missing probability, AQI unknown, stale/conflict limits even when stale hides conflict enum", () => {
    const day = photoDay();
    day.hours.forEach((hour) => {
      hour.weather.precipitationProbability = photoMetric(null); hour.air.referenceAqi = photoMetric(null);
      hour.weather.windSpeed = { ...photoMetric(2), state: "stale", notes: ["多源分歧", "允许旧缓存"] };
    });
    const result = analyzePhotography(day, photoSolar, photoLocation, PHOTO_NOW, photoSunsetField());
    const text = JSON.stringify(result.advice.street);
    expect(text).toContain("没有下雨概率"); expect(text).toContain("没有空气质量预报"); expect(text).toContain("旧缓存"); expect(text).toContain("分歧");
    expect(text).not.toMatch(/空气安全[。，]/);
  });
});

describe("P6.4 independent IFS sunset integration", () => {
  it("keeps formal spatial input independent of missing GFS cloud layers", () => {
    const day = photoDay();
    day.hours.forEach(hour => { hour.primaryWeather.cloudMid = photoMetric(null); });
    const result = assessSunsetOpportunity(day, photoSolar, PHOTO_NOW, photoSunsetField());
    expect(result).toMatchObject({ status: "assessed", level: 5, confidence: "medium" });
    expect(OpportunitySchema.safeParse(result).success).toBe(true);
  });
  it("does not substitute local GFS rules when IFS is absent", () => {
    expect(assessSunsetOpportunity(photoDay(), photoSolar, PHOTO_NOW)).toMatchObject({ status: "unknown", level: null });
  });
});

describe("P6.5 structured Chinese advice, summary and pure integration entry", () => {
  it("returns existing schemas, rule version, no internal scores and distinct genre guidance", () => {
    const day = photoDay(); const before = structuredClone(day);
    const result = analyzePhotography(day, photoSolar, photoLocation, PHOTO_NOW, photoSunsetField());
    expect(PHOTOGRAPHY_FIXTURE_NOTICE).toContain("人工合成");
    expect(day).toEqual(before);
    expect(result.rulesVersion).toBe("photo-rules-v0.3");
    result.hours.forEach((hour) => HourSchema.parse(hour)); SummarySchema.parse(result.summary);
    for (const genre of genres) {
      GenreAdviceSchema.parse(result.advice[genre]);
      const item = result.advice[genre];
      expect(item.timing).toMatch(/\d{2}:\d{2}/); expect(item.timing).not.toMatch(/窗口|北京时间/);
      expect(item.light.length).toBeGreaterThan(0); expect(item.opportunities.length).toBeGreaterThan(0);
      expect(item.limitations.length).toBeGreaterThan(0); expect(item.alternatives.length).toBeGreaterThan(0);
      expect(item.recommendedWindows.every((window) => Date.parse(window.start) >= Date.parse(PHOTO_NOW))).toBe(true);
    }
    expect(new Set(genres.map((genre) => result.advice[genre].opportunities.join())).size).toBe(3);
    expect(result.advice.landscape.opportunities.join()).toContain("能见度");
    expect(result.advice.portrait.opportunities.join()).toContain("人物");
    expect(result.advice.street.opportunities.join()).toContain("街");
    expect(JSON.stringify(result)).not.toMatch(/"score"|"probability"|lux|\bEV\b/);
    const base = syntheticBriefing();
    BriefingSchema.parse({ ...base, ...result, generatedAt: PHOTO_NOW, localDate: PHOTO_DATE, location: photoLocation,
      sources: day.sources, solar: photoSolar, state: "ready" });
  });
  it("keeps all past windows for review and never invites waiting for passed sunset", () => {
    const now = instant(23, 50); const result = analyzePhotography(photoDay(now), photoSolar, photoLocation, now, photoSunsetField(now));
    expect(result.sunsetOpportunity.limitations.join()).toContain("今天的日落已经过去");
    for (const genre of genres) {
      expect(result.advice[genre].recommendedWindows).toEqual([]);
      expect(result.advice[genre].allWindows.length).toBeGreaterThan(0);
      expect(result.advice[genre].allWindows.every((window) => window.status === "past")).toBe(true);
      expect(result.advice[genre].timing).toContain("已经过去");
    }
  });
  it("summary risks lead, temperature coverage is explicit and model past/current/future tenses remain correct", () => {
    const day = photoDay(); day.hours[0].weather.temperature = photoMetric(null);
    day.hours[12].riskInputs[0].weather.weatherCode = photoMetric(97);
    const result = analyzePhotography(day, photoSolar, photoLocation, PHOTO_NOW, photoSunsetField());
    expect(result.summary.headline).toMatch(/^12 时有雷雨/);
    expect(result.interpretation.risks[0]).toMatchObject({ code: "thunderstorm", status: "current" });
    expect(result.summary.temperatureRange).toEqual({ min: 20, max: 20, coveredHours: 23, totalHours: 24 });
    expect(result.summary.limitations.join()).toContain("23/24");
    expect(result.summary.changes.join()).toContain("（已经过去）");
    expect(result.summary.changes.join()).toContain("（现在）");
    expect(result.summary.changes.join()).toContain("（接下来）");
    day.hours.forEach((hour) => { hour.weather.temperature = photoMetric(null); });
    expect(analyzePhotography(day, photoSolar, photoLocation, PHOTO_NOW, photoSunsetField()).summary.temperatureRange).toEqual({ min: null, max: null, coveredHours: 0, totalHours: 24 });
  });
  it("missing conditions are not ranked and alternatives remain conditional", () => {
    const day = photoDay(); day.hours.forEach((hour) => { hour.weather.cloudTotal = photoMetric(null); hour.air.referenceAqi = photoMetric(null); });
    const result = analyzePhotography(day, photoSolar, photoLocation, PHOTO_NOW, photoSunsetField());
    for (const genre of genres) {
      expect(result.advice[genre].allWindows).toEqual([]);
      expect(result.advice[genre].timing).toContain("排不出");
    }
    expect(result.advice.street.alternatives.join()).toContain("的话");
    expect(result.summary.limitations.join()).toContain("没有空气质量预报");
  });
  it("skips isolated missing hours without denying the remaining recommendations", () => {
    const day = photoDay(); day.hours[13].weather.cloudTotal = photoMetric(null);
    const result = analyzePhotography(day, photoSolar, photoLocation, PHOTO_NOW, photoSunsetField());
    for (const genre of genres) {
      const advice = result.advice[genre];
      expect(advice.recommendedWindows.length).toBeGreaterThan(0);
      expect(advice.limitations[0]).toBe("部分小时缺预报，已跳过这些时间。");
      expect(advice.limitations.join()).toContain("缺少云量预报");
      expect(advice.limitations[0]).not.toContain("无法选时");
    }
  });
  it("prints an upcoming risk before a past one while keeping both full facts", () => {
    const day = photoDay();
    day.hours[7].riskInputs[0].weather.weatherCode = photoMetric(97);
    day.hours[15].riskInputs[0].weather.windGust = photoMetric(22);
    const result = analyzePhotography(day, photoSolar, photoLocation, PHOTO_NOW, photoSunsetField());
    for (const genre of genres) {
      const advice = result.advice[genre];
      expect(advice.limitations[0]).toBe("15:00–16:00：风很大，户外停拍。");
      expect(advice.limitations.join()).toContain("07:00–08:00（已经过去）：可能有雷雨");
      expect(advice.limitations.join()).toContain("风很大（8 级或以上）");
      expect(Array.from(advice.limitations[0]).length).toBeLessThanOrEqual(28);
    }
  });
  it("all-source failure preserves astronomy but cannot invent ranked weather advice", () => {
    const original = photoDay(); const day = normalizeSources(original.target, []);
    const result = analyzePhotography(day, photoSolar, photoLocation, PHOTO_NOW);
    expect(result.sunsetOpportunity.status).toBe("unknown");
    expect(result.hours).toHaveLength(24);
    for (const genre of genres) expect(result.advice[genre].allWindows).toEqual([]);
    expect(result.summary.temperatureRange).toEqual({ min: null, max: null, coveredHours: 0, totalHours: 24 });
    expect(photoSolar.sunset).not.toBeNull();
    expect(result.hours.some((hour) => hour.light.altitude !== null)).toBe(true);
  });
  it("below-50 conditions receive conditional guidance, never a forced priority", () => {
    const day = photoDay(); day.hours.forEach((hour) => { hour.weather.precipitation = photoMetric(2); hour.weather.windSpeed = photoMetric(10); hour.weather.cloudTotal = photoMetric(90); hour.weather.visibility = photoMetric(1000); });
    const sunset = assessSunsetOpportunity(day, photoSolar, PHOTO_NOW);
    const advice = createGenreAdvice(day, photoSolar, photoLocation, "landscape", PHOTO_NOW, sunset);
    expect(advice.allWindows.length).toBeGreaterThan(0); expect(advice.recommendedWindows).toEqual([]);
    expect(advice.timing).toContain("条件一般");
  });
  it("film types follow light with generic styles and reversal latitude limitation", () => {
    expect(suggestFilm("landscape", photoLight(), true)).toMatchObject({ type: "彩色反转片", sensitivity: "低感", caveat: expect.stringContaining("宽容度") });
    expect(suggestFilm("portrait", photoLight(), true)).toMatchObject({ type: "彩色负片", sensitivity: "低感" });
    expect(suggestFilm("street", photoLight(), true).type).toBe("黑白负片");
    expect(suggestFilm("portrait", photoLight("day", "diffuse"), false).sensitivity).toBe("中感");
    expect(suggestFilm("landscape", photoLight("blue", "unknown", -5), false).sensitivity).toBe("较高感");
    expect(suggestFilm("street", null, false).sensitivity).toBe("较高感");
  });
  it("rejects invalid explicit now and mismatched target; no implicit clock", () => {
    expect(() => analyzePhotography(photoDay(), photoSolar, photoLocation, "bad")).toThrow();
    expect(() => analyzePhotography(photoDay(), photoSolar, { ...photoLocation, id: "geonames:1" }, PHOTO_NOW)).toThrow("不匹配");
  });
});
