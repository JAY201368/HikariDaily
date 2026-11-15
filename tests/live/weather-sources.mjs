/** Opt-in, independent live probe. Never run by pnpm test/build; no fixture fallback.
 * curl uses a fixed endpoint and a 4s total deadline; stdout has no identity/header data.
 * Usage: http_proxy=... https_proxy=... node tests/live/weather-sources.mjs
 */
import { spawnSync } from "node:child_process";
const weather = ["temperature_2m", "relative_humidity_2m", "weather_code", "precipitation", "precipitation_probability", "wind_speed_10m", "wind_gusts_10m", "wind_direction_10m", "cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high", "visibility"];
const sources = [
  { id: "open-meteo-gfs", endpoint: "https://api.open-meteo.com/v1/forecast", params: { latitude: "39.9075", longitude: "116.3972", timezone: "Asia/Shanghai", timeformat: "unixtime", forecast_days: "2", models: "gfs_seamless", wind_speed_unit: "ms", hourly: weather.join(",") } },
  { id: "open-meteo-cams", endpoint: "https://air-quality-api.open-meteo.com/v1/air-quality", params: { latitude: "39.9075", longitude: "116.3972", timezone: "Asia/Shanghai", timeformat: "unixtime", forecast_days: "2", domains: "cams_global", hourly: "pm2_5,pm10,us_aqi" } },
];
let failed = false;
for (const source of sources) {
  const url = new URL(source.endpoint); url.search = new URLSearchParams(source.params).toString();
  const result = spawnSync("curl", ["--silent", "--show-error", "--fail", "--max-time", "4", "--proto", "=https", url.href], { encoding: "utf8" });
  if (result.status !== 0) { console.log(JSON.stringify({ source: source.id, checkedAt: new Date().toISOString(), status: "failed", curlExit: result.status })); failed = true; continue; }
  try {
    const raw = JSON.parse(result.stdout);
    console.log(JSON.stringify({ source: source.id, checkedAt: new Date().toISOString(), status: "response-received", grid: { latitude: raw.latitude, longitude: raw.longitude }, timezone: raw.timezone, offset: raw.utc_offset_seconds, units: raw.hourly_units, hours: raw.hourly?.time?.length,
      firstEpoch: raw.hourly?.time?.[0], lastEpoch: raw.hourly?.time?.at(-1), fields: Object.fromEntries(Object.entries(raw.hourly ?? {}).filter(([key]) => key !== "time").map(([key, values]) => [key, { length: values.length, validCount: values.filter((v) => typeof v === "number" && Number.isFinite(v)).length }])) }));
  } catch { console.log(JSON.stringify({ source: source.id, status: "invalid-json" })); failed = true; }
}
// A production identity is neither created nor guessed. This probe intentionally makes no MET request.
console.log(JSON.stringify({ source: "met-norway", status: "skipped", reason: "No verified real MET_NO_USER_AGENT configured for this probe; no anonymous request sent" }));
if (failed) process.exitCode = 1;
