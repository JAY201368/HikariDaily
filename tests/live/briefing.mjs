/** Opt-in real-source probe of an already running normal Next server, no fixtures.
 * node tests/live/briefing.mjs [http://127.0.0.1:3200]
 * Server transport is native fetch. Set Node's official NODE_USE_ENV_PROXY=1
 * and temporary http_proxy/https_proxy on the SERVER process if needed.
 * Logs public source metadata/counts, never response bodies, identities or env.
 * Does not enable MET/cache, retry failures, or change production 4s/6s budgets.
 */
const origin = new URL(process.argv[2] ?? "http://127.0.0.1:3200");
if (origin.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(origin.hostname) || origin.pathname !== "/" || origin.search || origin.username || origin.password) throw Error("Expected loopback HTTP origin");
const cases = [
  { q: "北京", id: "geonames:1816670" },
  { q: "上海", id: "geonames:1796236" },
  { q: "广州", id: "geonames:1809858" },
  { q: "成都", id: "geonames:1815286" },
  { q: "乌鲁木齐", id: "geonames:1529102" },
  { q: "海淀", id: "geonames:1809104" },
  { q: "朝阳", id: null },
];
let failed = false;
const log = value => console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...value }));
async function get(path, format = "json") {
  const start = performance.now();
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(20_000), redirect: "error" });
  return { status: response.status, durationMs: Math.round(performance.now() - start), body: format === "json" ? await response.json() : await response.text() };
}
for (const item of cases) {
  try {
    const search = await get(`/api/locations?q=${encodeURIComponent(item.q)}`);
    log({ kind: "location", query: item.q, http: search.status, durationMs: search.durationMs, data: search.body.data, error: search.body.error });
    if (search.status !== 200 || !Array.isArray(search.body.data) || (item.id && !search.body.data.some(x => x.id === item.id))) { failed = true; continue; }
    if (!item.id) continue;
    const result = await get(`/api/briefing?place=${encodeURIComponent(item.id)}`);
    const b = result.body.data;
    if (!b) { failed = true; log({ kind: "briefing", query: item.q, http: result.status, error: result.body.error }); continue; }
    const fixture = b.warnings.some(w => w.includes("演示数据"));
    const expectedDate = new Date(Date.parse(b.generatedAt) + 8 * 3600_000).toISOString().slice(0, 10);
    const contiguous = b.hours.length === 24 && b.hours.every((h, i) => Date.parse(h.start) === Date.parse(`${b.localDate}T00:00:00+08:00`) + i * 3600_000 && Date.parse(h.end) - Date.parse(h.start) === 3600_000);
    const coverage = Object.fromEntries(["weather", "air"].map(group => [group, Object.fromEntries(Object.keys(b.hours[0][group]).map(field => [field, {
      validHours: b.hours.filter(h => h[group][field].value !== null).length,
      nullHours: b.hours.filter(h => h[group][field].value === null).length,
      states: [...new Set(b.hours.map(h => h[group][field].state))],
      sourceIds: [...new Set(b.hours.flatMap(h => h[group][field].sourceIds))],
    }]))]));
    const sourceTimes = b.sources.map(s => ({ ...s, ageAtProbeSeconds: s.fetchedAt ? Math.round((Date.now() - Date.parse(s.fetchedAt)) / 1000) : null }));
    log({ kind: "briefing", query: item.q, http: result.status, durationMs: result.durationMs, error: result.body.error,
      state: b.state, location: b.location, localDate: b.localDate, generatedAt: b.generatedAt, contiguous24: contiguous, fixture,
      sources: sourceTimes, coverage, warnings: b.warnings, solar: b.solar,
      opportunity: b.sunsetOpportunity, genres: Object.fromEntries(Object.entries(b.advice).map(([genre, a]) => [genre, { recommendedWindows: a.recommendedWindows, limitations: a.limitations }])) });
    if (fixture || !contiguous || b.localDate !== expectedDate || result.status !== 200 || b.state === "unavailable") failed = true;
    // Real SSR is separate from API: request-time snapshots may differ.
    {
      const ssr = await get(`/?place=${encodeURIComponent(item.id)}`, "text");
      const checks = { location: ssr.body.includes(b.location.name), date: ssr.body.includes(b.localDate), source: ssr.body.includes("open-meteo-gfs"), coreHeading: ssr.body.includes("当天概览"), noFixture: !ssr.body.includes("演示数据：人工合成") };
      log({ kind: "ssr", query: item.q, http: ssr.status, durationMs: ssr.durationMs, checks });
      if (ssr.status !== 200 || !Object.values(checks).every(Boolean)) failed = true;
    }
  } catch (error) {
    failed = true;
    log({ kind: "probe-error", query: item.q, code: error?.name ?? "Error" });
  }
}
log({ kind: "limitations", met: "No identity supplied or anonymous MET request; default server must keep MET disabled", cache: "No Runtime Cache opt-in; degraded source cache is expected", scope: "One machine/time/transport; not nationwide coverage, model accuracy, licensing, deployment or mainland device validation" });
if (failed) process.exitCode = 1;
