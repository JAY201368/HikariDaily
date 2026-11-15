import { searchLocations } from "../../../server/location-service";
import { LocationError, locationErrorResponse } from "../../../server/http/errors";

export const runtime = "nodejs";
export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => key !== "q") || params.getAll("q").length !== 1) throw new LocationError("INVALID_LOCATION");
    const data = await searchLocations(params.get("q") ?? "");
    return Response.json({ data, error: null });
  } catch (error) { return locationErrorResponse(error); }
}
