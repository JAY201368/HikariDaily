import { handleAuth } from "@/server/workspace/auth-routes";
export const runtime = "nodejs";
export const GET = (request: Request) => handleAuth("session", request);
