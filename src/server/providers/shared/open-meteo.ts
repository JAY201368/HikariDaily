import "server-only";
import { z } from "zod";
import { DAY_MS, HOUR_MS } from "../../../domain/schemas";
import { createSnapshot, finishSnapshot, missing } from "../../../domain/normalization/snapshot";
import type { SourceSnapshot, SourceTarget, FieldSemantics } from "../../../domain/normalization/snapshot";
import type { Source } from "../../../domain/types";
import { shanghaiDate, shanghaiDayBounds } from "../../../domain/time";
import { coordinate, targetSchema, validNumber } from "./values";

export const OpenMeteoResponseSchema = z.object({
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  timezone: z.literal("Asia/Shanghai"), utc_offset_seconds: z.literal(28800),
  hourly_units: z.record(z.string(), z.unknown()),
  hourly: z.object({ time: z.array(z.number().int().nonnegative()).max(1000) }).catchall(z.unknown()),
}).superRefine(({ hourly }, ctx) => {
  hourly.time.forEach((time, index) => {
    if (time % 3600 !== 0 || (index > 0 && time <= hourly.time[index - 1])) ctx.addIssue({ code: "custom", message: "时间轴必须严格递增且为整点", path: ["hourly", "time", index] });
  });
});
export type FieldMap = Record<string, { field: string; unit: string; timing: FieldSemantics["timing"]; notes?: string[] }>;
/** Query bounds, not a promise of model availability (CAMS Global is normally five days).
 * The final accepted day is kept even when its next-midnight cumulative value is outside the API horizon. */
export function openMeteoRange(target: SourceTarget, fields: FieldMap, maxDays: number, now: number) {
  targetSchema.parse(target);
  const { start, end } = shanghaiDayBounds(target.localDate);
  const lastDay = shanghaiDayBounds(shanghaiDate(now)).start + (maxDays - 1) * DAY_MS;
  return { outside: start > lastDay,
    end: Math.min(Object.values(fields).some(f => f.timing === "preceding-hour") ? end : end - HOUR_MS, lastDay + 23 * HOUR_MS) };
}
export function openMeteoParams(target: SourceTarget, fields: FieldMap, maxDays: number, now: number) {
  targetSchema.parse(target);
  const range = openMeteoRange(target, fields, maxDays, now);
  const hour = (epoch: number) => `${shanghaiDate(epoch)}T${new Date(epoch + 8 * HOUR_MS).toISOString().slice(11, 13)}:00`;
  return new URLSearchParams({ latitude: coordinate(target.latitude), longitude: coordinate(target.longitude),
    timezone: "Asia/Shanghai", timeformat: "unixtime", start_date: target.localDate,
    end_date: shanghaiDate(range.end), start_hour: `${target.localDate}T00:00`, end_hour: hour(range.end),
    hourly: Object.values(fields).map((f) => f.field).join(",") });
}
export function parseOpenMeteo(body: unknown, target: SourceTarget, source: Source, version: string, fields: FieldMap, group: "weather" | "air", fetchedAt: number): SourceSnapshot {
  targetSchema.parse(target);
  const raw = OpenMeteoResponseSchema.parse(body);
  if (raw.hourly_units.time !== "unixtime") throw new Error("INVALID_TIME_UNIT");
  const snapshot = createSnapshot(source, version, target);
  snapshot.grid = { latitude: raw.latitude, longitude: raw.longitude };
  const epochs = new Map(raw.hourly.time.map((time, i) => [time * 1000, i]));
  for (const [name, config] of Object.entries(fields)) {
    snapshot.semantics[name] = { upstreamField: config.field, unit: config.unit, timing: config.timing, notes: config.notes ?? [] };
    const values = raw.hourly[config.field];
    const badField = !Array.isArray(values) ? "字段缺失或非数组"
      : values.length !== raw.hourly.time.length ? "数组长度与时间轴不一致"
      : raw.hourly_units[config.field] !== config.unit ? "未知或不兼容单位" : null;
    for (const hour of snapshot.hours) {
      const index = epochs.get(Date.parse(hour.start) + (config.timing === "preceding-hour" ? HOUR_MS : 0));
      const metrics = hour[group] as Record<string, ReturnType<typeof missing>>;
      metrics[name] = badField ? missing(`${name}: ${badField}`) : index === undefined ? missing(`${name}: 所需整点缺失`)
        : validNumber(name, (values as unknown[])[index], source.id, config.notes ?? []);
    }
  }
  return finishSnapshot(snapshot, fetchedAt);
}
