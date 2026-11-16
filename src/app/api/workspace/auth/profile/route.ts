import { requireAccount } from "@/server/workspace/auth";
import { identityConfig } from "@/server/workspace/identity";
import { route } from "@/server/workspace/http";
export const GET = (request: Request) => route(async () => {
  await requireAccount(request);
  return new Response(null, { status: 302, headers: { Location: `${identityConfig().host}/u`, "Cache-Control": "no-store" } });
});
