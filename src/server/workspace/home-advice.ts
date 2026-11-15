import "server-only";
import type { Briefing } from "../../domain/types";
import type { AdviceContext, AdviceEnhancementResult } from "../../domain/workspace/advice";
import { requireAccount, sessionToken } from "./auth";
import { getModelConfig } from "./config";
import { enhanceBriefing } from "./advice";
import { json, rateLimit, route } from "./http";

export async function getAdviceContext(request: Request): Promise<AdviceContext> {
  const account = await requireAccount(request), config = await getModelConfig(account.id);
  const reason = !config.configured ? "MODEL_NOT_CONFIGURED" : config.capabilities.text === "untested" ? "TEXT_CAPABILITY_UNVERIFIED" : config.capabilities.text !== "available" ? "TEXT_CAPABILITY_UNAVAILABLE" : null;
  return { ownerId: account.id, configVersion: config.version, enabled: reason === null, reason };
}
export const handleAdviceContext = (request: Request) => route(async () => json(await getAdviceContext(request)));
/** Called once per private SSR with the very same deterministic result. Ordinary weather never needs a database. */
export async function loadHomeAdvice(base: Briefing | null, request: Request, dependencies = { getAdviceContext, enhanceBriefing, rateLimit }): Promise<{ context: AdviceContext | null; advice: AdviceEnhancementResult | null }> {
  if (!base || !sessionToken(request)) return { context: null, advice: null };
  let context: AdviceContext | null = null;
  try {
    context = await dependencies.getAdviceContext(request);
    if (!context.enabled) return { context, advice: null };
    await dependencies.rateLimit(`advice:${context.ownerId}`, 12);
    const advice = await dependencies.enhanceBriefing(context.ownerId, base, { signal: AbortSignal.timeout(65_000) });
    if (advice.metadata.ownerId !== context.ownerId || advice.metadata.configVersion !== context.configVersion) return { context: null, advice: null };
    return { context, advice };
  } catch { return { context, advice: null }; }
}
