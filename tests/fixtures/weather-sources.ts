/** Artificial source contract fixtures; not measured or captured live forecasts. */
import { shanghaiDayBounds } from "../../src/domain/time";
export const SOURCE_TARGET = { locationId: "geonames:1816670", localDate: "2026-10-23", latitude: 39.9075, longitude: 116.3972 };
export const FETCHED_AT = Date.parse("2026-10-23T02:00:00Z");
const units = { temperature_2m: "°C", relative_humidity_2m: "%", weather_code: "wmo code", precipitation: "mm", precipitation_probability: "%", wind_speed_10m: "m/s", wind_gusts_10m: "m/s", wind_direction_10m: "°", cloud_cover: "%", cloud_cover_low: "%", cloud_cover_mid: "%", cloud_cover_high: "%", visibility: "m", pm2_5: "μg/m³", pm10: "μg/m³", us_aqi: "USAQI" };
const defaults = { temperature_2m: 20, relative_humidity_2m: 50, weather_code: 0, precipitation: 0, precipitation_probability: 10, wind_speed_10m: 2, wind_gusts_10m: 3, wind_direction_10m: 0, cloud_cover: 30, cloud_cover_low: 10, cloud_cover_mid: 50, cloud_cover_high: 20, visibility: 25000, pm2_5: 12, pm10: 20, us_aqi: 40 };
export function openMeteoFixture(count = 48) {
  const start = shanghaiDayBounds(SOURCE_TARGET.localDate).start / 1000;
  return { latitude: 39.9, longitude: 116.4, timezone: "Asia/Shanghai", utc_offset_seconds: 28800,
    hourly_units: { time: "unixtime", ...units } as Record<string, unknown>,
    hourly: { time: Array.from({ length: count }, (_, i) => start + i * 3600), ...Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, Array(count).fill(v)])) } as { time: number[] } & Record<string, unknown>,
  };
}
export function metFixture() {
  const start = shanghaiDayBounds(SOURCE_TARGET.localDate).start;
  return { type: "Feature", geometry: { type: "Point", coordinates: [116.3972, 39.9075, 40] }, properties: {
    meta: { updated_at: "2026-10-23T01:00:00Z", units: { air_temperature: "celsius", relative_humidity: "%", wind_speed: "m/s", wind_from_direction: "degrees", cloud_area_fraction: "%", cloud_area_fraction_low: "%", cloud_area_fraction_medium: "%", cloud_area_fraction_high: "%", precipitation_amount: "mm" } },
    timeseries: Array.from({ length: 24 }, (_, i) => ({ time: new Date(start + i * 3600000).toISOString(), data: {
      instant: { details: { air_temperature: 21, relative_humidity: 55, wind_speed: 3, wind_from_direction: 360, cloud_area_fraction: 40, cloud_area_fraction_low: 15, cloud_area_fraction_medium: 40, cloud_area_fraction_high: 25 } },
      next_1_hours: { details: { precipitation_amount: i / 10 }, summary: { symbol_code: "partlycloudy_day" } },
      next_6_hours: { details: { precipitation_amount: 60 }, summary: { symbol_code: "rain" } },
    } })),
  } };
}
