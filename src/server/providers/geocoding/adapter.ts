import "server-only";

/** Compatibility surface. Each implementation module owns one provider responsibility. */
export { GEOCODING_VERSION, LOCATION_CACHE_SECONDS, LOCATION_FALLBACK_NOTE, LOCATION_ATTRIBUTION } from "./metadata";
export { parseLocationQuery, parseLocationId } from "./input";
export { normalizeLocation } from "./normalization";
export { createLocationUpstream } from "./upstream";
export { createLocationProvider } from "./provider";
export type { LocationCacheEntry, LocationLoader } from "./types";
