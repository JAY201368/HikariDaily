import type { Briefing, Genre } from "../../../src/domain/types";
import type { GenreNarrative } from "../../../src/domain/workspace/advice";
import type { KnowledgeEvidence } from "../../../src/domain/workspace/knowledge";
import corpus from "../../../src/content/knowledge/original-fieldcraft.v1.json" with { type: "json" };
import { syntheticBriefing } from "../domain-synthetic";
export function qualityBriefing(scene = "sunny"): Briefing {
  const b = syntheticBriefing();
  b.generatedAt = scene === "night" ? "2026-10-22T20:00:00+08:00" : "2026-10-22T12:00:00+08:00";
  b.state = "ready";
  b.solar.sunset = "2026-10-22T17:30:00+08:00";
  for (const h of b.hours) {
    h.light.phase = scene === "night" ? "night" : "day";
    h.light.character = ["overcast", "rain", "conflict"].includes(scene) ? "diffuse" : "direct";
    for (const [name, value] of Object.entries({ cloudTotal: scene === "overcast" ? 95 : 10, visibility: scene === "poor-visibility" ? 500 : 20000, precipitation: scene === "rain" ? 2 : 0 })) {
      Object.assign(h.weather[name as "cloudTotal"], { value, state: "ok", sourceIds: ["synthetic-weather"], notes: [] });
    }
    if (["stale", "conflict", "null"].includes(scene)) Object.assign(h.weather.cloudTotal, { value: scene === "null" ? null : 50, state: scene === "null" ? "missing" : scene });
    if (scene === "risk") h.risks.push({ code: "thunderstorm", message: "人工合成雷暴风险", sourceIds: ["synthetic-weather"], start: h.start, end: h.end });
  }
  for (const genre of ["landscape", "portrait", "street"] as const) {
    b.advice[genre].limitations = scene === "null" ? ["云量缺失"] : [];
    b.advice[genre].film.caveat = "手持保持稳定";
    b.advice[genre].film.reason = "保留主体颜色层次";
  }
  return b;
}
export const originalEvidence = corpus.chunks.map(c => ({ ...c, source: corpus.source })) as KnowledgeEvidence[];
/** Authored example, not a recorded live model output. Each facet is independently cited. */
export function goodNarrative(genre: Genre, evidence: KnowledgeEvidence[], indoor = false): GenreNarrative {
  const subject = { landscape: "用窗框与墙面建立建筑层次。", portrait: "让人物整理衣领，拍手部与面部的关系。", street: "拍店面陈列与顾客手部动作的呼应。" }[genre];
  const film = { landscape: "用胶片保留墙面与窗框的色彩层次。", portrait: "用胶片保留肤色与衣料的颜色呼应。", street: "用胶片突出招牌与衣服的颜色关系。" }[genre];
  const light = { landscape: "选明暗分开的墙面，让建筑轮廓与窗框错开。", portrait: "让人物朝向较亮处，观察眼窝与下颌的明暗。", street: "用店面与衣服的颜色分开行人和背景。" }[genre];
  const composition = { landscape: "用建筑重复线条组织画面，在窗框旁留出完整空隙。", portrait: "在人物视线前留白，避开穿过头部的背景线条。", street: "保留招牌与门洞的节奏，让顾客动作打破重复。" }[genre];
  const viewpoint = { landscape: "降低机位，让建筑近景与远处轮廓错开。", portrait: "以人物眼睛高度取景，侧向移动整理肩线背景。", street: "靠近店面边缘取景，让顾客与招牌保留间隔。" }[genre];
  const texts = { timing: "先观察主体边缘，再安排取景顺序。", light, subject,
    composition, viewpoint, alternative: "转到室内拍门洞与墙面纹理。", film };
  return Object.fromEntries(Object.entries(texts).map(([key, text]) => {
    if (indoor && ["subject", "light", "viewpoint"].includes(key)) text = `在室内${text}`;
    const topic = key === "timing" ? "alternative" : key;
    const e = evidence.find(e => e.topics.includes(topic)) ?? evidence.find(e => e.topics.includes("alternative"))!;
    return [key, { text, short: text, factIds: [`${genre}:${key === "film" ? "film" : key === "timing" ? "timing" : "context"}`], knowledge: [{ sourceId: e.source.id, version: e.source.version, chunkId: e.id }], claims: ["neutral"] }];
  })) as GenreNarrative;
}
