import { briefingFailure, getBriefing } from "../../../server/briefing-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const result = [...params.keys()].some((key) => key !== "place") || params.getAll("place").length !== 1
    ? briefingFailure("INVALID_LOCATION") : await getBriefing(params.get("place"));
  return Response.json({ data: result.data, error: result.error }, {
    status: result.status, headers: { "Cache-Control": "no-store" },
  });
}
