import "server-only";
import { BriefingSchema, RULES_VERSION, SCHEMA_VERSION } from "../../../domain/schemas";
import { shanghaiIso } from "../../../domain/time";
import { briefingResult } from "../result";
import type { BriefingGraphState } from "../state";

export function assembleBriefing(state: BriefingGraphState) {
  const { now, localDate, location, quality, sources, hours, sunsetOpportunity, advice, interpretation, summary, solar, warnings } = state;
  return { candidate: { schemaVersion: SCHEMA_VERSION, rulesVersion: RULES_VERSION, generatedAt: shanghaiIso(now), localDate,
    location, state: quality, sources, hours, sunsetOpportunity, advice, interpretation, summary, solar, warnings } };
}
export function validateBriefing({ candidate }: BriefingGraphState) {
  return { data: BriefingSchema.parse(candidate) };
}
export function buildResult({ data }: BriefingGraphState) {
  return { result: briefingResult(data) };
}
