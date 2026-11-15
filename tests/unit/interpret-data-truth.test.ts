import { describe, expect, it } from "vitest";
import { rainReading, skyReading, visibilityReading, windReading } from "../../src/content/interpret/levels";
import { at, missing, run, setAll } from "../fixtures/interpret-helpers";
import { photoMetric } from "../fixtures/photography-synthetic";

describe("T14 data truth boundaries", () => {
  it.each([
    [null, "预报雨量为 0，没有下雨概率的预报。"],
    [19, "基本不会下雨。"], [20, "下雨可能不大（20%）。"], [39, "下雨可能不大（39%）。"],
    [40, "有 40% 可能下雨，带把伞。"], [69, "有 69% 可能下雨，带把伞。"], [70, "很可能下雨（70%），带好伞。"],
  ] as const)("zero rainfall / probability %s is stated exactly", (chance, detail) => {
    expect(rainReading(photoMetric(0), chance === null ? missing() : photoMetric(chance), photoMetric(1)))
      .toEqual({ label: "无雨", key: "none", detail });
  });
  it.each([[20, "clear"], [21, "partly"], [50, "partly"], [51, "cloudy"], [84, "cloudy"], [85, "overcast"]] as const)(
    "cloud %s preserves the existing wording boundary", (cloud, key) => {
      for (const code of [0, 1, 2, 3]) expect(skyReading(photoMetric(code), photoMetric(cloud)).key).toBe(key);
    });
  it.each([[0, "clear"], [1, "partly"], [2, "cloudy"], [3, "overcast"]] as const)(
    "code %s remains a fallback when clouds are missing", (code, key) => {
      expect(skyReading(photoMetric(code), missing()).key).toBe(key);
    });
  it.each([
    [45, "fog"], [48, "fog"], [51, "drizzle"], [53, "drizzle"], [55, "drizzle"],
    [56, "sleet"], [57, "sleet"], [61, "rain"], [63, "rain"], [65, "rain"], [66, "sleet"], [67, "sleet"],
    [71, "snow"], [73, "snow"], [75, "snow"], [77, "snow"], [80, "showers"], [81, "showers"], [82, "showers"],
    [85, "snow"], [86, "snow"], [95, "thunder"], [96, "thunder"], [97, "thunder"], [99, "thunder"],
  ] as const)("weather-significant code %s wins over clear cloud amount", (code, key) => {
    expect(skyReading(photoMetric(code), photoMetric(0)).key).toBe(key);
  });
  it.each([
    [null, null, "很难看远"], [89, 1, "很难看远"], [90, 1, "有雾"],
    [null, 45, "有雾"], [null, 48, "有雾"], [95, null, "有雾"],
  ] as const)("850m / humidity %s / code %s needs fog evidence", (humidity, code, label) => {
    expect(visibilityReading(photoMetric(850), humidity === null ? missing() : photoMetric(humidity),
      code === null ? missing() : photoMetric(code)).label).toBe(label);
  });
  it("fog evidence does not override visibility >= 1km or missing visibility", () => {
    expect(visibilityReading(photoMetric(1000), photoMetric(100), photoMetric(45)).label).toBe("朦胧");
    expect(visibilityReading(missing(), photoMetric(100), photoMetric(45)).key).toBe("unknown");
  });
  it.each([[0, 0.3], [null, 0.3], [4, 3], [4, 4]] as const)(
    "wind %s / gust %s has no weak or non-stronger gust copy", (speed, gust) => {
      const reading = windReading(speed === null ? missing() : photoMetric(speed), photoMetric(gust), missing(), photoMetric(20), photoMetric(50));
      expect(reading.short).toBe("20°C · 湿度 50%");
      expect(reading.detail).not.toContain("阵风");
    });
  it.each([[5, "天冷"], [30, "天热"], [null, "没有气温预报"]] as const)(
    "portrait advice uses temperature %s without inventing missing values", (temperature, expected) => {
      const scene = run(at(9), day => setAll(day, { temperature, windSpeed: null }));
      const text = scene.advice.portrait.opportunities[1];
      expect(text).toContain(expected);
      expect(text).toContain("没有平均风的预报");
      expect(text).not.toMatch(/风不大|人物站得住|冷热要看现场/);
    });
  it("strong average wind is not described as a stable portrait pose", () => {
    const scene = run(at(9), day => setAll(day, { temperature: 20, windSpeed: 6 }));
    expect(scene.advice.portrait.opportunities[1]).toContain("平均风 4 级");
    expect(scene.advice.portrait.opportunities[1]).toContain("气温 20°C");
    expect(scene.advice.portrait.opportunities[1]).not.toContain("人物站得住");
  });
  it.each([2.5, null])("average %s / gust 11 uses the known stronger wind without filling average gaps", windSpeed => {
    const scene = run(at(9), day => setAll(day, { windSpeed, windGust: 11, temperature: 20 }));
    const text = scene.advice.portrait.opportunities[1];
    expect(text).toContain("阵风可到 6 级");
    expect(text).toContain("气温 20°C");
    expect(text).not.toMatch(/风不大|人物站得住/);
    if (windSpeed === null) expect(text).toContain("没有平均风的预报");
  });
  it("a stronger average wind retains its impact instead of the weaker gust", () => {
    const scene = run(at(9), day => setAll(day, { windSpeed: 20, windGust: 11, temperature: 20 }));
    expect(scene.advice.portrait.opportunities[1]).toContain("平均风 8 级");
    expect(scene.advice.portrait.opportunities[1]).toContain("户外有危险");
    expect(scene.advice.portrait.opportunities[1]).not.toMatch(/阵风可到 6|人物站得住|风不大/);
  });
  it.each([21, 22, 23])("missing rain at future/current hour %s prevents a dry fallback", hour => {
    const scene = run(at(21), day => setAll(day, { precipitation: null }, [hour]));
    expect(scene.interpretation.nextUp).toEqual(["接下来没有需要特别留意的变化（部分小时缺降水预报）。"]);
  });
  it("past missing rain does not invalidate known dry future hours", () => {
    const scene = run(at(21), day => setAll(day, { precipitation: null }, [0]));
    expect(scene.interpretation.nextUp).toEqual(["剩余时段预报雨量为 0，暂未见明显变化。"]);
  });
  it("trace rain after dark does not become a missing-data claim", () => {
    const scene = run(at(21), day => setAll(day, { precipitation: 0.05, weatherCode: 51 }));
    expect(scene.interpretation.nextUp).toEqual(["剩余时段有零星雨点，暂未见明显变化。"]);
  });
  it.each([60, 70])("zero rain and %s%% chance after dark does not promise a dry evening", precipitationProbability => {
    const scene = run(at(21), day => setAll(day, { precipitation: 0, precipitationProbability }));
    expect(scene.interpretation.nextUp).toEqual(["剩余时段预报雨量为 0，暂未见明显变化。"]);
    expect(scene.interpretation.nextUp.join("")).not.toMatch(/不会下雨|缺降水预报/);
  });
  it("the data note names weather type independently of the later missing-ranking headline fix", () => {
    const scene = run(at(9), day => setAll(day, { weatherCode: null }));
    expect(scene.interpretation.dataNote).toContain("天气类型");
  });
  it("completed all-overcast day keeps past tense", () => {
    const scene = run(at(21), day => setAll(day, { cloudTotal: 95, weatherCode: 3 }));
    expect(scene.interpretation.tone).toBe("done");
    expect(scene.interpretation.headline).toContain("阴了一整天");
  });
});
