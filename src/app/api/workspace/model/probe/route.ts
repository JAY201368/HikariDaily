import { handleModel } from "@/server/workspace/model-routes";
export const runtime = "nodejs";
export const POST = (request: Request) => handleModel("probe", request);
