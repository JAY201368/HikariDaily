import "server-only";
import type { Location } from "../../../domain/types";
import { LocationError } from "../../http/errors";
import { parseLocationId, parseLocationQuery } from "./input";
import { LOCATION_CACHE_SECONDS } from "./metadata";
import type { LocationLoader, LocationCacheEntry } from "./types";

/** Enforce the cache's 24h semantic age even when its backing store returns old data. */
export function createLocationProvider(loader: LocationLoader, now: () => number = Date.now) {
  function fresh<T>(entry: LocationCacheEntry<T>): T {
    const age = now() - entry.fetchedAt;
    if (!Number.isFinite(age) || age < 0 || age >= LOCATION_CACHE_SECONDS * 1000) throw new LocationError("LOCATION_UNAVAILABLE");
    return entry.data;
  }
  return {
    async searchLocations(query: string): Promise<Location[]> { return fresh(await loader.search(parseLocationQuery(query))); },
    async resolveLocation(id: string): Promise<Location> {
      const data = fresh(await loader.resolve(parseLocationId(id)));
      if (!data) throw new LocationError("LOCATION_NOT_FOUND");
      return data;
    },
  };
}
