import "server-only";
import type { SourceTarget } from "../../domain/normalization/snapshot";
import type { SourceName } from "../cache/source-key";
import type { SourceRecord } from "../cache/source-store";
import { EMPTY_HTTP, SOURCE_TIMEOUT_MS } from "../providers/shared/http";
import type { ProviderResult } from "../providers/shared/values";
import { abortable } from "./abortable";
import { emptyHourlySource } from "./hourly-policy";
import type { SourceFetcher, SourceGraphRuntime } from "./types";

/** One upstream attempt, bounded by both the source and aggregate deadlines. */
export async function fetchHourlySource(name: SourceName, target: SourceTarget, record: SourceRecord | null,
  fetcher: SourceFetcher, userAgent: string | undefined, runtime: SourceGraphRuntime): Promise<ProviderResult> {
  const { clock } = runtime;
  const upstreamController = new AbortController();
  const abort = () => upstreamController.abort();
  runtime.signal.addEventListener("abort", abort, { once: true });
  const sourceTimer = setTimeout(abort, SOURCE_TIMEOUT_MS);
  let result: ProviderResult;
  try {
    result = await abortable(fetcher(target, {
      clock, signal: upstreamController.signal, userAgent,
      ifModifiedSince: name === "crosscheck" ? record?.http.lastModified ?? undefined : undefined,
    }), upstreamController.signal);
  } catch {
    const code = runtime.signal.aborted ? "AGGREGATE_TIMEOUT" : upstreamController.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR";
    result = { kind: "unavailable", snapshot: emptyHourlySource(name, target, code), http: EMPTY_HTTP, code };
  } finally {
    clearTimeout(sourceTimer); runtime.signal.removeEventListener("abort", abort);
  }
  return result;
}
