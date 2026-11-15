import type { NormalizedDay } from "../normalization";
import type { GenreAdvice, Location, SolarEvents } from "../types";
import { RULES_VERSION } from "../schemas";
import { createSummary } from "../../content/summary";
import { createInterpretation } from "../../content/interpret";
import { validatePhotographyContext } from "./context";
import { analyzeHourlyLight } from "./hour-light";
import { analyzeHourlyRisks } from "./hour-risks";
import { assemblePhotographyHours } from "./hours";
import { analyzeGenreAdvice } from "./genre";
import { assessSunsetOpportunity } from "./sunset";
import { GENRES } from "./windows";
import type { SunsetCloudField } from "./sunset-input";

export { assessLight, assessLightAtPosition } from "./light";
export { assessHourRisks, assessSourceRisks, excludesOutdoor } from "./risks";
export { assessSunsetOpportunity } from "./sunset";
export { validatePhotographyContext } from "./context";
export { analyzeHourlyLight } from "./hour-light";
export { analyzeHourlyRisks } from "./hour-risks";
export { assemblePhotographyHours } from "./hours";
export { analyzeGenreAdvice } from "./genre";

/** T07 entry: no IO/implicit clock; returns existing Briefing fields, no internal scores. */
export function analyzePhotography(day: NormalizedDay, solar: SolarEvents, location: Location, now: string | number, sunset?: SunsetCloudField) {
  validatePhotographyContext(day, location, now);
  const hours = assemblePhotographyHours(day, analyzeHourlyLight(day, solar, location), analyzeHourlyRisks(day));
  const sunsetOpportunity = assessSunsetOpportunity(day, solar, now, sunset);
  const advice = Object.fromEntries(GENRES.map((genre) => [genre,
    analyzeGenreAdvice(day, solar, location, genre, now, sunsetOpportunity)])) as Record<typeof GENRES[number], GenreAdvice>;
  const sources = sunset ? [...day.sources, sunset.source] : day.sources;
  const interpretation = createInterpretation({ hours, solar, advice, sunsetOpportunity, sources, now, location });
  return { rulesVersion: RULES_VERSION, hours, sunsetOpportunity, advice,
    summary: createSummary(hours, advice, interpretation), interpretation };
}
