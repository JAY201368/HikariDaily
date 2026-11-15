import type { NormalizedDay } from "../normalization";
import type { Hour, LightAssessment, RiskNote } from "../types";

/** Join independently computed rule results without exposing normalization-only fields. */
export function assemblePhotographyHours(day: NormalizedDay, light: LightAssessment[], risks: RiskNote[][]): Hour[] {
  if (light.length !== day.hours.length || risks.length !== day.hours.length) {
    throw new RangeError("逐小时摄影结果与归一化时段数量不匹配");
  }
  return day.hours.map((hour, index) => ({
    start: hour.start, end: hour.end, weather: hour.weather, air: hour.air,
    light: light[index], risks: risks[index],
  }));
}
