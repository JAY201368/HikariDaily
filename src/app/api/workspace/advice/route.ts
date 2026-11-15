import { handleAdvice } from "../../../../server/workspace/advice-routes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => handleAdvice(request);
