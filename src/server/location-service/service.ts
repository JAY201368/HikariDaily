import "server-only";
import type { Location } from "../../domain/types";
import { LocationError } from "../http/errors";
import type { LocationSearchDependencies } from "./contracts";
import { createLocationSearchGraph } from "./graph";

export function createLocationSearchService(deps: LocationSearchDependencies) {
  const graph = createLocationSearchGraph(deps);
  return async function searchLocations(query: unknown): Promise<Location[]> {
    try {
      const { locations } = await graph.invoke({ query });
      if (!locations) throw new LocationError("LOCATION_UNAVAILABLE");
      return locations;
    } catch (error) {
      throw error instanceof LocationError ? error : new LocationError("LOCATION_UNAVAILABLE");
    }
  };
}
