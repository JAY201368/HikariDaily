import type { Location } from "../../../domain/types";

export type LocationCacheEntry<T> = { fetchedAt: number; data: T };
export type LocationLoader = {
  search(query: string): Promise<LocationCacheEntry<Location[]>>;
  resolve(id: string): Promise<LocationCacheEntry<Location | null>>;
};
