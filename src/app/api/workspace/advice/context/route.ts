import { handleAdviceContext } from "../../../../../server/workspace/home-advice";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handleAdviceContext(request);
