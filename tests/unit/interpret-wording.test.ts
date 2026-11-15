import { describe, expect, it } from "vitest";
import type { Genre, RiskNote } from "../../src/domain/types";
import { RULES_VERSION } from "../../src/domain/schemas";
import { hourReadings, hourSentence } from "../../src/content/interpret";
import { HAZARD_WORDS } from "../../src/content/interpret/hazard-words";
import { SUNSET_WORDS } from "../../src/content/interpret/sunset-words";
import { at, run, setAll, visibleEntries, visibleText } from "../fixtures/interpret-helpers";
import { photoMetric, photoSolar } from "../fixtures/photography-synthetic";
import { SCENARIOS } from "../fixtures/interpret-scenes";

const GENRES: Genre[] = ["landscape", "portrait", "street"];
const CODES: RiskNote["code"][] = ["thunderstorm", "heavy-rain", "strong-wind", "air-quality"];
const count = (text: string, phrase: string) => text.split(phrase).length - 1;
const LEVELS = [
  { level: 1, visibility: 2000, label: "很低", prospect: "晚霞基本没戏", retrospective: "当时的条件很差", action: "不必专门等" },
  { level: 2, visibility: 6000, label: "偏低", prospect: "晚霞机会不大", retrospective: "当时的条件不太好", action: "不必专门等" },
  { level: 3, visibility: 10000, label: "一般", prospect: "晚霞有一点机会", retrospective: "当时的条件一般", action: "顺路的话看一眼西边" },
  { level: 4, visibility: 15000, label: "较高", prospect: "有机会出晚霞", retrospective: "当时的云况不错", action: "日落前后留意西边的天空" },
  { level: 5, visibility: 25000, label: "很高", prospect: "晚霞机会很大", retrospective: "当时的云况很有利", action: "日落前 20 分钟到位，看西边" },
] as const;

describe("T17 sunset vocabulary", () => {
  it.each(LEVELS)("level $level uses exactly the planned table at every outlet", row => {
    const { level, label, prospect, retrospective, action } = row;
    expect(SUNSET_WORDS[level]).toEqual({ label, prospect, retrospective, action });
    for (const now of [at(9), at(21)]) {
      const scene = run(now, day => setAll(day, { visibility: row.visibility }), field => { field.points[0].hours.forEach(h => { h.visibility = row.visibility; }); });
      const sunset = scene.sunsetOpportunity, view = scene.interpretation;
      const passed = Date.parse(now) >= Date.parse(photoSolar.sunset!);
      expect(sunset).toMatchObject({ status: "assessed", level, label });
      expect(view.sunset.title).toBe(`${level}/5 ${label}`);
      const phrase = passed ? retrospective : prospect;
      for (const text of [sunset.reasons[0], view.sunset.line, view.lead, scene.advice.landscape.opportunities[1]]) expect(text).toContain(phrase);
      if (passed) {
        for (const text of [sunset.reasons[0], view.sunset.line, view.lead, scene.advice.landscape.opportunities[1]]) {
          expect(text).not.toContain(prospect);
          expect(text).not.toContain(action);
        }
      } else {
        expect(scene.advice.landscape.opportunities[1]).toBe(`${prospect}，${action}。`);
        expect(view.nextUp.join()).toContain(prospect);
      }
      expect(scene.rulesVersion).toBe(RULES_VERSION);
    }
  });
  it.each([
    { id: "rain", values: { precipitation: 2 }, level: 1, cause: "日落前后有雨" },
    { id: "low cloud", values: { cloudLow: 90 }, level: 2, cause: "本地低云遮挡较多" },
    { id: "no colouring cloud", values: { cloudLow: 0, cloudMid: 0, cloudHigh: 0 }, level: 1, cause: "日落方向缺少可着色的云" },
  ])("spatial $id limitation retains actual level and matching prospect/review", ({ values, level, cause }) => {
    for (const now of [at(9), at(21)]) {
      const scene = run(now, day => setAll(day, values), field => {
        const points = "cloudMid" in values ? field.points : field.points.filter(p => p.distanceKm === 0);
        points.forEach(p => p.hours.forEach(h => Object.assign(h, values)));
      });
      expect(scene.sunsetOpportunity.level).toBe(level);
      if (now === at(9)) {
        expect(scene.sunsetOpportunity.reasons[0]).toContain(cause);
        expect(scene.sunsetOpportunity.reasons[0]).toContain(SUNSET_WORDS[level as 1 | 2].prospect);
      } else expect(scene.sunsetOpportunity.reasons[0]).toContain(SUNSET_WORDS[level as 1 | 2].retrospective);
    }
  });
  it.each([at(9), at(21)])("unknown remains independent at %s", now => {
    const scene = run(now, undefined, field => { field.points[0].hours.forEach(h => { h.cloudHigh = null; }); });
    expect(scene.sunsetOpportunity).toMatchObject({ status: "unknown", level: null, label: SUNSET_WORDS.unknown.label });
    expect(scene.interpretation.sunset.title).toBe(SUNSET_WORDS.unknown.label);
    expect(scene.interpretation.lead).toContain(SUNSET_WORDS.unknown.prospect);
    expect(scene.advice.landscape.opportunities[1]).toBe(`${SUNSET_WORDS.unknown.prospect}，${SUNSET_WORDS.unknown.action}。`);
    expect(scene.interpretation.sunset.line).not.toMatch(/[1-5]\/5|基本没戏/);
  });
  it.each(["thunderstorm", "strong-wind"] as const)("level 5 sunset with %s prioritizes the existing outdoor risk", code => {
    const sunsetHour = Number(photoSolar.sunset!.slice(11, 13));
    const scene = run(at(9), day => setAll(day, code === "thunderstorm" ? { weatherCode: 95, precipitation: 0 } : { windGust: 18 }, [sunsetHour]));
    expect(scene.sunsetOpportunity.level).toBe(5);
    const line = scene.advice.landscape.opportunities[1];
    expect(scene.hours[sunsetHour].risks.map(risk => risk.code)).toContain(code);
    expect(line).toContain(SUNSET_WORDS[5].prospect);
    expect(line).toContain(HAZARD_WORDS[code].action);
    expect(line).not.toContain(SUNSET_WORDS[5].action);
  });
  it("a backup-only sunset thunder risk cannot be vetoed by the clear primary sky", () => {
    const sunsetHour = Number(photoSolar.sunset!.slice(11, 13));
    const scene = run(at(9), day => {
      const input = structuredClone(day.hours[sunsetHour].riskInputs[0]);
      input.source = { ...input.source, id: "backup-weather" };
      input.weather.weatherCode = photoMetric(95, input.source.id);
      day.hours[sunsetHour].riskInputs.push(input);
    });
    expect(scene.sunsetOpportunity.level).toBe(5);
    expect(scene.advice.landscape.opportunities[1]).toContain(HAZARD_WORDS.thunderstorm.action);
    expect(scene.advice.landscape.opportunities[1]).not.toContain("20 分钟到位");
    expect(scene.hours[sunsetHour].risks[0].sourceIds).toEqual(["backup-weather"]);
    expect(scene.hours[sunsetHour].risks[0].message).toContain("分歧");
  });
});

describe("T17 hazard vocabulary and structural deduplication", () => {
  it.each(CODES)("%s uses the table in rules, grouped risk, marks, sentences and lead", code => {
    const scene = run(at(9), day => {
      if (code === "thunderstorm") setAll(day, { weatherCode: 95 }, [12]);
      if (code === "heavy-rain") setAll(day, { precipitation: 5.5 }, [12]);
      if (code === "strong-wind") setAll(day, { windGust: 18 }, [12]);
      if (code === "air-quality") {
        day.hours[12].air.referenceAqi = photoMetric(180);
        day.hours[12].riskInputs.forEach(input => { input.air.referenceAqi = photoMetric(180, input.source.id); });
      }
    });
    const words = HAZARD_WORDS[code], hour = scene.interpretation.hours[12];
    const raw = scene.hours[12].risks.find(risk => risk.code === code)!;
    expect(raw.message).toContain(code === "thunderstorm" || code === "strong-wind" ? words.detail : words.action);
    expect(scene.interpretation.risks.find(risk => risk.code === code)!.text).toContain(words.action);
    expect(hour.marks.risks.join()).toContain(words.label);
    expect(hour.sentences.join()).toContain(words.action);
    expect(count(hour.sentences.join(), words.action)).toBe(1);
    expect(scene.interpretation.lead).toContain(words.detail);
    for (const genre of GENRES) {
      expect(scene.advice[genre].limitations[0]).toContain(words.printedLabel);
      expect(scene.advice[genre].limitations[0]).toContain(words.printedAction);
    }
    if (code === "thunderstorm") expect(hour.sky.detail).toContain(words.action);
  });
  it.each([1, 95, 66])("sky code %s keeps every simultaneous risk exactly once without parsing messages", weatherCode => {
    const scene = run(at(9), day => setAll(day, { weatherCode }, [12]));
    const hour = scene.hours[12];
    const risks = CODES.map(code => ({ code, start: hour.start, end: hour.end, message: "任意中文，不用于识别风险", sourceIds: ["synthetic"] }));
    const before = structuredClone({ hour, risks, advice: scene.advice });
    const sentences = hourSentence(hourReadings(hour), hour, risks, scene.advice);
    expect(sentences).toHaveLength(3);
    for (const code of CODES) expect(count(sentences.join(), `${HAZARD_WORDS[code].label}，${HAZARD_WORDS[code].action}`)).toBe(1);
    expect(sentences.join()).not.toContain("最好的时段");
    if (weatherCode === 66) expect(sentences[1]).toContain(HAZARD_WORDS.sleet.detail);
    expect({ hour, risks, advice: scene.advice }).toEqual(before);
  });
  it("sleet shares its detailed warning without creating a public risk code", () => {
    const scene = run(at(9), day => setAll(day, { weatherCode: 66 }));
    expect(scene.interpretation.hours[12].sky.detail).toContain(HAZARD_WORDS.sleet.detail);
    expect(scene.interpretation.hours[12].sentences[1]).toContain(HAZARD_WORDS.sleet.detail);
    expect(scene.hours.flatMap(hour => hour.risks)).toEqual([]);
  });
});

describe("T17 distance, glossary and print budgets", () => {
  it("AQI 180 remains unhealthy while every clear-distance reason says far view", () => {
    const scene = run(at(9), SCENARIOS.find(item => item.id === "aqi-180")!.edit);
    const entries = visibleEntries(scene);
    expect(entries.filter(entry => /空气很?通透/.test(entry.text))).toEqual([]);
    for (const windows of [scene.advice.landscape.allWindows, scene.advice.landscape.recommendedWindows]) {
      expect(windows.length).toBeGreaterThan(0);
      for (const window of windows) expect(window.reasons.join()).toContain("远处很通透");
    }
    expect(scene.sunsetOpportunity.reasons.join()).toContain("本地能见度约25公里");
    expect(scene.interpretation.hours[12].air.detail).toContain("户外尽量缩短停留，可以戴口罩");
    for (const now of [at(9), at(21)]) {
      const view = run(now).interpretation;
      for (const hour of view.hours) {
        expect(hour.air.detail).not.toContain("两回事");
        expect(hour.devices.weather.meaning.join()).not.toContain("两回事");
        expect(hour.devices.weather.reference.filter(text => text.includes("两回事"))).toHaveLength(1);
      }
    }
  });
  it("all candidate reasons describe effects without unranked best claims", () => {
    const scene = run(at(9));
    for (const advice of Object.values(scene.advice)) for (const window of advice.allWindows) {
      expect(window.reasons.join()).not.toMatch(/最好|最值得|最适合/);
    }
    expect(scene.interpretation.hours.some(hour => hour.sentences.join().includes("最好的时段"))).toBe(true);
    expect(visibleText(scene)).not.toMatch(/空气通透|空气很通透|一天里最好看|几乎不透光|放心/);
  });
  it.each(SCENARIOS)("$id at 05/09/21 fits all six printed-field budgets", scenario => {
    for (const hour of [5, 9, 21]) {
      const scene = run(at(hour), scenario.edit);
      expect(Array.from(scene.interpretation.headline).length).toBeLessThanOrEqual(28);
      for (const genre of GENRES) {
        const advice = scene.advice[genre];
        const timing = advice.timing.replace(/^.*?\d{4}-\d{2}-\d{2}，/, "");
        const fields = [["timing", timing, 52], ["light", advice.light, 44], ["opportunity", advice.opportunities[0], 44],
          ["film", advice.film.reason, 45], ["limit", advice.limitations[0], 28], ["alternative", advice.alternatives[0], 28]] as const;
        for (const [name, text, budget] of fields) expect(Array.from(text.replace(/\s+/gu, " ").trim()).length, `${scenario.id}@${hour} ${genre}.${name}: ${text}`).toBeLessThanOrEqual(budget);
      }
    }
  });
});
