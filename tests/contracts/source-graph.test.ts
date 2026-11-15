import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createSourceGraph, createSourceLoader } from "../../src/server/source-loader/loader";
import { readSourceConfig } from "../../src/server/source-loader/config";
import { demoSourceSnapshots, demoSunsetField } from "../../src/server/source-loader/fixtures";
import type { SourceFetcher, SourceGraphRuntime } from "../../src/server/source-loader/types";
import { EMPTY_HTTP } from "../../src/server/providers/shared/http";
import { SOURCE_TARGET, FETCHED_AT } from "../fixtures/weather-sources";

const runtime = (): SourceGraphRuntime => ({
  clock: () => FETCHED_AT, started: FETCHED_AT, requestId: "synthetic-source-graph",
  signal: new AbortController().signal,
});

describe("LangGraph source workflow (synthetic transports)", () => {
  it("starts four independent providers before joining, and emits one aggregate update", async () => {
    const started: string[] = [];
    let release!: () => void;
    let allStarted!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const providersStarted = new Promise<void>(resolve => { allStarted = resolve; });
    const wait = async (name: string) => {
      started.push(name);
      if (started.length === 4) allStarted();
      await gate;
    };
    const fetchers = Object.fromEntries((["weather", "crosscheck", "air"] as const).map((name, index) => [name,
      vi.fn<SourceFetcher>(async target => {
        await wait(name);
        return { kind: "snapshot", snapshot: demoSourceSnapshots(target, FETCHED_AT)[index], http: EMPTY_HTTP };
      }),
    ]));
    const graph = createSourceGraph({
      config: readSourceConfig({ NODE_ENV: "test", MET_NO_USER_AGENT: "HikariSynthetic/1.0 graph@hikaridaily.invalid" }),
      store: { get: async () => null, set: async () => {} }, fetchers,
      sunsetLoader: async target => { await wait("sunset"); return { field: demoSunsetField(target, FETCHED_AT), warnings: [] }; },
    }, runtime());
    const updates: Record<string, unknown>[] = [];
    const consume = (async () => {
      for await (const update of await graph.stream({ target: SOURCE_TARGET }, { streamMode: "updates" })) updates.push(update);
    })();
    await providersStarted;
    expect(started.sort()).toEqual(["air", "crosscheck", "sunset", "weather"]);
    expect(updates.some(update => "aggregate_sources" in update)).toBe(false);
    release();
    await consume;
    expect(updates.flatMap(update => Object.keys(update)).sort()).toEqual([
      "aggregate_sources", "load_cams", "load_ecmwf", "load_gfs", "load_met", "validate_source_target",
    ]);
    const result = (updates.find(update => "aggregate_sources" in update)!.aggregate_sources as {
      result: { snapshots: { source: { id: string } }[]; cacheStatus: string };
    }).result;
    expect(result.snapshots.map(snapshot => snapshot.source.id)).toEqual(["open-meteo-gfs", "met-norway", "open-meteo-cams"]);
    expect(result.cacheStatus).toBe("shared-configured");
    for (const fetcher of Object.values(fetchers)) expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("routes fixtures without executing live provider or aggregate nodes", async () => {
    const upstream = vi.fn<SourceFetcher>();
    const graph = createSourceGraph({
      config: readSourceConfig({ NODE_ENV: "test", HIKARI_SOURCE_MODE: "fixture" }),
      fetchers: { weather: upstream, crosscheck: upstream, air: upstream },
      fixture: demoSourceSnapshots, sunsetFixture: demoSunsetField,
    }, runtime());
    const nodes: string[] = [];
    for await (const update of await graph.stream({ target: SOURCE_TARGET }, { streamMode: "updates" })) {
      nodes.push(...Object.keys(update));
    }
    expect(nodes).toEqual(["validate_source_target", "fixture_sources"]);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("isolates simultaneous invocations, targets and request logs", async () => {
    const logger = vi.fn();
    const loader = createSourceLoader({
      config: readSourceConfig({ NODE_ENV: "test", HIKARI_MET_ENABLED: "false", HIKARI_SUNSET_ENABLED: "false" }),
      clock: () => FETCHED_AT, logger,
      fetchers: Object.fromEntries((["weather", "air"] as const).map((name, index) => [name,
        async target => {
          await Promise.resolve();
          return { kind: "snapshot", snapshot: demoSourceSnapshots(target, FETCHED_AT)[index === 0 ? 0 : 2], http: EMPTY_HTTP };
        },
      ])),
    });
    const other = { ...SOURCE_TARGET, locationId: "geonames:123", latitude: 30 };
    const [first, second] = await Promise.all([loader(SOURCE_TARGET), loader(other)]);
    expect(first.snapshots.every(snapshot => snapshot.target.locationId === SOURCE_TARGET.locationId)).toBe(true);
    expect(second.snapshots.every(snapshot => snapshot.target.locationId === other.locationId)).toBe(true);
    expect(new Set(logger.mock.calls.map(([event]) => event.requestId)).size).toBe(2);
  });
});
