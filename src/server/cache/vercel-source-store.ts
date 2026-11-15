import "server-only";
import { getCache } from "@vercel/functions";
import type { SharedSourceStore } from "./source-store";
import type { SunsetSourceStore } from "./sunset-store";

/** Construct only after the external runtime verification gate. SDK backend fallback is not publicly detectable. */
export function createVercelSourceStore(namespace: string): SharedSourceStore {
  const cache = getCache({ namespace, keyHashFunction: (key) => key });
  return {
    get: (key) => cache.get(key),
    set: (key, record, ttlSeconds) => cache.set(key, record, { ttl: ttlSeconds, name: "", tags: ["hikari-sources-v1"] }),
  };
}

/** Separate record/key contract, subject to the same verified runtime gate. */
export function createVercelSunsetStore(namespace: string): SunsetSourceStore {
  const cache = getCache({ namespace, keyHashFunction: (key) => key });
  return {
    get: (key) => cache.get(key),
    set: (key, record, ttlSeconds) => cache.set(key, record, { ttl: ttlSeconds, name: "", tags: ["hikari-sunset-2026-10"] }),
  };
}
