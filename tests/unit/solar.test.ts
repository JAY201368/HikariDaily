import SunCalc from "suncalc";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SolarEventsSchema, BriefingSchema } from "../../src/domain/schemas";
import { calculateSolarEvents, calculateSolarPosition, toNorthClockwiseDegrees } from "../../src/domain/solar";
import { shanghaiDate } from "../../src/domain/time";
import { syntheticBriefing } from "../fixtures/domain-synthetic";
import { solarRegressionCities } from "../fixtures/solar-regression";

afterEach(() => vi.restoreAllMocks());

describe("SunCalc 1.9.0 independent adapter", () => {
  it.each(solarRegressionCities)("matches the fixed $name minute baseline and event order", (city) => {
    const events = calculateSolarEvents(city.localDate, city);
    expect(SolarEventsSchema.safeParse(events).success).toBe(true);
    const instants = [events.morningBlue?.start, events.morningBlue?.end, events.sunrise,
      events.morningGolden?.end, events.eveningGolden?.start, events.sunset,
      events.eveningBlue?.start, events.eveningBlue?.end];
    expect(instants.map((instant) => instant?.slice(11, 16))).toEqual(city.minutes);
    instants.forEach((instant, index) => {
      expect(instant).not.toBeNull();
      expect(shanghaiDate(instant!)).toBe(city.localDate);
      expect(instant).toMatch(/\+08:00$/);
      if (index > 0) expect(Date.parse(instant!)).toBeGreaterThan(Date.parse(instants[index - 1]!));
    });
    expect(events.morningBlue?.end).toBe(events.morningGolden?.start);
    expect(events.eveningGolden?.end).toBe(events.eveningBlue?.start);
    // Independent position API agrees with the registered -4 degree boundary.
    expect(calculateSolarPosition(events.morningGolden!.start, city).altitude).toBeCloseTo(-4, 0);
    expect(events.notes.join()).toContain("地点坐标与北京时间日期");
  });
  it("calls getTimes at explicit Beijing noon with height zero", () => {
    const spy = vi.spyOn(SunCalc, "getTimes");
    calculateSolarEvents("2026-10-22", { latitude: 39.9, longitude: 116.4 });
    expect(spy).toHaveBeenCalledExactlyOnceWith(new Date("2026-10-22T04:00:00Z"), 39.9, 116.4, 0);
  });
  it("registers -4 once across repeated calls and module reload", async () => {
    const table = (SunCalc as typeof SunCalc & { times: [number, string, string][] }).times;
    const count = () => table.filter(([angle, name]) => angle === -4 && name === "hikariMorningMinusFour").length;
    expect(count()).toBe(1);
    const spy = vi.spyOn(SunCalc, "addTime");
    for (let i = 0; i < 5; i += 1) calculateSolarEvents("2026-10-22", solarRegressionCities[0]);
    vi.resetModules();
    const reloaded = await import("../../src/domain/solar");
    reloaded.calculateSolarEvents("2026-10-22", solarRegressionCities[1]);
    expect(spy).not.toHaveBeenCalled();
    expect(count()).toBe(1);
  });
  it.each([[0, 180], [Math.PI / 2, 270], [-Math.PI / 2, 90], [Math.PI, 0], [-Math.PI, 0]])(
    "converts SunCalc bearing %s to north-clockwise %s", (radians, degrees) => {
      expect(toNorthClockwiseDegrees(radians)).toBeCloseTo(degrees, 10);
    },
  );
  it("converts altitude radians and rejects invalid position values", () => {
    const spy = vi.spyOn(SunCalc, "getPosition").mockReturnValue({ altitude: Math.PI / 6, azimuth: -Math.PI / 2 });
    expect(calculateSolarPosition("2026-10-22T04:00:00Z", solarRegressionCities[0])).toMatchObject({ altitude: 29.999999999999996, azimuth: 90 });
    spy.mockReturnValue({ altitude: NaN, azimuth: Infinity });
    expect(calculateSolarPosition(0, solarRegressionCities[0]).altitude).toBeNull();
    expect(toNorthClockwiseDegrees(NaN)).toBeNull();
    expect(toNorthClockwiseDegrees(Infinity)).toBeNull();
    expect(calculateSolarPosition("no timezone", solarRegressionCities[0]).azimuth).toBeNull();
    expect(calculateSolarPosition(0, { latitude: 91, longitude: 0 }).azimuth).toBeNull();
  });
  it("keeps invalid, out-of-day and reversed events missing with reasons", () => {
    const city = solarRegressionCities[0];
    const raw = SunCalc.getTimes(new Date("2026-10-22T04:00:00Z"), city.latitude, city.longitude);
    const spy = vi.spyOn(SunCalc, "getTimes");
    spy.mockReturnValue({ ...raw, sunrise: new Date(NaN) });
    expect(calculateSolarEvents(city.localDate, city).sunrise).toBeNull();
    spy.mockReturnValue({ ...raw, sunset: new Date("2026-10-23T10:00:00+08:00") });
    const outOfDay = calculateSolarEvents(city.localDate, city);
    expect(outOfDay.sunset).toBeNull();
    expect(outOfDay.notes.join()).toContain("目标北京时间日期");
    spy.mockReturnValue({ ...raw, dawn: raw.goldenHourEnd });
    const reversed = calculateSolarEvents(city.localDate, city);
    expect(reversed.morningBlue).toBeNull();
    expect(reversed.notes.join()).toContain("顺序异常");
  });
  it("returns null for non-applicable polar events or invalid input, never NaN", () => {
    for (const [date, coords] of [["2026-06-21", { latitude: 90, longitude: 0 }],
      ["2026-02-30", solarRegressionCities[0]], ["2026-10-22", { latitude: NaN, longitude: 0 }]] as const) {
      const events = calculateSolarEvents(date, coords);
      expect(events.sunrise).toBeNull();
      expect(events.sunset).toBeNull();
      expect(events.notes.length).toBeGreaterThan(0);
      expect(JSON.stringify(events)).not.toContain("NaN");
    }
  });
  it("also rejects cross-date events at the public Briefing boundary", () => {
    const briefing = syntheticBriefing();
    briefing.solar.sunrise = "2026-10-23T06:00:00+08:00";
    expect(BriefingSchema.safeParse(briefing).success).toBe(false);
  });
  it("uses no implicit clock or network even while the system clock is unavailable", () => {
    vi.spyOn(Date, "now").mockImplementation(() => { throw new Error("implicit clock forbidden"); });
    const network = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("network forbidden"); });
    expect(calculateSolarEvents("2026-10-22", solarRegressionCities[0]).sunset).not.toBeNull();
    expect(calculateSolarPosition("2026-10-22T04:00:00Z", solarRegressionCities[0]).azimuth).not.toBeNull();
    expect(network).not.toHaveBeenCalled();
  });
});
