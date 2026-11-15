import type { SourceSnapshot, SourceTarget } from "../../domain/normalization/snapshot";
import type { SunsetCloudField } from "../../domain/photography/sunset-input";
import type { SharedSourceStore, SourceError } from "../cache/source-store";
import type { SourceName } from "../cache/source-key";
import type { ProviderOptions, ProviderResult } from "../providers/shared/values";
import type { SourceConfig } from "./config";
import type { SunsetLoaded } from "./sunset";

export type SourceFetcher = (target: SourceTarget, options: ProviderOptions & { userAgent?: string; ifModifiedSince?: string }) => Promise<ProviderResult>;
export type SourceLog = { requestId: string; duration: number; sourceStatus: string; errorCode: SourceError | null };
export type LoadedSources = {
  snapshots: SourceSnapshot[]; mode: "live" | "fixture";
  cacheStatus: "shared-configured" | "degraded" | "unused"; warnings: string[];
  sunset?: SunsetCloudField;
};
export type SourceLoaderDependencies = {
  config: SourceConfig; store?: SharedSourceStore | null; clock?: () => number;
  fetchers?: Partial<Record<SourceName, SourceFetcher>>; logger?: (event: SourceLog) => void;
  fixture?: (target: SourceTarget, now: number) => SourceSnapshot[];
  sunsetFixture?: (target: SourceTarget, now: number) => SunsetCloudField;
  sunsetLoader?: (target: SourceTarget, options: { signal: AbortSignal; enabled: boolean }) => Promise<SunsetLoaded>;
};
/** Request resources stay in closures, outside serializable graph state. */
export type SourceGraphRuntime = {
  clock: () => number; started: number; requestId: string; signal: AbortSignal;
};
export type HourlySourceLoaded = { snapshot: SourceSnapshot; warnings: string[]; degraded: boolean };
