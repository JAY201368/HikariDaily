import "server-only";
import { normalizeSources } from "../../../domain/normalization";
import { calculateSolarEvents } from "../../../domain/solar";
import { validatePhotographyContext } from "../../../domain/photography";
import type { BriefingGraphState } from "../state";
import type { BriefingDependencies } from "../contracts";

export function createSourceNode({ loadSources }: BriefingDependencies) {
  return async ({ target }: BriefingGraphState) => ({ loaded: await loadSources(target) });
}
export function calculateSolar({ localDate, location }: BriefingGraphState) {
  return { solar: calculateSolarEvents(localDate, location) };
}
export function normalizeWeather({ target, loaded, location, now }: BriefingGraphState) {
  const day = normalizeSources(target, loaded.snapshots);
  validatePhotographyContext(day, location, now);
  return { day };
}
