import { z } from "zod";
import { CoordinatesSchema, InstantSchema, LocalDateSchema, SourceSchema } from "../schemas";
import { SourceTargetSchema } from "../normalization/snapshot";
import type { SourceTarget } from "../normalization/snapshot";
import { calculateSolarPosition } from "../solar";
import { createDayHours } from "../time";

export const SUNSET_MODEL_VERSION = "ecmwf-spatial-2026-10" as const;
export const SUNSET_SOURCE_ID = "open-meteo-ecmwf-sunset" as const;
export const SUNSET_DISTANCES_KM = [25, 75, 150, 250, 400] as const;
export const SUNSET_BEARING_OFFSETS = [-25, 0, 25] as const;
const percent = z.number().min(0).max(100).nullable();
const nonnegative = z.number().nonnegative().nullable();

export const SunsetCloudHourSchema = z.strictObject({
  time: InstantSchema,
  cloudTotal: percent, cloudLow: percent, cloudMid: percent, cloudHigh: percent,
  visibility: nonnegative, precipitation: nonnegative, humidity: percent,
});
export const SunsetSamplePointSchema = z.strictObject({
  ...CoordinatesSchema.shape,
  distanceKm: z.number().min(0).max(400),
  bearing: z.number().min(0).lt(360),
  grid: CoordinatesSchema.nullable(),
  hours: z.array(SunsetCloudHourSchema).length(24),
});
export const SunsetCloudFieldSchema = z.strictObject({
  modelVersion: z.literal(SUNSET_MODEL_VERSION),
  target: SourceTargetSchema,
  source: SourceSchema,
  sunsetTime: InstantSchema.nullable(),
  points: z.array(SunsetSamplePointSchema).max(16),
  notes: z.array(z.string().min(1)),
}).superRefine((field, ctx) => {
  if (!LocalDateSchema.safeParse(field.target.localDate).success) return;
  const expected = createDayHours(field.target.localDate);
  const coordinates = new Set<string>();
  field.points.forEach((point, p) => {
    const key = `${point.latitude},${point.longitude}`;
    if (coordinates.has(key)) ctx.addIssue({ code: "custom", message: "空间采样点不可重复", path: ["points", p] });
    coordinates.add(key);
    point.hours.forEach((hour, h) => {
      if (Date.parse(hour.time) !== Date.parse(expected[h].start)) {
        ctx.addIssue({ code: "custom", message: "云场必须对应目标日24个连续整点", path: ["points", p, "hours", h, "time"] });
      }
    });
  });
});

export type SunsetCloudField = z.infer<typeof SunsetCloudFieldSchema>;
export type SunsetSamplePoint = z.infer<typeof SunsetSamplePointSchema>;
export type SunsetCloudHour = z.infer<typeof SunsetCloudHourSchema>;
export type SunsetSamplingPoint = Pick<SunsetSamplePoint, "latitude" | "longitude" | "distanceKm" | "bearing">;

const radians = (angle: number) => angle * Math.PI / 180;
const degrees = (angle: number) => angle * 180 / Math.PI;
const truncateCoordinate = (value: number) => Math.trunc(value * 10_000) / 10_000;

/** Great-circle destinations, fixed to the actual sunset bearing rather than due west. */
export function createSunsetSamplingPlan(target: SourceTarget, sunsetTime: string | null): SunsetSamplingPoint[] {
  if (sunsetTime === null) return [];
  const { azimuth } = calculateSolarPosition(sunsetTime, target);
  if (azimuth === null) return [];
  const latitude = radians(target.latitude);
  const longitude = radians(target.longitude);
  const points: SunsetSamplingPoint[] = [{ latitude: truncateCoordinate(target.latitude),
    longitude: truncateCoordinate(target.longitude), distanceKm: 0, bearing: azimuth }];
  for (const offset of SUNSET_BEARING_OFFSETS) {
    const bearing = (azimuth + offset + 360) % 360;
    for (const distanceKm of SUNSET_DISTANCES_KM) {
      const arc = distanceKm / 6371;
      const destinationLatitude = Math.asin(Math.sin(latitude) * Math.cos(arc) +
        Math.cos(latitude) * Math.sin(arc) * Math.cos(radians(bearing)));
      const destinationLongitude = longitude + Math.atan2(Math.sin(radians(bearing)) * Math.sin(arc) * Math.cos(latitude),
        Math.cos(arc) - Math.sin(latitude) * Math.sin(destinationLatitude));
      points.push({ latitude: truncateCoordinate(degrees(destinationLatitude)),
        longitude: truncateCoordinate((degrees(destinationLongitude) + 540) % 360 - 180), distanceKm, bearing });
    }
  }
  return points;
}
