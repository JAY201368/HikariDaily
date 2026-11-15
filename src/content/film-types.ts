import type { Genre, GenreAdvice, LightAssessment } from "../domain/types";

/** P6.5: generic style choices tied to light, without exposure measurements or brands. */
export function suggestFilm(genre: Genre, light: LightAssessment | null, stable: boolean, night = false, outdoorPaused = false): GenreAdvice["film"] {
  const caveat = "也可以在数码相机上套用类似的色彩和颗粒风格。";
  if (night || light?.phase === "night") return { type: "彩色负片", sensitivity: "较高感", reason: outdoorPaused ? "夜里光线暗，较高感负片可用于允许拍摄的室内；户外安排先暂停。" : "夜里光线暗，较高感负片适合灯光题材；手持要拿稳。", caveat };
  if (genre === "street" && light?.character === "direct" && light.altitude !== null && light.altitude > 30) {
    return { type: "黑白负片", sensitivity: "中感", reason: "阳光硬、影子浓，黑白能把街头的明暗和线条拍得更有力量。", caveat };
  }
  if (light?.phase === "day" && light.character === "direct" && stable) {
    return genre === "landscape" ? { type: "彩色反转片", sensitivity: "低感",
      reason: "光线明亮又稳定，反转片颗粒细、颜色浓，蓝天和远山会很鲜明。", caveat: `反转片宽容度小，亮处和暗处差太多会丢细节，测光要仔细。${caveat}` }
      : { type: "彩色负片", sensitivity: "低感", reason: "光线明亮又稳定，低感负片颗粒细、肤色柔和。", caveat };
  }
  return { type: "彩色负片", sensitivity: genre === "street" || light?.phase === "blue" ? "较高感" : "中感",
    reason: light ? "阴天或光线偏暗时，负片宽容度大，颗粒感能让灰调更有质感；手持记得拿稳。"
      : "光线情况还不清楚，先用宽容度大的中感负片。", caveat };
}
