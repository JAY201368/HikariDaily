import type { Hour, Metric, SolarEvents } from "../../domain/types";
import { hasConflict, present } from "../../domain/photography/shared";
import { bearingName, rainAmountText, skyReading, windEffect, windLevel, type HourReadings } from "./levels";

const number = (value: number) => String(Math.round(value * 10) / 10);
const degrees = (value: number) => `${number(value)}°`;
const percent = (value: number) => `${number(value)}%`;
const temperature = (value: number) => `${number(value)}°C`;
const wind = (value: number) => `${windLevel(value)} 级`;
const direction = (value: number) => `${bearingName(value)}风`;
const distance = (value: number) => value > 0 && value < 100 ? "不到 0.1 公里" : `${number(value / 1000)} 公里`;
const pollution = (value: number) => `${number(value)} μg/m³`;
const aqi = (value: number) => `美国标准 AQI ${number(value)}`;

/** Wording only: these bands never feed photography scores or weather classification. */
export function cloudLayerText(name: string, value: number): string {
  return `${name}${value < 25 ? "少" : value <= 75 ? "有一些" : "很多"}（${percent(value)}）`;
}

type Entry = { name: string; metric: Metric<number>; format: (value: number) => string; missing: string };
function entry(name: string, metric: Metric<number>, format: Entry["format"], missing = `这一小时没有${name}预报。`): Entry {
  return { name, metric, format, missing };
}
function fields(entries: Entry[]) {
  return entries.map(({ name, metric, format }) => ({ name, value: present(metric) ? format(metric.value) : "—" }));
}
function notices(entries: Entry[]) {
  return entries.flatMap(({ name, metric, format, missing }) => {
    const result: string[] = [];
    if (!present(metric)) result.push(missing);
    if (metric.state === "stale") result.push(`${name}：这一项用的是早些时候存下的数据。`);
    if (hasConflict(metric) || (metric.alternatives?.length ?? 0) > 0) {
      const values = present(metric) ? [format(metric.value), ...(metric.alternatives ?? []).map((other) => format(other.value))] : [];
      const comparison = values.length > 1 ? `（一家说 ${values[0]}，另一家说 ${values.slice(1).join("、")}）` : "";
      result.push(`${name}：两家预报对这一项说法不一${comparison}。`);
    }
    return result;
  });
}

/** Pure device explanations: independent fields keep AQI, distance and PM separate. */
export function deviceReadings(hour: Hour, readings: HourReadings, solar?: SolarEvents) {
  const w = hour.weather, a = hour.air, r = readings;
  const windEntries = [entry("平均风", w.windSpeed, wind, r.wind.detail), entry("阵风", w.windGust, wind),
    entry("风向", w.windFrom, direction), entry("气温", w.temperature, temperature, r.temperature.key === "unknown" ? "这一小时没有气温预报。" : r.temperature.detail),
    entry("湿度", w.humidity, percent)];
  const cloudEntries = ([['总云', w.cloudTotal], ['低云', w.cloudLow], ['中云', w.cloudMid], ['高云', w.cloudHigh]] as const)
    .map(([name, metric]) => entry(name, metric, (value) => cloudLayerText(name, value)));
  const weatherEntries = [entry("天色", w.weatherCode, (value) => skyReading({ ...w.weatherCode, value }, w.cloudTotal).label, r.sky.detail),
    entry("雨量", w.precipitation, rainAmountText, r.rain.detail), entry("降水概率", w.precipitationProbability, percent),
    entry("能见度", w.visibility, distance, r.visibility.detail), entry("空气", a.referenceAqi, aqi, r.air.detail),
    entry("PM2.5", a.pm25, pollution), entry("PM10", a.pm10, pollution)];
  const average = present(w.windSpeed) ? windLevel(w.windSpeed.value) : null;
  const gust = present(w.windGust) ? windLevel(w.windGust.value) : null;
  const windMeaning = gust !== null && gust >= 3 && (average === null || gust > average)
    ? [`阵风 ${gust} 级，${windEffect(gust)}。`] : [r.wind.detail];
  const sunMissing = r.sun.key === "unknown" ? [r.sun.detail] : [];
  if (solar) {
    const events = [["sunrise", "日出"], ["sunset", "日落"], ["morningGolden", "清晨黄金时刻"],
      ["eveningGolden", "傍晚黄金时刻"], ["morningBlue", "清晨蓝调时刻"], ["eveningBlue", "傍晚蓝调时刻"]] as const;
    const absent = events.filter(([key]) => solar[key] === null).map(([, name]) => name);
    if (absent.length) sunMissing.push(`今天的${absent.join("、")}暂时算不出来，时间先空着。`);
  }
  const precipitationSky = ["rain", "drizzle", "showers", "snow", "sleet", "thunder"].includes(r.sky.key);
  const weatherMeaning = precipitationSky && r.rain.key === "none" ? r.sky.detail : `${r.sky.detail}${r.rain.detail}`;
  const skyNotices = notices(weatherEntries.slice(0, 1));
  // A cloud-based sky remains useful when weather codes are missing, but its own
  // cloud provenance (including simultaneous stale/conflict) still matters.
  if (!present(w.weatherCode)) {
    skyNotices.splice(0, skyNotices.length, ...notices([entry("天色", w.cloudTotal, percent, r.sky.detail)]));
  } else if (present(w.cloudTotal)) {
    skyNotices.push(...notices([entry("总云", w.cloudTotal, percent)]));
  }
  return {
    wind: {
      fields: fields(windEntries.slice(1)), meaning: windMeaning, notices: notices(windEntries),
      reference: ["3 级发丝乱 / 4 级脚架抖 / 5 级起要压重"],
      trend: { value: average, key: r.wind.key, label: r.wind.label },
    },
    direction: {
      fields: [{ name: "方位", value: hour.light.azimuth === null ? "—" : degrees(hour.light.azimuth) },
        { name: "高度", value: hour.light.altitude === null ? "—" : degrees(hour.light.altitude) }],
      meaning: r.sun.key === "unknown" ? [r.sun.detail] : [r.sun.detail, "方位是太阳所在的方向，高度为 0° 时就在地平线上。"], notices: sunMissing, reference: [],
      trend: { value: hour.light.altitude, key: hour.light.altitude === null ? "unknown" : hour.light.altitude >= 0 ? "above" : "below", label: r.sun.label },
    },
    light: {
      fields: fields(cloudEntries), meaning: [r.light.detail], notices: [...(r.light.key === "unknown" ? [r.light.detail] : []), ...notices(cloudEntries)],
      reference: ["柔光：云层把阳光铺匀，影子很淡。", "硬光：阳光直射，明暗反差大，影子清楚。", "忽明忽暗：云一阵一阵遮住太阳，亮度会跟着变。"],
      trend: { value: r.light.key === "unknown" ? null : 1, key: r.light.key, label: r.light.label },
    },
    weather: {
      fields: [{ name: "天色", value: r.sky.label }, { name: "雨", value: `${r.rain.label} · ${present(w.precipitation) ? rainAmountText(w.precipitation.value) : "—"}` },
        ...fields(weatherEntries.slice(2)).map((field) => field.name === "能见度" ? { ...field, value: `${r.visibility.label} · ${field.value}` }
          : field.name === "空气" ? { ...field, value: `${r.air.label} · ${field.value}` } : field)],
      meaning: [weatherMeaning, `${r.visibility.detail}${r.air.detail}`],
      notices: [...skyNotices, ...notices(weatherEntries.slice(1))],
      reference: ["空气质量和能见度是两回事，空气差不等于看不远。"],
      trend: { value: r.sky.key === "unknown" ? null : 1, key: r.sky.key, label: r.sky.label },
    },
  };
}
