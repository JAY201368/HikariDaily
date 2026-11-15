import "server-only";
import { excludesOutdoor } from "../../domain/photography/risks";
import type { Briefing, Genre } from "../../domain/types";
import { genreNarrativeSchema, type GenreNarrative } from "../../domain/workspace/advice";
import type { KnowledgeContext, KnowledgeEvidence } from "../../domain/workspace/knowledge";
import { applicable, evidenceReference, referenceKey } from "./knowledge";
export const GENRES: Genre[] = ["landscape", "portrait", "street"];
export function adviceContext(base: Briefing, genre: Genre): KnowledgeContext {
  const advice = base.advice[genre];
  const windows = advice.recommendedWindows.filter(w => w.status !== "past" && Date.parse(w.end) > Date.parse(base.generatedAt));
  const hours = base.hours.filter(h => Date.parse(h.end) > Date.parse(base.generatedAt) && (!windows.length || windows.some(w => Date.parse(h.start) < Date.parse(w.end) && Date.parse(h.end) > Date.parse(w.start))));
  const distinct = (values: string[]) => [...new Set(values)];
  // Unknown/stale/conflicting weather cannot establish a positive condition.
  const metricKnown = (name: "cloudTotal" | "visibility" | "precipitation") => hours.length > 0 && hours.every(h => h.weather[name].state === "ok" && h.weather[name].value !== null);
  const characters = hours.length ? distinct(hours.map(h => h.light.character)) : ["unknown"];
  if (!metricKnown("cloudTotal")) characters.push("unknown");
  const weather: string[] = [];
  if (metricKnown("visibility") && hours.every(h => h.weather.visibility.value! >= 10000)) weather.push("clear-distance");
  if (metricKnown("precipitation") && hours.every(h => h.weather.precipitation.value! > 0)) weather.push("rain-forecast");
  if (!weather.length) weather.push("unknown");
  const risks = distinct(hours.flatMap(h => excludesOutdoor(h.risks) ? h.risks.filter(r => r.code !== "air-quality").map(r => r.code) : []));
  return { genre, phases: hours.length ? distinct(hours.map(h => h.light.phase)) : ["unknown"], characters: distinct(characters), weather, equipment: [], aesthetics: [], risks };
}
export function buildAdviceFacts(base: Briefing, genre: Genre) {
  const a = base.advice[genre], context = adviceContext(base, genre);
  return {
    [`${genre}:context`]: { locationId: base.location.id, localDate: base.localDate, generatedAt: base.generatedAt, state: base.state, context },
    [`${genre}:timing`]: { timing: a.timing, when: base.interpretation.genres[genre].when, status: base.interpretation.genres[genre].status, windows: a.recommendedWindows.map(w => ({ start: w.start, end: w.end, status: w.status })) },
    [`${genre}:light`]: { light: a.light, phases: context.phases, characters: context.characters },
    [`${genre}:conditions`]: { limitations: a.limitations, risks: base.interpretation.risks.map(r => ({ code: r.code, status: r.status, start: r.start, end: r.end })), dataNote: base.interpretation.dataNote, sunset: { ...base.sunsetOpportunity, reasons: undefined, limitations: undefined } },
    [`${genre}:film`]: a.film,
  };
}
const disclaimers = /以.{0,8}(现场|实际).{0,5}为准|(?:仍|还|需要|需|要|取决于).{0,10}(?:现场|实拍|实际).{0,8}(?:判断|确认|观察|情况|条件|效果)|(?:现场|实拍).{0,10}(?:再判断|再确认|决定|才知道)|不(?:能|作|做)?保证|仅供参考|仅作参考|参考价值|不代表.{0,8}(?:实际|一定|必然)|(?:实际|最终).{0,8}(?:效果|结果).{0,8}(?:取决|受制|仍需|为准)|(?:别|不要).{0,4}(?:期望|期待)|不宜.{0,4}(?:期望|期待)|概率.{0,8}(?:校准|保证)|效果.{0,8}因人而异|请自行.{0,5}(?:判断|确认)|具体.{0,6}(?:实地|现场)|天气.{0,6}(?:随时变化|可能变化)/u;
export function hasDefensiveDisclaimer(text: string) {
  return /[\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(text) || disclaimers.test(text.normalize("NFKC"));
}
/** Free text is technique. Measured values/times/grades stay in deterministic fact slots.
 * Ground observations require explicit conditional wording; a forecast never proves wet ground.
 * This guard is conservative, not a general natural-language truth oracle (see quality README).
 */
export function unsafeAdviceText(text: string, context: KnowledgeContext, base: Briefing) {
  const normalized = text.normalize("NFKC").replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f]/gu, "");
  if (hasDefensiveDisclaimer(text)) return true;
  text = normalized;
  if (/[0-9]|[零〇一二三四五六七八九十百千万两半几]+(?:点|时|分|秒|度|级|成|毫米|公里|米每秒)|[fFＦ]\s*[/／]|ISO|感光度.{0,4}[零一二三四五六七八九十百千]/u.test(text)) return true;
  if (/将会|必定|肯定|一定会|绝佳|最佳时段|适宜外出|放心外出|无风险|没有风险|数据齐全|天气确定/u.test(text)) return true;
  // Weather forecasts are supplied in service-rendered facts, never invented in prose.
  // Conditions may introduce specific actions, e.g. "路面有积水时，降低机位收进倒影。"
  const clauses = text.split(/[。！？；]/u).filter(Boolean);
  const conditional = /^(?:如果|若|当|如遇|遇到|在.{0,16}时)|^[^，,]{0,20}(?:时|的话)[，,]/u;
  for (const clause of clauses) {
    const condition = conditional.test(clause);
    if (/晴天|晴朗|晴空|阴天|多云|云层|云量|厚云|薄云|低云|高云|下雨|降雨|雨后|雨势|雨已|放晴|雪|雷|风速|大风|风力|温度|气温|湿度|能见度|污染|空气质量|概率|晚霞|朝霞|火烧云|日出|日落|黄金时段|黄金时间/u.test(clause) && !condition) return true;
    if (/湿润|湿地|积水|倒影|湿路|地面.{0,4}湿|路面.{0,4}湿/u.test(clause) && !condition) return true;
    if (/已经|正在下|即将|将有|将出现|雨停了|雨已经停|雨已停/u.test(clause)) return true;
  }
  const all = (actual: string[], expected: string) => actual.length > 0 && actual.every(c => c === expected);
  if (/直射|阳光|太阳|日光|光束|光斑|硬影|投影|影子/u.test(text) && (!all(context.characters, "direct") || context.risks.length)) return true;
  // Directional window or artificial light remains usable under an overcast sky.
  if (/逆光|侧光/u.test(text) && !all(context.characters, "direct") && !/窗边|窗户|窗光|灯光|补光|反光板/u.test(text)) return true;
  if (/柔光|散射光|漫射光/u.test(text) && !all(context.characters, "diffuse")) return true;
  if (/夜间|夜景|入夜/u.test(text) && !all(context.phases, "night")) return true;
  if (/远景.{0,6}(清晰|通透)|清晰.{0,6}远景|通透|远山清楚|看清远/u.test(text) && !context.weather.includes("clear-distance")) return true;
  if (/霞光|落日|夕阳|夕照/u.test(text) && (Date.parse(base.solar.sunset ?? "") <= Date.parse(base.generatedAt) || !base.solar.sunset || base.sunsetOpportunity.status === "unknown")) return true;
  // A blocking risk in the selected hours requires explicitly indoor actions for the subject/light/viewpoint below.
  if (context.risks.length && /户外|河岸|山顶|岸边|露天|街头|街道|行走|出发|外出/u.test(text)) return true;
  // The film type/sensitivity are authoritative objects; prose cannot select an alternative.
  const filmTypes = text.match(/彩色负片|黑白负片|彩色反转片/gu) ?? [];
  const sensitivities = text.match(/较高感|中感|低感/gu) ?? [];
  if (filmTypes.some(t => !Object.values(base.advice).some(a => a.film.type === t))) return true;
  if (sensitivities.some(t => !Object.values(base.advice).some(a => a.film.sensitivity === t))) return true;
  return false;
}
export function validateGenreNarrative(input: unknown, base: Briefing, genre: Genre, knowledge: KnowledgeEvidence[]): { narrative: GenreNarrative | null; reason: string | null } {
  const parsed = genreNarrativeSchema.safeParse(input);
  if (!parsed.success) return { narrative: null, reason: "INVALID_STRUCTURE_OR_LENGTH" };
  const narrative = parsed.data, context = adviceContext(base, genre), facts = buildAdviceFacts(base, genre);
  const allowed = new Map(knowledge.filter(k => applicable(k, context)).map(k => [referenceKey(evidenceReference(k)), k]));
  const topics: Record<keyof GenreNarrative, string[]> = { timing: ["subject", "alternative", "night", "light", "direct"], light: ["light", "direct", "night", "alternative", "viewpoint"], subject: ["subject", "alternative", "night"], composition: ["composition", "alternative"], viewpoint: ["viewpoint", "alternative"], alternative: ["alternative"], film: ["film"] };
  for (const [key, facet] of Object.entries(narrative) as [keyof GenreNarrative, GenreNarrative[keyof GenreNarrative]][]) {
    if (facet.factIds.some(id => !(id in facts))) return { narrative: null, reason: "INVALID_FACT_REFERENCE" };
    if (facet.knowledge.some(r => !allowed.has(referenceKey(r))) || !facet.knowledge.some(r => allowed.get(referenceKey(r))?.topics.some(t => topics[key].includes(t)))) return { narrative: null, reason: "INVALID_KNOWLEDGE_REFERENCE" };
    if (unsafeAdviceText(facet.text, context, base) || unsafeAdviceText(facet.short, context, base)) return { narrative: null, reason: "UNSUPPORTED_OR_PROHIBITED_CLAIM" };
    if ((facet.text.match(/彩色负片|黑白负片|彩色反转片/gu) ?? []).some(t => t !== base.advice[genre].film.type)
      || (facet.text.match(/较高感|中感|低感/gu) ?? []).some(t => t !== base.advice[genre].film.sensitivity)) return { narrative: null, reason: "FILM_CONTRACT_MISMATCH" };
    if (context.risks.length && ["subject", "light", "viewpoint"].includes(key) && !/室内/u.test(facet.text)) return { narrative: null, reason: "RISK_REQUIRES_INDOOR_ACTION" };
    for (const claim of facet.claims) {
      if ((claim === "direct-light" && !context.characters.every(c => c === "direct")) || (claim === "diffuse-light" && !context.characters.every(c => c === "diffuse")) || (claim === "night" && !context.phases.every(p => p === "night")) || (claim === "clear-distance" && !context.weather.includes("clear-distance")) || (claim === "rain-forecast" && !context.weather.includes("rain-forecast")) || (claim === "sunset-future" && (!base.solar.sunset || Date.parse(base.solar.sunset) <= Date.parse(base.generatedAt) || base.sunsetOpportunity.status === "unknown"))) return { narrative: null, reason: "CLAIM_CONDITION_MISMATCH" };
    }
  }
  // Full advice must supply distinct actions, not repeat the same generic paragraph in every facet.
  const actionFields = [narrative.subject.text, narrative.light.text, narrative.composition.text, narrative.viewpoint.text, narrative.film.text];
  if (new Set(actionFields).size !== actionFields.length || actionFields.some(t => !/拍|取景|留|用|让|移|选|观察|保留|突出|安排|降低|靠近|面向|朝向/u.test(t))) return { narrative: null, reason: "GENERIC_OR_DUPLICATED_ADVICE" };
  return { narrative, reason: null };
}
