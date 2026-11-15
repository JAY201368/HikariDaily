import "server-only";
import { z } from "zod";
import { InstantSchema } from "../../../domain/schemas";
import { ADAPTER_VERSIONS, SOURCE_IDS, createSnapshot, finishSnapshot, missing } from "../../../domain/normalization/snapshot";
import type { SourceTarget, FieldSemantics } from "../../../domain/normalization/snapshot";
import { fetchSource, EMPTY_HTTP } from "../shared/http";
import { coordinate, sourceBase, targetSchema, unavailable, validNumber } from "../shared/values";
import type { ProviderOptions, ProviderResult } from "../shared/values";
export const MET_SOURCE = sourceBase(SOURCE_IDS.crosscheck, "MET Norway", "Locationforecast 2.0 complete / ECMWF global", "ECMWF global (MET post-processing)", "全球约9km，部分时段6小时；不拆分累计量", "https://api.met.no/doc/License");
const details = z.record(z.string(), z.unknown());
const period = z.object({ details: details.optional(), summary: z.object({ symbol_code: z.unknown().optional() }).optional() });
export const MetResponseSchema = z.object({
  type: z.literal("Feature"), geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]).rest(z.number()) }),
  properties: z.object({ meta: z.object({ updated_at: InstantSchema.optional(), units: details }),
    timeseries: z.array(z.object({ time: InstantSchema, data: z.object({ instant: z.object({ details }), next_1_hours: period.optional() }) })).max(1000) }),
}).superRefine((raw, ctx) => {
  raw.properties.timeseries.forEach((row, i, rows) => {
    const epoch = Date.parse(row.time);
    if (epoch % 3_600_000 !== 0 || (i && epoch <= Date.parse(rows[i - 1].time))) ctx.addIssue({ code: "custom", message: "MET时间轴须整点严格递增", path: ["properties", "timeseries", i] });
  });
});
/** Explicit MET symbol families; unknown codes never become clear weather. */
export const MET_SYMBOLS: Readonly<Record<string, number>> = {
  clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45,
  lightrain: 61, rain: 63, heavyrain: 65,
  lightsnow: 71, snow: 73, heavysnow: 75,
  lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82,
  lightsnowshowers: 85, snowshowers: 85, heavysnowshowers: 86,
  lightrainandthunder: 95, rainandthunder: 95, heavyrainandthunder: 95,
  lightsleetandthunder: 95, sleetandthunder: 95, heavysleetandthunder: 95,
  lightsnowandthunder: 95, snowandthunder: 95, heavysnowandthunder: 95,
  lightrainshowersandthunder: 95, rainshowersandthunder: 95, heavyrainshowersandthunder: 95,
  lightssleetshowersandthunder: 95, sleetshowersandthunder: 95, heavysleetshowersandthunder: 95,
  lightssnowshowersandthunder: 95, snowshowersandthunder: 95, heavysnowshowersandthunder: 95,
};
export const MET_UNREPRESENTABLE_SYMBOLS = ["lightsleet", "sleet", "heavysleet", "lightsleetshowers", "sleetshowers", "heavysleetshowers"] as const;
export function metWeatherCode(symbol: unknown): number | null {
  if (typeof symbol !== "string") return null;
  const key = symbol.replace(/_(day|night|polartwilight)$/, "");
  return Object.hasOwn(MET_SYMBOLS, key) ? MET_SYMBOLS[key] : null;
}
const MET_FIELDS: Record<string, { field: string; unit: string; timing: FieldSemantics["timing"] }> = {
  temperature: { field: "air_temperature", unit: "celsius", timing: "instant" }, humidity: { field: "relative_humidity", unit: "%", timing: "instant" },
  windSpeed: { field: "wind_speed", unit: "m/s", timing: "instant" }, windFrom: { field: "wind_from_direction", unit: "degrees", timing: "instant" },
  cloudTotal: { field: "cloud_area_fraction", unit: "%", timing: "instant" }, cloudLow: { field: "cloud_area_fraction_low", unit: "%", timing: "instant" },
  cloudMid: { field: "cloud_area_fraction_medium", unit: "%", timing: "instant" }, cloudHigh: { field: "cloud_area_fraction_high", unit: "%", timing: "instant" },
  precipitation: { field: "precipitation_amount", unit: "mm", timing: "following-hour" },
};
export function parseMet(body: unknown, target: SourceTarget, fetchedAt: number) {
  targetSchema.parse(target);
  const raw = MetResponseSchema.parse(body);
  const snapshot = createSnapshot({ ...MET_SOURCE }, ADAPTER_VERSIONS.crosscheck, target);
  snapshot.source.issuedAt = raw.properties.meta.updated_at ?? null;
  snapshot.grid = { latitude: raw.geometry.coordinates[1], longitude: raw.geometry.coordinates[0] };
  snapshot.notes.push("MET分层云采用独立定义；缺少小时累计时保留缺失", "天气符号近似映射为WMO分类");
  const rows = new Map(raw.properties.timeseries.map((row) => [Date.parse(row.time), row]));
  for (const [name, config] of Object.entries(MET_FIELDS)) {
    snapshot.semantics[name] = { upstreamField: config.field, unit: config.unit, timing: config.timing, notes: [] };
    for (const hour of snapshot.hours) {
      const row = rows.get(Date.parse(hour.start));
      const value = config.timing === "following-hour" ? row?.data.next_1_hours?.details?.[config.field] : row?.data.instant.details[config.field];
      (hour.weather as Record<string, ReturnType<typeof missing>>)[name] = raw.properties.meta.units[config.field] !== config.unit
        ? missing(`${name}: 未知或不兼容单位`) : validNumber(name, value, MET_SOURCE.id);
    }
  }
  snapshot.semantics.weatherCode = { upstreamField: "next_1_hours.summary.symbol_code", unit: "WMO approximation", timing: "following-hour", notes: ["MET天气类型近似映射"] };
  for (const hour of snapshot.hours) {
    const symbol = rows.get(Date.parse(hour.start))?.data.next_1_hours?.summary?.symbol_code;
    const code = metWeatherCode(symbol);
    (hour.weather as Record<string, ReturnType<typeof missing>>).weatherCode = code === null
      ? missing(typeof symbol === "string" && MET_UNREPRESENTABLE_SYMBOLS.includes(symbol.replace(/_(day|night|polartwilight)$/, "") as typeof MET_UNREPRESENTABLE_SYMBOLS[number])
        ? "MET雨夹雪在公开WMO集合中无等价类型" : "MET未知或缺失symbol_code")
      : validNumber("weatherCode", code, MET_SOURCE.id, ["由MET下一小时symbol近似映射"]);
  }
  return finishSnapshot(snapshot, fetchedAt);
}
/** Caller must supply a real, verified project identity; syntax cannot prove ownership. */
export function validMetUserAgent(ua: string | undefined): ua is string {
  return !!ua && ua.length >= 12 && ua.length <= 512 && !/[\r\n]/.test(ua) &&
    !/example\.(com|org|net)|localhost|your[-_ ]|placeholder|test@/i.test(ua) &&
    /\S+\s+.*(?:https:\/\/[^\s)]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i.test(ua);
}
export async function fetchMet(target: SourceTarget, options: ProviderOptions & { userAgent?: string; ifModifiedSince?: string } = {}): Promise<ProviderResult> {
  targetSchema.parse(target);
  if (!validMetUserAgent(options.userAgent)) return unavailable(MET_SOURCE, ADAPTER_VERSIONS.crosscheck, target, "MET_IDENTITY_REQUIRED", EMPTY_HTTP, true);
  const params = new URLSearchParams({ lat: coordinate(target.latitude), lon: coordinate(target.longitude) });
  const headers: Record<string, string> = { "User-Agent": options.userAgent };
  if (options.ifModifiedSince && Number.isFinite(Date.parse(options.ifModifiedSince)) && !/[\r\n]/.test(options.ifModifiedSince)) headers["If-Modified-Since"] = options.ifModifiedSince;
  const result = await fetchSource("met", params, { ...options, headers });
  if (result.kind === "not-modified") return result;
  if (result.kind === "failure") return unavailable(MET_SOURCE, ADAPTER_VERSIONS.crosscheck, target, result.code, result.http);
  try { return { kind: "snapshot", snapshot: parseMet(result.body, target, result.fetchedAt), http: result.http }; }
  catch { return unavailable(MET_SOURCE, ADAPTER_VERSIONS.crosscheck, target, "INVALID_RESPONSE", result.http); }
}
