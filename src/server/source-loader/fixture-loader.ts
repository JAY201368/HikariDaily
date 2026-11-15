import "server-only";
import { SourceSnapshotSchema } from "../../domain/normalization/snapshot";
import type { SourceTarget } from "../../domain/normalization/snapshot";
import { SunsetCloudFieldSchema } from "../../domain/photography/sunset-input";
import { emptySunsetField } from "../providers/sunset-ecmwf";
import type { LoadedSources, SourceLoaderDependencies } from "./types";

/** Explicit synthetic mode cannot read caches or call any upstream provider. */
export function loadFixtureSources(target: SourceTarget, started: number, deps: SourceLoaderDependencies): LoadedSources {
  if (deps.config.production) throw new Error("PRODUCTION_FIXTURE_FORBIDDEN");
  if (!deps.fixture) throw new Error("FIXTURE_NOT_CONFIGURED");
  const snapshots = deps.fixture(target, started).map((s) => SourceSnapshotSchema.parse(s));
  const sunset = deps.sunsetFixture ? SunsetCloudFieldSchema.parse(deps.sunsetFixture(target, started))
    : emptySunsetField(target, "FIXTURE_NOT_CONFIGURED", true);
  return { snapshots, sunset, mode: "fixture", cacheStatus: "unused", warnings: ["演示数据：人工合成，非真实预报或观测"] };
}
