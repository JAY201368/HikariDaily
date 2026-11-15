import { describe, expect, it } from "vitest";
import type { Genre, RiskNote } from "../../src/domain/types";
import { HEADLINE_MAX, createInterpretation, hourReadings, rainClass } from "../../src/content/interpret";
import { GENRE_NAMES, genreLine, windowLightKey } from "../../src/content/interpret/genres";
import { type RainState, wet } from "../../src/content/interpret/periods";
import { scoreConditions } from "../../src/domain/photography/windows";
import { assessLight } from "../../src/domain/photography/light";
import { at, run, setAll, visibleEntries, visibleText, type InterpretationScene } from "../fixtures/interpret-helpers";
import { windLevel } from "../../src/content/interpret/levels";
import { present } from "../../src/domain/photography/shared";
import { photoDay, photoLocation, photoSolar } from "../fixtures/photography-synthetic";

// Deliberately red V10 baseline. No skip/todo/expected-failure markers: later tasks repair it.
// A1 joins the original invariants in step 5; their assertions remain unchanged.
const BANNED_V10 = /空气通透|空气很通透|一天里最好看|几乎不透光|放心/;
const GENRES: Genre[] = ["landscape", "portrait", "street"];
const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) =>
  Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
import { SCENARIOS } from "../fixtures/interpret-scenes";

const MATRIX = SCENARIOS.flatMap(scenario => [5, 9, 21].map(hour => ({
  id: `${scenario.id}@${String(hour).padStart(2, "0")}`, now: at(hour), scenario: scenario.id,
  scene: run(at(hour), scenario.edit),
})));
function getScene(id: string, hour = 9) { return MATRIX.find(item => item.id === `${id}@${String(hour).padStart(2, "0")}`)!.scene; }
function noCopy(scene: InterpretationScene, pattern: RegExp, scope: "all" | "current-advice" = "all") {
  expect(visibleEntries(scene, scope).filter(({ text }) => pattern.test(text))).toEqual([]);
}
function umbrellaEvidence(scene: InterpretationScene, range: { start: string; end: string }) {
  return scene.hours.filter(hour => overlaps(hour, range)).some(({ weather: w }) =>
    (w.precipitation.value !== null && w.precipitation.value > 0) ||
    (w.precipitationProbability.value !== null && w.precipitationProbability.value >= 40));
}
const UMBRELLA_ACTION = /带[^。]*伞|备[^。]*伞|撑把伞/;

// Every invariant is independently identifiable for every scenario/time, so one failure
// cannot hide a different defect. Unknown rain/wind remain unknown, never fabricated bad weather.
describe.each(MATRIX)("V10 matrix $id", ({ scene, now }) => {
  it("I01 / A2: marked hours are dry and have no thunder/freezing-rain sky", () => {
    for (const [index, reading] of scene.interpretation.hours.entries()) if (reading.marks.recommendation) {
      expect(wet(reading.rain.key as RainState), `hour ${index}: ${reading.sentences.join("")}`).toBe(false);
      expect(["thunder", "sleet"], `hour ${index}: ${reading.sentences.join("")}`).not.toContain(reading.sky.key);
    }
  });
  it("I11 / A1: marked hours with known gust stay below Beaufort 6", () => {
    for (const [index, reading] of scene.interpretation.hours.entries()) if (reading.marks.recommendation) {
      const gust = scene.hours[index].weather.windGust;
      if (present(gust)) expect(windLevel(gust.value), `hour ${index}: ${reading.sentences.join("")}`).toBeLessThan(6);
    }
  });
  it("I02 / B2: wet hourly sentences do not promote portrait light", () => {
    for (const [index, reading] of scene.interpretation.hours.entries()) if (wet(reading.rain.key as RainState)) {
      expect(reading.sentences.join(""), `hour ${index}`).not.toContain("适合人像");
    }
  });
  it("I03 / B3: sky details describe sky rather than light or shadows", () => {
    for (const [index, reading] of scene.interpretation.hours.entries()) expect(reading.sky.detail, `hour ${index}`).not.toMatch(/光线|影子/);
  });
  it("I04 / B4: each weather hazard survives in every overlapping period", () => {
    const terms: Partial<Record<RiskNote["code"], RegExp>> = { thunderstorm: /雷雨/, "heavy-rain": /雨/, "strong-wind": /风/ };
    // AQI is not a weather type. B13 below tests its appropriate lead/air surfaces.
    for (const risk of scene.interpretation.risks) {
      const word = terms[risk.code];
      if (!word) continue;
      const covered = scene.interpretation.periods.filter(period => overlaps(period, risk));
      expect(covered.length, risk.text).toBeGreaterThan(0);
      for (const period of covered) expect(period.summary, `${risk.text} -> ${period.name}`).toMatch(word);
    }
  });
  it("I05 / B1: umbrella actions have rain/probability evidence in their own range", () => {
    const view = scene.interpretation;
    const ahead = { start: now, end: scene.hours.at(-1)!.end };
    for (const text of [view.headline, view.lead, ...view.nextUp]) if (UMBRELLA_ACTION.test(text)) {
      expect(umbrellaEvidence(scene, ahead), text).toBe(true);
    }
    for (const [index, reading] of view.hours.entries()) if (UMBRELLA_ACTION.test(reading.rain.detail)) {
      expect(umbrellaEvidence(scene, scene.hours[index]), `hour ${index}: ${reading.rain.detail}`).toBe(true);
    }
    for (const advice of Object.values(scene.advice)) for (const window of advice.allWindows) {
      for (const text of window.reasons) if (UMBRELLA_ACTION.test(text)) expect(umbrellaEvidence(scene, window), `${window.start}: ${text}`).toBe(true);
    }
  });
  it("I06 / B9: after evening blue, current advice has no daytime or future-sunset prompt", () => {
    if (Date.parse(now) > Date.parse(photoSolar.eveningBlue!.end)) {
      // Historical hours/allWindows deliberately remain outside this assertion.
      noCopy(scene, /有机会出晚霞|留意西边|阳光太硬/, "current-advice");
    }
  });
  it("I07 / B5: missing weather code is named instead of judged as bad weather", () => {
    if (scene.hours.every(hour => hour.weather.weatherCode.value === null)) {
      expect(scene.interpretation.headline).not.toContain("不太适合");
      expect(scene.interpretation.dataNote).toContain("天气类型");
    }
  });
  it("I08 / B11: each genre has only one contiguous best interval, belonging to its top recommendation", () => {
    for (const genre of GENRES) {
      const bestHours = scene.interpretation.hours.flatMap((hour, index) => hour.sentences.some(sentence =>
        /最值得|最好的时段/.test(sentence) && sentence.includes(GENRE_NAMES[genre])) ? [index] : []);
      const groups = bestHours.filter((hour, index) => index === 0 || hour !== bestHours[index - 1] + 1);
      expect(groups.length, `${genre}: best hours ${bestHours.join(",")}`).toBeLessThanOrEqual(1);
      for (const index of bestHours) {
        const best = scene.advice[genre].recommendedWindows[0];
        expect(best && overlaps(scene.hours[index], best), `${genre} hour ${index}`).toBe(true);
      }
    }
  });
  it("I09 / B12 B17: no newly banned wording, including advice and sunset reasons", () => noCopy(scene, BANNED_V10));
  it("I10 / B11: headline fits the 28-character contract", () => expect(Array.from(scene.interpretation.headline).length).toBeLessThanOrEqual(HEADLINE_MAX));
});

describe("V10 helper visibility boundaries", () => {
  it("includes every advice field, both window reasons, and sunset reasons", () => {
    const scene = structuredClone(getScene("clear"));
    const advice = scene.advice.landscape;
    advice.recommendedWindows[0].reasons.push("recommended-reason-marker");
    advice.allWindows[0].reasons.push("history-reason-marker");
    scene.sunsetOpportunity.reasons.push("sunset-reason-marker");
    const text = visibleText(scene);
    for (const marker of ["recommended-reason-marker", "history-reason-marker", "sunset-reason-marker"]) expect(text).toContain(marker);
    expect(visibleEntries(scene)).toEqual(expect.arrayContaining([
      { path: "advice.landscape.film.type", text: advice.film.type },
      { path: "advice.landscape.film.sensitivity", text: advice.film.sensitivity },
    ]));
    expect(visibleText(scene, "current-advice")).not.toContain("history-reason-marker");
  });
  it("keeps historical daytime copy visible without treating it as a night action", () => {
    const scene = structuredClone(getScene("clear", 21));
    scene.interpretation.hours[12].sentences.push("历史小时阳光太硬");
    scene.advice.landscape.allWindows[0].reasons.push("历史时段留意西边");
    expect(visibleText(scene)).toContain("历史小时阳光太硬");
    expect(visibleText(scene, "current-advice")).not.toContain("历史小时阳光太硬");
    expect(visibleText(scene, "current-advice")).not.toContain("历史时段留意西边");
  });
});

describe("V10 concrete regression cases (section 3)", () => {
  it.each([5, 9, 21])("B1 missing probability @%s: no umbrella in headline/lead", hour => {
    const view = getScene("missing-probability", hour).interpretation;
    expect(`${view.headline}\n${view.lead}`).not.toContain("伞");
  });
  it.each([5, 9])("B1 probability 60 @%s: umbrella advice is retained", hour => {
    const view = getScene("probability-60", hour).interpretation;
    expect(`${view.headline}\n${view.lead}`).toContain("伞");
  });
  it.each(["afternoon-rain", "freezing-rain"])("B2 %s: danger/rain handling wins over soft-light portrait advice", id => {
    const scene = getScene(id), index = id === "afternoon-rain" ? 14 : 12;
    const text = scene.interpretation.hours[index].sentences.join("");
    expect(text).not.toContain("适合人像");
    expect(text).toMatch(id === "freezing-rain" ? /结冰|冻雨.*别/ : /防雨|防水|雨.*拍摄受影响/);
  });
  it.each(Array.from({ length: 21 }, (_, index) => index * 5))("B3 cloud %s percent: sky has no light or shadow claim", cloudTotal => {
    const scene = run(at(9), day => setAll(day, { cloudTotal, weatherCode: null }));
    expect(scene.interpretation.hours[12].sky.detail).not.toMatch(/光线|影子/);
  });
  it.each([0, 1, 2, 3])("B3/B16 code %s yields to valid cloud amount", weatherCode => {
    const scene = run(at(9), day => setAll(day, { cloudTotal: 80, weatherCode }));
    expect(scene.interpretation.hours[12].sky.key).toBe("cloudy");
  });
  it.each([5, 9, 21])("B4 dry thunder @%s survives period, weatherLine, and daily headline", hour => {
    const scene = getScene("dry-thunder", hour), view = scene.interpretation;
    for (const index of [15, 16]) {
      const period = view.periods.find(period => overlaps(period, scene.hours[index]))!;
      expect(period.summary, `${index}: ${period.name}`).toContain("雷雨");
      expect(view.weatherLine).toMatch(new RegExp(`${period.name}[^，]*雷雨`));
    }
    expect(view.headline).toContain("雷雨");
  });
  it.each([5, 9])("B5 missing code @%s explains missing ranking evidence", hour => {
    const view = getScene("missing-code", hour).interpretation;
    expect(view.headline).toMatch(/缺.*天气类型.*排不出/);
    expect(view.lead).toContain("已算出的光线时刻仍可查看");
    expect(view.dataNote).toContain("天气类型");
  });
  it.each([0.05, 0.099])("B6 %s mm is trace before rounding", amount => {
    expect(rainClass(amount)).toBe("trace");
    const scene = run(at(9), day => setAll(day, { precipitation: amount, weatherCode: 51 }));
    const rain = scene.interpretation.hours[10].rain;
    expect(rain.key).toBe("trace");expect(rain.label).toBe("零星雨点");
    expect(rain.detail).toContain("不到 0.1");
    expect(scene.interpretation.nextUp.join("")).not.toContain("小雨");
  });
  it.each([5, 9])("B7 rain 5.5 @%s does not promote reflections or repeat the risk event", hour => {
    const scene = getScene("rain-55", hour), reading = scene.interpretation.hours[10];
    expect(reading.sentences.join("")).toContain("别安排户外");
    expect(reading.rain.detail).not.toContain("倒影");
    expect(reading.rain.detail).toContain("别安排户外");
    const sameEvent = scene.interpretation.nextUp.filter(text => /10 时/.test(text) && /雨/.test(text));
    expect(sameEvent).toHaveLength(1);
  });
  it.each([5, 9, 21])("B8 gust 18 @%s: overlapping period states gust force 8", hour => {
    const scene = getScene("gust-18", hour);
    for (const period of scene.interpretation.periods.filter(period => [14, 15].some(index => overlaps(period, scene.hours[index])))) {
      expect(period.summary).toContain("阵风 8 级");
    }
  });
  it("B9 night: sunset looks back, genre opportunities and film suit night", () => {
    const scene = getScene("clear", 21), view = scene.interpretation;
    expect(view.sunset.line).toMatch(/当时/);expect(view.sunset.line).not.toMatch(/有机会出晚霞|留意西边/);
    expect(view.lead).toMatch(/今天白天/);
    for (const advice of Object.values(scene.advice)) {
      expect(advice.opportunities[0]).toMatch(/夜|天黑|灯/);
      expect(advice.film.sensitivity).toBe("较高感");expect(advice.film.reason).toMatch(/夜|灯/);
      expect(advice.film.reason).not.toContain("还不清楚");
    }
  });
  it("B10 after-sunset golden slice uses afterglow copy at every genre outlet", () => {
    const scene = getScene("clear"), start = new Date(Date.parse(photoSolar.sunset!) + 60000).toISOString();
    const end = photoSolar.eveningGolden!.end;
    expect(Date.parse(start)).toBeLessThan(Date.parse(end));
    const readings = scene.hours.map(hourReadings);
    for (const genre of GENRES) {
      const window = { ...scene.advice[genre].allWindows.find(window => window.reasonCodes.includes("phase:golden"))!, start, end, status: "current" as const };
      const advice = { ...scene.advice[genre], recommendedWindows: [window] };
      expect(windowLightKey(window, readings, scene.hours, { solar: photoSolar, now: start, location: photoLocation })).toBe("afterglow");
      expect(genreLine(genre, advice, scene.hours, readings, photoSolar, start).line).not.toMatch(/长影子|侧.*照来|背对太阳/);
    }
    const sunsetNow = new Date(Date.parse(photoSolar.sunset!) + 1000).toISOString();
    const post = run(sunsetNow);
    expect(post.advice.portrait.opportunities.join("")).not.toContain("背对太阳");
  });
  it("B11 clear 09: shared lead does not truncate different genre end times", () => {
    const scene = getScene("clear"), advice = structuredClone(scene.advice);
    // Isolate overlap wording from ranking. A3 will rightly remove actual L0 portrait
    // recommendations; this explicitly supplied copy fixture still exercises both ends.
    for (const genre of GENRES) {
      const base = advice[genre].allWindows.find(window => overlaps(window, scene.hours[9]))!;
      advice[genre].recommendedWindows = [{ ...base, start: at(9), end: at(genre === "landscape" ? 10 : 11), status: "current" }];
    }
    const before = structuredClone(advice);
    const view = createInterpretation({ hours: scene.hours, advice, solar: photoSolar,
      sunsetOpportunity: scene.sunsetOpportunity, sources: photoDay(at(9)).sources, now: at(9) });
    expect(advice).toEqual(before);
    for (const end of ["10:00", "11:00"]) expect(view.lead).toContain(end);
    expect(view.headline).not.toMatch(/出门正好|最值得/);
  });
  it("B12 AQI 180: clear distance is not called clear air in any visible reasons", () => noCopy(getScene("aqi-180"), /空气很?通透/));
  it.each([5, 9, 21])("B13 AQI 180 @%s is an actual source hazard with lead advice", hour => {
    const scene = getScene("aqi-180", hour);
    expect(scene.hours.every(hour => hour.risks.some(risk => risk.code === "air-quality"))).toBe(true);
    expect(scene.interpretation.risks.some(risk => risk.code === "air-quality")).toBe(true);
    expect(scene.interpretation.lead).toContain("空气");expect(scene.interpretation.lead).toContain("口罩");
  });
  it.each([
    [null, /雨量.*0.*没有.*概率/], [19, /基本不会下雨/], [20, /下雨可能不大.*20%/], [39, /下雨可能不大.*39%/],
    [40, /有 40% 可能下雨.*伞/], [69, /有 69% 可能下雨.*伞/], [70, /很可能下雨.*70%.*伞/],
  ] as const)("B14 zero rain / probability %s: aligned probability wording", (probability, expected) => {
    const scene = run(at(9), day => setAll(day, { precipitation: 0, precipitationProbability: probability }));
    expect(scene.interpretation.hours[12].rain.detail).toMatch(expected);
    expect(scene.interpretation.hours[12].rain.detail).not.toContain("雨随时可能落下");
  });
  it.each([5, 9, 21])("B15 snow @%s is snow and has no rain/umbrella prompt", hour => {
    const scene = getScene("snow", hour);
    expect(scene.interpretation.headline).toContain("雪");expect(scene.interpretation.headline).not.toContain("雨雪");
    noCopy(scene, /飘点雨|带上伞/);
    expect(scene.interpretation.lead).toMatch(/防滑|电池保暖/);
  });
  it("B16 low visibility without humid/fog evidence is not asserted to be fog", () => {
    const reading = getScene("visibility-850").interpretation.hours[12].visibility;
    expect(reading.label).toBe("很难看远");expect(reading.detail).toMatch(/雾、霾或沙尘/);
  });
  it.each([{ humidity: 90, weatherCode: 1 }, { humidity: 50, weatherCode: 45 }, { humidity: 50, weatherCode: 48 }])(
    "B16 supported fog remains fog ($humidity%% / code $weatherCode)", fields => {
      const scene = run(at(9), day => setAll(day, { visibility: 850, ...fields }));
      expect(scene.interpretation.hours[12].visibility.label).toBe("有雾");
    });
  it("B17 missing future rain does not become a no-rain promise", () => {
    const scene = run(at(21), day => setAll(day, { precipitation: null }));
    expect(scene.interpretation.nextUp.join("")).not.toContain("不会下雨");
    expect(scene.interpretation.nextUp.join("")).toContain("缺降水预报");
  });
  it("B17 missing wind is unknown in portrait advice", () => {
    const scene = run(at(9), day => setAll(day, { windSpeed: null, windGust: null }));
    expect(scene.advice.portrait.opportunities.join("")).not.toContain("风不大");
    expect(scene.advice.portrait.opportunities.join("")).toContain("没有风的预报");
  });
  it.each([[-1, /天冷/], [20, /气温 20°C/], [32, /天热.*补水/]] as const)("B17 portrait uses temperature %s", (temperature, expected) => {
    const scene = run(at(9), day => setAll(day, { temperature }));
    expect(scene.advice.portrait.opportunities.join("")).toMatch(expected);
    expect(scene.advice.portrait.opportunities.join("")).not.toContain("冷热要看现场");
  });
  it.each([[0, 0.2], [4, 3], [4, 4]] as const)("B17 average %s / gust %s: no uninformative gust small print", (windSpeed, windGust) => {
    const scene = run(at(9), day => setAll(day, { windSpeed, windGust }));
    expect(scene.interpretation.hours[12].wind.short).not.toContain("阵风");
  });
  it.each([5, 9])("B17 overcast @%s uses current whole-day wording", hour => {
    expect(getScene("overcast", hour).interpretation.headline).not.toContain("阴了一整天");
    expect(getScene("overcast", hour).interpretation.headline).toContain("全天阴");
  });
  it("B17 air/thick-cloud/golden language avoids guarantees and superlatives", () => {
    noCopy(getScene("clear"), /放心|一天里最好看/);
    expect(getScene("overcast").interpretation.lead).not.toContain("几乎不透光");
  });
  it.each([5, 9])("A2 freezing rain @%s: poor tone and no go/best invitation", hour => {
    const scene = getScene("freezing-rain", hour);
    expect(scene.interpretation.tone).toBe("poor");
    noCopy(scene, /最值得|出门正好/);
  });
  it("A3 clear hard-light portrait is retained for review but not recommended", () => {
    const scene = getScene("clear"), noon = scene.hours[12];
    expect(scene.advice.portrait.allWindows.some(window => overlaps(window, noon))).toBe(true);
    expect(scene.advice.portrait.recommendedWindows.filter(window => window.reasonCodes.includes("portrait:L0"))).toEqual([]);
  });
  it("A3 after-sunset portrait golden slices have light component at most 1", () => {
    const day = photoDay(at(9));
    const instant = Date.parse(photoSolar.sunset!) + 10 * 60000;
    const hour = day.hours.find(hour => Date.parse(hour.start) <= instant && instant < Date.parse(hour.end))!;
    const light = assessLight(instant, photoLocation, hour.weather.cloudTotal, photoSolar);
    expect(light.phase).toBe("golden");expect(light.altitude).toBeLessThan(0);
    const score = scoreConditions("portrait", hour, light)!;
    expect(score.components.L).toBeLessThanOrEqual(1);
  });
});

// Keep the mark invariant meaningful: a clear day must still produce real recommendations.
it("V10 A1 positive control: clear hours retain marks and gust11 hours retain records only", () => {
  expect(getScene("clear").interpretation.hours.some(hour => hour.marks.recommendation !== null)).toBe(true);
  const gust = run(at(5), day => setAll(day, { windGust: 11 }));
  expect(gust.advice.street.allWindows.length).toBeGreaterThan(0);
  expect(gust.interpretation.hours.every(hour => hour.marks.recommendation === null)).toBe(true);
});
