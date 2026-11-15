import type { Briefing } from "../../../src/domain/types";
import type { AdviceEnhancementResult } from "../../../src/domain/workspace/advice";
import { snapshotHash } from "../../../src/domain/workspace/snapshot";
import { goodNarrative, originalEvidence, qualityBriefing } from "./advice";
export const homeOwner = "d01c098d-9865-4d45-85f2-dbb285c50c39";
export const homeContext = { ownerId: homeOwner, configVersion: 1, enabled: true, reason: null };
export function homeBaseBriefing() { const base=qualityBriefing();base.state="partial";return base; }
/** Explicit authored UI fixture, never a live model result. */
export async function homeAdviceFixture(base: Briefing = homeBaseBriefing(), ownerId = homeOwner, configVersion = 1): Promise<AdviceEnhancementResult> {
  return {
    baseBriefing: base, factsHash: await snapshotHash(base),
    enhancement: Object.fromEntries((["landscape", "portrait", "street"] as const).map(g => {
      const n = goodNarrative(g, originalEvidence), a = base.advice[g];
      // Long complete text proves every full outlet preserves more than the short paper passage.
      n.composition.text += "留意主体边缘与背景之间的空隙，再移动站位整理线条。";
      return [g, { status: "generated", reason: null, full: n,
        short: { newspaper: n.subject.short, manual: { timing: n.timing.short, light: n.light.short, opportunity: n.subject.short, film: n.film.short, alternative: n.alternative.short } },
        constraints: { when: base.interpretation.genres[g].when, status: base.interpretation.genres[g].status, timing: a.timing, limitations: a.limitations,
          filmCaveat: a.film.caveat, dataNote: base.interpretation.dataNote, risks: base.interpretation.risks }, evidence: originalEvidence }];
    })) as AdviceEnhancementResult["enhancement"],
    metadata: { ownerId, locationId: base.location.id, localDate: base.localDate, snapshotGeneratedAt: base.generatedAt, generatedAt: base.generatedAt,
      rulesVersion: base.rulesVersion, promptVersion: "explicit-authored-ui-fixture", qualityVersion: "explicit-authored-ui-fixture", configVersion,
      model: "explicit-authored-ui-fixture", knowledgeVersions: [{ sourceId: originalEvidence[0].source.id, version: originalEvidence[0].source.version }], durationMs: 1, usage: null },
  };
}
