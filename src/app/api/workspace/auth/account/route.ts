import { handleAuth } from "@/server/workspace/auth-routes";
export const runtime = "nodejs";
export const DELETE = (request: Request) => handleAuth("account", request);
