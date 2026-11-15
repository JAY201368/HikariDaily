import type { z } from "zod";
import type * as schemas from "../schemas";

export type Genre = z.infer<typeof schemas.GenreSchema>;
export type MetricState = z.infer<typeof schemas.MetricStateSchema>;
export type Confidence = z.infer<typeof schemas.ConfidenceSchema>;
export type Metric<T> = z.infer<ReturnType<typeof schemas.createMetricSchema<z.ZodType<T>>>>;
export type WeatherMetricName = z.infer<typeof schemas.WeatherMetricNameSchema>;
export type Location = z.infer<typeof schemas.LocationSchema>;
export type Source = z.infer<typeof schemas.SourceSchema>;
export type Hour = z.infer<typeof schemas.HourSchema>;
export type Opportunity = z.infer<typeof schemas.OpportunitySchema>;
export type Briefing = z.infer<typeof schemas.BriefingSchema>;
export type LightAssessment = z.infer<typeof schemas.LightAssessmentSchema>;
export type RiskNote = z.infer<typeof schemas.RiskNoteSchema>;
export type SolarEvents = z.infer<typeof schemas.SolarEventsSchema>;
export type Summary = z.infer<typeof schemas.SummarySchema>;
export type RecommendedWindow = z.infer<typeof schemas.RecommendedWindowSchema>;
export type GenreAdvice = z.infer<typeof schemas.GenreAdviceSchema>;
