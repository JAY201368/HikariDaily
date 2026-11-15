import "server-only";
import { z } from "zod";
import { LocationSchema } from "../../../domain/schemas";
import type { Location } from "../../../domain/types";

const text = z.string().trim().min(1).max(200).refine((v) => !/[\u0000-\u001f\u007f<>]/u.test(v));
export const GeocodingRecordSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), name: text,
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  country_code: z.string(), feature_code: z.string(), timezone: z.string(),
  admin1: text.optional(), admin2: text.optional(), admin3: text.optional(),
  admin1_id: z.number().int().positive().optional(),
});
// Mainland provincial GeoNames IDs. CN alone is insufficient for the service boundary.
const mainlandProvinces = new Set([
  1279685,1280239,1529047,1784764,1785694,1792943,1794299,1795912,
  1796231,1796328,1796480,1799355,1806222,1806260,1806691,1806949,
  1808520,1808773,1809054,1809445,1809867,1809935,1810676,1811017,
  1814905,1818058,2035607,2036115,2036500,2036965,2038349,
]);
// First-order administrative centres are cities; second-order cities; third-order districts/counties.
const classifications: Record<string, Location["granularity"]> = {
  PPLC: "city", PPLA: "city", PPLA2: "city", ADM2: "city",
  PPLA3: "district", ADM3: "district",
};
export function normalizeLocation(value: unknown): Location | null {
  const parsed = GeocodingRecordSchema.safeParse(value);
  if (!parsed.success) return null;
  const r = parsed.data;
  const granularity = Object.hasOwn(classifications, r.feature_code) ? classifications[r.feature_code] : undefined;
  if (r.country_code !== "CN" || !r.admin1 || !r.admin1_id || !mainlandProvinces.has(r.admin1_id) ||
      !["Asia/Shanghai", "Asia/Urumqi"].includes(r.timezone) || !granularity) return null;
  if (granularity === "district" && !r.admin2) return null;
  const administrativePath = [...new Set([r.admin1, r.admin2, r.admin3, r.name].filter((s): s is string => !!s))];
  return LocationSchema.parse({
    id: `geonames:${r.id}`, name: r.name, administrativePath, granularity,
    latitude: r.latitude, longitude: r.longitude, timezone: "Asia/Shanghai",
  });
}
