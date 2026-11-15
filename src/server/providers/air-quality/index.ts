import "server-only";
import { ADAPTER_VERSIONS, SOURCE_IDS } from "../../../domain/normalization/snapshot";
import type { SourceTarget } from "../../../domain/normalization/snapshot";
import { EMPTY_HTTP, fetchSource } from "../shared/http";
import { openMeteoParams, openMeteoRange, parseOpenMeteo } from "../shared/open-meteo";
import type { FieldMap } from "../shared/open-meteo";
import { sourceBase, unavailable } from "../shared/values";
import type { ProviderOptions, ProviderResult } from "../shared/values";
export const CAMS_NOTE = "CAMS全球约45km网格、原生三小时；模型小时序列，含插值";
export const CAMS_SOURCE = sourceBase(SOURCE_IDS.air, "Open-Meteo", "Copernicus CAMS Global Atmospheric Composition Forecasts", "cams_global", "约45km / 原生3小时，API小时序列含插值", "https://open-meteo.com/en/docs/air-quality-api");
export const CAMS_FIELDS: FieldMap = {
  pm25: { field: "pm2_5", unit: "μg/m³", timing: "instant", notes: [CAMS_NOTE] },
  pm10: { field: "pm10", unit: "μg/m³", timing: "instant", notes: [CAMS_NOTE] },
  referenceAqi: { field: "us_aqi", unit: "USAQI", timing: "instant", notes: [CAMS_NOTE, "参考AQI：US_EPA（美国EPA口径）"] },
};
export function parseCams(body: unknown, target: SourceTarget, fetchedAt: number) {
  const snapshot = parseOpenMeteo(body, target, { ...CAMS_SOURCE }, ADAPTER_VERSIONS.air, CAMS_FIELDS, "air", fetchedAt);
  snapshot.notes.push(CAMS_NOTE, "AQI、污染物浓度与能见度使用各自来源字段");
  return snapshot;
}
export async function fetchCams(target: SourceTarget, options: ProviderOptions = {}): Promise<ProviderResult> {
  const now = (options.clock ?? Date.now)();
  if (openMeteoRange(target, CAMS_FIELDS, 7, now).outside) return unavailable(CAMS_SOURCE, ADAPTER_VERSIONS.air, target, "OUTSIDE_FORECAST_COVERAGE", EMPTY_HTTP);
  const params = openMeteoParams(target, CAMS_FIELDS, 7, now); params.set("domains", "cams_global");
  const result = await fetchSource("air", params, options);
  if (result.kind === "not-modified") return result;
  if (result.kind === "failure") return unavailable(CAMS_SOURCE, ADAPTER_VERSIONS.air, target, result.code, result.http);
  try { return { kind: "snapshot", snapshot: parseCams(result.body, target, result.fetchedAt), http: result.http }; }
  catch { return unavailable(CAMS_SOURCE, ADAPTER_VERSIONS.air, target, "INVALID_RESPONSE", result.http); }
}
