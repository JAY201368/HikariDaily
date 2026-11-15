import "server-only";
import type { SourceTarget } from "../../domain/normalization/snapshot";
import { createPostgresSourceStore, createPostgresSunsetStore } from "../cache/postgres-source-store";
import { createVercelSourceStore, createVercelSunsetStore } from "../cache/vercel-source-store";
import { readSourceConfig } from "./config";
import { demoSourceSnapshots, demoSunsetField } from "./fixtures";
import { createSourceLoader } from "./loader";
import { createSunsetLoader } from "./sunset";

/** Server-only entry for T07. No client cache bypass or arbitrary upstream configuration. */
export async function loadSources(target: SourceTarget) {
  const config = readSourceConfig();
  const postgres = config.mode === "live" && config.cache === "postgres" && process.env.HIKARI_DATABASE_URL;
  const store = config.mode !== "live" ? null : config.cacheNamespace
    ? createVercelSourceStore(config.cacheNamespace)
    : postgres ? createPostgresSourceStore() : null;
  const sunsetStore = config.mode !== "live" || !config.sunsetEnabled ? null : config.cacheNamespace
    ? createVercelSunsetStore(config.cacheNamespace)
    : postgres ? createPostgresSunsetStore() : null;
  return createSourceLoader({
    config, store, fixture: demoSourceSnapshots, sunsetFixture: demoSunsetField,
    sunsetLoader: createSunsetLoader({ store: sunsetStore }),
    logger: (event) => console.info(JSON.stringify(event)),
  })(target);
}
export type { LoadedSources, SourceLog } from "./loader";
export { createSourceGraph, SourceGraphState } from "./graph";
export type { SourceLoaderDependencies, SourceGraphRuntime } from "./types";
