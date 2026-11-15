import { handleAuth } from "@/server/workspace/auth-routes";
export const runtime = "nodejs";
export const PUT = (request: Request) => handleAuth("password", request);
