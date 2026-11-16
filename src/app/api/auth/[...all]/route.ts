import { z } from "zod";
import { getIdentity, identityConfig } from "@/server/workspace/identity";
import { readJson, requireSameOrigin, route } from "@/server/workspace/http";
import { WorkspaceError } from "@/server/workspace/errors";
export const runtime = "nodejs";
// Expose only the required protocol surface; management/token APIs remain server-only.
const reads = new Set(["/callback/authing", "/error"]);
const writes = new Set(["/sign-in/social", "/sign-out"]);
async function handler(request: Request) {
  return route(async () => {
    const path = new URL(request.url).pathname.slice("/api/auth".length);
    if (!(request.method === "GET" ? reads : writes).has(path)) throw new WorkspaceError("NOT_FOUND", 404, "此账户操作不可用");
    if (request.method === "POST") {
      requireSameOrigin(request);
      const callback = z.string().refine(value => { try { return new URL(value).origin === identityConfig().origin; } catch { return false; } });
      const schema = path === "/sign-in/social"
        ? z.object({ provider: z.literal("authing"), callbackURL: callback, errorCallbackURL: callback.optional() }).strict()
        : z.object({ callbackURL: callback, disableRedirect: z.boolean().optional() }).strict();
      if (!schema.safeParse(await readJson(request.clone())).success) throw new WorkspaceError("AUTH_INPUT_REJECTED", 403, "账户跳转地址或操作不受支持");
    }
    const response = await getIdentity().handler(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  });
}
export const GET = handler;
export const POST = handler;
