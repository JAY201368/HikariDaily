import { describe, expect, it } from "vitest";
import { analyzePhotography, assessLight, assessLightAtPosition } from "../../src/domain/photography";
import { calculateSolarPosition } from "../../src/domain/solar";
import type { Genre, RecommendedWindow, SolarEvents } from "../../src/domain/types";
import { createInterpretation, hourReadings, lightReading } from "../../src/content/interpret";
import { windowLightKey } from "../../src/content/interpret/genres";
import { suggestFilm } from "../../src/content/film-types";
import { at, run, setAll, visibleText } from "../fixtures/interpret-helpers";
import { photoDay, photoLight, photoLocation, photoMetric, photoSolar, photoSunsetField } from "../fixtures/photography-synthetic";

const GENRES: Genre[] = ["landscape", "portrait", "street"];
const none: SolarEvents = { sunrise: null, sunset: null, morningBlue: null, morningGolden: null, eveningBlue: null, eveningGolden: null, notes: [] };
const iso = (epoch: number) => new Date(epoch).toISOString();
const sunset = Date.parse(photoSolar.sunset!);
const sunrise = Date.parse(photoSolar.sunrise!);
const minute = 60000;
const NO_DIRECT = /长影|侧.*照来|背对太阳|太阳已.*落|西边/;
const base = run(at(9));
function golden(start: number, end: number): RecommendedWindow {
  return { ...base.advice.portrait.allWindows.find(window => window.reasonCodes.includes("phase:golden"))!, start: iso(start), end: iso(end), status: "current" };
}
function viewOf(window: RecommendedWindow, now: number) {
  const advice = structuredClone(base.advice);
  for (const genre of GENRES) advice[genre].recommendedWindows = [window];
  return createInterpretation({ ...base, solar: photoSolar, advice, sources: photoDay(iso(now)).sources, now, location: photoLocation });
}

describe("T16 whole remaining solar interval", () => {
  it("names pre-sunrise golden dawn, with no sunset direction or direct-light claim", () => {
    const window = golden(sunrise - 8 * minute, sunrise - minute);
    expect(windowLightKey(window, base.hours.map(hourReadings), base.hours, { solar: photoSolar, now: window.start, location: photoLocation })).toBe("dawn");
    const view = viewOf(window, Date.parse(window.start));
    for (const genre of GENRES) expect(view.genres[genre].line).not.toMatch(NO_DIRECT);
    expect(view.lead).toContain("清晨");
    const result = run(window.start);
    // v0.2 no longer recommends the pre-zero L0 dawn. Its real advice describes
    // the later selected interval; the injected dawn assertions above stay strict.
    const selected = result.advice.portrait.recommendedWindows[0];
    expect(selected).toBeDefined();
    expect(Date.parse(selected.start)).toBeGreaterThan(Date.parse(window.end));
    expect(calculateSolarPosition((Date.parse(selected.start) + Date.parse(selected.end)) / 2, photoLocation).altitude).toBeGreaterThanOrEqual(0);
    expect(selected.reasonCodes).toContain("portrait:L2");
    expect(result.advice.portrait.light).toContain(selected.start.slice(11, 16));
  });
  it("names post-sunset golden afterglow at every genre outlet", () => {
    const window = golden(sunset + minute, Date.parse(photoSolar.eveningGolden!.end));
    expect(windowLightKey(window, base.hours.map(hourReadings), base.hours, { solar: photoSolar, now: window.start, location: photoLocation })).toBe("afterglow");
    const view = viewOf(window, Date.parse(window.start));
    for (const genre of GENRES) expect(view.genres[genre].line).not.toMatch(/长影|侧.*照来|背对太阳/);
    expect(view.lead).toContain("地平线下");
    const result = run(window.start);
    expect(result.advice.portrait.light + result.advice.portrait.opportunities.join()).not.toMatch(/长影|背对太阳/);
  });
  it.each([[-20, 10], [-10, 20]])("uses a whole-interval sentence for sunset offsets %s / %s min", (start, end) => {
    const window = golden(sunset + start * minute, sunset + end * minute);
    expect(windowLightKey(window, base.hours.map(hourReadings), base.hours, { solar: photoSolar, now: window.start, location: photoLocation })).toBe("golden-transition");
    const view = viewOf(window, Date.parse(window.start));
    expect(view.lead).toContain("光线会变化");
    for (const genre of GENRES) expect(view.genres[genre].line).not.toMatch(/长影|暖光从|太阳刚落|背对太阳/);
  });
  it.each([[-20, 10], [-10, 20]])("uses a whole-interval sentence across sunrise offsets %s / %s min", (start, end) => {
    const window = golden(sunrise + start * minute, sunrise + end * minute);
    expect(windowLightKey(window, base.hours.map(hourReadings), base.hours, { solar: photoSolar, now: window.start, location: photoLocation })).toBe("golden-transition");
    const view = viewOf(window, Date.parse(window.start));
    expect(view.lead).toContain("光线会变化");
    for (const genre of GENRES) expect(view.genres[genre].line).not.toMatch(/长影|暖光从|太阳刚落|背对太阳|西边/);
  });
  it("actual advice crossing sunset keeps the full changing-light interval", () => {
    const scene = run(iso(sunset - 10 * minute));
    expect(scene.advice.portrait.light).toContain("晨昏光线在变化。");
    expect(scene.advice.portrait.opportunities[0]).toContain("晨昏光线在变化。");
    expect(scene.advice.portrait.light + scene.advice.portrait.opportunities.join()).not.toMatch(/影子长|背对太阳/);
  });
  it("only describes the remaining part of a crossing window at sunset +1 min", () => {
    const window = golden(sunset - 20 * minute, sunset + 10 * minute), now = sunset + minute;
    expect(windowLightKey(window, base.hours.map(hourReadings), base.hours, { solar: photoSolar, now, location: photoLocation })).toBe("afterglow");
    const view = viewOf(window, now);
    expect(view.lead).toContain("地平线下");
    expect(view.lead).not.toContain("太阳低、光偏暖");
  });
  it("does not equate the negative-altitude sunrise event with geometric altitude zero", () => {
    const start = sunrise + 1000, end = sunrise + 10000;
    expect(calculateSolarPosition(start, photoLocation).altitude).toBeLessThan(0);
    const window = golden(start, end);
    expect(windowLightKey(window, base.hours.map(hourReadings), base.hours, { solar: photoSolar, now: start, location: photoLocation })).toBe("dawn");
  });
  it("geometric dawn after the apparent sunrise event does not claim the event is still ahead", () => {
    const window = golden(sunrise + 1000, sunrise + 10000), view = viewOf(window, sunrise + 1000);
    expect(view.lead).toContain("地平线下");
    expect(view.lead).not.toContain("日出前");
    for (const genre of GENRES) expect(view.genres[genre].line).not.toMatch(/日出前|暖光|长影/);
  });
  it("morning blue never says that lights have just turned on", () => {
    const start = Date.parse(photoSolar.morningBlue!.start), end = Date.parse(photoSolar.morningBlue!.end);
    const window = { ...golden(start, end), reasonCodes: ["D2", "phase:blue"] };
    const view = viewOf(window, start);
    expect(view.lead).not.toContain("灯刚亮");
    expect(view.genres.street.line).toContain("日出前");
    const light = assessLight((start + end) / 2, photoLocation, photoMetric(20), photoSolar);
    expect(lightReading(light).detail).not.toMatch(/刚亮|刚落/);
  });
  it("domain and reading descriptions have no direct-light shadow below the horizon", () => {
    for (const altitude of [-3, -0.1]) for (const cloud of [20, 90]) {
      const light = assessLightAtPosition(sunset + minute, { altitude, azimuth: 250, notes: [] }, photoMetric(cloud), photoSolar);
      expect(light.phase).toBe("golden");
      expect(light.description + lightReading(light).detail).not.toMatch(/长影|影子长|直射|暖光从/);
    }
  });
  it("omits a shared gloss when overlapping genre intervals have different light keys", () => {
    const advice = structuredClone(base.advice), now = sunset - 30 * minute;
    advice.landscape.recommendedWindows = [golden(now, sunset - 20 * minute)];
    advice.portrait.recommendedWindows = [golden(sunset - 25 * minute, sunset + 10 * minute)];
    advice.street.recommendedWindows = [];
    const view = createInterpretation({ ...base, advice, solar: photoSolar, sources: photoDay(iso(now)).sources, now, location: photoLocation });
    expect(view.lead).toContain("各题材时段的光线不同");
    expect(view.lead).not.toContain("那时太阳低、光偏暖");
  });
  it("uses honest neutral text when no geometry or solar context is available", () => {
    expect(windowLightKey(golden(sunset - minute, sunset + minute), base.hours.map(hourReadings), base.hours)).toBe("golden-transition");
  });
});

describe("T16 sunset tense and night action", () => {
  it.each([-1, 0, 1])("sunset %s ms switches to model-condition review at >= sunset", offset => {
    const now = iso(sunset + offset), scene = run(now);
    expect(scene.sunsetOpportunity.status).toBe("assessed");
    expect(scene.sunsetOpportunity.level).toBe(5);
    if (offset < 0) expect(scene.sunsetOpportunity.reasons[0]).toContain("晚霞机会很大");
    else {
      expect(scene.sunsetOpportunity.reasons[0]).toContain("当时");
      expect(scene.interpretation.sunset.line + scene.interpretation.lead).not.toContain("有机会出晚霞");
    }
  });
  it("21:00 uses a fresh photoDay(now21), keeps history, and changes every action field", () => {
    const now = at(21), day = photoDay(now), scene = analyzePhotography(day, photoSolar, photoLocation, now, photoSunsetField(now, day.target));
    expect(day.sources[0].fetchedAt).toBe(now);
    expect(scene.sunsetOpportunity.status).toBe("assessed");
    expect(scene.interpretation.lead).toContain("今天白天");
    for (const genre of GENRES) {
      const advice = scene.advice[genre];
      expect(advice.allWindows.length).toBeGreaterThan(0);
      expect(advice.allWindows.every(window => window.status === "past")).toBe(true);
      expect(advice.timing).toContain("已经过去");
      expect(advice.light).toContain("夜里");
      expect(advice.opportunities[0]).toMatch(/夜|天黑|灯/);
      expect(advice.alternatives.join()).not.toMatch(/树荫|阳光|楼影/);
      expect(advice.film).toMatchObject({ type: "彩色负片", sensitivity: "较高感" });
    }
    expect(visibleText(scene, "current-advice")).not.toMatch(/有机会出晚霞|留意西边|阳光太硬|还不清楚/);
  });
  it.each([
    ["thunder", { weatherCode: 95 }, /雷雨/],
    ["rain", { precipitation: 5.5 }, /雨势较大/],
    ["wind", { windGust: 18 }, /风很大/],
  ] as const)("21:00 future %s beats historical windows and night invitations", (_, values, phrase) => {
    const scene = run(at(21), day => setAll(day, values, [21, 22]));
    for (const genre of GENRES) {
      expect(scene.advice[genre].allWindows.length).toBeGreaterThan(0);
      expect(scene.interpretation.genres[genre].line).toMatch(phrase);
      expect(scene.advice[genre].opportunities[0]).toMatch(phrase);
      expect(scene.advice[genre].opportunities.join() + scene.advice[genre].alternatives.join() + scene.advice[genre].film.reason).not.toMatch(/可以拍城市|记得带三脚架|夜里可以拍|路灯、橱窗|值得一拍|适合灯光题材/);
    }
    expect(scene.interpretation.tone).toBe("poor");
  });
  it("past daytime dangers no longer block night photography", () => {
    const scene = run(at(21), day => setAll(day, { weatherCode: 95, precipitation: 5.5, windGust: 18 }, [12]));
    expect(scene.interpretation.tone).toBe("done");
    expect(scene.interpretation.genres.landscape.line).toContain("城市夜景");
    expect(scene.advice.street.opportunities[0]).toContain("夜里");
  });
  it("known gust level 6 avoids an unconditional tripod invitation without inventing a formal risk", () => {
    const scene = run(at(21), day => setAll(day, { windGust: 11 }));
    expect(scene.hours[21].risks.filter(risk => risk.code === "strong-wind")).toEqual([]);
    expect(scene.interpretation.genres.landscape.line).toContain("风较大");
    for (const advice of Object.values(scene.advice)) expect(advice.opportunities.join() + advice.film.reason).not.toMatch(/记得带三脚架|适合灯光题材/);
  });
  it("missing sunset inputs stay unknown after sunset, separately from level 1", () => {
    const scene = run(at(21), undefined, field => { field.points[0].hours.forEach(h => { h.cloudLow = null; }); });
    expect(scene.sunsetOpportunity).toMatchObject({ status: "unknown", level: null });
    expect(scene.interpretation.sunset.title).toBe("暂时判断不了");
  });
  it("all unknown solar events and positions make no promise of solar times or darkness", () => {
    const scene = run(at(21)), hours = structuredClone(scene.hours);
    for (const hour of hours) {
      hour.light = { ...photoLight("unknown", "unknown"), altitude: null, azimuth: null };
      for (const name of Object.keys(hour.weather) as (keyof typeof hour.weather)[]) Object.assign(hour.weather, { [name]: photoMetric(null) });
    }
    const advice = structuredClone(scene.advice);
    for (const genre of GENRES) { advice[genre].allWindows = []; advice[genre].recommendedWindows = []; }
    const view = createInterpretation({ ...scene, hours, advice, solar: none, sources: photoDay(at(21)).sources, now: at(21) });
    expect(view.tone).toBe("unknown");
    expect(view.lead).toContain("太阳时刻暂时算不出来");
    expect(view.headline + view.lead + Object.values(view.genres).map(item => item.line).join()).not.toMatch(/照常可用|天黑|城市夜景|夜里可以拍/);
    expect(suggestFilm("street", null, false).reason).toContain("还不清楚");
  });
  it.each([-15 * minute, -1, 0, 1])("known evening-blue end overrides the hour midpoint at end offset %s ms", offset => {
    const end = Date.parse(at(20, 20)), now = iso(end + offset);
    const scene = run(now, day => setAll(day, { weatherCode: null }));
    expect(scene.hours[20].light.phase).toBe("night");
    const solar = { ...photoSolar, eveningBlue: { start: at(20), end: iso(end) } };
    const view = createInterpretation({ ...scene, solar, sources: photoDay(now).sources, now });
    expect(view.tone === "done").toBe(offset >= 0);
    for (const genre of GENRES) {
      if (offset < 0) expect(view.genres[genre].when).toBe("暂时排不出");
      else expect(view.genres[genre].line).toMatch(/夜|天黑/);
    }
  });
  it("missing events with known current night can still describe night", () => {
    const scene = run(at(21));
    const view = createInterpretation({ ...scene, solar: none, sources: photoDay(at(21)).sources, now: at(21) });
    expect(view.tone).toBe("done");
    expect(view.genres.street.line).toContain("夜里");
    expect(suggestFilm("portrait", photoLight("night", "unknown", -30), false).sensitivity).toBe("较高感");
  });
  it("AQI warnings retain their current-night timing", () => {
    const scene = run(at(21), day => { for (const hour of day.hours) { hour.air.referenceAqi = photoMetric(180); hour.riskInputs.forEach(input => { input.air.referenceAqi = photoMetric(180, input.source.id); }); } });
    expect(scene.interpretation.lead).toMatch(/空气不健康.*口罩/);
  });
});
