import "server-only";
/** Endpoint enum is the only entry point: callers cannot supply a proxy URL. */
export const ENDPOINTS = {
  weather: "https://api.open-meteo.com/v1/forecast",
  ecmwf: "https://api.open-meteo.com/v1/forecast",
  air: "https://air-quality-api.open-meteo.com/v1/air-quality",
  met: "https://api.met.no/weatherapi/locationforecast/2.0/complete",
} as const;
export const SOURCE_TIMEOUT_MS = 4_000;
export type HttpMetadata = { status: number | null; expires: string | null; lastModified: string | null; retryAfter: string | null };
export type HttpResult = { kind: "data"; body: unknown; http: HttpMetadata; fetchedAt: number }
  | { kind: "not-modified"; http: HttpMetadata }
  | { kind: "failure"; code: "HTTP_ERROR" | "INVALID_JSON" | "TIMEOUT" | "ABORTED" | "NETWORK_ERROR"; http: HttpMetadata };
export type RequestOptions = { fetcher?: typeof fetch; clock?: () => number; signal?: AbortSignal; headers?: Record<string, string> };
export const EMPTY_HTTP: HttpMetadata = { status: null, expires: null, lastModified: null, retryAfter: null };
export async function fetchSource(endpoint: keyof typeof ENDPOINTS, params: URLSearchParams, options: RequestOptions = {}): Promise<HttpResult> {
  const url = new URL(ENDPOINTS[endpoint]);
  url.search = params.toString();
  const controller = new AbortController();
  let timeout = false;
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(() => { timeout = true; controller.abort(); }, SOURCE_TIMEOUT_MS);
  let http = EMPTY_HTTP;
  try {
    if (controller.signal.aborted) return { kind: "failure", code: "ABORTED", http };
    const response = await (options.fetcher ?? fetch)(url, { signal: controller.signal, redirect: "error", cache: "no-store", headers: { Accept: "application/json", ...options.headers } });
    http = { status: response.status, expires: response.headers.get("expires"), lastModified: response.headers.get("last-modified"), retryAfter: response.headers.get("retry-after") };
    if (response.status === 304) return { kind: "not-modified", http };
    if (!response.ok) return { kind: "failure", code: "HTTP_ERROR", http };
    let body: unknown;
    try { body = await response.json(); } catch {
      return { kind: "failure", code: controller.signal.aborted ? timeout ? "TIMEOUT" : "ABORTED" : "INVALID_JSON", http };
    }
    if (controller.signal.aborted) return { kind: "failure", code: timeout ? "TIMEOUT" : "ABORTED", http };
    return { kind: "data", body, http, fetchedAt: (options.clock ?? Date.now)() };
  } catch { return { kind: "failure", code: timeout ? "TIMEOUT" : controller.signal.aborted ? "ABORTED" : "NETWORK_ERROR", http }; }
  finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
}
