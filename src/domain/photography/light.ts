import { calculateSolarPosition } from "../solar";
import { toEpoch } from "../time";
import type { LightAssessment, Location, Metric, SolarEvents } from "../types";
import { metricLimitations, present } from "./shared";

type Position = ReturnType<typeof calculateSolarPosition>;
const inRange = (epoch: number, range: { start: string; end: string } | null) =>
  range !== null && epoch >= Date.parse(range.start) && epoch < Date.parse(range.end);

/** P6.2: a condition assessment, never a light-meter measurement. */
export function assessLightAtPosition(instant: string | number, position: Position,
  cloud: Metric<number>, solar: SolarEvents): LightAssessment {
  const epoch = toEpoch(instant);
  const { altitude, azimuth } = position;
  const phase: LightAssessment["phase"] = altitude === null ? "unknown" : altitude < -6 ? "night"
    : [solar.morningBlue, solar.eveningBlue].some((range) => inRange(epoch, range)) ? "blue"
    : [solar.morningGolden, solar.eveningGolden].some((range) => inRange(epoch, range)) ? "golden"
    : altitude >= 0 ? "day" : "unknown";
  const cloudKnown = present(cloud);
  const character: LightAssessment["character"] = altitude === null || altitude < 0 || !cloudKnown ? "unknown"
    : cloud.value <= 25 ? "direct" : cloud.value >= 75 ? "diffuse" : "variable";
  const phaseText = { night: "天黑了，没有自然光。", blue: "蓝调时刻（太阳在地平线下不远，天空深蓝），光很暗。",
    golden: altitude !== null && altitude < 0 ? "黄金时刻，太阳仍在地平线下，天边有晨昏余光。" : "黄金时刻（太阳很低，光偏暖、影子长）。", day: "白天。", unknown: "太阳位置暂时算不出来。" }[phase];
  const characterText = character === "direct" ? `阳光直射${altitude! > 30 ? "，明暗反差较强，影子浓" : "，光从侧面来，影子拉得长"}。`
    : character === "diffuse" ? "云层很厚，是柔光，影子很淡。"
    : character === "variable" ? "云时开时合，光线忽明忽暗，可以等云缝里漏下来的光。"
    : altitude !== null && altitude < 0 ? ""
    : !cloudKnown ? "没有云量预报。" : "";
  return { phase, character, altitude, azimuth, description: `${phaseText}${characterText}`,
    reasons: [
      ...(cloudKnown ? [`云量约 ${Math.round(cloud.value)}%。`, ...(["blue", "golden"].includes(phase)
        ? [cloud.value >= 75 ? "云很厚，可能遮挡天边的颜色。" : "云的位置会改变天边的颜色。"] : [])] : [])],
    limitations: [...(altitude === null ? position.notes : []), ...metricLimitations([cloud])],
    sourceIds: cloud.sourceIds };
}
export function assessLight(instant: string | number, location: Pick<Location, "latitude" | "longitude">,
  cloud: Metric<number>, solar: SolarEvents): LightAssessment {
  return assessLightAtPosition(instant, calculateSolarPosition(instant, location), cloud, solar);
}
