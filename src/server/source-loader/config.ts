import "server-only";
import { z } from "zod";
import { validMetUserAgent } from "../providers/met-norway";

const switchSchema = z.enum(["true", "false"]);
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HIKARI_SOURCE_MODE: z.enum(["live", "fixture"]).default("live"),
  HIKARI_GFS_ENABLED: switchSchema.default("true"),
  HIKARI_MET_ENABLED: switchSchema.default("true"),
  HIKARI_CAMS_ENABLED: switchSchema.default("true"),
  HIKARI_SUNSET_ENABLED: switchSchema.default("true"),
  HIKARI_SOURCE_CACHE: z.enum(["disabled", "postgres", "vercel"]).default("disabled"),
  HIKARI_SHARED_CACHE_VERIFIED: switchSchema.default("false"),
  MET_NO_USER_AGENT: z.string().optional(),
  VERCEL: z.string().optional(), VERCEL_PROJECT_ID: z.string().optional(), VERCEL_ENV: z.string().optional(),
});
export type SourceConfig = {
  mode: "live" | "fixture"; production: boolean;
  enabled: { weather: boolean; crosscheck: boolean; air: boolean };
  sunsetEnabled: boolean;
  metUserAgent: string | undefined;
  cache: "disabled" | "postgres" | "vercel"; cacheNamespace: string | null;
};
export function readSourceConfig(env: Record<string, string | undefined> = process.env): SourceConfig {
  const parsed = EnvSchema.safeParse(env);
  // Never echo values, Zod errors or contact details into a log/client error.
  if (!parsed.success) throw new Error("INVALID_SOURCE_CONFIG");
  const e = parsed.data;
  if (e.NODE_ENV === "production" && e.HIKARI_SOURCE_MODE === "fixture") throw new Error("PRODUCTION_FIXTURE_FORBIDDEN");
  const platform = e.HIKARI_SHARED_CACHE_VERIFIED === "true" && e.VERCEL === "1" && /^prj_[A-Za-z0-9_-]+$/.test(e.VERCEL_PROJECT_ID ?? "") &&
    ["production", "preview"].includes(e.VERCEL_ENV ?? "");
  return {
    mode: e.HIKARI_SOURCE_MODE, production: e.NODE_ENV === "production",
    enabled: { weather: e.HIKARI_GFS_ENABLED === "true", crosscheck: e.HIKARI_MET_ENABLED === "true", air: e.HIKARI_CAMS_ENABLED === "true" },
    sunsetEnabled: e.HIKARI_SUNSET_ENABLED === "true",
    metUserAgent: validMetUserAgent(e.MET_NO_USER_AGENT) ? e.MET_NO_USER_AGENT : undefined,
    cache: e.HIKARI_SOURCE_CACHE,
    cacheNamespace: e.HIKARI_SOURCE_CACHE === "vercel" && platform
      ? `hikari:${e.VERCEL_PROJECT_ID}:${e.VERCEL_ENV}:sources-v1` : null,
  };
}
