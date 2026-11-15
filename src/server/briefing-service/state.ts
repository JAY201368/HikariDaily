import "server-only";
import { Annotation } from "@langchain/langgraph";
import type { NormalizedDay, SourceTarget } from "../../domain/normalization";
import type { Briefing, Genre, GenreAdvice, Hour, LightAssessment, Location, Opportunity, RiskNote, SolarEvents, Source, Summary } from "../../domain/types";
import type { Interpretation } from "../../content/interpret";
import type { LoadedSources } from "../source-loader";
import type { BriefingResult } from "./contracts";

export const BriefingInput = Annotation.Root({ place: Annotation<unknown>() });
export const BriefingOutput = Annotation.Root({ result: Annotation<BriefingResult>() });
/** Request data only. Parallel nodes own distinct channels; no clients, clocks or controllers in state. */
export const BriefingState = Annotation.Root({
  ...BriefingInput.spec,
  id: Annotation<string>(), requestedAt: Annotation<number>(), now: Annotation<number>(),
  location: Annotation<Location>(), localDate: Annotation<string>(), target: Annotation<SourceTarget>(),
  loaded: Annotation<LoadedSources>(), solar: Annotation<SolarEvents>(), day: Annotation<NormalizedDay>(),
  light: Annotation<LightAssessment[]>(), risks: Annotation<RiskNote[][]>(), hours: Annotation<Hour[]>(),
  sunsetOpportunity: Annotation<Opportunity>(),
  landscapeAdvice: Annotation<GenreAdvice>(), portraitAdvice: Annotation<GenreAdvice>(), streetAdvice: Annotation<GenreAdvice>(),
  advice: Annotation<Record<Genre, GenreAdvice>>(), interpretation: Annotation<Interpretation>(), summary: Annotation<Summary>(),
  sources: Annotation<Source[]>(), warnings: Annotation<string[]>(), quality: Annotation<Briefing["state"]>(),
  candidate: Annotation<Briefing>(), data: Annotation<Briefing>(), ...BriefingOutput.spec,
});
export type BriefingGraphState = typeof BriefingState.State;
