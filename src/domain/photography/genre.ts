import type { NormalizedDay } from "../normalization";
import type { Genre, GenreAdvice, Location, Opportunity, SolarEvents } from "../types";
import { createGenreAdvice } from "../../content/advice";

/** A single genre use case, shared by the facade and independently scheduled graph nodes. */
export function analyzeGenreAdvice(day: NormalizedDay, solar: SolarEvents, location: Location,
  genre: Genre, now: string | number, sunsetOpportunity: Opportunity): GenreAdvice {
  return createGenreAdvice(day, solar, location, genre, now, sunsetOpportunity);
}
