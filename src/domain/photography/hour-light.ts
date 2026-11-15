import type { NormalizedDay } from "../normalization";
import type { LightAssessment, Location, SolarEvents } from "../types";
import { assessLight } from "./light";

/** Assess each normalized hour at its midpoint without fetching or interpolating weather. */
export function analyzeHourlyLight(day: NormalizedDay, solar: SolarEvents, location: Location): LightAssessment[] {
  return day.hours.map((hour) => assessLight(
    (Date.parse(hour.start) + Date.parse(hour.end)) / 2, location, hour.weather.cloudTotal, solar,
  ));
}
