import "server-only";
import { z } from "zod";
import type { Location } from "../../../domain/types";
import { LocationError } from "../../http/errors";
import { parseLocationId, parseLocationQuery } from "./input";
import { normalizeLocation, GeocodingRecordSchema } from "./normalization";
import { createLocationRequest } from "./transport";
import type { LocationLoader } from "./types";

/** Normalize fixed-provider responses; records carry their original download time. */
export function createLocationUpstream(fetcher: typeof fetch = (...args) => fetch(...args), now: () => number = Date.now): LocationLoader {
  const request = createLocationRequest(fetcher);
  return {
    async search(query) {
      const raw = await request("search", { name: parseLocationQuery(query), countryCode: "CN", count: "10" });
      const parsed = z.object({ results: z.array(z.unknown()).optional() }).safeParse(raw);
      if (!parsed.success || (typeof raw === "object" && raw !== null && "error" in raw)) throw new LocationError("LOCATION_UNAVAILABLE");
      const unique = new Map<string, Location>();
      for (const value of parsed.data.results ?? []) {
        const location = normalizeLocation(value);
        if (location) unique.set(location.id, location);
      }
      return { fetchedAt: now(), data: [...unique.values()].slice(0, 10) };
    },
    async resolve(id) {
      const validId = parseLocationId(id);
      const raw = await request("get", { id: validId.slice(9) });
      if (raw === null || (typeof raw === "object" && raw !== null && Object.keys(raw).length === 0)) return { fetchedAt: now(), data: null };
      if (!GeocodingRecordSchema.safeParse(raw).success) throw new LocationError("LOCATION_UNAVAILABLE");
      const data = normalizeLocation(raw);
      if (`geonames:${GeocodingRecordSchema.parse(raw).id}` !== validId) throw new LocationError("LOCATION_UNAVAILABLE");
      return { fetchedAt: now(), data };
    },
  };
}
