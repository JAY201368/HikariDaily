import { HAZARD_WORDS } from "./hazard-words";
import type { Hour, LightAssessment, Metric } from "../../domain/types";
import { HEAVY_RAIN_MM } from "../../domain/photography/risks";
import { freezingRain, present } from "../../domain/photography/shared";
import { shanghaiIso } from "../../domain/time";

export type Reading = { label: string; detail: string; key: string };
export type ShortReading = Reading & { short: string };

const round1 = (value: number) => Math.round(value * 10) / 10;
const trimZero = (value: number) => String(round1(value)).replace(/\.0$/, "");

export function distanceText(meters: number): string {
  if (meters >= 10000) return `${Math.round(meters / 1000)} 公里`;
  if (meters >= 1000) return `${trimZero(meters / 1000)} 公里`;
  if (meters < 100) return "不到 100 米";
  return `${Math.round(meters / 100) * 100} 米`;
}
export function rainAmountText(mm: number): string {
  return mm > 0 && mm < 0.1 ? "不到 0.1 毫米/小时" : `约 ${trimZero(mm)} 毫米/小时`;
}
export const BEARINGS = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"] as const;
export function bearingName(degrees: number): string {
  return BEARINGS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

/** GB/T 28591-2012 Beaufort upper bounds in m/s, compared after rounding to 0.1. */
const WIND_UPPER = [0.2, 1.5, 3.3, 5.4, 7.9, 10.7, 13.8, 17.1, 20.7, 24.4, 28.4, 32.6];
export function windLevel(speed: number): number {
  const value = round1(speed);
  const index = WIND_UPPER.findIndex((upper) => value <= upper);
  return index === -1 ? 12 : index;
}
const WIND_EFFECT = [
  "几乎无风，水面倒影和长曝光都很稳",
  "几乎无风，水面倒影和长曝光都很稳",
  "微微有风，树叶轻动，拍摄基本不受影响",
  "树叶细枝不停摇动，头发和衣角会乱",
  "能吹起纸片和灰尘，三脚架长曝光容易抖",
  "小树跟着摇，三脚架要挂重物，手持也不太稳",
  "大树枝摇晃，撑伞困难，器材注意防倒",
  "迎风走路吃力，不建议架三脚架",
];
export function windEffect(level: number): string {
  return level >= 8 ? "户外有危险，别在空旷处、海边或高处拍" : WIND_EFFECT[level];
}
export function windReading(speed: Metric<number>, gust: Metric<number>, from: Metric<number>,
  temperature?: Metric<number>, humidity?: Metric<number>): ShortReading {
  const level = present(speed) ? windLevel(speed.value) : null;
  const gustLevel = present(gust) ? windLevel(gust.value) : null;
  const strongerGust = gustLevel !== null && gustLevel > 1 && (level === null || gustLevel > level);
  const short = [strongerGust ? `阵风 ${gustLevel} 级` : "",
    temperature && present(temperature) ? `${Math.round(temperature.value)}°C` : "",
    humidity && present(humidity) ? `湿度 ${Math.round(humidity.value)}%` : ""].filter(Boolean).join(" · ");
  if (!present(speed)) return { label: "风力不明", detail: "这一小时没有风的预报。", key: "unknown", short };
  const knownLevel = level!;
  const direction = present(from) && knownLevel >= 2 ? `${bearingName(from.value)}风 ` : "";
  const gustText = strongerGust ? `，阵风可到 ${gustLevel} 级` : "";
  return { label: knownLevel <= 1 ? "几乎无风" : `${direction}${knownLevel} 级`, key: `w${knownLevel}`,
    detail: `${windEffect(knownLevel)}${gustText}。`, short };
}

/** GB/T 28592-2012 one-hour classes. */
export type RainClass = "none" | "trace" | "light" | "moderate" | "heavy" | "storm";
export const RAIN_ORDER: RainClass[] = ["none", "trace", "light", "moderate", "heavy", "storm"];
export function rainClass(mm: number): RainClass {
  if (mm <= 0) return "none";
  if (mm < 0.1) return "trace";
  const value = round1(mm);
  return value <= 1.5 ? "light" : value <= 6.9 ? "moderate" : value <= 14.9 ? "heavy" : "storm";
}
export const RAIN_NAMES: Record<RainClass, string> = {
  none: "无雨", trace: "零星雨点", light: "小雨", moderate: "中雨", heavy: "大雨", storm: "暴雨",
};
const RAIN_EFFECT: Record<RainClass, string> = {
  none: "", trace: "地面可能微湿", light: "撑把伞就行，镜头记得擦水",
  moderate: "相机要套防雨罩，地面积水能拍倒影", heavy: "户外很难拍，别在低洼处停留", storm: "别出门拍摄",
};
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
export function rainReading(amount: Metric<number>, chance: Metric<number>, code: Metric<number>): Reading {
  const freeze = freezingRain(code);
  if (!present(amount)) return { label: "雨情不明", detail: `这一小时没有降水预报。${freeze ? `${HAZARD_WORDS.sleet.detail}。` : ""}`, key: "unknown" };
  const kind = rainClass(amount.value);
  if (freeze) return { label: RAIN_NAMES[kind], key: kind, detail: `预报降水${rainAmountText(amount.value)}，天气类型为冻雨；${HAZARD_WORDS.sleet.detail}。` };
  const chanceText = present(chance) ? `下雨可能 ${Math.round(chance.value)}%` : "";
  if (kind !== "none" && present(code) && SNOW_CODES.has(code.value)) {
    return { label: "下雪", key: "snow", detail: `降水${rainAmountText(amount.value)}（按融化后的水量算），注意防滑和电池保暖。` };
  }
  if (kind === "none") {
    const detail = !present(chance) ? "预报雨量为 0，没有下雨概率的预报。" : chance.value < 20 ? "基本不会下雨。"
      : chance.value < 40 ? `下雨可能不大（${Math.round(chance.value)}%）。`
      : chance.value < 70 ? `有 ${Math.round(chance.value)}% 可能下雨，带把伞。` : `很可能下雨（${Math.round(chance.value)}%），带好伞。`;
    return { label: "无雨", key: "none", detail };
  }
  return { label: RAIN_NAMES[kind], key: kind,
    detail: `${rainAmountText(amount.value)}，${amount.value >= HEAVY_RAIN_MM ? "雨已经不小，别安排户外拍摄" : RAIN_EFFECT[kind]}${chanceText ? `（${chanceText}）` : ""}。` };
}

export type SkyKey = "clear" | "partly" | "cloudy" | "overcast" | "fog" | "drizzle" | "rain" | "showers" | "snow" | "sleet" | "thunder" | "unknown";
/** Ordered from most to least weather-significant, for picking a period's dominant sky. */
export const SKY_SEVERITY: SkyKey[] = ["thunder", "snow", "sleet", "rain", "showers", "drizzle", "fog", "overcast", "cloudy", "partly", "clear", "unknown"];
export const SKY_NAMES: Record<SkyKey, string> = {
  clear: "晴", partly: "少云", cloudy: "多云", overcast: "阴", fog: "雾", drizzle: "毛毛雨",
  rain: "雨", showers: "阵雨", snow: "雪", sleet: HAZARD_WORDS.sleet.label, thunder: "雷雨", unknown: "天气不明",
};
export function skyKey(code: Metric<number>, cloud: Metric<number>): SkyKey {
  if (present(code)) {
    const c = code.value;
    if ([95, 96, 97, 99].includes(c)) return "thunder";
    if (SNOW_CODES.has(c)) return "snow";
    if (freezingRain(code)) return "sleet";
    if ([80, 81, 82].includes(c)) return "showers";
    if ([61, 63, 65].includes(c)) return "rain";
    if ([51, 53, 55].includes(c)) return "drizzle";
    if ([45, 48].includes(c)) return "fog";
    if (!present(cloud)) {
      if (c === 3) return "overcast";
      if (c === 2) return "cloudy";
      if (c === 1) return "partly";
      if (c === 0) return "clear";
    }
  }
  if (!present(cloud)) return "unknown";
  return cloud.value <= 20 ? "clear" : cloud.value <= 50 ? "partly" : cloud.value < 85 ? "cloudy" : "overcast";
}
const SKY_EFFECT: Record<SkyKey, string> = {
  clear: "天空干净，几乎没有云", partly: "天上有零散的云，蓝天占大半",
  cloudy: "云比较多，蓝天露得少", overcast: "云铺满了天空，看不到蓝天",
  fog: "远处被雾吞掉，适合拍朦胧感", drizzle: "细雨若有若无，镜头前要常擦",
  rain: "下着雨，户外要做好防水", showers: "雨来得快去得也快，可以等雨停的空档",
  snow: "正在下雪，画面会变干净，注意保暖", sleet: HAZARD_WORDS.sleet.detail,
  thunder: `${HAZARD_WORDS.thunderstorm.label}，${HAZARD_WORDS.thunderstorm.action}`, unknown: "没有天气类型和云量的预报",
};
export function skyReading(code: Metric<number>, cloud: Metric<number>): Reading {
  const key = skyKey(code, cloud);
  const cloudText = present(cloud) && key !== "unknown" ? `云量约 ${Math.round(cloud.value)}%，` : "";
  return { label: SKY_NAMES[key], key, detail: `${cloudText}${SKY_EFFECT[key]}。` };
}

export function visibilityReading(visibility: Metric<number>, humidity?: Metric<number>, code?: Metric<number>): Reading {
  if (!present(visibility)) return { label: "远景不明", key: "unknown", detail: "这一小时没有能见度预报。" };
  const m = visibility.value, far = distanceText(m);
  if (m >= 20000) return { label: "很通透", key: "clear-far", detail: `能见度约 ${far}，远山和天际线都清楚。` };
  if (m >= 10000) return { label: "通透", key: "clear", detail: `能见度约 ${far}，远景清楚，层次拉得开。` };
  if (m >= 5000) return { label: "远处发灰", key: "hazy", detail: `能见度约 ${far}，再远就开始发灰，远景层次变浅。` };
  if (m >= 1000) return { label: "朦胧", key: "misty", detail: `能见度约 ${far}，稍远一点就灰蒙蒙的，适合拍近景和朦胧氛围。` };
  if ((humidity && present(humidity) && humidity.value >= 90) || (code && present(code) && [45, 48].includes(code.value))) {
    return { label: "有雾", key: "fog", detail: `能见度只有约 ${far}，适合拍雾里的树和建筑剪影。` };
  }
  return { label: "很难看远", key: "low-visibility", detail: `能见度只有约 ${far}，可能是雾、霾或沙尘，远处几乎看不见。` };
}

/** US EPA AQI categories in Chinese; never mixed with China's AQI names or colours. */
const AIR_LEVELS = [
  { upper: 50, label: "良好", key: "good", effect: "空气不错，户外活动不受影响" },
  { upper: 100, label: "中等", key: "moderate", effect: "大多数人不受影响" },
  { upper: 150, label: "对敏感人群不健康", key: "sensitive", effect: "老人、孩子和呼吸道敏感的人少在户外待" },
  { upper: 200, label: "不健康", key: "unhealthy", effect: "户外尽量缩短停留，可以戴口罩" },
  { upper: 300, label: "非常不健康", key: "very-unhealthy", effect: "别在户外久留" },
  { upper: Infinity, label: "有害", key: "hazardous", effect: "尽量待在室内" },
] as const;
export function airLevel(aqi: number) { return AIR_LEVELS.find((level) => Math.round(aqi) <= level.upper)!; }
export function airReading(aqi: Metric<number>): Reading {
  if (!present(aqi)) return { label: "空气不明", key: "unknown", detail: "这一小时没有空气质量预报。" };
  const level = airLevel(aqi.value);
  return { label: `空气${level.label}`, key: level.key,
    detail: `美国标准 AQI ${Math.round(aqi.value)}，${level.effect}。` };
}

function lightDescription(light: LightAssessment): Reading {
  const morning = light.azimuth !== null && light.azimuth < 180;
  if (light.phase === "night") return { label: "天黑", key: "night", detail: "太阳在地平线下，没有自然光了，可以拍灯光和夜景。" };
  if (light.phase === "blue") return { label: "蓝调时刻", key: "blue",
    detail: `${morning ? "太阳快升起" : "太阳刚落下"}，天空是深蓝色，${morning ? "城市灯光还没灭" : "城市灯光刚亮"}；光很暗，相机要拿稳。` };
  if (light.phase === "golden") return { label: "黄金时刻", key: "golden",
    detail: light.altitude !== null && light.altitude < 0 ? `${morning ? "太阳还没露头，天边已经亮了" : "太阳刚沉下去，天边还有余光"}。`
      : light.character === "diffuse" ? "太阳很低，但云很厚，暖色可能透不出来。"
      : "太阳很低，光偏暖、影子长。" };
  if (light.phase === "day") {
    if (light.character === "direct") return light.altitude !== null && light.altitude > 30
      ? { label: "硬光", key: "hard", detail: "阳光直射，明暗分明，人脸和物体下面会有浓重的影子。" }
      : { label: "斜射阳光", key: "low-sun", detail: "阳光斜着照过来，有立体感，影子拉得比较长。" };
    if (light.character === "diffuse") return { label: "柔光", key: "soft", detail: "云层像一块柔光罩，光线均匀、影子很淡，适合人像和细节。" };
    if (light.character === "variable") return { label: "忽明忽暗", key: "mixed", detail: "云时开时合，光线说变就变，可以等云缝里漏下来的光。" };
    return { label: "白天", key: "day", detail: "没有云量预报。" };
  }
  return { label: "光线不明", key: "unknown", detail: "这一小时的太阳位置暂时算不出来。" };
}

export function lightReading(light: LightAssessment): ShortReading {
  const reading = lightDescription(light);
  return { ...reading, short: reading.detail.match(/^[^。！？]*[。！？]?/)![0] };
}

/** Hour context is explicitly Beijing time, independent of the host timezone. */
export function sunPositionReading(light: LightAssessment, hourStart?: string | number): Reading {
  if (light.azimuth === null || light.altitude === null) {
    return { label: "太阳位置算不出来", detail: "这一小时的太阳位置暂时算不出来。", key: "unknown" };
  }
  const morning = hourStart === undefined ? light.azimuth < 180 : Number(shanghaiIso(hourStart).slice(11, 13)) < 12;
  const position = light.altitude >= 0 ? `离地平线 ${trimZero(light.altitude)}°`
    : light.altitude >= -6 ? morning ? "快日出了" : "刚落山，天还亮"
      : morning ? "还没出来" : "已落山";
  return { label: `${bearingName(light.azimuth)} · ${position}`,
    detail: `方位 ${trimZero(light.azimuth)}°，高度 ${trimZero(light.altitude)}°。`,
    key: light.altitude >= 0 ? "above-horizon" : morning ? "before-sunrise" : "after-sunset" };
}

export function temperatureReading(temperature: Metric<number>, humidity: Metric<number>): Reading {
  if (!present(temperature)) return { label: "气温不明", key: "unknown",
    detail: present(humidity) ? `湿度 ${Math.round(humidity.value)}%，没有气温预报。` : "这一小时没有气温预报。" };
  const humid = present(humidity) ? humidity.value >= 90 ? `湿度 ${Math.round(humidity.value)}%，空气很潮，从冷处进暖处镜头容易起雾。`
    : `湿度 ${Math.round(humidity.value)}%。` : "没有湿度预报。";
  return { label: `${Math.round(temperature.value)}°C`, key: "temperature", detail: humid };
}

export function hourReadings(hour: Hour) {
  const w = hour.weather;
  return { sky: skyReading(w.weatherCode, w.cloudTotal), rain: rainReading(w.precipitation, w.precipitationProbability, w.weatherCode),
    wind: windReading(w.windSpeed, w.windGust, w.windFrom, w.temperature, w.humidity), visibility: visibilityReading(w.visibility, w.humidity, w.weatherCode),
    air: airReading(hour.air.referenceAqi), light: lightReading(hour.light), sun: sunPositionReading(hour.light, hour.start),
    temperature: temperatureReading(w.temperature, w.humidity) };
}
export type HourReadings = ReturnType<typeof hourReadings>;
