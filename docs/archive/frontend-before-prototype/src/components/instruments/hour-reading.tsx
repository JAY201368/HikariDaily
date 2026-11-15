import type { Hour } from "../../domain/types";
import { AIR_UNITS, WEATHER_UNITS } from "../../domain/schemas";
import { windowStatus } from "../../domain/time";
import { Notes, MetricValue, range } from "../briefing";
const names = { temperature: "温度", humidity: "湿度", weatherCode: "天气代码", precipitation: "小时降水",
    precipitationProbability: "降水概率", windSpeed: "平均风", windGust: "小时最大阵风", windFrom: "风向（来向）",
    cloudTotal: "总云量", cloudLow: "低云量", cloudMid: "中云量", cloudHigh: "高云量", visibility: "能见度",
    pm25: "PM2.5", pm10: "PM10", referenceAqi: "参考 AQI（美国 EPA 口径）" };
export function HourReading({ hour, index, generatedAt }: {
    hour: Hour;
    index: number;
    generatedAt: string;
}) {
    return <section aria-labelledby={`hour-${index}`}>        <h3 id={`hour-${index}`}>{range(hour)} · {{ past: "已过", current: "当前小时", future: "随后预报" }[windowStatus(hour.start, hour.end, generatedAt)]}</h3>
        <p>{hour.light.description}</p>
        <p>太阳计算参考 {String(index).padStart(2, "0")}:30：高度 {hour.light.altitude?.toFixed(1) ?? "未知"}°，方位 {hour.light.azimuth?.toFixed(1) ?? "未知"}°（北0°顺时针，非设备朝向）。</p>
        <Notes items={hour.risks.map((risk) => risk.message)}/>
        <details><summary>天气、空气与推断依据</summary>
          <dl>{Object.entries(hour.weather).map(([key, metric]) => <MetricValue key={key} name={names[key as keyof typeof names]} metric={metric} unit={WEATHER_UNITS[key as keyof typeof WEATHER_UNITS]}/>)}
            {Object.entries(hour.air).map(([key, metric]) => <MetricValue key={key} name={names[key as keyof typeof names]} metric={metric} unit={AIR_UNITS[key as keyof typeof AIR_UNITS]}/>)}</dl>
          <Notes items={hour.light.reasons}/><Notes items={hour.light.limitations}/>
          <p>光照依据来源：{hour.light.sourceIds.join("、") || "仅太阳计算 / 气象依据不足"}</p>
          {hour.risks.map((risk) => <p key={`${risk.code}-${risk.start}`}>风险时段 {range(risk)} · 来源 {risk.sourceIds.join("、")}。模型风险提示，非官方预警。</p>)}
        </details></section>;
}
