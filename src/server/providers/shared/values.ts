import "server-only";
import { z } from "zod";
import { WeatherCodeSchema } from "../../../domain/schemas";
import type { Metric, Source } from "../../../domain/types";
import { createSnapshot, missing, SourceTargetSchema } from "../../../domain/normalization/snapshot";
import type { SourceSnapshot, SourceTarget } from "../../../domain/normalization/snapshot";
import type { HttpMetadata, RequestOptions } from "./http";
export type ProviderOptions = RequestOptions;
export type ProviderResult = { kind: "snapshot"; snapshot: SourceSnapshot; http: HttpMetadata }
  | { kind: "not-modified"; http: HttpMetadata }
  | { kind: "unavailable"; snapshot: SourceSnapshot; http: HttpMetadata; code: string };
export function unavailable(source: Source, version: string, target: SourceTarget, code: string, http: HttpMetadata, disabled = false): ProviderResult {
  return { kind: "unavailable", code, http, snapshot: createSnapshot({ ...source, status: disabled ? "disabled" : "failed" }, version, target, code) };
}
export const targetSchema = SourceTargetSchema;
export function coordinate(value: number) { return String(Math.trunc(value * 10_000) / 10_000); }
export function validNumber(name: string, value: unknown, sourceId: string, notes: string[] = []): Metric<number> {
  let schema: z.ZodType = z.number();
  if (name === "weatherCode") schema = WeatherCodeSchema;
  else if (["humidity", "cloudTotal", "cloudLow", "cloudMid", "cloudHigh", "precipitationProbability"].includes(name)) schema = z.number().min(0).max(100);
  else if (name === "temperature") schema = z.number().min(-100).max(70);
  else if (name === "windFrom") schema = z.number().min(0).max(360);
  else schema = z.number().min(0); // No artificial upper cap: hazardous values must survive.
  if (!schema.safeParse(value).success) return missing(`${name}: ${value === null || value === undefined ? "上游缺失" : "非法范围、类型或未知码"}`);
  return { value: name === "windFrom" && value === 360 ? 0 : value as number, state: "ok", sourceIds: [sourceId], notes };
}
export function sourceBase(id: string, provider: string, dataset: string, model: string, nativeResolution: string, attributionUrl: string): Source {
  return { id, provider, dataset, model, kind: "forecast", fetchedAt: null, issuedAt: null, validFrom: null, validTo: null, nativeResolution, attributionUrl, status: "ok" };
}
