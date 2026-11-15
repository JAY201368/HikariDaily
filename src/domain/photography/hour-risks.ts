import type { NormalizedDay } from "../normalization";
import type { RiskNote } from "../types";
import { assessHourRisks } from "./risks";

/** Keep per-source hazard assessment independent of light and recommendation scoring. */
export function analyzeHourlyRisks(day: NormalizedDay): RiskNote[][] {
  return day.hours.map(assessHourRisks);
}
