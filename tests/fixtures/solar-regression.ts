/**
 * Fixed regression baseline, calculated once with pinned SunCalc 1.9.0,
 * WGS84 city-center coordinates, height=0, target-day Beijing noon.
 * Values are Beijing HH:mm (truncated for minute presentation).
 * This is a library regression fixture, not observed/published ephemeris,
 * weather data, accuracy certification, or a production fallback.
 * Order: -6 rise, -4 rise, sunrise, +6 rise, +6 set, sunset, -4 set, -6 set.
 */
export const solarRegressionCities = [
  { name: "北京", latitude: 39.9042, longitude: 116.4074, localDate: "2026-10-22",
    minutes: ["06:05", "06:15", "06:32", "07:09", "16:50", "17:27", "17:44", "17:55"] },
  { name: "上海", latitude: 31.2304, longitude: 121.4737, localDate: "2026-10-22",
    minutes: ["05:37", "05:47", "06:02", "06:35", "16:44", "17:17", "17:32", "17:41"] },
  { name: "广州", latitude: 23.1291, longitude: 113.2644, localDate: "2026-10-22",
    minutes: ["06:04", "06:13", "06:27", "06:58", "17:27", "17:57", "18:11", "18:20"] },
  { name: "成都", latitude: 30.5728, longitude: 104.0668, localDate: "2026-10-22",
    minutes: ["06:47", "06:56", "07:11", "07:44", "17:54", "18:27", "18:42", "18:51"] },
  { name: "乌鲁木齐", latitude: 43.8256, longitude: 87.6168, localDate: "2026-10-22",
    minutes: ["08:03", "08:15", "08:33", "09:12", "18:37", "19:17", "19:35", "19:46"] },
] as const;
