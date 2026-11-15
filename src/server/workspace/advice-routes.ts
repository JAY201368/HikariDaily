import "server-only";
import { z } from "zod";
import { adviceInputSchema } from "../../domain/workspace/advice";
import { requireAccount } from "./auth";
import { invalid, WorkspaceError } from "./errors";
import { json, rateLimit, readJson, requireSameOrigin, route } from "./http";
import { getBriefing } from "../briefing-service";
import { enhanceBriefing } from "./advice";
import { retrieveKnowledge } from "./knowledge";
import { GenreSchema } from "../../domain/schemas";
export function handleAdvice(request: Request, dependencies = { getBriefing, enhanceBriefing }) {
  return route(async () => {
    requireSameOrigin(request);
    const account = await requireAccount(request);
    await rateLimit(`advice:${account.id}`, 12);
    const input = adviceInputSchema.safeParse(await readJson(request)); if (!input.success) throw invalid();
    const base = await dependencies.getBriefing(input.data.place);
    if (!base.data) throw new WorkspaceError(base.error?.code ?? "BRIEFING_UNAVAILABLE", base.status, base.error?.message ?? "天气简报暂不可用");
    return json(await dependencies.enhanceBriefing(account.id, base.data, { signal: request.signal }));
  });
}
/** Authenticated read-only shared evidence search. Private sources have a separate T04 boundary. */
export function handleKnowledge(request: Request) {
  return route(async () => {
    await requireAccount(request);
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const input = z.strictObject({ genre: GenreSchema, query: z.string().max(200).default("") }).safeParse(params); if (!input.success) throw invalid();
    const evidence = await retrieveKnowledge({ genre: input.data.genre, phases: ["unknown"], characters: ["unknown"], weather: ["unknown"], equipment: [], aesthetics: [], risks: [] }, input.data.query);
    return json({ evidence, coverage: evidence.length ? "covered" : "not-covered" });
  });
}
