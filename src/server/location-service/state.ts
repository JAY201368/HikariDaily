import "server-only";
import { Annotation } from "@langchain/langgraph";
import type { Location } from "../../domain/types";

export const LocationSearchInput = Annotation.Root({ query: Annotation<unknown>() });
export const LocationSearchOutput = Annotation.Root({ locations: Annotation<Location[]>() });
export const LocationSearchState = Annotation.Root({
  ...LocationSearchInput.spec,
  validQuery: Annotation<string>(),
  candidates: Annotation<Location[]>(),
  ...LocationSearchOutput.spec,
});
export type LocationSearchGraphState = typeof LocationSearchState.State;
