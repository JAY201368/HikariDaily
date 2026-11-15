import "server-only";
import type { NormalizedDay, SourceTarget } from "../../domain/normalization";
import type { Briefing, Genre, GenreAdvice, Hour, Location, Opportunity, SolarEvents, Summary } from "../../domain/types";
import type { Interpretation, InterpretationInput } from "../../content/interpret";
import type { LoadedSources } from "../source-loader";

export type BriefingResult = {
  status: 200 | 400 | 404 | 503;
  data: Briefing | null;
  error: { code: string; message: string } | null;
};
export type BriefingDependencies = {
  clock: () => number;
  resolveLocation: (id: string) => Promise<Location>;
  loadSources: (target: SourceTarget) => Promise<LoadedSources>;
};
type Awaitable<T> = T | Promise<T>;
export type GenreAdviceInput = {
  day: NormalizedDay; solar: SolarEvents; location: Location; genre: Genre;
  now: number; sunsetOpportunity: Opportunity;
};
export type SummaryInput = {
  hours: Hour[]; advice: Record<Genre, GenreAdvice>; interpretation: Interpretation;
};
/** Async capabilities receive isolated working copies; their results still pass public schema validation. */
export type BriefingCapabilities = {
  genreAdvice?: Partial<Record<Genre, (input: GenreAdviceInput) => Awaitable<GenreAdvice>>>;
  interpretation?: (input: InterpretationInput) => Awaitable<Interpretation>;
  summary?: (input: SummaryInput) => Awaitable<Summary>;
};
