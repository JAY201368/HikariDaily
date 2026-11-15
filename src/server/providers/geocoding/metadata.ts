import "server-only";

export const GEOCODING_VERSION = "geocoding-v1";
export const LOCATION_CACHE_SECONDS = 86_400;
export const LOCATION_FALLBACK_NOTE = "区县无结果时，请搜索并选择所属城市。";
export const LOCATION_ATTRIBUTION = {
  provider: "Open-Meteo Geocoding", dataset: "GeoNames",
  url: "https://www.geonames.org/", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
} as const;
