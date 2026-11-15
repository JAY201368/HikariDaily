import "server-only";
import { LocationSchema } from "../../domain/schemas";
import { LocationError } from "../http/errors";
import { parseLocationQuery } from "../providers/geocoding/input";
import type { LocationSearchDependencies } from "./contracts";
import type { LocationSearchGraphState } from "./state";

export function validateQuery({ query }: LocationSearchGraphState) {
  return { validQuery: parseLocationQuery(query) };
}
export function createSearchLocationsNode(deps: LocationSearchDependencies) {
  return async ({ validQuery }: LocationSearchGraphState) => {
    try {
      return { candidates: await deps.searchLocations(validQuery) };
    } catch (error) {
      throw error instanceof LocationError ? error : new LocationError("LOCATION_UNAVAILABLE");
    }
  };
}
export function validateResults({ candidates }: LocationSearchGraphState) {
  const parsed = LocationSchema.array().max(10).safeParse(candidates);
  if (!parsed.success) throw new LocationError("LOCATION_UNAVAILABLE");
  return { locations: parsed.data };
}
