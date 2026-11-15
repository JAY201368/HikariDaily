import { z } from "zod";

export const PRODUCT_TIMEZONE = "Asia/Shanghai" as const;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
export const SHANGHAI_OFFSET_MS = 8 * HOUR_MS;

/** Public instants must identify an absolute instant (Z or an explicit offset). */
export const InstantSchema = z.iso.datetime({ offset: true });
export const LocalDateSchema = z.iso.date();
export const TextSchema = z.string().min(1);
export const SourceIdsSchema = z.array(TextSchema);
export const NotesSchema = z.array(TextSchema);
export const CoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const TimeRangeSchema = z.strictObject({
  start: InstantSchema,
  end: InstantSchema,
}).refine(({ start, end }) => Date.parse(start) < Date.parse(end), {
  message: "时间区间必须满足 start < end",
  path: ["end"],
});
