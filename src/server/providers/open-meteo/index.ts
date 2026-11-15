import "server-only";
import { ADAPTER_VERSIONS, SOURCE_IDS } from "../../../domain/normalization/snapshot";
import type { SourceTarget } from "../../../domain/normalization/snapshot";
import { EMPTY_HTTP, fetchSource } from "../shared/http";
import { openMeteoParams, openMeteoRange, parseOpenMeteo } from "../shared/open-meteo";
import type { FieldMap } from "../shared/open-meteo";
import { sourceBase, unavailable } from "../shared/values";
import type { ProviderOptions, ProviderResult } from "../shared/values";
export const GFS_SOURCE = sourceBase(SOURCE_IDS.weather, "Open-Meteo", "NOAA GFS", "gfs_seamless", "GFS全球约0.11°–0.25°，模型小时序列", "https://open-meteo.com/en/docs/gfs-api");
export const GFS_FIELDS: FieldMap = {
  temperature: { field: "temperature_2m", unit: "°C", timing: "instant" }, humidity: { field: "relative_humidity_2m", unit: "%", timing: "instant" },
  weatherCode: { field: "weather_code", unit: "wmo code", timing: "instant" },
  precipitation: { field: "precipitation", unit: "mm", timing: "preceding-hour" },
  precipitationProbability: { field: "precipitation_probability", unit: "%", timing: "preceding-hour", notes: ["对应小时的降水概率"] },
  windSpeed: { field: "wind_speed_10m", unit: "m/s", timing: "instant" }, windGust: { field: "wind_gusts_10m", unit: "m/s", timing: "preceding-hour" },
  windFrom: { field: "wind_direction_10m", unit: "°", timing: "instant", notes: ["风的来向，北0°顺时针"] },
  cloudTotal: { field: "cloud_cover", unit: "%", timing: "instant" }, cloudLow: { field: "cloud_cover_low", unit: "%", timing: "instant" },
  cloudMid: { field: "cloud_cover_mid", unit: "%", timing: "instant" }, cloudHigh: { field: "cloud_cover_high", unit: "%", timing: "instant" },
  visibility: { field: "visibility", unit: "m", timing: "instant" },
};
export function parseGfs(body: unknown, target: SourceTarget, fetchedAt: number) {
  return parseOpenMeteo(body, target, { ...GFS_SOURCE }, ADAPTER_VERSIONS.weather, GFS_FIELDS, "weather", fetchedAt);
}
export async function fetchGfs(target: SourceTarget, options: ProviderOptions = {}): Promise<ProviderResult> {
  const now = (options.clock ?? Date.now)();
  if (openMeteoRange(target, GFS_FIELDS, 16, now).outside) return unavailable(GFS_SOURCE, ADAPTER_VERSIONS.weather, target, "OUTSIDE_FORECAST_COVERAGE", EMPTY_HTTP);
  const params = openMeteoParams(target, GFS_FIELDS, 16, now);
  params.set("models", "gfs_seamless"); params.set("wind_speed_unit", "ms");
  const result = await fetchSource("weather", params, options);
  if (result.kind === "not-modified") return result;
  if (result.kind === "failure") return unavailable(GFS_SOURCE, ADAPTER_VERSIONS.weather, target, result.code, result.http);
  try { return { kind: "snapshot", snapshot: parseGfs(result.body, target, result.fetchedAt), http: result.http }; }
  catch { return unavailable(GFS_SOURCE, ADAPTER_VERSIONS.weather, target, "INVALID_RESPONSE", result.http); }
}
