import "server-only";
import { createSummary } from "../../../content/summary";
import type { BriefingCapabilities } from "../contracts";
import type { BriefingGraphState } from "../state";

export function createSummaryNode(capabilities: BriefingCapabilities) {
  return async ({ hours, advice, interpretation }: BriefingGraphState) => ({
    summary: capabilities.summary ? structuredClone(await capabilities.summary(structuredClone({ hours, advice, interpretation })))
      : createSummary(hours, advice, interpretation),
  });
}
