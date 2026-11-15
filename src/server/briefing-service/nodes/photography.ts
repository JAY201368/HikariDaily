import "server-only";
import { analyzeHourlyLight, analyzeHourlyRisks, assemblePhotographyHours, assessSunsetOpportunity } from "../../../domain/photography";
import type { BriefingGraphState } from "../state";

export function analyzeLight({ day, solar, location }: BriefingGraphState) {
  return { light: analyzeHourlyLight(day, solar, location) };
}
export function analyzeRisks({ day }: BriefingGraphState) {
  return { risks: analyzeHourlyRisks(day) };
}
export function assessSunset({ day, solar, now, loaded }: BriefingGraphState) {
  return { sunsetOpportunity: assessSunsetOpportunity(day, solar, now, loaded.sunset) };
}
export function assembleHours({ day, light, risks }: BriefingGraphState) {
  return { hours: assemblePhotographyHours(day, light, risks) };
}
