import { describe, expect, it } from "vitest";
import { createDayHours, shanghaiDate, shanghaiDayBounds, shanghaiIso, shanghaiNoon, toEpoch, windowStatus } from "../../src/domain/time";

describe("explicit Beijing time, independent of process TZ", () => {
  it("changes date exactly at Beijing midnight across month/year/leap boundaries", () => {
    for (const [before, after, date] of [
      ["2026-10-21T15:59:59.999Z", "2026-10-21T16:00:00Z", "2026-10-22"],
      ["2026-12-31T15:59:59.999Z", "2026-12-31T16:00:00Z", "2027-01-01"],
      ["2024-02-28T15:59:59.999Z", "2024-02-28T16:00:00Z", "2024-02-29"],
    ]) {
      expect(shanghaiDate(after)).toBe(date);
      expect(shanghaiDate(before)).not.toBe(date);
    }
  });
  it.each(["2026-10-22", "2026-12-31", "2024-02-29"])("generates all 24 contiguous hours for %s", (date) => {
    const hours = createDayHours(date);
    const bounds = shanghaiDayBounds(date);
    expect(hours).toHaveLength(24);
    expect(hours[0].start).toBe(`${date}T00:00:00.000+08:00`);
    hours.forEach((hour, index) => {
      expect(toEpoch(hour.end) - toEpoch(hour.start)).toBe(3_600_000);
      expect(shanghaiDate(hour.start)).toBe(date);
      if (index > 0) expect(hours[index - 1].end).toBe(hour.start);
    });
    expect(toEpoch(hours[23].end)).toBe(bounds.end);
    expect(bounds.end - bounds.start).toBe(86_400_000);
    expect(new Date(shanghaiNoon(date)).toISOString()).toBe(`${date}T04:00:00.000Z`);
  });
  it("keeps equivalent instants and millisecond precision", () => {
    expect(shanghaiIso("2026-10-21T16:00:00.123Z")).toBe("2026-10-22T00:00:00.123+08:00");
    expect(toEpoch("2026-10-21T16:00:00Z")).toBe(toEpoch("2026-10-22T00:00:00+08:00"));
  });
  it("classifies half-open windows with explicit now", () => {
    const start = "2026-10-22T10:00:00+08:00", end = "2026-10-22T11:00:00+08:00";
    expect(windowStatus(start, end, "2026-10-22T09:59:59Z")).toBe("past");
    expect(windowStatus(start, end, start)).toBe("current");
    expect(windowStatus(start, end, end)).toBe("past");
    expect(windowStatus(start, end, "2026-10-22T09:59:59+08:00")).toBe("future");
    expect(() => windowStatus(end, start, start)).toThrow();
  });
  it("rejects invalid dates, timezone-free strings and non-finite epochs", () => {
    for (const value of ["2026-02-29", "2026-13-01", "26-10-22"]) expect(() => createDayHours(value)).toThrow();
    for (const value of [NaN, Infinity, "2026-10-22T00:00:00", "bad"]) expect(() => toEpoch(value)).toThrow();
  });
});
