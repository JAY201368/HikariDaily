import { handleModel } from "@/server/workspace/model-routes";
export const runtime = "nodejs";
export const GET = (request: Request) => handleModel("get", request);
export const PUT = (request: Request) => handleModel("put", request);
export const DELETE = (request: Request) => handleModel("delete", request);
