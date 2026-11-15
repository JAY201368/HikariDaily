import "server-only";
import { createInterpretation } from "../../../content/interpret";
import type { BriefingCapabilities } from "../contracts";
import type { BriefingGraphState } from "../state";

export function createInterpretationNode(capabilities: BriefingCapabilities) {
  return async ({ hours, solar, advice, sunsetOpportunity, day, loaded, now, location }: BriefingGraphState) => {
    const sources = loaded.sunset ? [...day.sources, loaded.sunset.source] : day.sources;
    const input = { hours, solar, advice, sunsetOpportunity, sources, now, location };
    return { interpretation: capabilities.interpretation
      ? structuredClone(await capabilities.interpretation(structuredClone(input)))
      : createInterpretation(input) };
  };
}
