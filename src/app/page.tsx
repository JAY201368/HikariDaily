import { GenreSchema } from "../domain/schemas";
import { getBriefing, briefingFailure } from "../server/briefing-service";
import { BriefingClient } from "../components/prototype-frontend";
import { cookies } from "next/headers";
import { loadHomeAdvice } from "../server/workspace/home-advice";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type SearchParams = Record<string, string | string[] | undefined>;
export default async function HomePage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = await searchParams ?? {};
  const genre = GenreSchema.safeParse(params.genre);
  const result = params.place === undefined ? null : typeof params.place !== "string"
    ? briefingFailure("INVALID_LOCATION") : await getBriefing(params.place);
  let initialWorkspace = { context: null, advice: null } as Awaited<ReturnType<typeof loadHomeAdvice>>;
  if (result?.data) {
    // Also allows direct server component contract tests outside a Next request.
    let cookie = "";
    try { cookie = (await cookies()).toString(); } catch { /* No request context. */ }
    initialWorkspace = await loadHomeAdvice(result.data, new Request("https://hikari.invalid/", { headers: { cookie } }));
  }
  return <>
    <BriefingClient initialPlace={params.place === undefined ? null : typeof params.place === "string" ? params.place : ""} initialGenre={genre.success ? genre.data : "landscape"} initialResult={result} initialWorkspace={initialWorkspace} />
  </>;
}
