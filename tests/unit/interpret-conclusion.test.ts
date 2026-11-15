import { describe, expect, it } from "vitest";
import { createInterpretation } from "../../src/content/interpret";
import type { Genre } from "../../src/domain/types";
import { at, run, setAll, sceneBriefing } from "../fixtures/interpret-helpers";
import { SCENARIOS } from "../fixtures/interpret-scenes";
import { photoDay, photoMetric, photoSolar } from "../fixtures/photography-synthetic";

const GENRES: Genre[] = ["landscape", "portrait", "street"];
const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) =>
  Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
describe("T15 conclusion and hazard boundaries", () => {
  it.each(SCENARIOS)("$id builds a complete date-aligned schema-valid browser briefing", scenario => {
    const b = sceneBriefing(at(9), scenario.edit);
    expect(b.generatedAt).toBe(at(9)); expect(b.localDate).toBe(at(0).slice(0, 10));
    expect(b.hours).toHaveLength(24); expect(b.warnings.join("")).toContain("演示数据");
    expect(b.solar).toEqual(photoSolar); expect(b.sources.every(source => source.fetchedAt === at(9))).toBe(true);
  });
  it.each([
    ["thunderstorm", { weatherCode: 95 }, /雷雨/],
    ["heavy-rain", { precipitation: 5.5 }, /雨/],
    ["strong-wind", { windGust: 18 }, /风/],
  ] as const)("backup %s survives primary clear sky in all summaries", (code, values, word) => {
    const scene = run(at(9), day => {
      const hour = day.hours[15], input = structuredClone(hour.riskInputs[0]);
      input.source = { ...input.source, id: "backup-weather" };
      for (const [name, value] of Object.entries(values)) Object.assign(input.weather, { [name]: photoMetric(value, input.source.id) });
      hour.riskInputs.push(input);
    });
    expect(scene.hours[15].weather.precipitation.value).toBe(0);
    expect(scene.hours[15].weather.windGust.value).toBe(3);
    expect(scene.hours[15].weather.weatherCode.value).toBe(1);
    expect(scene.hours[15].risks.some(risk => risk.code === code)).toBe(true);
    const period = scene.interpretation.periods.find(period => overlaps(period, scene.hours[15]))!;
    expect(period.summary).toMatch(word); expect(scene.interpretation.weatherLine).toMatch(word);
    expect(scene.interpretation.headline).toMatch(word);
    for (const genre of GENRES) expect(scene.advice[genre].recommendedWindows.some(window => overlaps(window, scene.hours[15]))).toBe(false);
  });
  it.each([
    ["thunderstorm", { weatherCode: 95 }], ["heavy-rain", { precipitation: 5.5 }], ["strong-wind", { windGust: 18 }],
  ] as const)("backup %s prevents a primary soft-light invitation", (code, values) => {
    const scene = run(at(9), day => {
      setAll(day, { weatherCode: 3, cloudTotal: 100, precipitation: 0 });
      const hour = day.hours[15], input = structuredClone(hour.riskInputs[0]);
      input.source = { ...input.source, id: "backup-weather" };
      for (const [name, value] of Object.entries(values)) Object.assign(input.weather, { [name]: photoMetric(value, input.source.id) });
      hour.riskInputs.push(input);
    });
    expect(scene.hours[15].risks.some(risk => risk.code === code)).toBe(true);
    const sentences = scene.interpretation.hours[15].sentences;
    expect(sentences[1]).toMatch(/别|注意/); expect(sentences.join("")).not.toMatch(/适合人像|最好的时段/);
  });
  it.each([56, 57, 66, 67])("freezing code %s wins over a clear majority even at zero accumulation", weatherCode => {
    const scene = run(at(9), day => setAll(day, { weatherCode, precipitation: 0 }, [15]));
    const period = scene.interpretation.periods.find(period => overlaps(period, scene.hours[15]))!;
    expect(period.summary).toContain("冻雨"); expect(scene.interpretation.weatherLine).toContain("冻雨");
    expect(scene.interpretation.headline).toContain("冻雨");
    expect(scene.interpretation.hours[15].sentences[1]).toMatch(/冻雨.*结冰/);
  });
  it("thunder and freezing rain both survive when sharing the same period", () => {
    const scene = run(at(9), day => {
      setAll(day, { weatherCode: 95 }, [13]); setAll(day, { weatherCode: 66 }, [14]);
    });
    const period = scene.interpretation.periods.find(period => overlaps(period, scene.hours[13]))!;
    expect(period.summary).toContain("雷雨"); expect(period.summary).toContain("冻雨");
    expect(scene.interpretation.weatherLine).toContain("雷雨"); expect(scene.interpretation.weatherLine).toContain("冻雨");
  });
  it("missing future ranking evidence stays explicit when historical windows exist", () => {
    const scene = run(at(9), day => setAll(day, { weatherCode: null }, Array.from({ length: 15 }, (_, index) => index + 9)));
    expect(scene.advice.street.allWindows.length).toBeGreaterThan(0);
    expect(scene.interpretation.headline).toContain("缺天气类型");
    expect(scene.interpretation.lead).toContain("已算出的光线时刻仍可查看");
  });
  it.each([4.999, 5, 5.5, 7])("rain %s uses the unchanged strong-rain threshold", precipitation => {
    const scene = run(at(9), day => setAll(day, { precipitation }, [10]));
    const reading = scene.interpretation.hours[10];
    if (precipitation >= 5) {
      expect(reading.rain.detail).toContain("别安排户外"); expect(reading.rain.detail).not.toContain("倒影");
      expect(scene.interpretation.nextUp.filter(text => /10 时/.test(text) && /雨/.test(text))).toHaveLength(1);
    } else expect(reading.rain.detail).not.toContain("别安排户外");
  });
  it("lead and next-up preserve different starts and ends without mutating advice", () => {
    const scene = run(at(9)), advice = structuredClone(scene.advice);
    for (const [index, genre] of GENRES.entries()) advice[genre].recommendedWindows = [{ ...advice[genre].recommendedWindows[0],
      start: at(9, index === 2 ? 30 : 0), end: at(index === 0 ? 10 : 11), status: "current" }];
    const before = structuredClone(advice);
    const view = createInterpretation({ hours: scene.hours, advice, solar: photoSolar, sunsetOpportunity: scene.sunsetOpportunity,
      sources: photoDay(at(9)).sources, now: at(9) });
    expect(advice).toEqual(before);
    expect(view.lead).toContain("10:00拍风光"); expect(view.lead).toContain("11:00拍人像");
    expect(view.nextUp.join("")).toContain("10:00拍风光"); expect(view.nextUp.join("")).toContain("11:00拍人像");
  });
  it("twenty-minute differences and different starts retain every actual endpoint", () => {
    const scene = run(at(9)), advice = structuredClone(scene.advice);
    const ranges = { landscape: [at(9), at(11)], portrait: [at(9), at(10, 40)], street: [at(9, 20), at(11)] };
    for (const genre of GENRES) advice[genre].recommendedWindows = [{ ...advice[genre].recommendedWindows[0],
      start: ranges[genre][0], end: ranges[genre][1], status: genre === "street" ? "future" : "current" }];
    const before = structuredClone(advice);
    const view = createInterpretation({ hours: scene.hours, advice, solar: photoSolar, sunsetOpportunity: scene.sunsetOpportunity,
      sources: photoDay(at(9)).sources, now: at(9) });
    expect(advice).toEqual(before);
    for (const text of [view.lead, view.nextUp.join("")]) {
      expect(text).toContain("现在到 11:00拍风光"); expect(text).toContain("现在到 10:40拍人像");
      expect(text).toContain("09:20–11:00拍街拍"); expect(text).not.toContain("11:00拍风光和人像");
    }
  });
  it("strong average and gust maxima are independent", () => {
    const scene = run(at(9), day => {
      setAll(day, { windSpeed: 12, windGust: 13 }, [14]);
      setAll(day, { windSpeed: 2, windGust: 18 }, [15]);
    });
    expect(scene.interpretation.periods.find(period => overlaps(period, scene.hours[14]))!.summary).toContain("阵风 8 级");
  });
  it.each([
    ["visibility", "能见度", "landscape"], ["weatherCode", "天气类型", "portrait"],
    ["windSpeed", "风", "street"], ["precipitation", "降水", "portrait"], ["cloudTotal", "云量", "street"],
  ] as const)("missing %s is named in the %s genre line", (field, label, genre) => {
    const scene = run(at(9), day => setAll(day, { [field]: null }));
    expect(scene.interpretation.genres[genre].line).toContain(`缺${label}`);
    expect(scene.interpretation.genres[genre].when).toBe("暂时排不出");
    expect(scene.interpretation.genres[genre].line).not.toContain("没有合适的自然光");
  });
  it("a single snow hour survives a clear majority without becoming rain", () => {
    const scene = run(at(9), day => setAll(day, { weatherCode: 73, precipitation: 0.8, cloudTotal: 100 }, [15]));
    const period = scene.interpretation.periods.find(period => overlaps(period, scene.hours[15]))!;
    expect(period.summary).toContain("雪"); expect(period.summary).not.toContain("小雨");
    expect(scene.interpretation.weatherLine).toContain("雪"); expect(scene.interpretation.weatherLine).not.toContain("小雨");
  });
  it.each([true, false])("rain/snow type conversion is an event despite unchanged amount (snow first %s)", snowFirst => {
    const scene = run(at(9), day => {
      setAll(day, { precipitation: 0.8, weatherCode: snowFirst ? 73 : 61 });
      setAll(day, { weatherCode: snowFirst ? 61 : 73 }, Array.from({ length: 12 }, (_, index) => index + 12));
    });
    const text = scene.interpretation.nextUp.join("");
    expect(text).toContain(`12 时前后${snowFirst ? "雪转雨" : "雨转雪"}`);
    expect(text).not.toContain("一直下到午夜");
  });
  it("unknown accumulation interrupts a continuous rain/snow claim", () => {
    const scene = run(at(9), day => {
      setAll(day, { precipitation: 0.8, weatherCode: 73 });
      setAll(day, { precipitation: null }, [12]);
    });
    const text = scene.interpretation.nextUp.join("");
    expect(text).toContain("12 时起缺降水预报"); expect(text).not.toContain("一直下到午夜");
  });
  it("air lead preserves the actual risk span without suppressing recommendations", () => {
    const scene = run(at(9), day => {
      for (const hour of day.hours.slice(14, 16)) {
        hour.air.referenceAqi = photoMetric(180);
        hour.riskInputs.forEach(input => { input.air.referenceAqi = photoMetric(180, input.source.id); });
      }
    });
    expect(scene.interpretation.lead).toContain("14–15 时空气不健康"); expect(scene.interpretation.lead).toContain("口罩");
    expect(scene.advice.street.recommendedWindows.length).toBeGreaterThan(0);
  });
});
