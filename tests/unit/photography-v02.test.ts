import { describe, expect, it } from "vitest";
import { analyzePhotography } from "../../src/domain/photography";
import { createScoredSlices, mergeScoredWindows, scoreConditions, selectRecommendedWindows } from "../../src/domain/photography/windows";
import { calculateSolarEvents, calculateSolarPosition } from "../../src/domain/solar";
import { RecommendedWindowSchema, RULES_VERSION } from "../../src/domain/schemas";
import type { Genre } from "../../src/domain/types";
import { windLevel } from "../../src/content/interpret/levels";
import { dayLine } from "../../src/content/interpret/verdict";
import { at, run, sceneBriefing, setAll } from "../fixtures/interpret-helpers";
import { PHOTO_DATE, photoDay, photoLight, photoLocation, photoSolar, photoSunsetField } from "../fixtures/photography-synthetic";

import { adviceHtml, bookHtml } from "../../src/components/prototype-frontend/adapter";

const GENRES: Genre[] = ["landscape", "portrait", "street"];
const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);

describe("photo-rules-v0.3 / confirmed A1–A4", () => {
  it("reports the versioned before/after rule probe", () => {
    const gust = run(at(9), day => setAll(day, { windGust: 11 }));
    const ice = run(at(9), day => setAll(day, { weatherCode: 66, precipitation: 0.3 }));
    const dawnNow = new Date(Date.parse(photoSolar.sunrise!) - 8 * 60000).toISOString();
    const dawn = run(dawnNow).advice.portrait.recommendedWindows[0];
    const dawnProbe = dawn ? { start: dawn.start, end: dawn.end, reasonCodes: dawn.reasonCodes,
      startAltitude: calculateSolarPosition(dawn.start, photoLocation).altitude,
      midpointAltitude: calculateSolarPosition((Date.parse(dawn.start) + Date.parse(dawn.end)) / 2, photoLocation).altitude } : null;
    console.info(JSON.stringify({ rulesVersion: RULES_VERSION, gust11: Object.fromEntries(GENRES.map(g => [g, gust.advice[g].recommendedWindows.length])), freeze: { tone: ice.interpretation.tone, headline: ice.interpretation.headline, timing: ice.advice.landscape.timing }, dawnNow, dawn: dawnProbe, portraitNoon: scoreConditions("portrait", photoDay().hours[12], photoLight())?.components }));
    expect(RULES_VERSION).toBe("photo-rules-v0.3");
  });
  it.each([[null, 2], [7.9, 2], [7.9001, 1], [10.7, 1], [10.7001, 0], [10.75, 0], [11, 0]] as const)("A1 raw gust %s gives W%s", (gust, expected) => {
    const day = photoDay(); setAll(day, { windGust: gust });
    for (const genre of GENRES) expect(scoreConditions(genre, day.hours[12], photoLight("golden", "direct", 4))?.components.W).toBe(expected);
    const reasons = scoreConditions("street", day.hours[12], photoLight())!.reasons.join("");
    if (gust !== null && gust > 7.9) { expect(reasons).toContain("阵风"); expect(reasons).not.toContain("风不大"); }
  });
  it("A1 worse average wins; missing gust never becomes a fabricated reading", () => {
    const day = photoDay(); setAll(day, { windSpeed: 10, windGust: 3 });
    expect(scoreConditions("street", day.hours[12], photoLight())?.components.W).toBe(0);
    setAll(day, { windSpeed: 5, windGust: null });
    expect(scoreConditions("street", day.hours[12], photoLight())?.components.W).toBe(1);
    expect(scoreConditions("street", day.hours[12], photoLight())?.reasons.join("")).not.toContain("阵风");
  });
  it.each([[2, 0], [4, 3], [4, 4], [4, 5]] as const)("A1 reasons omit trivial/weaker gust (avg%s/gust%s)", (windSpeed, windGust) => {
    const day = photoDay(); setAll(day, { windSpeed, windGust });
    expect(scoreConditions("street", day.hours[12], photoLight())!.reasons.join("")).not.toContain("阵风");
  });
  it.each([10.7001, 10.75, 11])("A1 gust %s retains records but prohibits main recommendations", gust => {
    const scene = run(at(5), day => setAll(day, { windGust: gust }));
    for (const genre of GENRES) { expect(scene.advice[genre].allWindows.length).toBeGreaterThan(0); expect(scene.advice[genre].recommendedWindows).toEqual([]); }
    expect(scene.interpretation.hours.every(h => h.marks.recommendation === null)).toBe(true);
    if (gust === 10.7001) expect(windLevel(gust)).toBe(5);
  });
  it("A1 merge preserves different eligibility even when W0/reason sets agree", () => {
    const day = photoDay(at(5)); setAll(day, { windSpeed: 10, windGust: null }); setAll(day, { windGust: 11 }, [13]);
    const slices = createScoredSlices(day, photoSolar, photoLocation, "street", at(5));
    const noon = slices.filter(s => Date.parse(s.start) >= Date.parse(at(12)) && Date.parse(s.end) <= Date.parse(at(14)));
    expect(noon).toHaveLength(2); expect(noon[0].reasonCodes).toEqual(noon[1].reasonCodes);
    const merged = mergeScoredWindows(noon, at(5)); expect(merged).toHaveLength(2);
    expect(selectRecommendedWindows(merged, at(5)).map(w => w.start)).toEqual([noon[0].start]);
  });
  it.each([56, 57, 66, 67])("A2 freeze code %s overrides D even at zero amount", code => {
    for (const amount of [0, 0.3]) {
      const day = photoDay(); setAll(day, { weatherCode: code, precipitation: amount });
      for (const genre of GENRES) expect(scoreConditions(genre, day.hours[12], photoLight("golden", "direct", 4))?.components.D).toBe(0);
      for (const hour of [5, 9, 21]) {
        const scene = run(at(hour), day => setAll(day, { weatherCode: code, precipitation: amount }));
        expect(scene.interpretation.tone).toBe("poor"); expect(scene.interpretation.headline).toMatch(/冻雨.*结冰.*户外/);
        expect(scene.interpretation.headline.length).toBeLessThanOrEqual(28); expect(scene.interpretation.lead).toContain("别外出拍摄");
        expect(scene.interpretation.nextUp.join("")).toContain("冻雨"); expect(scene.interpretation.nextUp.join("")).not.toMatch(/出门带伞|现在到.*拍风光/);
        for (const genre of GENRES) {
          const advice = scene.advice[genre]; expect(advice.allWindows.length).toBeGreaterThan(0); expect(advice.recommendedWindows).toEqual([]);
          expect([advice.timing, ...advice.opportunities, scene.interpretation.genres[genre].line].join("")).not.toMatch(/可以试试|可以拍城市夜景|夜里可以拍|20 分钟到位|逆光轮廓|找一条光带/);
          expect(advice.allWindows.every(w => w.reasons.join("").includes("结冰") && !/可以拍|适合拍/.test(w.reasons.join("")))).toBe(true);
        }
        for (const reading of scene.interpretation.hours) {
          expect(reading.rain.key).toBe(amount === 0 ? "none" : "light"); expect(reading.rain.detail).toContain("结冰"); expect(reading.rain.detail).not.toContain("撑把伞"); expect(reading.marks.recommendation).toBeNull();
        }
      }
    }
  });
  it("A2 freezing at sunset cancels arrival; safe hours elsewhere remain recommendable", () => {
    const sunsetHour = new Date(Date.parse(photoSolar.sunset!) + 8 * 3600000).getUTCHours();
    const scene = run(at(9), day => setAll(day, { weatherCode: 66, precipitation: 0 }, [sunsetHour]));
    expect(scene.advice.landscape.opportunities[1]).toContain("别外出拍摄"); expect(scene.advice.landscape.opportunities[1]).not.toContain("20 分钟到位");
    for (const genre of GENRES) { expect(scene.advice[genre].recommendedWindows.length).toBeGreaterThan(0); expect(scene.advice[genre].recommendedWindows.every(w => !overlaps(w, scene.hours[sunsetHour]))).toBe(true); }
  });
  it("A2 empty recommendation headings stay neutral; valid recommendations keep their label", () => {
    const frozen = sceneBriefing(at(9), day => setAll(day, { weatherCode: 66, precipitation: 0 }));
    expect(bookHtml(frozen).match(/<small>拍摄时段<\/small>/g)).toHaveLength(3);
    expect(bookHtml(frozen)).not.toContain("<small>最值得拍的时间</small>");
    expect(adviceHtml(frozen, "landscape")).toContain("时段记录（含已经过去的）");
    expect(adviceHtml(frozen, "landscape")).not.toContain("今天所有可以拍");
    expect(bookHtml(sceneBriefing(at(9)))).toContain("<small>最值得拍的时间</small>");
  });
  it("v0.2 does not impose a blanket D0/W0 ban", () => {
    const day = photoDay(at(5)); setAll(day, { precipitation: 1, windSpeed: 10, windGust: null });
    const all = mergeScoredWindows(createScoredSlices(day, photoSolar, photoLocation, "street", at(5)), at(5));
    const selected = selectRecommendedWindows(all, at(5));
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every(window => window.reasonCodes.includes("D0") && window.reasonCodes.includes("W0"))).toBe(true);
  });
  it("A2 unknown amount stays unknown while explaining frozen precipitation", () => {
    const scene = run(at(9), day => setAll(day, { weatherCode: 66, precipitation: null }));
    expect(scene.interpretation.hours[12].rain.key).toBe("unknown"); expect(scene.interpretation.hours[12].rain.detail).toMatch(/没有降水预报.*结冰/);
  });
  it.each(["cloudTotal", "windSpeed", "precipitation"] as const)("A2 known freezing rain overrides missing %s in every genre's actions", field => {
    const scene = run(at(9), day => setAll(day, { weatherCode: 66, precipitation: 0.3, [field]: null }));
    for (const genre of GENRES) {
      const advice = scene.advice[genre];
      expect(advice.allWindows).toEqual([]);
      expect(advice.recommendedWindows).toEqual([]);
      expect(advice.opportunities[0]).toContain("结冰");
      expect(advice.opportunities[0]).toContain("别外出拍摄");
      expect(advice.light).toContain("取消户外拍摄");
      expect([...advice.opportunities, ...advice.alternatives].join("")).not.toMatch(/倒影|找树荫|可以多拍|拉出前后层次/);
      expect(advice.alternatives[0]).toContain("室内");
    }
  });
  it.each([[66, /冻雨.*别外出拍摄/], [95, /雷雨.*别安排户外拍摄/]] as const)("A2 arrival before sunset avoids code %s in the previous hour", (weatherCode, warning) => {
    const arrival = Date.parse(photoSolar.sunset!) - 20 * 60000;
    const arrivalHour = photoDay().hours.findIndex(hour => Date.parse(hour.start) <= arrival && arrival < Date.parse(hour.end));
    const scene = run(at(9), day => setAll(day, { weatherCode, precipitation: 0 }, [arrivalHour]));
    expect(scene.sunsetOpportunity.level).toBe(5);
    expect(scene.advice.landscape.opportunities[1]).toMatch(warning);
    expect(scene.advice.landscape.opportunities[1]).not.toContain("20 分钟到位");
    expect(scene.advice.landscape.recommendedWindows.length).toBeGreaterThan(0);
  });
  it("sunset action does not ask for an arrival time that already passed", () => {
    const now = new Date(Date.parse(photoSolar.sunset!) - 5 * 60000).toISOString();
    const scene = run(now);
    expect(scene.sunsetOpportunity.level).toBe(5);
    expect(scene.advice.landscape.opportunities[1]).not.toContain("20 分钟到位");
    expect(scene.advice.landscape.opportunities[1]).toContain("现在留意西边");
  });
  it("A3 L0 at score 50 is retained but not selected; L1 score 50 remains eligible", () => {
    const day = photoDay(at(9)); const noon = createScoredSlices(day, photoSolar, photoLocation, "portrait", at(9)).filter(w => w.start === at(12).replace("+", ".000+"));
    expect(noon).toHaveLength(1); expect(noon[0].score).toBe(50); expect(noon[0].reasonCodes).toContain("portrait:L0"); expect(selectRecommendedWindows(noon, at(9))).toEqual([]);
    for (const genre of GENRES) expect(selectRecommendedWindows([{ ...noon[0], eligible: true, components: { ...noon[0].components, L: 0 }, reasonCodes: [`${genre}:L0`] }], at(9))).toEqual([]);
    const soft = createScoredSlices(day, photoSolar, photoLocation, "portrait", at(5)).find(w => w.reasonCodes.includes("portrait:L1") && Date.parse(w.end) - Date.parse(w.start) >= 15 * 60000);
    expect(soft).toBeDefined(); expect(selectRecommendedWindows([{ ...soft!, score: 50 }], at(5))).toHaveLength(1);
  });
  it.each([0, -0.000001])("A3 golden geometric altitude %s changes only portrait/street bonus", altitude => {
    const hour = photoDay().hours[12];
    expect(scoreConditions("portrait", hour, photoLight("golden", "direct", altitude))?.components.L).toBe(altitude >= 0 ? 2 : 1);
    expect(scoreConditions("street", hour, photoLight("golden", "direct", altitude))?.components.L).toBe(altitude >= 0 ? 2 : 1);
    expect(scoreConditions("landscape", hour, photoLight("golden", "direct", altitude))?.components.L).toBe(2);
  });
  it("A3 longitude119 cuts the actual zero crossing, preserves pre-zero and landscape afterglow", () => {
    const location = { ...photoLocation, longitude: 119 }; const solar = calculateSolarEvents(PHOTO_DATE, location); const day = photoDay(at(5)); day.target.longitude = 119;
    const after = Date.parse(solar.sunset!) + 10 * 60000;
    const portrait = createScoredSlices(day, solar, location, "portrait", at(5));
    const slice = portrait.find(w => Date.parse(w.start) <= after && after < Date.parse(w.end))!;
    expect(slice).toBeDefined(); expect(slice.reasonCodes).not.toContain("portrait:L2"); expect(Number(slice.reasonCodes.find(c => c.startsWith("portrait:L"))!.at(-1))).toBeLessThanOrEqual(1);
    // After the true zero crossing a fragment may be <15 minutes; it cannot retain a warm-light L2 recommendation.
    expect(selectRecommendedWindows(mergeScoredWindows(portrait, at(5)), at(5)).some(w => overlaps(w, { start: new Date(after).toISOString(), end: new Date(after + 1).toISOString() }))).toBe(false);
    const zero = portrait.filter(w => w.reasonCodes.includes("phase:golden")).flatMap(w => [Date.parse(w.start), Date.parse(w.end)])
      .find(t => t > Date.parse(solar.eveningGolden!.start) && t < Date.parse(solar.sunset!) && Math.abs(calculateSolarPosition(t, location).altitude!) < 0.005);
    expect(zero).toBeDefined();
    const before = portrait.find(w => Date.parse(w.end) === zero); expect(before?.reasonCodes).toContain("portrait:L2");
    const landscape = createScoredSlices(day, solar, location, "landscape", at(5)).find(w => Date.parse(w.start) <= after && after < Date.parse(w.end)); expect(landscape?.reasonCodes).toContain("landscape:L2");
    const scene = analyzePhotography(day, solar, location, at(5), photoSunsetField(at(5), day.target));
    for (const genre of GENRES) for (const window of scene.advice[genre].allWindows) { expect(RecommendedWindowSchema.strict().safeParse(window).success).toBe(true); expect(window).not.toHaveProperty("components"); expect(window).not.toHaveProperty("eligible"); }
    for (const genre of GENRES) for (const window of scene.advice[genre].recommendedWindows) expect(RecommendedWindowSchema.strict().safeParse(window).success).toBe(true);
  });
  it("A3 partial-hour best wording names the actual intersection without dropping positive-overlap marks", () => {
    const scene = run(at(5));
    for (const genre of GENRES) {
      const best = scene.advice[genre].recommendedWindows[0]; expect(best).toBeDefined();
      for (const [index, hour] of scene.hours.entries()) if (overlaps(hour, best)) {
        expect(scene.interpretation.hours[index].marks.recommendation).not.toBeNull();
        const from = Math.max(Date.parse(hour.start), Date.parse(best.start)), to = Math.min(Date.parse(hour.end), Date.parse(best.end));
        if (from !== Date.parse(hour.start) || to !== Date.parse(hour.end)) {
          const clock = (t: number) => new Date(t + 8 * 3600000).toISOString().slice(11, 16);
          expect(scene.interpretation.hours[index].sentences.join("")).toContain(`${clock(from)}–${clock(to)}`);
        }
      }
    }
  });
  it.each([89.999, 90])("A4 cloud %s affects only diffuse daytime landscape", cloud => {
    const day = photoDay(); setAll(day, { cloudTotal: cloud });
    expect(scoreConditions("landscape", day.hours[12], photoLight("day", "diffuse"))?.components.L).toBe(cloud >= 90 ? 0 : 1);
    if (cloud >= 90) expect(scoreConditions("landscape", day.hours[12], photoLight("day", "diffuse"))?.reasons[0]).toContain("平光");
    for (const phase of ["golden", "blue"] as const) expect(scoreConditions("landscape", day.hours[12], photoLight(phase, "diffuse", phase === "blue" ? -5 : 4))?.components.L).toBe(1);
    expect(scoreConditions("portrait", day.hours[12], photoLight("day", "diffuse"))?.components.L).toBe(2); expect(scoreConditions("street", day.hours[12], photoLight("day", "diffuse"))?.components.L).toBe(1);
    expect(run(at(9), day => setAll(day, { cloudTotal: cloud })).interpretation.tone).toBe("go");
  });

  it("wet ordinary-rain hours have no good-time mark while their scored records remain", () => {
    const scene = run(at(5), day => setAll(day, { weatherCode: 61, precipitation: 0.8 }));
    expect(scene.advice.street.allWindows.length).toBeGreaterThan(0);
    expect(scene.advice.street.recommendedWindows.length).toBeGreaterThan(0);
    expect(scene.interpretation.hours.every(hour => hour.rain.key === "light")).toBe(true);
    expect(scene.interpretation.hours.every(hour => hour.marks.recommendation === null)).toBe(true);
    const trace = run(at(5), day => setAll(day, { weatherCode: 61, precipitation: 0.05 }));
    expect(trace.interpretation.hours.some(hour => hour.marks.recommendation !== null)).toBe(true);
  });

  it.each([[61, "雨"], [71, "雪"], [null, "雨雪"]] as const)("sparse precipitation coverage names known %s without claiming a whole wet day", (weatherCode, word) => {
    const scene = run(at(9), day => {
      setAll(day, { precipitation: null });
      setAll(day, { precipitation: 0.8, weatherCode: weatherCode ?? 61, cloudTotal: 80 }, [12]);
      if (weatherCode === null) setAll(day, { precipitation: 0.8, weatherCode: 71, cloudTotal: 80 }, [13]);
    });
    expect(dayLine(scene.hours, scene.interpretation.hours, scene.interpretation.periods)).toBe(`雨情不全，已知时段有${word}`);
    expect(scene.interpretation.headline).not.toContain("一整天");
    expect(scene.interpretation.dataNote).toContain("降水");
  });
});
