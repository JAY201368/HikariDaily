import { z } from "zod";
import { BriefingSchema, HourSchema, OpportunitySchema, SolarEventsSchema, SourceSchema, WeatherMetricNameSchema } from "../../src/domain/schemas";
import { createDayHours } from "../../src/domain/time";
import type { Genre, GenreAdvice } from "../../src/domain/types";
import { createInterpretation } from "../../src/content/interpret";

/** Artificial contract data only: not an upstream response or production fallback. */
export const fixtureProvenance = {
  kind: "人工合成领域契约fixture", source: "T02 tests", date: "2026-10-22",
  limitation: "不验证真实天气、许可、全国覆盖或预测准确率。",
} as const;

export function missingMetric() {
  return { value: null, state: "missing" as const, sourceIds: [], notes: ["人工合成：无天气数据"] };
}

function advice(genre: Genre): GenreAdvice {
  return { genre, allWindows: [], recommendedWindows: [], timing: "人工合成：暂无法推荐时机",
    light: "人工合成：光照性质未知", opportunities: [], limitations: ["无天气数据"], alternatives: [],
    film: { type: "彩色负片", sensitivity: "中感", reason: "仅供契约测试", caveat: "风格参考，非效果保证" } };
}

export function syntheticBriefing() {
  const base = {
    schemaVersion: "2", rulesVersion: "photo-rules-v0.3", generatedAt: "2026-10-22T12:00:00+08:00",
    localDate: "2026-10-22", location: { id: "geonames:1796236", name: "人工合成上海样例",
      administrativePath: ["上海市"], granularity: "city", latitude: 31.2304, longitude: 121.4737,
      timezone: "Asia/Shanghai" },
    state: "unavailable", sources: [{ id: "synthetic-weather", provider: "人工合成",
      dataset: "无数据契约样例", model: null, kind: "forecast", fetchedAt: null, issuedAt: null,
      validFrom: null, validTo: null, nativeResolution: null, attributionUrl: "https://example.com/synthetic",
      status: "failed" }],
    summary: { headline: "人工合成：天气不可用", changes: [], opportunities: [], limitations: ["无天气数据"],
      temperatureRange: { min: null, max: null, coveredHours: 0, totalHours: 24 } },
    hours: createDayHours("2026-10-22").map((range) => ({ ...range,
      weather: Object.fromEntries(WeatherMetricNameSchema.options.map((name) => [name, missingMetric()])),
      air: { pm25: missingMetric(), pm10: missingMetric(), referenceAqi: missingMetric() },
      light: { phase: "unknown", character: "unknown", altitude: null, azimuth: null,
        description: "人工合成：未知光照", reasons: [], limitations: ["无天气数据"], sourceIds: [] }, risks: [] })),
    solar: { sunrise: null, sunset: null, morningBlue: null, morningGolden: null, eveningGolden: null,
      eveningBlue: null, notes: ["人工合成：未计算太阳事件"] },
    sunsetOpportunity: { status: "unknown", level: null, label: "暂无法判断", targetTime: null,
      confidence: null, reasons: [], limitations: ["人工合成：缺少必要条件"], sourceIds: [] },
    advice: { landscape: advice("landscape"), portrait: advice("portrait"), street: advice("street") },
    warnings: ["人工合成领域fixture，禁止当成真实天气或生产回退"],
  } as const;
  const interpretation = createInterpretation({ hours: z.array(HourSchema).parse(base.hours),
    solar: SolarEventsSchema.parse(base.solar), advice: base.advice, now: base.generatedAt,
    sunsetOpportunity: OpportunitySchema.parse(base.sunsetOpportunity), sources: z.array(SourceSchema).parse(base.sources) });
  return BriefingSchema.parse({ ...base, interpretation });
}
