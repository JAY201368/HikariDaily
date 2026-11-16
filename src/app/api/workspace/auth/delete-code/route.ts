import { handleAuth } from "@/server/workspace/auth-routes";
export const runtime = "nodejs";
export const POST = (request: Request) => handleAuth("delete-code", request);
