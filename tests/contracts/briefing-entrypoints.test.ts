import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const entry = vi.hoisted(() => ({ getBriefing: vi.fn() }));
vi.mock("../../src/server/briefing-service", async () => {
  const service = await import("../../src/server/briefing-service/service");
  return { ...service, getBriefing: entry.getBriefing };
});
import { renderToStaticMarkup } from "react-dom/server";
import { GET, dynamic as apiDynamic } from "../../src/app/api/briefing/route";
import HomePage, { dynamic as pageDynamic } from "../../src/app/page";
import { pageHtml } from "../../src/components/prototype-frontend/adapter";
import { createBriefingService, briefingFailure } from "../../src/server/briefing-service/service";
import { demoSourceSnapshots, demoSunsetField } from "../../src/server/source-loader/fixtures";
import { syntheticBriefing } from "../fixtures/domain-synthetic";
import { BriefingSchema } from "../../src/domain/schemas";
import type { Briefing } from "../../src/domain/types";

const location = { ...syntheticBriefing().location, name: "人工合成地点（仅用于契约测试）" };
async function fixture() {
  const now = Date.parse("2026-10-23T12:00:00+08:00");
  return createBriefingService({ clock: () => now, resolveLocation: async () => location,
    loadSources: async (target) => ({ snapshots: demoSourceSnapshots(target, now), sunset: demoSunsetField(target, now), mode: "fixture", warnings: [], cacheStatus: "unused" }),
  })(location.id);
}
beforeEach(() => entry.getBriefing.mockReset());
describe("T07 SSR/API share the direct service result", () => {
  it("both entrypoints explicitly stay dynamic", () => {
    expect(apiDynamic).toBe("force-dynamic"); expect(pageDynamic).toBe("force-dynamic");
  });
  it.each(["", "?place=", "?place=geonames:1&place=geonames:2", "?place=geonames:1&date=2020-01-01",
    "?place=geonames:1&latitude=39&longitude=116", "?place=geonames:1&url=https://secret.test",
    "?place=geonames:1&fields=temperature", "?place=geonames:1&genre=street"])("rejects non-contract API parameters %s", async (query) => {
    // ID validation belongs to the shared service for a single place value.
    entry.getBriefing.mockImplementation(async () => briefingFailure("INVALID_LOCATION"));
    const response = await GET(new Request(`https://local.test/api/briefing${query}`));
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ data: null, error: { code: "INVALID_LOCATION" } });
    if (query !== "?place=") expect(entry.getBriefing).not.toHaveBeenCalled();
  });
  it("same validated service document is returned by API and rendered directly by SSR", async () => {
    const result = await fixture(); entry.getBriefing.mockResolvedValue(result);
    const response = await GET(new Request(`https://local.test/api/briefing?place=${location.id}`));
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    const envelope = await response.json(); expect(envelope).toEqual({ data: result.data, error: null }); BriefingSchema.parse(envelope.data);
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({ place: location.id, genre: "street" }) }));
    expect(entry.getBriefing.mock.calls).toEqual([[location.id], [location.id]]);
    expect(html).toContain(result.data!.summary.headline); expect(html).toContain("当前题材：街拍");
    expect(html).toContain("演示数据：人工合成");
    expect(html).toContain("US_EPA"); expect(html).toContain("含插值"); for (const source of result.data!.sources) if (source.nativeResolution) expect(html).toContain(source.nativeResolution);
    expect(html).toContain("生成时间"); expect(html).toContain("数据获取"); expect(html).toContain("上游发布");
    expect(html).toContain('data-frontend="prototype"');
    expect(html).toContain('id="newspaper"');
    expect(html).toContain('id="handbook"');
    expect(html).toContain("拨针选择小时，北京时间");
    expect(html).toContain("24 小时明细");
    expect(html).not.toContain("window.HIKARI");
  });
  it.each(["ready", "partial", "stale"] as const)("API preserves 200 %s", async (state) => {
    const result = await fixture(); result.data!.state = state; entry.getBriefing.mockResolvedValue(result);
    const response = await GET(new Request(`https://local.test/api/briefing?place=${location.id}`));
    expect(response.status).toBe(200); expect((await response.json()).data.state).toBe(state);
  });
  it.each(["INVALID_LOCATION", "LOCATION_NOT_FOUND", "LOCATION_UNAVAILABLE", "BRIEFING_UNAVAILABLE"] as const)("preserves stable %s errors in SSR and API", async (code) => {
    const result = briefingFailure(code); entry.getBriefing.mockResolvedValue(result);
    const response = await GET(new Request(`https://local.test/api/briefing?place=${location.id}`));
    expect(response.status).toBe(result.status); expect(await response.json()).toEqual({ data: null, error: result.error });
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({ place: location.id }) }));
    expect(html).toContain(result.error!.message); expect(html).toContain(code); expect(html).not.toContain("24 小时天气与光照");
  });
  it("503 unavailable can still render solar and missing indicators", async () => {
    const b = syntheticBriefing(); b.state = "unavailable";
    b.hours.forEach((hour) => { for (const metric of [...Object.values(hour.weather), ...Object.values(hour.air)]) Object.assign(metric, { value: null, state: "missing", sourceIds: [], notes: ["人工缺失样例"] }); });
    const result = briefingFailure("WEATHER_UNAVAILABLE", b); entry.getBriefing.mockResolvedValue(result);
    const response = await GET(new Request(`https://local.test/api/briefing?place=${location.id}`));
    expect(response.status).toBe(503); expect((await response.json()).data.solar).toEqual(b.solar);
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({ place: location.id }) }));
    expect(html).toContain("WEATHER_UNAVAILABLE"); expect(html).toContain("光线时刻 · 天文推算"); expect(b.interpretation.dataNote).not.toBeNull(); expect(html).toContain(b.interpretation.dataNote!);
  });
  it("no location produces no fabricated data or service call; invalid genre defaults", async () => {
    const html = renderToStaticMarkup(await HomePage({}));
    expect(html).toContain("尚未选择地点"); expect(html).not.toContain("id=\"newspaper\""); expect(entry.getBriefing).not.toHaveBeenCalled();
    entry.getBriefing.mockResolvedValue(await fixture());
    const selected = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({ place: location.id, genre: "invalid" }) }));
    expect(selected).toContain("当前题材：风光");
  });
  it("duplicate SSR place is invalid and does not resolve", async () => {
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({ place: [location.id, location.id] }) }));
    expect(html).toContain("INVALID_LOCATION"); expect(entry.getBriefing).not.toHaveBeenCalled();
  });
  it("renders untrusted text safely and retains long source/missing content in natural flow", async () => {
    const b = (await fixture()).data as Briefing;
    b.location.name = '<script>alert("fixture")</script>';
    b.warnings.push("人工长文".repeat(150));
    const html = pageHtml(b);
    expect(html).not.toContain('<script>alert("fixture")'); expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("人工长文".repeat(150));
  });
});
