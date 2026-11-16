import "server-only";
import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { getPool } from "./db";
import { unavailable } from "./errors";

export function identityConfig() {
  const origin = process.env.HIKARI_APP_ORIGIN;
  const host = process.env.AUTHING_APP_HOST;
  const clientId = process.env.AUTHING_APP_ID;
  const clientSecret = process.env.AUTHING_APP_SECRET;
  const secret = process.env.HIKARI_AUTH_SECRET;
  if (!origin || !host || !clientId || !clientSecret || !secret || secret.length < 32) throw unavailable();
  const app = new URL(origin), provider = new URL(host);
  if (app.origin !== origin || (app.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && app.hostname === "localhost")) || provider.protocol !== "https:" || provider.origin !== host) throw unavailable();
  return { origin, host, clientId, clientSecret, secret };
}
export function identityOptions() {
  const { origin, host, clientId, clientSecret, secret } = identityConfig();
  return {
    appName: "逐光日刊", baseURL: origin, basePath: "/api/auth", secret,
    database: getPool(), trustedOrigins: [origin],
    user: { modelName: "identity_users" },
    session: { modelName: "identity_sessions", expiresIn: 30 * 86400, cookieCache: { enabled: false } },
    account: { modelName: "identity_accounts", accountLinking: { enabled: false }, encryptOAuthTokens: true },
    verification: { modelName: "identity_verifications" },
    advanced: { cookiePrefix: "hikari_identity", database: { generateId: () => randomUUID() } },
    plugins: [genericOAuth({ config: [{ providerId: "authing", clientId, clientSecret,
      discoveryUrl: `${host}/oidc/.well-known/openid-configuration`,
      scopes: ["openid", "profile", "email"], prompt: "login" as const, pkce: true, requireIdTokenVerification: true,
      requireEmailVerification: true, authentication: "basic" as const,
      authorizationUrlParams: { ui_locales: "zh-CN" },
    }] })],
  };
}
let instance: ReturnType<typeof betterAuth<ReturnType<typeof identityOptions>>> | undefined;
export function getIdentity() { return instance ??= betterAuth(identityOptions()); }
/** Cookie presence is only a cheap guest fast path, never authorization. */
export function sessionToken(request: Request): string | null {
  return request.headers.get("cookie")?.match(/(?:^|;\s*)(?:__Secure-)?hikari_identity\.session_token=([^;]+)/)?.[1] ?? null;
}
