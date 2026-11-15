import { z } from "zod";
import { createDayHours, shanghaiDate } from "../time";
import {
  CoordinatesSchema, HOUR_MS, InstantSchema, LocalDateSchema, NotesSchema,
  PRODUCT_TIMEZONE, SourceIdsSchema, TextSchema, TimeRangeSchema,
} from "./primitives";

export * from "./primitives";

export const SCHEMA_VERSION = "2" as const;
export const RULES_VERSION = "photo-rules-v0.3" as const;
export const GenreSchema = z.enum(["landscape", "portrait", "street"]);
export const MetricStateSchema = z.enum(["ok", "missing", "stale", "conflict"]);
export const ConfidenceSchema = z.enum(["medium", "low"]);

export function createMetricSchema<T extends z.ZodType>(value: T) {
  return z.strictObject({
    value: value.nullable(),
    state: MetricStateSchema,
    sourceIds: SourceIdsSchema,
    notes: NotesSchema,
    alternatives: z.array(z.strictObject({ sourceId: TextSchema, value })).optional(),
  }).refine((metric) => (metric.state === "missing") === ("value" in metric && metric.value === null), {
    message: "缺失值必须为 null；有效状态必须有值",
    path: ["value"],
  });
}

export const NumberMetricSchema = createMetricSchema(z.number());
const percent = z.number().min(0).max(100);
const nonnegative = z.number().min(0);
const bearing = z.number().min(0).lt(360);
export const WeatherMetricNameSchema = z.enum([
  "temperature", "humidity", "weatherCode", "precipitation", "precipitationProbability",
  "windSpeed", "windGust", "windFrom", "cloudTotal", "cloudLow", "cloudMid", "cloudHigh", "visibility",
]);
/** Fixed public units; pollutant concentrations and visibility are independent. */
export const WEATHER_UNITS = {
  temperature: "°C", humidity: "%", weatherCode: "WMO", precipitation: "mm",
  precipitationProbability: "%", windSpeed: "m/s", windGust: "m/s", windFrom: "° (北0顺时针)",
  cloudTotal: "%", cloudLow: "%", cloudMid: "%", cloudHigh: "%", visibility: "m",
} as const satisfies Record<z.infer<typeof WeatherMetricNameSchema>, string>;
export const AIR_UNITS = { pm25: "μg/m³", pm10: "μg/m³", referenceAqi: "US_EPA" } as const;
export const WeatherCodeSchema = z.union([
  z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(45), z.literal(48),
  z.literal(51), z.literal(53), z.literal(55), z.literal(56), z.literal(57),
  z.literal(61), z.literal(63), z.literal(65), z.literal(66), z.literal(67),
  z.literal(71), z.literal(73), z.literal(75), z.literal(77),
  z.literal(80), z.literal(81), z.literal(82), z.literal(85), z.literal(86),
  z.literal(95), z.literal(96), z.literal(97), z.literal(99),
]);
export const WeatherSchema = z.strictObject({
  temperature: NumberMetricSchema,
  humidity: createMetricSchema(percent),
  weatherCode: createMetricSchema(WeatherCodeSchema),
  precipitation: createMetricSchema(nonnegative),
  precipitationProbability: createMetricSchema(percent),
  windSpeed: createMetricSchema(nonnegative),
  windGust: createMetricSchema(nonnegative),
  windFrom: createMetricSchema(bearing),
  cloudTotal: createMetricSchema(percent), cloudLow: createMetricSchema(percent),
  cloudMid: createMetricSchema(percent), cloudHigh: createMetricSchema(percent),
  visibility: createMetricSchema(nonnegative),
});
export const AirSchema = z.strictObject({
  pm25: createMetricSchema(nonnegative), pm10: createMetricSchema(nonnegative),
  referenceAqi: createMetricSchema(nonnegative),
});
export const LocationSchema = z.strictObject({
  id: z.string().regex(/^geonames:[1-9]\d*$/), name: TextSchema,
  administrativePath: z.array(TextSchema).min(1), granularity: z.enum(["district", "city"]),
  ...CoordinatesSchema.shape, timezone: z.literal(PRODUCT_TIMEZONE),
});
export const SourceSchema = z.strictObject({
  id: TextSchema, provider: TextSchema, dataset: TextSchema, model: TextSchema.nullable(),
  kind: z.enum(["forecast", "observation", "astronomical"]),
  fetchedAt: InstantSchema.nullable(), issuedAt: InstantSchema.nullable(),
  validFrom: InstantSchema.nullable(), validTo: InstantSchema.nullable(),
  nativeResolution: TextSchema.nullable(), attributionUrl: z.url({ protocol: /^https?$/ }),
  status: z.enum(["ok", "stale", "failed", "disabled"]),
}).refine((source) => source.validFrom === null || source.validTo === null ||
  Date.parse(source.validFrom) < Date.parse(source.validTo), {
  message: "来源有效期必须正序", path: ["validTo"],
});
export const LightAssessmentSchema = z.strictObject({
  phase: z.enum(["night", "blue", "golden", "day", "unknown"]),
  character: z.enum(["direct", "diffuse", "variable", "unknown"]),
  altitude: z.number().min(-90).max(90).nullable(), azimuth: bearing.nullable(),
  description: TextSchema, reasons: NotesSchema, limitations: NotesSchema, sourceIds: SourceIdsSchema,
});
export const RiskNoteSchema = TimeRangeSchema.safeExtend({
  code: z.enum(["thunderstorm", "heavy-rain", "strong-wind", "air-quality"]),
  message: TextSchema, sourceIds: SourceIdsSchema,
});
export const SolarEventsSchema = z.strictObject({
  sunrise: InstantSchema.nullable(), sunset: InstantSchema.nullable(),
  morningBlue: TimeRangeSchema.nullable(), morningGolden: TimeRangeSchema.nullable(),
  eveningGolden: TimeRangeSchema.nullable(), eveningBlue: TimeRangeSchema.nullable(),
  notes: NotesSchema,
});
export const SummarySchema = z.strictObject({
  headline: TextSchema, changes: NotesSchema, opportunities: NotesSchema, limitations: NotesSchema,
  temperatureRange: z.strictObject({
    min: z.number().nullable(), max: z.number().nullable(),
    coveredHours: z.number().int().min(0).max(24), totalHours: z.literal(24),
  }).refine(({ min, max, coveredHours }) => coveredHours === 0
    ? min === null && max === null : min !== null && max !== null && min <= max, {
    message: "温度范围必须与有效覆盖数一致且 min ≤ max",
  }),
});
export const RecommendedWindowSchema = TimeRangeSchema.safeExtend({
  status: z.enum(["past", "current", "future"]), reasons: NotesSchema, reasonCodes: NotesSchema,
  limitations: NotesSchema, sourceIds: SourceIdsSchema,
});
export const GenreAdviceSchema = z.strictObject({
  genre: GenreSchema, allWindows: z.array(RecommendedWindowSchema),
  recommendedWindows: z.array(RecommendedWindowSchema).max(3),
  timing: TextSchema, light: TextSchema, opportunities: NotesSchema, limitations: NotesSchema,
  alternatives: NotesSchema,
  film: z.strictObject({
    type: z.enum(["彩色负片", "黑白负片", "彩色反转片"]),
    sensitivity: z.enum(["低感", "中感", "较高感"]), reason: TextSchema, caveat: TextSchema,
  }),
});
export const OpportunitySchema = z.strictObject({
  status: z.enum(["assessed", "unknown"]),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable(),
  label: TextSchema, targetTime: InstantSchema.nullable(), confidence: ConfidenceSchema.nullable(),
  reasons: NotesSchema, limitations: NotesSchema, sourceIds: SourceIdsSchema,
}).refine(({ status, level, confidence, targetTime }) => status === "unknown"
  ? level === null && confidence === null
  : level !== null && confidence !== null && targetTime !== null, {
  message: "未知机会不能冒充最低等级；评估须有等级、依据置信度及目标时刻",
});
export const HourSchema = TimeRangeSchema.safeExtend({
  weather: WeatherSchema, air: AirSchema, light: LightAssessmentSchema, risks: z.array(RiskNoteSchema),
}).refine(({ start, end }) => Date.parse(end) - Date.parse(start) === HOUR_MS &&
  Date.parse(start) % HOUR_MS === 0, { message: "小时格必须从整点开始、长度一小时" });

/** Plain-language reading of the same data; carries no score, threshold or source detail. */
export const ReadingSchema = z.strictObject({ label: TextSchema, detail: TextSchema, key: z.string().regex(/^[a-z0-9-]+$/) });
export const DeviceReadingSchema = z.strictObject({
  fields: z.array(z.strictObject({ name: TextSchema, value: TextSchema })),
  meaning: z.array(TextSchema).min(1).max(2), notices: z.array(TextSchema), reference: z.array(TextSchema),
  trend: z.strictObject({ value: z.number().nullable(), key: z.string().regex(/^[a-z0-9-]+$/), label: TextSchema }),
});
const StatusSchema = z.enum(["past", "current", "future"]);
const GenreLineSchema = z.strictObject({
  status: z.enum(["now", "upcoming", "maybe", "passed", "none"]), when: TextSchema, line: TextSchema,
});
export const InterpretationSchema = z.strictObject({
  tone: z.enum(["go", "maybe", "poor", "done", "unknown"]),
  headline: TextSchema.max(28), lead: TextSchema, weatherLine: TextSchema, nextUp: z.array(TextSchema).min(1).max(3),
  risks: z.array(TimeRangeSchema.safeExtend({ code: RiskNoteSchema.shape.code, status: StatusSchema, text: TextSchema })),
  periods: z.array(TimeRangeSchema.safeExtend({
    name: z.enum(["天亮前", "清晨", "上午", "下午", "傍晚", "入夜"]), status: StatusSchema, sky: ReadingSchema,
    temperature: z.strictObject({ min: z.number(), max: z.number() }).nullable(), summary: TextSchema,
  })).min(1).max(6),
  hours: z.array(z.strictObject({
    sky: ReadingSchema, rain: ReadingSchema, wind: ReadingSchema.extend({ short: z.string().trim() }), visibility: ReadingSchema,
    air: ReadingSchema, light: ReadingSchema.extend({ short: TextSchema }), temperature: ReadingSchema, sun: ReadingSchema,
    sentences: z.array(TextSchema).min(2).max(3),
    marks: z.strictObject({ timing: StatusSchema, recommendation: TextSchema.nullable(), risks: z.array(TextSchema) }),
    devices: z.strictObject({ wind: DeviceReadingSchema, direction: DeviceReadingSchema, light: DeviceReadingSchema, weather: DeviceReadingSchema }),
  })).length(24),
  genres: z.strictObject({ landscape: GenreLineSchema, portrait: GenreLineSchema, street: GenreLineSchema }),
  sunset: z.strictObject({ title: TextSchema, line: TextSchema }),
  dataNote: TextSchema.nullable(),
});

export const BriefingSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION), rulesVersion: z.literal(RULES_VERSION),
  generatedAt: InstantSchema, localDate: LocalDateSchema, location: LocationSchema,
  state: z.enum(["ready", "partial", "stale", "unavailable"]), sources: z.array(SourceSchema),
  summary: SummarySchema, hours: z.array(HourSchema).length(24), solar: SolarEventsSchema,
  sunsetOpportunity: OpportunitySchema,
  advice: z.strictObject({ landscape: GenreAdviceSchema, portrait: GenreAdviceSchema, street: GenreAdviceSchema }),
  interpretation: InterpretationSchema,
  warnings: NotesSchema,
}).superRefine((briefing, ctx) => {
  // A format failure is already a Zod issue; do not throw from a refinement.
  if (!LocalDateSchema.safeParse(briefing.localDate).success) return;
  const expected = createDayHours(briefing.localDate);
  briefing.hours.forEach((hour, index) => {
    if (expected[index] && (Date.parse(hour.start) !== Date.parse(expected[index].start) ||
      Date.parse(hour.end) !== Date.parse(expected[index].end))) {
      ctx.addIssue({ code: "custom", message: "必须是目标北京时间日期的24个连续小时", path: ["hours", index] });
    }
  });
  for (const genre of GenreSchema.options) {
    if (briefing.advice[genre].genre !== genre) {
      ctx.addIssue({ code: "custom", message: "题材键与建议题材不一致", path: ["advice", genre, "genre"] });
    }
  }
  for (const [key, event] of Object.entries(briefing.solar)) {
    if (key === "notes" || event === null) continue;
    const instants = typeof event === "string" ? [event] : "start" in event ? [event.start, event.end] : [];
    if (instants.some((instant) => InstantSchema.safeParse(instant).success && shanghaiDate(instant) !== briefing.localDate)) {
      ctx.addIssue({ code: "custom", message: "太阳事件必须属于目标北京时间日期", path: ["solar", key] });
    }
  }
  const metrics = briefing.hours.flatMap((hour) => [...Object.values(hour.weather), ...Object.values(hour.air)]);
  const hasValues = metrics.some((metric) => metric.value !== null);
  if ((briefing.state === "unavailable") !== !hasValues) {
    ctx.addIssue({ code: "custom", message: "全部天气与空气无有效值时必须 unavailable；星历不代替天气", path: ["state"] });
  } else if (hasValues && metrics.some((metric) => metric.state === "stale") && briefing.state !== "stale") {
    ctx.addIssue({ code: "custom", message: "使用旧气象值时简报必须 stale", path: ["state"] });
  } else if (hasValues && briefing.state === "ready" &&
    briefing.sources.some((source) => source.status === "failed" || source.status === "disabled")) {
    ctx.addIssue({ code: "custom", message: "来源失败或禁用时不能宣称 ready", path: ["state"] });
  }
});
