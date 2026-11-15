import {
  DAY_MS, HOUR_MS, InstantSchema, LocalDateSchema, SHANGHAI_OFFSET_MS,
} from "../schemas/primitives";

/** No local Date accessors: product dates are independent of the host timezone. */
export function shanghaiDate(instant: string | number): string {
  const epoch = toEpoch(instant);
  return new Date(epoch + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

export function toEpoch(instant: string | number): number {
  if (typeof instant === "string") InstantSchema.parse(instant);
  const epoch = typeof instant === "number" ? instant : Date.parse(instant);
  if (!Number.isFinite(epoch) || !Number.isFinite(new Date(epoch).getTime())) {
    throw new RangeError("无效绝对时刻");
  }
  return epoch;
}

/** ISO with explicit +08:00, retaining milliseconds for exact event instants. */
export function shanghaiIso(instant: string | number): string {
  return new Date(toEpoch(instant) + SHANGHAI_OFFSET_MS).toISOString().replace("Z", "+08:00");
}

export function shanghaiDayBounds(localDate: string) {
  LocalDateSchema.parse(localDate);
  const start = Date.parse(`${localDate}T00:00:00+08:00`);
  return { start, end: start + DAY_MS };
}

export function shanghaiNoon(localDate: string): number {
  return shanghaiDayBounds(localDate).start + 12 * HOUR_MS;
}

export function createDayHours(localDate: string): { start: string; end: string }[] {
  const { start } = shanghaiDayBounds(localDate);
  return Array.from({ length: 24 }, (_, hour) => ({
    start: shanghaiIso(start + hour * HOUR_MS),
    end: shanghaiIso(start + (hour + 1) * HOUR_MS),
  }));
}

/** Half-open windows: end == now has already passed. Explicit now is required. */
export function windowStatus(start: string | number, end: string | number, now: string | number) {
  const from = toEpoch(start);
  const to = toEpoch(end);
  const current = toEpoch(now);
  if (from >= to) throw new RangeError("时间区间必须满足 start < end");
  return current >= to ? "past" : current < from ? "future" : "current";
}
