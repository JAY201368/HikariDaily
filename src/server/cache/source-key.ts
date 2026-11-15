import "server-only";
import { createHash } from "node:crypto";
import { ADAPTER_VERSIONS } from "../../domain/normalization/snapshot";
import type { SourceTarget } from "../../domain/normalization/snapshot";
import { GFS_FIELDS, GFS_SOURCE } from "../providers/open-meteo";
import { CAMS_FIELDS, CAMS_SOURCE } from "../providers/air-quality";
import { MET_SOURCE } from "../providers/met-norway";
import { coordinate } from "../providers/shared/values";

export type SourceName = keyof typeof ADAPTER_VERSIONS;
const sources = { weather: GFS_SOURCE, crosscheck: MET_SOURCE, air: CAMS_SOURCE };
const variables = {
  weather: Object.values(GFS_FIELDS).map((f) => f.field),
  air: Object.values(CAMS_FIELDS).map((f) => f.field),
  // Complete endpoint contract (the API itself has no variable selection).
  crosscheck: ["instant.details", "next_1_hours.details", "next_1_hours.summary.symbol_code"],
};
export function sourceCacheKey(name: SourceName, target: SourceTarget): string {
  const payload = JSON.stringify([
    "hikari-source-cache-v1", ADAPTER_VERSIONS[name], sources[name].id, sources[name].model,
    target.locationId, coordinate(target.latitude), coordinate(target.longitude), target.localDate,
    [...variables[name]].sort(), "Asia/Shanghai",
  ]);
  // Only the stable digest reaches platform key/observability surfaces.
  return `source-v1:${createHash("sha256").update(payload).digest("hex")}`;
}
