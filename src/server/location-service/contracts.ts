import type { Location } from "../../domain/types";

export type LocationSearchDependencies = {
  searchLocations: (query: string) => Promise<Location[]>;
};
