import "server-only";
import { searchLocations as searchCachedLocations } from "../providers/geocoding";
import { createLocationSearchService } from "./service";

export const searchLocations = createLocationSearchService({ searchLocations: searchCachedLocations });
export { createLocationSearchService } from "./service";
export { createLocationSearchGraph } from "./graph";
export type { LocationSearchDependencies } from "./contracts";
