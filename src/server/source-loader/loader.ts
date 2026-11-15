import "server-only";
import { randomUUID } from "node:crypto";
import type { SourceTarget } from "../../domain/normalization/snapshot";
import { targetSchema } from "../providers/shared/values";
import { createSourceGraph } from "./graph";
import type { LoadedSources, SourceLoaderDependencies } from "./types";

export const AGGREGATE_TIMEOUT_MS = 6_000;
export { createSourceGraph, SourceGraphState } from "./graph";
export type { LoadedSources, SourceLog, SourceFetcher, SourceLoaderDependencies, SourceGraphRuntime } from "./types";

/** Own request resources only; all source orchestration runs through LangGraph. */
export function createSourceLoader(deps: SourceLoaderDependencies) {
  const clock = deps.clock ?? Date.now;
  return async function loadSources(target: SourceTarget): Promise<LoadedSources> {
    targetSchema.parse(target);
    const started = clock();
    if (!Number.isFinite(started) || started < 0) throw new Error("INVALID_SOURCE_CLOCK");
    const controller = new AbortController();
    const timer = deps.config.mode === "live" ? setTimeout(() => controller.abort(), AGGREGATE_TIMEOUT_MS) : null;
    try {
      const graph = createSourceGraph(deps, { clock, started, requestId: randomUUID(), signal: controller.signal });
      const state = await graph.invoke({ target });
      return state.result;
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  };
}
