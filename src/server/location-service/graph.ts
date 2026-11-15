import "server-only";
import { END, START, StateGraph } from "@langchain/langgraph";
import type { LocationSearchDependencies } from "./contracts";
import { LocationSearchInput, LocationSearchOutput, LocationSearchState } from "./state";
import { createSearchLocationsNode, validateQuery, validateResults } from "./nodes";

/** Search validation and output validation surround the existing cached provider. */
export function createLocationSearchGraph(deps: LocationSearchDependencies) {
  return new StateGraph(LocationSearchState, { input: LocationSearchInput, output: LocationSearchOutput })
    .addNode("validate_query", validateQuery)
    .addNode("search_locations", createSearchLocationsNode(deps))
    .addNode("validate_results", validateResults)
    .addEdge(START, "validate_query")
    .addEdge("validate_query", "search_locations")
    .addEdge("search_locations", "validate_results")
    .addEdge("validate_results", END)
    .compile();
}
