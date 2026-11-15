import "server-only";
import { z } from "zod";
import { LocationError } from "../../http/errors";

/** Only fixed Open-Meteo paths and controlled parameters reach the network. */
export function createLocationRequest(fetcher: typeof fetch = (...args) => fetch(...args)) {
  return async function request(path: "search" | "get", params: Record<string, string>): Promise<unknown> {
    const url = new URL(`https://geocoding-api.open-meteo.com/v1/${path}`);
    url.search = new URLSearchParams({ ...params, language: "zh", format: "json" }).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_000);
    try {
      const response = await fetcher(url, { signal: controller.signal, cache: "no-store", redirect: "error" });
      if (path === "get" && response.status === 404) return null;
      if (path === "get" && response.status === 400) {
        const error = z.object({ error: z.literal(true), reason: z.literal("Location ID not found.") }).safeParse(await response.json());
        if (error.success) return null;
        throw new LocationError("LOCATION_UNAVAILABLE");
      }
      if (!response.ok) throw new LocationError("LOCATION_UNAVAILABLE");
      return await response.json();
    } catch { throw new LocationError("LOCATION_UNAVAILABLE"); }
    finally { clearTimeout(timer); }
  }
}
