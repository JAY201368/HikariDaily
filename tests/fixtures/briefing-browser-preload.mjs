/** Test-only location injection for browser SSR. Never imported by application code.
 * Run only with explicit HIKARI_SOURCE_MODE=fixture; the normal location provider stays live.
 * This artificial record is not live-service coverage evidence or a production fallback.
 */
if (process.env.HIKARI_SOURCE_MODE !== "fixture" || process.env.NODE_ENV === "production") {
  throw new Error("Browser fixture preload requires explicit non-production fixture mode");
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.origin === "https://geocoding-api.open-meteo.com") {
    const records = [
      { id: 1796236, name: "人工合成上海浏览器样例", country_code: "CN", feature_code: "PPLA",
        latitude: 31.2304, longitude: 121.4737, timezone: "Asia/Shanghai", admin1_id: 1796231, admin1: "人工上海行政上下文" },
      { id: 1816670, name: "人工合成北京区域浏览器样例", country_code: "CN", feature_code: "ADM3",
        latitude: 39.9042, longitude: 116.4074, timezone: "Asia/Shanghai", admin1_id: 2038349, admin1: "人工北京行政上下文", admin2: "人工北京市" },
    ];
    if (url.pathname === "/v1/get") return Response.json(records.find((record) => String(record.id) === url.searchParams.get("id")) ?? {});
    if (url.pathname === "/v1/search") {
      const query = url.searchParams.get("name") ?? "";
      return Response.json({ results: query.includes("无结果") ? [] : query.includes("同名") ? records : records.filter((record) => record.name.includes(query)) });
    }
  }
  return originalFetch(input, init);
};
