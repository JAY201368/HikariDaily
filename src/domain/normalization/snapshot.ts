import { z } from "zod";
import { AirSchema, CoordinatesSchema, InstantSchema, LocalDateSchema, SourceSchema, WeatherSchema } from "../schemas";
import { createDayHours } from "../time";
import type { Metric, Source, WeatherMetricName } from "../types";

export const SOURCE_IDS = { weather: "open-meteo-gfs", crosscheck: "met-norway", air: "open-meteo-cams" } as const;
export const ADAPTER_VERSIONS = { weather: "gfs-v2-target-day", crosscheck: "met-complete-v1", air: "cams-global-v2-target-day" } as const;
export const WEATHER_FIELDS = Object.keys(WeatherSchema.shape) as WeatherMetricName[];
export const AIR_FIELDS = ["pm25", "pm10", "referenceAqi"] as const;
export const SourceHourSchema = z.strictObject({ start: InstantSchema, end: InstantSchema, weather: WeatherSchema, air: AirSchema });
const FieldSemanticsSchema = z.strictObject({
  unit: z.string().min(1), timing: z.enum(["instant", "preceding-hour", "following-hour"]),
  upstreamField: z.string().min(1), notes: z.array(z.string().min(1)),
});
/** Internal targets include private coordinates; public LocationSchema stays GeoNames-only. */
export const SourceTargetSchema = z.strictObject({
  locationId: z.string().regex(/^(?:geonames:[1-9]\d*|coords:[a-f0-9]{64})$/),
  localDate: LocalDateSchema, ...CoordinatesSchema.shape,
});
export const SourceSnapshotSchema = z.strictObject({
  source: SourceSchema, adapterVersion: z.string().min(1),
  target: SourceTargetSchema,
  grid: CoordinatesSchema.nullable(), hours: z.array(SourceHourSchema).length(24),
  semantics: z.record(z.string(), FieldSemanticsSchema), notes: z.array(z.string().min(1)),
}).superRefine((snapshot, ctx) => {
  if (!LocalDateSchema.safeParse(snapshot.target.localDate).success) return;
  const expected = createDayHours(snapshot.target.localDate);
  snapshot.hours.forEach((hour, i) => {
    if (Date.parse(hour.start) !== Date.parse(expected[i].start) || Date.parse(hour.end) !== Date.parse(expected[i].end)) {
      ctx.addIssue({ code: "custom", message: "源快照必须对应目标日24个连续小时", path: ["hours", i] });
    }
  });
});
export type SourceSnapshot = z.infer<typeof SourceSnapshotSchema>;
export type SourceHour = z.infer<typeof SourceHourSchema>;
export type SourceTarget = SourceSnapshot["target"];
export type FieldSemantics = z.infer<typeof FieldSemanticsSchema>;
export function missing(note: string): Metric<number> {
  return { value: null, state: "missing", sourceIds: [], notes: [note] };
}
export function emptyHours(date: string, reason: string): SourceHour[] {
  return createDayHours(date).map((range) => ({ ...range,
    weather: Object.fromEntries(WEATHER_FIELDS.map((name) => [name, missing(reason)])) as SourceHour["weather"],
    air: Object.fromEntries(AIR_FIELDS.map((name) => [name, missing(reason)])) as SourceHour["air"],
  }));
}
export function createSnapshot(source: Source, adapterVersion: string, target: SourceTarget, reason = "来源不提供此字段"): SourceSnapshot {
  return { source, adapterVersion, target, grid: null, hours: emptyHours(target.localDate, reason), semantics: {}, notes: [] };
}
/** Fetch time belongs to the completed upstream read, never cache reuse. */
export function finishSnapshot(snapshot: SourceSnapshot, fetchedAt: number): SourceSnapshot {
  const covered = snapshot.hours.filter((h) => [...Object.values(h.weather), ...Object.values(h.air)].some((m) => m.value !== null));
  snapshot.source.fetchedAt = new Date(fetchedAt).toISOString();
  snapshot.source.validFrom = covered[0]?.start ?? null;
  snapshot.source.validTo = covered.at(-1)?.end ?? null;
  return SourceSnapshotSchema.parse(snapshot);
}
