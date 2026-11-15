import "server-only";
import type { Source } from "../../domain/types";
import type { SourceName } from "../cache/source-key";
import { GFS_SOURCE, fetchGfs } from "../providers/open-meteo";
import { MET_SOURCE, fetchMet } from "../providers/met-norway";
import { CAMS_SOURCE, fetchCams } from "../providers/air-quality";
import type { SourceFetcher } from "./types";

export const SOURCE_NAMES = ["weather", "crosscheck", "air"] as const;
export const SOURCE_BASES: Record<SourceName, Source> = { weather: GFS_SOURCE, crosscheck: MET_SOURCE, air: CAMS_SOURCE };
export const SOURCE_FETCHERS: Record<SourceName, SourceFetcher> = { weather: fetchGfs, crosscheck: fetchMet, air: fetchCams };
