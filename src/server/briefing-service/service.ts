import "server-only";
import { createBriefingGraph } from "./graph";
import { briefingFailure } from "./result";
import type { BriefingCapabilities, BriefingDependencies } from "./contracts";

export { briefingFailure } from "./result";
export type { BriefingResult } from "./contracts";

/** SSR and API run the same graph; only source snapshots are cached below it. */
export function createBriefingService(deps: BriefingDependencies, capabilities: BriefingCapabilities = {}) {
  const graph = createBriefingGraph(deps, capabilities);
  return async function getBriefing(place: unknown) {
    try {
      const { result } = await graph.invoke({ place });
      return result ?? briefingFailure("BRIEFING_UNAVAILABLE");
    } catch {
      return briefingFailure("BRIEFING_UNAVAILABLE");
    }
  };
}
