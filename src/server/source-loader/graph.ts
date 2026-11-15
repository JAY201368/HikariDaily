import "server-only";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { SourceTarget } from "../../domain/normalization/snapshot";
import { targetSchema } from "../providers/shared/values";
import { emptySunsetField } from "../providers/sunset-ecmwf";
import { abortable } from "./abortable";
import { loadFixtureSources } from "./fixture-loader";
import { loadHourlySource } from "./hourly";
import { createSunsetLoader } from "./sunset";
import type { SunsetLoaded } from "./sunset";
import type { HourlySourceLoaded, LoadedSources, SourceGraphRuntime, SourceLoaderDependencies } from "./types";

/** Each parallel provider owns one channel; no completion-order dependent reducer. */
export const SourceGraphState = Annotation.Root({
  target: Annotation<SourceTarget>,
  weather: Annotation<HourlySourceLoaded>,
  crosscheck: Annotation<HourlySourceLoaded>,
  air: Annotation<HourlySourceLoaded>,
  sunset: Annotation<SunsetLoaded>,
  result: Annotation<LoadedSources>,
});
export type SourceGraphStateValue = typeof SourceGraphState.State;

/** Request resources are captured here, outside graph state. The caller owns its aggregate timer. */
export function createSourceGraph(deps: SourceLoaderDependencies, runtime: SourceGraphRuntime) {
  return new StateGraph(SourceGraphState)
    .addNode("validate_source_target", ({ target }) => {
      targetSchema.parse(target);
      if (!Number.isFinite(runtime.started) || runtime.started < 0) throw new Error("INVALID_SOURCE_CLOCK");
      return {};
    })
    .addNode("fixture_sources", ({ target }) => ({ result: loadFixtureSources(target, runtime.started, deps) }))
    .addNode("load_gfs", async ({ target }) => ({ weather: await loadHourlySource("weather", target, deps, runtime) }))
    .addNode("load_met", async ({ target }) => ({ crosscheck: await loadHourlySource("crosscheck", target, deps, runtime) }))
    .addNode("load_cams", async ({ target }) => ({ air: await loadHourlySource("air", target, deps, runtime) }))
    .addNode("load_ecmwf", async ({ target }) => {
      let sunset: SunsetLoaded;
      try {
        sunset = await abortable((deps.sunsetLoader ?? createSunsetLoader({ clock: runtime.clock }))(target,
          { signal: runtime.signal, enabled: deps.config.sunsetEnabled }), runtime.signal);
      } catch {
        sunset = { field: emptySunsetField(target, runtime.signal.aborted ? "AGGREGATE_TIMEOUT" : "NETWORK_ERROR"), warnings: [] };
      }
      return { sunset };
    })
    .addNode("aggregate_sources", ({ weather, crosscheck, air, sunset }) => {
      const hourly = [weather, crosscheck, air];
      const warnings = new Set<string>(deps.store ? [] : ["共享源缓存降级：CACHE_UNAVAILABLE；无跨实例缓存/冷却保证"]);
      for (const source of hourly) for (const warning of source.warnings) warnings.add(warning);
      for (const warning of sunset.warnings) warnings.add(warning);
      const result: LoadedSources = {
        snapshots: hourly.map(source => source.snapshot), sunset: sunset.field, mode: "live",
        cacheStatus: hourly.some(source => source.degraded) || sunset.warnings.length > 0 ? "degraded" : "shared-configured",
        warnings: [...warnings],
      };
      return { result };
    })
    .addEdge(START, "validate_source_target")
    .addConditionalEdges("validate_source_target", () => deps.config.mode === "fixture"
      ? ["fixture_sources"] : ["load_gfs", "load_met", "load_cams", "load_ecmwf"],
    ["fixture_sources", "load_gfs", "load_met", "load_cams", "load_ecmwf"])
    .addEdge(["load_gfs", "load_met", "load_cams", "load_ecmwf"], "aggregate_sources")
    .addEdge("fixture_sources", END)
    .addEdge("aggregate_sources", END)
    .compile();
}
