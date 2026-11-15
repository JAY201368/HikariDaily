import { z } from "zod";
import { knowledgeReferenceSchema, knowledgeChunkSchema, knowledgeSourceSchema } from "./knowledge";
import { BriefingSchema, InterpretationSchema } from "../schemas";
import { canonicalSnapshot } from "./snapshot";
import { shanghaiDate, windowStatus } from "../time";
const plain = z.string().trim().min(4).max(320).refine(v => !/[<>\u0000-\u001f\u007f]/u.test(v), "仅允许纯文本");
export const adviceClaims = ["neutral", "direct-light", "diffuse-light", "night", "clear-distance", "rain-forecast", "sunset-future"] as const;
function facet(shortLimit: number) {
  return z.strictObject({ text: plain, short: plain.refine(v => Array.from(v).length <= shortLimit, "短文超出纸面预算"),
    factIds: z.array(z.string().max(100)).min(1).max(12),
    knowledge: z.array(knowledgeReferenceSchema).min(1).max(5), claims: z.array(z.enum(adviceClaims)).min(1).max(7),
  }).refine(v => v.text.split(/(?<=[。！？])/u).map(s => s.trim()).includes(v.short) && /[。！？]$/u.test(v.short), "短文须是全文中的完整原句");
}
/** Separate narrative only; cannot receive a GenreAdvice or mutate rules. */
export const genreNarrativeSchema = z.strictObject({
  timing: facet(52), light: facet(44), subject: facet(36), composition: facet(44),
  viewpoint: facet(44), alternative: facet(28), film: facet(45),
});
export const adviceNarrativeSchema = z.strictObject({ landscape: z.unknown().optional(), portrait: z.unknown().optional(), street: z.unknown().optional() });
export type GenreNarrative = z.infer<typeof genreNarrativeSchema>;
export type NarrativeFacet = GenreNarrative[keyof GenreNarrative];
export const ADVICE_PROMPT_VERSION = "advice-2026-10-v1";
export const ADVICE_QUALITY_VERSION = "quality-2026-10-v1";
export const adviceInputSchema = z.strictObject({ place: z.string().regex(/^geonames:[1-9]\d*$/) });
export type GenreEnhancement = {
  status: "generated" | "fallback";
  reason: string | null;
  full: GenreNarrative | null;
  short: { newspaper: string; manual: { timing: string; light: string; opportunity: string; film: string; alternative: string } } | null;
  /** Always render with the narrative: these values are owned by deterministic rules. */
  constraints: { when: string; status: string; timing: string; limitations: string[]; filmCaveat: string; dataNote: string | null; risks: import("../types").Briefing["interpretation"]["risks"] };
  evidence: import("./knowledge").KnowledgeEvidence[];
};
export type AdviceEnhancementResult = {
  baseBriefing: import("../types").Briefing;
  factsHash: string;
  enhancement: Record<"landscape" | "portrait" | "street", GenreEnhancement>;
  metadata: {
    ownerId: string;
    locationId: string; localDate: string; snapshotGeneratedAt: string; generatedAt: string; rulesVersion: string;
    promptVersion: string; qualityVersion: string; configVersion: number | null; model: string | null;
    knowledgeVersions: { sourceId: string; version: number }[];
    durationMs: number | null; usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  };
};
export const adviceContextSchema = z.strictObject({ ownerId: z.uuid(), configVersion: z.number().int().nonnegative(), enabled: z.boolean(), reason: z.string().nullable() });
export type AdviceContext = z.infer<typeof adviceContextSchema>;
const enhancementSchema = z.strictObject({
  status: z.enum(["generated", "fallback"]), reason: z.string().nullable(), full: genreNarrativeSchema.nullable(),
  short: z.strictObject({ newspaper: z.string(), manual: z.strictObject({ timing: z.string(), light: z.string(), opportunity: z.string(), film: z.string(), alternative: z.string() }) }).nullable(),
  constraints: z.strictObject({ when: z.string(), status: z.string(), timing: z.string(), limitations: z.array(z.string()), filmCaveat: z.string(), dataNote: z.string().nullable(), risks: InterpretationSchema.shape.risks }),
  evidence: z.array(knowledgeChunkSchema.extend({ source: knowledgeSourceSchema })).max(36),
});
export const adviceResultSchema = z.strictObject({
  baseBriefing: BriefingSchema, factsHash: z.string().regex(/^[a-f0-9]{64}$/),
  enhancement: z.strictObject({ landscape: enhancementSchema, portrait: enhancementSchema, street: enhancementSchema }),
  metadata: z.strictObject({
    ownerId: z.uuid(), locationId: z.string(), localDate: z.string(), snapshotGeneratedAt: z.string(), generatedAt: z.string(), rulesVersion: z.string(),
    promptVersion: z.string(), qualityVersion: z.string(), configVersion: z.number().int().nonnegative().nullable(), model: z.string().nullable(),
    knowledgeVersions: z.array(z.strictObject({ sourceId: z.string(), version: z.number().int() })), durationMs: z.number().nullable(),
    usage: z.strictObject({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional(), total_tokens: z.number().optional() }).nullable(),
  }),
}).superRefine((result, ctx) => {
  const b = result.baseBriefing, m = result.metadata;
  let valid = m.locationId === b.location.id && m.localDate === b.localDate && m.snapshotGeneratedAt === b.generatedAt && m.rulesVersion === b.rulesVersion;
  for (const g of ["landscape", "portrait", "street"] as const) {
    const x = result.enhancement[g], a = b.advice[g], full = x.full;
    valid &&= canonicalSnapshot(x.constraints) === canonicalSnapshot({ when: b.interpretation.genres[g].when, status: b.interpretation.genres[g].status,
      timing: a.timing, limitations: a.limitations, filmCaveat: a.film.caveat, dataNote: b.interpretation.dataNote, risks: b.interpretation.risks });
    if (x.status === "fallback") valid &&= full === null && x.short === null && x.evidence.length === 0;
    else {
      valid &&= !!full && !!x.short && x.reason === null;
      if (full) {
        valid &&= canonicalSnapshot(x.short) === canonicalSnapshot({ newspaper: full.subject.short, manual: { timing: full.timing.short, light: full.light.short,
          opportunity: full.subject.short, film: full.film.short, alternative: full.alternative.short } });
        valid &&= Object.values(full).every(f => f.knowledge.every(k => x.evidence.some(e => e.id === k.chunkId && e.source.id === k.sourceId && e.source.version === k.version)));
      }
    }
  }
  if (!valid) ctx.addIssue({ code: "custom", message: "建议与事实或依据不匹配" });
});
/** No past-window narrative can cross its eligibility boundary while waiting for I/O. */
export function adviceTimingValid(base: AdviceEnhancementResult["baseBriefing"], now: number): boolean {
  if (base.localDate !== shanghaiDate(now)) return false;
  const prior = Date.parse(base.generatedAt);
  if ([base.solar.sunrise, base.solar.sunset].some(t => t && prior < Date.parse(t) && now >= Date.parse(t))) return false;
  return Object.values(base.advice).every(a => a.recommendedWindows.every(w => windowStatus(w.start, w.end, prior) === windowStatus(w.start, w.end, now)));
}
