import SunCalc from "suncalc";
import { CoordinatesSchema, LocalDateSchema } from "../schemas/primitives";
import type { SolarEvents } from "../types";
import { shanghaiDate, shanghaiIso, shanghaiNoon, toEpoch } from "../time";

const MORNING_MINUS_FOUR = "hikariMorningMinusFour";
const EVENING_MINUS_FOUR = "hikariEveningMinusFour";
// SunCalc 1.9.0 exposes its event table; checking it also protects module reloads.
const times = (SunCalc as typeof SunCalc & { times: [number, string, string][] }).times;
if (!times.some(([angle, morning, evening]) => angle === -4 &&
  morning === MORNING_MINUS_FOUR && evening === EVENING_MINUS_FOUR)) {
  SunCalc.addTime(-4, MORNING_MINUS_FOUR, EVENING_MINUS_FOUR);
}

const LIMITATION = "太阳事件按地点坐标与北京时间日期计算。";
const EVENT_KEYS = ["dawn", MORNING_MINUS_FOUR, "sunrise", "goldenHourEnd",
  "goldenHour", "sunset", EVENING_MINUS_FOUR, "dusk"] as const;

function emptyEvents(reason: string): SolarEvents {
  return { sunrise: null, sunset: null, morningBlue: null, morningGolden: null,
    eveningGolden: null, eveningBlue: null, notes: [reason, LIMITATION] };
}

/** One target-day noon call, observer height 0 (location elevation is not used). */
export function calculateSolarEvents(
  localDate: string,
  coordinates: { latitude: number; longitude: number },
): SolarEvents {
  if (!LocalDateSchema.safeParse(localDate).success) return emptyEvents("目标日期无效，无法计算太阳事件。");
  if (!CoordinatesSchema.safeParse(coordinates).success) return emptyEvents("地点坐标无效，无法计算太阳事件。");
  const raw = SunCalc.getTimes(new Date(shanghaiNoon(localDate)), coordinates.latitude,
    coordinates.longitude, 0) as unknown as Record<string, Date>;
  const notes = [LIMITATION];
  const events: Record<string, string | null> = {};
  for (const key of EVENT_KEYS) {
    const value = raw[key];
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      events[key] = null;
      notes.push(`${key} 无有效事件，可能不适用该地点或日期。`);
    } else if (shanghaiDate(value.getTime()) !== localDate) {
      events[key] = null;
      notes.push(`${key} 不在目标北京时间日期内，已标为缺失。`);
    } else {
      events[key] = shanghaiIso(value.getTime());
    }
  }
  // Validate the complete chronological chain before mutating any event values.
  const valid = EVENT_KEYS.filter((key) => events[key] !== null);
  const invalid = new Set<string>();
  for (let index = 1; index < valid.length; index += 1) {
    const before = valid[index - 1];
    const after = valid[index];
    if (Date.parse(events[before]!) >= Date.parse(events[after]!)) {
      invalid.add(before);
      invalid.add(after);
      notes.push(`${before} / ${after} 事件顺序异常，已标为缺失。`);
    }
  }
  invalid.forEach((key) => { events[key] = null; });
  const range = (startKey: string, endKey: string) => {
    const start = events[startKey];
    const end = events[endKey];
    return start && end ? { start, end } : null;
  };
  return {
    sunrise: events.sunrise, sunset: events.sunset,
    morningBlue: range("dawn", MORNING_MINUS_FOUR),
    morningGolden: range(MORNING_MINUS_FOUR, "goldenHourEnd"),
    eveningGolden: range("goldenHour", EVENING_MINUS_FOUR),
    eveningBlue: range(EVENING_MINUS_FOUR, "dusk"), notes,
  };
}

/** SunCalc: south=0 toward west; public bearing: north=0 clockwise. */
export function toNorthClockwiseDegrees(radians: number): number | null {
  if (!Number.isFinite(radians)) return null;
  const degrees = (radians * 180 / Math.PI + 180) % 360;
  return (degrees + 360) % 360;
}

export function calculateSolarPosition(instant: string | number, coordinates: { latitude: number; longitude: number }) {
  const missing = { altitude: null, azimuth: null, notes: ["无效时刻、坐标或太阳位置，暂无法计算。"] };
  if (!CoordinatesSchema.safeParse(coordinates).success) return missing;
  let epoch: number;
  try { epoch = toEpoch(instant); } catch { return missing; }
  const position = SunCalc.getPosition(new Date(epoch), coordinates.latitude, coordinates.longitude);
  const altitude = position.altitude * 180 / Math.PI;
  const azimuth = toNorthClockwiseDegrees(position.azimuth);
  if (!Number.isFinite(altitude) || altitude < -90 || altitude > 90 || azimuth === null) return missing;
  return { altitude, azimuth, notes: [LIMITATION] };
}
