import "server-only";
import { unstable_cache } from "next/cache";
import { createLocationProvider, createLocationUpstream, GEOCODING_VERSION, LOCATION_CACHE_SECONDS } from "./adapter";

const upstream = createLocationUpstream();
// Function arguments are part of Next's shared Data Cache key. Never cache exceptions.
const provider = createLocationProvider({
  search: unstable_cache(upstream.search, [GEOCODING_VERSION, "search", "zh", "CN", "10"], { revalidate: LOCATION_CACHE_SECONDS }),
  resolve: unstable_cache(upstream.resolve, [GEOCODING_VERSION, "resolve", "zh", "CN"], { revalidate: LOCATION_CACHE_SECONDS }),
});
export const { searchLocations, resolveLocation } = provider;
export { LOCATION_ATTRIBUTION, LOCATION_FALLBACK_NOTE } from "./adapter";
