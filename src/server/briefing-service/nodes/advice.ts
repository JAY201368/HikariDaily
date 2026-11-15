import "server-only";
import { analyzeGenreAdvice } from "../../../domain/photography";
import { GenreAdviceSchema } from "../../../domain/schemas";
import type { Genre } from "../../../domain/types";
import type { BriefingCapabilities } from "../contracts";
import type { BriefingGraphState } from "../state";

export function createAdviceNode(genre: Genre, capabilities: BriefingCapabilities) {
  return async ({ day, solar, location, now, sunsetOpportunity }: BriefingGraphState) => {
    const capability = capabilities.genreAdvice?.[genre];
    const advice = GenreAdviceSchema.parse(capability
      ? await capability(structuredClone({ day, solar, location, genre, now, sunsetOpportunity }))
      : analyzeGenreAdvice(day, solar, location, genre, now, sunsetOpportunity));
    if (advice.genre !== genre) throw new RangeError("建议题材与节点不匹配");
    return genre === "landscape" ? { landscapeAdvice: advice }
      : genre === "portrait" ? { portraitAdvice: advice } : { streetAdvice: advice };
  };
}
export function collectAdvice({ landscapeAdvice, portraitAdvice, streetAdvice }: BriefingGraphState) {
  return { advice: { landscape: landscapeAdvice, portrait: portraitAdvice, street: streetAdvice } };
}
