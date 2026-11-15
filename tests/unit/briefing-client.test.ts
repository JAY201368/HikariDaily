import { afterEach, describe, expect, it, vi } from "vitest";
import { BriefingController, fetchBriefing, fetchLocations, readSelection, REFRESH_MS, type ClientRuntime } from "../../src/components/briefing-client/controller";
import { syntheticBriefing } from "../fixtures/domain-synthetic";
import { createDayHours, shanghaiDate, shanghaiIso } from "../../src/domain/time";
import type { BriefingResult } from "../../src/server/briefing-service";

const start = Date.parse("2026-10-22T12:00:00+08:00");
const first = "geonames:1796236", second = "geonames:1816670";
function result(id = first, now = start): BriefingResult {
  const data = syntheticBriefing(); data.location.id = id; data.location.name = id;
  data.generatedAt = shanghaiIso(now); data.localDate = shanghaiDate(now);
  data.hours.forEach((hour, i) => Object.assign(hour, createDayHours(data.localDate)[i]));
  data.hours[0].weather.temperature = { value: 24, state: "ok", sourceIds: ["synthetic-weather"], notes: [] };
  data.state = "partial";
  return { status: 200, data, error: null };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function harness(initial = result(), now = start) {
  vi.useFakeTimers(); vi.setSystemTime(now);
  let visible = true, url = `https://local.test/?place=${initial.data!.location.id}`, memory: string | null = null;
  const fetcher = vi.fn<ClientRuntime["fetch"]>(async (input) => {
    const selection = new URL(input, "https://local.test").searchParams.get("place")!;
    const value = result(selection, Date.now()); return Response.json({ data: value.data, error: null });
  });
  const runtime: ClientRuntime = { now: Date.now, fetch: fetcher, visible: () => visible,
    timer: (callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); },
    readUrl: () => url, writeUrl: (selection) => { url = `https://local.test/?${new URLSearchParams({ ...(selection.place === null ? {} : { place: selection.place }), genre: selection.genre })}`; },
    readMemory: () => memory, writeMemory: (value) => { memory = value; },
  };
  const controller = new BriefingController({ place: initial.data!.location.id, genre: "landscape", result: initial });
  return { controller, runtime, fetcher, setVisible(value: boolean) { visible = value; controller.visibilityChanged(); }, setUrl(value: string) { url = value; }, setMemory(value: string) { memory = value; }, getUrl: () => url };
}
afterEach(() => { vi.useRealTimers(); });
describe("T08 URL and safe optional memory", () => {
  it("URL values win independently, invalid genre defaults, duplicates never choose a place", () => {
    const saved = JSON.stringify({ place: first, genre: "portrait" });
    expect(readSelection(`/?place=${second}&genre=invalid`, saved)).toEqual({ place: second, genre: "landscape" });
    expect(readSelection("/?genre=street", saved)).toEqual({ place: first, genre: "street" });
    expect(readSelection("/", saved)).toEqual({ place: first, genre: "portrait" });
    expect(readSelection("/?place=x&place=y", saved).place).toBe("");
    expect(readSelection("/", "{bad-json")).toEqual({ place: null, genre: "landscape" });
    expect(readSelection("/", JSON.stringify({ place: "https://arbitrary.test", genre: "street" })).place).toBeNull();
  });
  it("SSR hydrates with no extra request; genre and hours preserve the exact conclusion object", () => {
    const h = harness(); const original = h.controller.getSnapshot().result;
    h.controller.start(h.runtime); h.controller.selectHour(13); h.controller.selectGenre("portrait");
    expect(h.fetcher).not.toHaveBeenCalled(); expect(h.controller.getSnapshot().result).toBe(original);
    expect(h.controller.getSnapshot()).toMatchObject({ selectedHour: 13, genre: "portrait" });
    expect(h.getUrl()).toContain("genre=portrait"); h.controller.stop();
  });
  it("broken browser storage does not stop reading, URL updates or refresh", async () => {
    const h = harness(); h.runtime.readMemory = () => { throw new Error("blocked"); }; h.runtime.writeMemory = () => { throw new Error("quota"); };
    h.controller.start(h.runtime); h.controller.selectGenre("street"); h.controller.retry();
    await vi.runAllTicks(); expect(h.fetcher).toHaveBeenCalledTimes(1); expect(h.getUrl()).toContain("street"); h.controller.stop();
  });
});
describe("T08 cancellation, navigation and time", () => {
  it("aborts old requests and rejects responses even from transports that ignore abort", async () => {
    const h = harness(); const old = deferred<Response>(), latest = deferred<Response>();
    h.fetcher.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    h.controller.start(h.runtime); h.controller.selectHour(18); h.controller.retry();
    const signal = h.fetcher.mock.calls[0][1].signal!;
    h.controller.selectPlace(second);
    expect(signal.aborted).toBe(true); expect(h.controller.getSnapshot()).toMatchObject({ result: null, selectedHour: null, loading: true });
    latest.resolve(Response.json({ data: result(second).data, error: null })); await vi.advanceTimersByTimeAsync(0);
    old.resolve(Response.json({ data: result(first).data, error: null })); await vi.advanceTimersByTimeAsync(0);
    expect(h.controller.getSnapshot().result?.data?.location.id).toBe(second);
    h.setUrl(`https://local.test/?place=${first}&genre=street`); h.controller.navigate(); await vi.advanceTimersByTimeAsync(0);
    expect(h.controller.getSnapshot()).toMatchObject({ place: first, genre: "street", selectedHour: null });
    expect(h.controller.getSnapshot().result?.data?.location.id).toBe(first); h.controller.stop();
  });
  it("checks at exactly 15 minutes, pauses while hidden and immediately checks age on resume", async () => {
    const h = harness(); h.controller.start(h.runtime);
    await vi.advanceTimersByTimeAsync(REFRESH_MS - 1); expect(h.fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(h.fetcher).toHaveBeenCalledTimes(1);
    h.setVisible(false); await vi.advanceTimersByTimeAsync(REFRESH_MS * 4); expect(h.fetcher).toHaveBeenCalledTimes(1);
    h.setVisible(true); await vi.advanceTimersByTimeAsync(0); expect(h.fetcher).toHaveBeenCalledTimes(2);
    h.setVisible(false); await vi.advanceTimersByTimeAsync(100); h.setVisible(true);
    expect(h.fetcher).toHaveBeenCalledTimes(2); h.controller.stop(); expect(vi.getTimerCount()).toBe(0);
  });
  it("rolls over at Beijing midnight independently of the host timezone; hidden resume clears old-day result", async () => {
    const now = Date.parse("2026-10-22T23:59:59.900+08:00"); const h = harness(result(first, now), now);
    const next = deferred<Response>(); h.fetcher.mockReturnValueOnce(next.promise);
    h.controller.start(h.runtime); h.controller.selectHour(23);
    await vi.advanceTimersByTimeAsync(100);
    expect(h.fetcher).toHaveBeenCalledTimes(1); expect(h.controller.getSnapshot()).toMatchObject({ result: null, selectedHour: null, loading: true });
    next.resolve(Response.json({ data: result(first, Date.now()).data, error: null })); await vi.advanceTimersByTimeAsync(0);
    expect(h.controller.getSnapshot().result?.data?.localDate).toBe("2026-10-23");
    h.setVisible(false); await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    h.setVisible(true); expect(h.controller.getSnapshot().result).toBeNull(); await vi.advanceTimersByTimeAsync(0);
    expect(h.controller.getSnapshot().result?.data?.localDate).toBe("2026-10-24"); h.controller.stop();
  });
  it("request spanning midnight cannot install yesterday's response", async () => {
    const now = Date.parse("2026-10-22T23:59:59.900+08:00"); const h = harness(result(first, now), now);
    const old = deferred<Response>(); h.fetcher.mockReturnValueOnce(old.promise);
    h.controller.start(h.runtime); h.controller.retry(); h.setVisible(false);
    await vi.advanceTimersByTimeAsync(200);
    old.resolve(Response.json({ data: result(first, now).data, error: null })); await vi.advanceTimersByTimeAsync(0);
    expect(h.fetcher).toHaveBeenCalledTimes(1); expect(h.controller.getSnapshot().result).toBeNull();
    h.setVisible(true); await vi.advanceTimersByTimeAsync(0);
    expect(h.fetcher).toHaveBeenCalledTimes(2); expect(h.controller.getSnapshot().result?.data?.localDate).toBe("2026-10-23"); h.controller.stop();
  });
  it("manual retry has only place, uses the same API, and unavailable data retains solar", async () => {
    const h = harness(); const unavailable = syntheticBriefing();
    h.fetcher.mockResolvedValueOnce(Response.json({ data: unavailable, error: { code: "WEATHER_UNAVAILABLE", message: "天气不可用" } }, { status: 503 }));
    h.controller.start(h.runtime); h.controller.retry(); await vi.advanceTimersByTimeAsync(0);
    expect(h.fetcher.mock.calls[0][0]).toBe(`/api/briefing?place=geonames%3A1796236`);
    expect(h.controller.getSnapshot().result).toMatchObject({ status: 503, data: { state: "unavailable" }, error: { code: "WEATHER_UNAVAILABLE" } }); h.controller.stop();
  });
  it.each(["network", "bad-json", "wrong-place", "wrong-day"])("%s produces a stable failure with no fake or mixed data", async (mode) => {
    const h = harness(); h.fetcher.mockImplementationOnce(async () => {
      if (mode === "network") throw new Error("secret internal error");
      if (mode === "bad-json") return new Response("{broken");
      return Response.json({ data: result(mode === "wrong-place" ? second : first, mode === "wrong-day" ? start - 86400000 : start).data, error: null });
    });
    h.controller.start(h.runtime); h.controller.retry(); await vi.advanceTimersByTimeAsync(0);
    expect(h.controller.getSnapshot()).toMatchObject({ loading: false, result: { data: null, status: 503, error: { code: "BRIEFING_UNAVAILABLE" } } });
    expect(JSON.stringify(h.controller.getSnapshot())).not.toContain("secret"); h.controller.stop();
  });
});
describe("T08 validates same-origin JSON responses", () => {
  it("rejects malformed search documents and non-contract status", async () => {
    await expect(fetchLocations(async () => Response.json({ data: [{}], error: null }), "上海", new AbortController().signal)).rejects.toThrow();
    await expect(fetchBriefing({ fetch: async () => Response.json({ data: result().data, error: null }, { status: 202 }) }, first, new AbortController().signal)).rejects.toThrow();
  });
});
