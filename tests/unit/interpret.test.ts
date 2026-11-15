import { describe, expect, it } from "vitest";
import { at, missing, run, setAll, visibleText } from "../fixtures/interpret-helpers";
import { InterpretationSchema, RULES_VERSION, SCHEMA_VERSION } from "../../src/domain/schemas";
import { calculateSolarEvents } from "../../src/domain/solar";
import { SOURCE_IDS } from "../../src/domain/normalization";
import type { Genre, GenreAdvice, Hour, RiskNote } from "../../src/domain/types";
import {
  HEADLINE_MAX, cloudLayerText, deviceReadings, airLevel, airReading, bearingName, hourReadings, hourSentence, hourMarks, lightReading, rainClass,
  sunPositionReading, visibilityReading, windLevel, windReading,
} from "../../src/content/interpret";
import { periodBoundaries } from "../../src/content/interpret/periods";
import { PHOTO_DATE, photoLight, photoMetric, photoSolar } from "../fixtures/photography-synthetic";

const BANNED = /空气通透|空气很通透|一天里最好看|几乎不透光|放心|窗口|本版|模型提示|US_EPA|依据置信度|暂无数据|不适用|漫射|金调|主推荐|非官方预警|不代表|不一定|不意味|不保证|不是保证|启发式|非现场|非区县实测|不随仪表|不收集微信身份|不创建订阅|仅预览文字|medium/;

describe("plain-language levels", () => {
  it.each([[0.2, 0], [0.3, 1], [3.3, 2], [3.4, 3], [5.4, 3], [5.5, 4], [17.1, 7], [17.2, 8], [32.6, 11], [32.7, 12]])(
    "wind %s m/s is level %s (GB/T 28591)", (speed, level) => expect(windLevel(speed)).toBe(level));
  it.each([[0, "none"], [0.04, "trace"], [0.05, "trace"], [0.099, "trace"], [0.1, "light"], [1.5, "light"], [1.6, "moderate"], [6.9, "moderate"], [7, "heavy"], [14.9, "heavy"], [15, "storm"]] as const)(
    "rain %s mm/h is %s (GB/T 28592)", (mm, name) => expect(rainClass(mm)).toBe(name));
  it.each([[25000, "很通透"], [20000, "很通透"], [19999, "通透"], [10000, "通透"], [9999, "远处发灰"], [5000, "远处发灰"], [4220, "朦胧"], [999, "很难看远"]])(
    "visibility %s m reads %s", (meters, label) => expect(visibilityReading(photoMetric(meters)).label).toBe(label));
  it.each([[50, "良好"], [51, "中等"], [100, "中等"], [101, "对敏感人群不健康"], [151, "不健康"], [201, "非常不健康"], [301, "有害"]])(
    "US AQI %s is %s", (aqi, label) => expect(airLevel(aqi).label).toBe(label));
  it("labels air with the US standard and never derives distance from it", () => {
    expect(airReading(photoMetric(73)).detail).toContain("美国标准 AQI 73");
    const scene = run(at(9));
    expect(scene.interpretation.hours[9].devices.weather.reference.join("")).toContain("两回事");
    expect(airReading(photoMetric(73)).detail).not.toContain("两回事");
    expect(visibilityReading(missing()).detail).toContain("没有能见度预报");
  });
  it("does not copy the average wind into a missing gust", () => {
    const reading = windReading(photoMetric(4.26), missing(), photoMetric(90));
    expect(reading.label).toBe("东风 3 级");
    expect(reading.detail).not.toContain("阵风");
    expect(reading.short).toBe("");
    expect(windReading(photoMetric(4.26), photoMetric(10.7), photoMetric(90)).detail).toContain("阵风可到 5 级");
  });
  it.each([[0, "北"], [45, "东北"], [90, "东"], [135, "东南"], [180, "南"], [225, "西南"], [270, "西"], [315, "西北"], [360, "北"], [-45, "西北"]])(
    "bearing %s reads %s for both wind and sun", (degrees, name) => {
      expect(bearingName(Number(degrees))).toBe(name);
      expect(windReading(photoMetric(4), missing(), photoMetric(Number(degrees))).label).toBe(`${name}风 3 级`);
      expect(sunPositionReading({ ...photoLight(), azimuth: Number(degrees) }, at(9)).label).toBe(`${name} · 离地平线 40°`);
    });
  it.each([
    [0, 6, "离地平线 0°"], [0, 18, "离地平线 0°"], [28, 9, "离地平线 28°"],
    [-0.1, 6, "快日出了"], [-0.1, 18, "刚落山，天还亮"],
    [-6, 6, "快日出了"], [-6, 18, "刚落山，天还亮"],
    [-6.1, 6, "还没出来"], [-6.1, 18, "已落山"], [-3, 12, "刚落山，天还亮"],
  ] as const)("sun at %s° at Beijing hour %s: %s", (altitude, hour, label) => {
    // Intentionally westward even before noon: explicit hour context wins over bearing.
    const light = { ...photoLight(), azimuth: 315, altitude };
    expect(sunPositionReading(light, at(hour)).label).toBe(`西北 · ${label}`);
    expect(sunPositionReading(light, new Date(at(hour)).toISOString()).label).toBe(`西北 · ${label}`);
    expect(hourReadings({ ...run(at(9)).hours[hour], light }).sun.label).toBe(`西北 · ${label}`);
  });
  it("reports missing solar coordinates separately from usable light", () => {
    for (const light of [{ ...photoLight(), azimuth: null }, { ...photoLight(), altitude: null }]) {
      expect(sunPositionReading(light, at(9))).toMatchObject({ label: "太阳位置算不出来", key: "unknown" });
    }
    expect(sunPositionReading({ ...photoLight(), altitude: -7, azimuth: 90 }).label).toBe("东 · 还没出来");
  });
  it("wind small print contains only available gust, temperature and humidity", () => {
    expect(windReading(photoMetric(4), photoMetric(10.7), photoMetric(90), photoMetric(20), photoMetric(96)).short)
      .toBe("阵风 5 级 · 20°C · 湿度 96%");
    expect(windReading(photoMetric(4), missing(), photoMetric(90), photoMetric(20), photoMetric(96)).short).toBe("20°C · 湿度 96%");
    expect(windReading(missing(), photoMetric(10.7), missing(), missing(), missing()).short).toBe("阵风 5 级");
    expect(windReading(missing(), missing(), missing(), missing(), missing()).short).toBe("");
    expect(hourReadings(run(at(9)).hours[9]).wind.short).toBe("20°C · 湿度 50%");
  });
  it.each([photoLight(), photoLight("blue"), photoLight("golden"), photoLight("night"), photoLight("unknown")])(
    "light small print is the first full sentence for $phase", (light) => {
      const reading = lightReading(light);
      expect(reading.short).toBe(`${reading.detail.split("。")[0]}。`);
    });
});

describe("hourly plain sentences", () => {
  const base = run(at(9));
  const hour = base.hours[12];
  const recommendation = (start: string, end: string, reasonCodes = ["D2"]) => ({
    start, end, status: "future" as const, reasons: [], reasonCodes, limitations: [], sourceIds: [],
  });
  function adviceWith(genre: Genre, start: string, end: string, reasonCodes?: string[]): Record<Genre, GenreAdvice> {
    const advice = {
      landscape: { ...base.advice.landscape, recommendedWindows: [] },
      portrait: { ...base.advice.portrait, recommendedWindows: [] },
      street: { ...base.advice.street, recommendedWindows: [] },
    } satisfies Record<Genre, GenreAdvice>;
    return { ...advice, [genre]: { ...advice[genre], recommendedWindows: [recommendation(start, end, reasonCodes)] } };
  }
  const say = (target: Hour, advice?: Record<Genre, GenreAdvice>, risks = target.risks) => hourSentence(hourReadings(target), target, risks, advice);
  it("clear hours give weather, temperature and a useful light effect", () => {
    expect(say(hour)).toEqual(["晴，无雨，20°C。", "阳光直射，明暗分明，人脸和物体下面会有浓重的影子。"]);
  });
  it("rain hours prioritize rainfall handling over soft light", () => {
    const rain = run(at(9), (day) => setAll(day, { precipitation: 0.8, weatherCode: 61, cloudTotal: 100 })).hours[12];
    expect(say(rain)).toEqual(["小雨，20°C。", "约 0.8 毫米/小时，撑把伞就行，镜头记得擦水（下雨可能 10%）。"]);
  });
  it.each([
    [51, "毛毛雨"], [61, "雨"], [80, "阵雨"], [71, "雪"], [85, "雪"],
    [56, "冻雨"], [66, "冻雨"], [95, "雷雨"], [97, "雷雨"],
  ] as const)("keeps precipitation code %s when the hourly amount is zero", (code, label) => {
    const target = { ...hour, weather: { ...hour.weather, weatherCode: photoMetric(code), precipitation: photoMetric(0) } };
    expect(hourReadings(target).rain.label).toBe("无雨"); // The amount reading retains its separate sampling context.
    expect(say(target)[0]).toBe(`${label}，20°C。`);
  });
  it("describes missing weather without inventing a temperature", () => {
    const target = run(at(9), (day) => setAll(day, { precipitation: null, weatherCode: null, cloudTotal: null, temperature: null })).hours[12];
    expect(say(target)).toEqual(["这一小时没有天气和降水预报，气温也没有预报。", "没有云量预报。"]);
  });
  it("uses wind or poor distance before a generic light description", () => {
    const wind = { ...hour, weather: { ...hour.weather, windSpeed: photoMetric(4), windGust: missing() } };
    expect(say(wind)[1]).toContain("头发和衣角会乱");
    expect(say({ ...hour, weather: { ...hour.weather, visibility: photoMetric(4000) } })[1]).toContain("4 公里");
    expect(say({ ...hour, weather: { ...hour.weather, windSpeed: missing(), windGust: photoMetric(10) } })[1]).toContain("阵风 5 级");
  });
  it.each([
    [2.81, 4.4, "阵风 3 级，树叶细枝不停摇动，头发和衣角会乱。"],
    [4.62, 10, "阵风 5 级，小树跟着摇，三脚架要挂重物，手持也不太稳。"],
    [5.7, 11.8, "阵风 6 级，大树枝摇晃，撑伞困难，器材注意防倒。"],
    [5.34, 12.1, "阵风 6 级，大树枝摇晃，撑伞困难，器材注意防倒。"],
    [null, 4.4, "阵风 3 级，树叶细枝不停摇动，头发和衣角会乱。"],
    [4, null, "树叶细枝不停摇动，头发和衣角会乱。"],
    [4, 2, "树叶细枝不停摇动，头发和衣角会乱。"],
    [4, 5, "树叶细枝不停摇动，头发和衣角会乱。"],
  ] as const)("wind impact for average %s and gust %s m/s", (speed, gust, expected) => {
    const target = { ...hour, weather: { ...hour.weather,
      windSpeed: speed === null ? missing() : photoMetric(speed), windGust: gust === null ? missing() : photoMetric(gust) } };
    expect(say(target)[1]).toBe(expected);
    expect(hourReadings(target).wind).toEqual(windReading(target.weather.windSpeed, target.weather.windGust,
      target.weather.windFrom, target.weather.temperature, target.weather.humidity));
  });
  it.each([[null, null], [null, 2], [0.2, 2], [2, null], [2, 1]] as const)(
    "keeps the light effect when average %s and gust %s m/s have no stronger impact", (speed, gust) => {
      const target = { ...hour, weather: { ...hour.weather,
        windSpeed: speed === null ? missing() : photoMetric(speed), windGust: gust === null ? missing() : photoMetric(gust) } };
      expect(say(target)[1]).toBe(hourReadings(target).light.short);
    });
  it("reviews sentences using the captured Shanghai and Urumqi weather inputs", () => {
    // Selected fields from the 2026-10-24 02:27 Beijing-time API capture; not a live-service check.
    const cases = [
      { city: "上海", index: 12, code: 51, temperature: 20, speed: 4.62, gust: 10 },
      { city: "上海", index: 18, code: 51, temperature: 20, speed: 5.7, gust: 11.8 },
      { city: "上海", index: 22, code: 51, temperature: 20, speed: 5.34, gust: 12.1 },
      { city: "乌鲁木齐", index: 0, code: 0, temperature: 1, speed: 2.81, gust: 4.4 },
    ] as const;
    expect(cases.map(({ city, index, code, temperature, speed, gust }) => {
      const target = { ...base.hours[index], weather: { ...base.hours[index].weather,
        weatherCode: photoMetric(code), precipitation: photoMetric(0), temperature: photoMetric(temperature),
        windSpeed: photoMetric(speed), windGust: photoMetric(gust) } };
      const sentences = say(target);
      expect(sentences).toHaveLength(2);
      expect(sentences.join("")).not.toMatch(BANNED);
      return { city, hour: index, sentences };
    })).toMatchSnapshot();
  });
  it.each(["landscape", "portrait", "street"] as const)("names an overlapping non-D0 %s recommendation", (genre) => {
    const sentences = say(hour, adviceWith(genre, at(12, 30), at(13)));
    expect(sentences).toHaveLength(3);
    expect(sentences[2]).toBe(`12:30–13:00是今天拍${{ landscape: "风光", portrait: "人像", street: "街拍" }[genre]}最好的时段。`);
  });
  it("does not mark D0 or merely touching ranges as good hours", () => {
    expect(say(hour, adviceWith("landscape", at(12), at(13), ["D0"]))).toHaveLength(2);
    expect(say(hour, adviceWith("landscape", at(11), at(12)))).toHaveLength(2);
    expect(say(hour, adviceWith("landscape", at(13), at(14)))).toHaveLength(2);
  });
  it.each(["thunderstorm", "heavy-rain", "strong-wind", "air-quality"] as const)("%s overrides a simultaneous recommendation", (code) => {
    const risk: RiskNote = { code, start: at(12, 30), end: at(13), message: "人工合成风险", sourceIds: [] };
    const sentences = say({ ...hour, risks: [risk] }, adviceWith("landscape", at(12), at(13)));
    expect(sentences).toHaveLength(code === "air-quality" ? 3 : 2);
    expect(sentences.join("")).not.toContain("最好的时段");
    expect(sentences.at(-1)).toMatch(/别|注意/);
    expect(say(hour, undefined, [{ ...risk, start: at(11), end: at(12) }])).toHaveLength(2);
  });
  it("keeps multiple risks in one third sentence and does not mutate inputs", () => {
    const risks: RiskNote[] = ["strong-wind", "thunderstorm", "heavy-rain", "air-quality"].map((code) => ({
      code: code as RiskNote["code"], start: at(12), end: at(13), message: "人工合成风险", sourceIds: [],
    }));
    const before = structuredClone({ hour, risks, advice: base.advice });
    const sentences = say(hour, base.advice, risks);
    expect(sentences).toHaveLength(3);
    expect(sentences[1]).toMatch(/^可能有雷雨/);
    expect(sentences[2]).toMatch(/^这一小时雨势较大/);
    expect(sentences[2]).toContain("空气较差");
    expect({ hour, risks, advice: base.advice }).toEqual(before);
  });
  it("feeds real per-hour rule risks into the interpretation", () => {
    const storm = run(at(9), (day) => setAll(day, { precipitation: 6 }, [12]));
    expect(storm.interpretation.hours[12].sentences).toEqual(["晴，中雨，20°C。", "雨势较大，别安排户外拍摄。"]);
    expect(storm.interpretation.hours[11].sentences.join("")).not.toContain("雨势较大");
  });
  it("requires the v2 additions and rejects extra fields or the wrong sentence count", () => {
    expect(SCHEMA_VERSION).toBe("2");
    expect(RULES_VERSION).toBe("photo-rules-v0.3");
    const interpretation = base.interpretation, reading = interpretation.hours[0];
    const parseHour = (replacement: unknown) => InterpretationSchema.safeParse({ ...interpretation,
      hours: interpretation.hours.map((value, index) => index === 0 ? replacement : value) }).success;
    for (const field of ["sun", "sentences"] as const) expect(parseHour({ ...reading, [field]: undefined })).toBe(false);
    for (const field of ["wind", "light"] as const) {
      expect(parseHour({ ...reading, [field]: { ...reading[field], short: undefined } })).toBe(false);
      expect(parseHour({ ...reading, [field]: { ...reading[field], extra: "bad" } })).toBe(false);
    }
    expect(parseHour({ ...reading, sun: { ...reading.sun, extra: "bad" } })).toBe(false);
    for (const sentences of [[], ["一句。"], ["一。", "二。", "三。", "四。"], ["", "二。"]]) expect(parseHour({ ...reading, sentences })).toBe(false);
    expect(parseHour({ ...reading, wind: { ...reading.wind, short: "" } })).toBe(true);
    expect(parseHour({ ...reading, light: { ...reading.light, short: "" } })).toBe(false);
  });
});

describe("periods follow the sun", () => {
  it("names evening after the local sunset hour in Urumqi, not at a fixed clock time", () => {
    const urumqi = calculateSolarEvents(PHOTO_DATE, { latitude: 43.8, longitude: 87.6 });
    const dayStart = Date.parse(at(0));
    const shanghai = periodBoundaries(dayStart, photoSolar), west = periodBoundaries(dayStart, urumqi);
    expect(shanghai[4]).toBeLessThan(west[4]);
    expect(west[4]).toBeGreaterThanOrEqual(18);
    expect(shanghai[4]).toBeLessThanOrEqual(16);
    expect(periodBoundaries(dayStart, { ...photoSolar, sunrise: null, sunset: null })).toEqual([0, 5, 8, 12, 17, 19, 24]);
  });
});

describe("whole-day verdict", () => {
  it("clear daytime: goes out, names a time, and fits the headline", () => {
    const { interpretation } = run(at(9));
    expect(interpretation.tone).toBe("go");
    expect(interpretation.headline).toMatch(/现在能拍/);
    expect(interpretation.weatherLine).toBe("全天晴");
    expect(Object.values(interpretation.genres).some((genre) => genre.status === "now" || genre.status === "upcoming")).toBe(true);
  });
  it("all-day rain: describes the rain and does not recommend going out", () => {
    const { interpretation } = run(at(9), (day) => setAll(day, { precipitation: 2.4, weatherCode: 63, cloudTotal: 100 }));
    expect(interpretation.headline).toMatch(/^阴雨一整天/);
    expect(interpretation.tone).not.toBe("go");
    expect(interpretation.lead).toMatch(/柔光|雨/);
  });
  it("after dark: says natural light is over instead of showing empty genres", () => {
    const { interpretation } = run(at(22));
    expect(interpretation.tone).toBe("done");
    expect(interpretation.headline).toContain("天黑了");
    for (const genre of Object.values(interpretation.genres)) expect(genre.status).toBe("passed");
  });
  it("an upcoming hazard leads the headline, the risk list and next-up", () => {
    const { interpretation } = run(at(9), (day) => setAll(day, { windSpeed: 18, windGust: 22 }, [14, 15]));
    expect(interpretation.tone).toBe("poor");
    expect(interpretation.headline).toBe("14–15 时风很大，户外拍摄注意安全");
    expect(interpretation.risks[0]).toMatchObject({ code: "strong-wind", status: "future" });
    expect(interpretation.risks[0].text).toContain("最大 9 级");
    expect(interpretation.nextUp[0]).toBe(interpretation.risks[0].text);
  });
  it("a passed hazard is marked as past and does not drive the tone", () => {
    const { interpretation } = run(at(18), (day) => setAll(day, { precipitation: 6 }, [7]));
    expect(interpretation.risks[0].text).toMatch(/已经过去$/);
    expect(interpretation.tone).not.toBe("poor");
  });
  it("missing forecast: says what is missing and keeps solar facts usable", () => {
    const { interpretation } = run(at(9), (day) => setAll(day, { precipitation: null, cloudTotal: null, weatherCode: null, windSpeed: null, visibility: null, temperature: null }));
    expect(interpretation.tone).toBe("unknown");
    expect(interpretation.headline).toBe("今天的天气预报暂时拿不到");
    expect(interpretation.lead).toContain("日出日落");
    expect(interpretation.dataNote).toContain("缺");
  });
  it("snow is called snow, not rain", () => {
    const { interpretation } = run(at(9), (day) => setAll(day, { precipitation: 0.4, weatherCode: 73, cloudTotal: 100 }, [12, 13, 14]));
    const change = interpretation.nextUp.find((item) => item.includes("12 时"));
    expect(change).toBe("12 时起开始下雪");
    expect(interpretation.nextUp.join("")).not.toContain("小雨");
  });
  it("crosscheck failure becomes one plain sentence", () => {
    const { interpretation } = run(at(9), (day) => day.sources.push({ ...day.sources[0], id: SOURCE_IDS.crosscheck, status: "failed" }));
    expect(interpretation.dataNote).toContain("没有经过第二家核对");
  });
});

describe("copy review", () => {
  const scenes = {
    clear: run(at(9)),
    rain: run(at(9), (day) => setAll(day, { precipitation: 2.4, weatherCode: 63, cloudTotal: 100 })),
    night: run(at(22)),
    wind: run(at(9), (day) => setAll(day, { windSpeed: 18, windGust: 22 }, [14, 15])),
    missing: run(at(9), (day) => setAll(day, { precipitation: null, cloudTotal: null, weatherCode: null })),
  };
  it.each(Object.entries(scenes))("%s: headline fits and user-facing text has no jargon", (_, scene) => {
    expect(Array.from(scene.interpretation.headline).length).toBeLessThanOrEqual(HEADLINE_MAX);
    expect(visibleText(scene)).not.toMatch(BANNED);
    for (const hour of scene.interpretation.hours) {
      expect(hour.sentences.length).toBeGreaterThanOrEqual(2);
      expect(hour.sentences.length).toBeLessThanOrEqual(3);
      expect(hour.wind.short).not.toContain("m/s");
    }
    const advice = Object.values(scene.advice).flatMap((item) => [item.timing, item.light, ...item.opportunities,
      ...item.limitations, ...item.alternatives, item.film.reason, item.film.caveat,
      ...item.allWindows.flatMap((window) => [...window.reasons, ...window.limitations])]);
    expect([scene.summary.headline, ...scene.summary.changes, ...scene.summary.opportunities, ...scene.summary.limitations,
      ...scene.sunsetOpportunity.reasons, ...scene.sunsetOpportunity.limitations, scene.sunsetOpportunity.label, ...advice,
      ...scene.hours.flatMap((hour) => [hour.light.description, ...hour.light.reasons, ...hour.light.limitations, ...hour.risks.map((risk) => risk.message)]),
    ].join("\n")).not.toMatch(BANNED);
  });
  it("fits timing on the fixed printed page in all five scenes", () => {
    for (const scene of Object.values(scenes)) for (const advice of Object.values(scene.advice)) {
      expect(Array.from(advice.timing).length).toBeLessThanOrEqual(52);
    }
  });
  it("reads as plain sentences (review snapshot)", () => {
    const pick = ({ interpretation: it }: ReturnType<typeof run>, currentHour: number) => ({ headline: it.headline, lead: it.lead, weatherLine: it.weatherLine,
      nextUp: it.nextUp, genres: Object.values(it.genres).map((genre) => `${genre.when}｜${genre.line}`), sunset: `${it.sunset.title}｜${it.sunset.line}`,
      sentences: { current: { hour: currentHour, text: it.hours[currentHour].sentences }, noon: it.hours[12].sentences } });
    expect(Object.fromEntries(Object.entries(scenes).map(([name, scene]) => [name, pick(scene, name === "night" ? 22 : 9)]))).toMatchSnapshot();
  });
});


describe("V08C device explanations", () => {
  const base = run(at(9)).hours[12];
  const explain = (hour: Hour) => deviceReadings(hour, hourReadings(hour), photoSolar);
  it.each([[0, "少"], [24.9, "少"], [25, "有一些"], [75, "有一些"], [75.1, "很多"], [100, "很多"]] as const)(
    "cloud %s%% has wording %s without changing the original percent", (value, word) => {
      expect(cloudLayerText("低云", value)).toBe(`低云${word}（${value}%）`);
    });
  it("exposes only the fields relevant to each device and complete independent air values", () => {
    const hour = structuredClone(base);
    Object.assign(hour.weather, { windSpeed: photoMetric(4.26), windGust: photoMetric(10.7), windFrom: photoMetric(45),
      visibility: photoMetric(4220), precipitation: photoMetric(0.8), precipitationProbability: photoMetric(67),
      cloudLow: photoMetric(80), cloudMid: photoMetric(50), cloudHigh: photoMetric(20) });
    hour.air = { referenceAqi: photoMetric(73), pm25: photoMetric(17.3), pm10: photoMetric(29.8) };
    const d = explain(hour);
    expect(d.wind.fields).toEqual([{ name: "阵风", value: "5 级" }, { name: "风向", value: "东北风" },
      { name: "气温", value: "20°C" }, { name: "湿度", value: "50%" }]);
    expect(d.wind.trend).toMatchObject({ value: 3, label: "东北风 3 级" });
    expect(d.wind.meaning[0]).toContain("三脚架要挂重物");
    expect(d.wind.reference[0]).toContain("3 级发丝乱 / 4 级脚架抖 / 5 级起要压重");
    expect(d.direction.fields.map((f) => f.name)).toEqual(["方位", "高度"]);
    expect(d.direction.trend).toMatchObject({ value: hour.light.altitude, key: "above" });
    expect(d.light.fields.slice(1).map((f) => f.value)).toEqual(["低云很多（80%）", "中云有一些（50%）", "高云少（20%）"]);
    expect(d.light.reference).toHaveLength(3);
    expect(d.weather.fields).toEqual(expect.arrayContaining([
      { name: "雨", value: "小雨 · 约 0.8 毫米/小时" }, { name: "降水概率", value: "67%" },
      { name: "能见度", value: "朦胧 · 4.2 公里" }, { name: "空气", value: "空气中等 · 美国标准 AQI 73" },
      { name: "PM2.5", value: "17.3 μg/m³" }, { name: "PM10", value: "29.8 μg/m³" },
    ]));
    expect(d.weather.reference).toContain("空气质量和能见度是两回事，空气差不等于看不远。");
  });
  it("keeps simultaneous stale/conflict, all field notices, and supplied comparison values without IDs", () => {
    const hour = structuredClone(base);
    hour.weather.temperature = { ...photoMetric(1), state: "stale", notes: ["来源分歧 hidden-source"], alternatives: [{ sourceId: "hidden-source", value: 8 }] };
    hour.weather.windSpeed = { ...photoMetric(4), state: "conflict" };
    hour.weather.humidity = missing();
    const d = explain(hour), text = d.wind.notices.join("\n");
    expect(text).toContain("气温：这一项用的是早些时候存下的数据");
    expect(text).toContain("气温：两家预报对这一项说法不一（一家说 1°C，另一家说 8°C）");
    expect(text).toContain("平均风：两家预报对这一项说法不一。");
    expect(text).toContain("这一小时没有湿度预报");
    expect(text).not.toContain("hidden-source");
    expect(d.weather.notices.join(" ")).not.toContain("气温");
    expect(d.light.notices.join(" ")).not.toContain("气温");
    hour.weather.temperature.alternatives = undefined;
    expect(explain(hour).wind.notices.join(" ")).toContain("气温：两家预报对这一项说法不一。");
  });
  it.each([[0.2, 10], [null, 10], [4, 2], [4, null]] as const)(
    "average %s and gust %s retain the average trend but use the stronger known wind impact", (speed, gust) => {
      const hour = structuredClone(base);
      hour.weather.windSpeed = speed === null ? missing() : photoMetric(speed);
      hour.weather.windGust = gust === null ? missing() : photoMetric(gust);
      const d = explain(hour);
      expect(d.wind.trend.value).toBe(speed === null ? null : windLevel(speed));
      if (gust === 10) {
        expect(d.wind.meaning).toEqual(["阵风 5 级，小树跟着摇，三脚架要挂重物，手持也不太稳。"]);
        expect(d.wind.meaning.join(" ")).not.toContain("都很稳");
      } else expect(d.wind.meaning).toEqual([hourReadings(hour).wind.detail]);
    });
  it("reports unavailable fields separately and never infers PM or visibility from AQI", () => {
    const hour = structuredClone(base);
    hour.air = { referenceAqi: photoMetric(73), pm25: missing(), pm10: missing() };
    hour.weather.visibility = missing();hour.weather.windSpeed = missing();hour.weather.windGust = missing();
    hour.weather.cloudLow = missing();hour.weather.cloudMid = missing();hour.weather.cloudHigh = missing();
    const d = explain(hour);
    expect(d.weather.fields).toEqual(expect.arrayContaining([
      { name: "PM2.5", value: "—" }, { name: "PM10", value: "—" }, { name: "能见度", value: "远景不明 · —" },
    ]));
    expect(d.weather.notices.join(" ")).toContain("这一小时没有能见度预报");
    expect(d.weather.notices.join(" ")).toContain("这一小时没有PM2.5预报");
    expect(d.weather.notices.join(" ")).toContain("这一小时没有PM10预报");
    expect(d.light.notices).toEqual(["这一小时没有低云预报。", "这一小时没有中云预报。", "这一小时没有高云预报。"]);
    expect(d.wind.fields[0]).toEqual({ name: "阵风", value: "—" });
    expect(d.wind.trend.value).toBeNull();
  });
  it("keeps sky fallback notices, sun event gaps and horizon trends readable", () => {
    const hour = structuredClone(base);hour.weather.weatherCode = { value: null, state: "missing", sourceIds: [], notes: [] };
    hour.weather.cloudTotal = { ...photoMetric(90), state: "stale", alternatives: [{ sourceId: "hidden", value: 20 }] };
    expect(explain(hour).weather.notices.join(" ")).toContain("早些时候");
    expect(explain(hour).weather.notices.join(" ")).toContain("一家说 90%，另一家说 20%");
    for (const altitude of [-10, 0, 28]) {
      hour.light.altitude = altitude;
      expect(explain(hour).direction.trend).toMatchObject({ value: altitude, key: altitude >= 0 ? "above" : "below" });
    }
    const solar = { ...photoSolar, sunrise: null, morningBlue: null, notes: ["morningBlue 不适用"] };
    const d = deviceReadings(hour, hourReadings(hour), solar);
    expect(d.direction.notices).toContain("今天的日出、清晨蓝调时刻暂时算不出来，时间先空着。");
    expect(JSON.stringify(d)).not.toMatch(BANNED);expect(JSON.stringify(d)).not.toContain("morningBlue");
  });
  it.each([[0, "0 公里"], [1, "不到 0.1 公里"], [49, "不到 0.1 公里"], [99, "不到 0.1 公里"], [100, "0.1 公里"]] as const)(
    "visibility %s meters preserves zero versus small positive distances", (meters, value) => {
      const hour = structuredClone(base);hour.weather.visibility = photoMetric(meters);
      expect(explain(hour).weather.fields.find((field) => field.name === "能见度")?.value).toBe(`很难看远 · ${value}`);
    });
  it.each([51, 61, 80, 71, 56, 95] as const)(
    "weather code %s with zero hourly rain keeps the precipitation description without saying it will not rain", (code) => {
      const hour = structuredClone(base);hour.weather.weatherCode = photoMetric(code);
      hour.weather.precipitation = photoMetric(0);hour.weather.precipitationProbability = photoMetric(0);
      const r = hourReadings(hour), d = explain(hour);
      expect(d.weather.meaning[0]).toBe(r.sky.detail);
      expect(d.weather.meaning.join(" ")).not.toContain("不会下雨");
      expect(d.weather.fields).toContainEqual({ name: "雨", value: "无雨 · 约 0 毫米/小时" });
      expect(d.weather.fields).toContainEqual({ name: "降水概率", value: "0%" });
    });
  it("retains cloud-total stale/conflict notices when weather code and cloud percentage are both shown", () => {
    const hour = structuredClone(base);
    hour.weather.cloudTotal = { ...photoMetric(90), state: "stale", notes: ["有分歧"], alternatives: [{ sourceId: "hidden", value: 20 }] };
    const d = explain(hour);
    expect(d.weather.meaning[0]).toContain("云量约 90%");
    expect(d.weather.notices).toContain("总云：这一项用的是早些时候存下的数据。");
    expect(d.weather.notices).toContain("总云：两家预报对这一项说法不一（一家说 90%，另一家说 20%）。");
    expect(d.weather.notices.join(" ")).not.toContain("hidden");
  });
  it("strictly validates the four device keys and nested values while retaining schema v2", () => {
    const interpretation = run(at(9)).interpretation;
    expect(SCHEMA_VERSION).toBe("2");
    const extra = structuredClone(interpretation) as unknown as { hours: { devices: Record<string, unknown> }[] };
    extra.hours[0].devices.other = extra.hours[0].devices.wind;
    expect(InterpretationSchema.safeParse(extra).success).toBe(false);
    const bad = structuredClone(interpretation);bad.hours[0].devices.wind.trend.value = NaN;
    expect(InterpretationSchema.safeParse(bad).success).toBe(false);
    const nested = structuredClone(interpretation);
    Object.assign(nested.hours[0].devices.wind.fields[0], { sourceId: "hidden" });
    expect(InterpretationSchema.safeParse(nested).success).toBe(false);
  });
});


describe("V08D hourly table marks", () => {
  const base = () => run(at(9));
  const recommendation = (start: string, end: string, reasonCodes = ["D2"]) => ({
    start, end, status: "future" as const, reasons: [], reasonCodes, limitations: [], sourceIds: [],
  });
  it("uses explicit half-open now boundaries, independent of selected or local hour", () => {
    const b = base(), hour = b.hours[9];
    expect(hourMarks(hour, b.advice, at(8,59)).timing).toBe("future");
    expect(hourMarks(hour, b.advice, at(9)).timing).toBe("current");
    expect(hourMarks(hour, b.advice, Date.parse(at(9,59))).timing).toBe("current");
    expect(hourMarks(hour, b.advice, at(10)).timing).toBe("past");
    expect(() => hourMarks(hour, b.advice, "bad-now")).toThrow();
    expect(b.interpretation.hours.map(h=>h.marks.timing)).toEqual([...Array(9).fill("past"),"current",...Array(14).fill("future")]);
  });
  it("marks every overlapping non-D0 genre once, excluding touching and zero-length ranges", () => {
    const b = base(), hour = b.hours[9];
    b.advice.landscape.recommendedWindows = [recommendation(at(8,59),at(9,1)),recommendation(at(9,30),at(10))];
    b.advice.portrait.recommendedWindows = [recommendation(at(9,15),at(9,45))];
    b.advice.street.recommendedWindows = [recommendation(at(9),at(10),["D0"])];
    expect(hourMarks(hour,b.advice,at(9)).recommendation).toBe("好时段 · 风光、人像");
    b.advice.landscape.recommendedWindows = [recommendation(at(8),at(9)),recommendation(at(10),at(11))];
    b.advice.portrait.recommendedWindows = [recommendation(at(9,30),at(9,30))];
    expect(hourMarks(hour,b.advice,at(9)).recommendation).toBeNull();
  });
  it("only translates existing overlapping risk codes, deduplicated in fixed order", () => {
    const b=base(), hour=structuredClone(b.hours[9]);
    hour.weather.precipitation=photoMetric(100);hour.weather.windSpeed=photoMetric(50);
    expect(hourMarks(hour,b.advice,at(9)).risks).toEqual([]);
    const risk=(code:RiskNote["code"],start=at(9),end=at(10)):RiskNote=>({code,start,end,message:"raw-source-secret",sourceIds:["raw-id"]});
    hour.risks=[risk("air-quality"),risk("strong-wind"),risk("heavy-rain"),risk("thunderstorm"),risk("thunderstorm"),risk("air-quality",at(8),at(9))];
    expect(hourMarks(hour,b.advice,at(9)).risks).toEqual(["可能有雷雨","雨势较大","风很大","空气较差，户外别久留"]);
    hour.risks=[risk("thunderstorm",at(10),at(11))];
    expect(hourMarks(hour,b.advice,at(9)).risks).toEqual([]);
  });
  it("strictly validates marks without changing schema version", () => {
    const it=base().interpretation;
    expect(SCHEMA_VERSION).toBe("2");
    expect(InterpretationSchema.safeParse(it).success).toBe(true);
    const extra=structuredClone(it);Object.assign(extra.hours[0].marks,{sourceId:"raw-id"});
    expect(InterpretationSchema.safeParse(extra).success).toBe(false);
    const bad=structuredClone(it);Object.assign(bad.hours[0].marks,{timing:"selected"});
    expect(InterpretationSchema.safeParse(bad).success).toBe(false);
    const absent=structuredClone(it);Reflect.deleteProperty(absent.hours[0],"marks");
    expect(InterpretationSchema.safeParse(absent).success).toBe(false);
  });
});
