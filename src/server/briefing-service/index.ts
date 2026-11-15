import "server-only";
import { resolveLocation } from "../providers/geocoding";
import { loadSources } from "../source-loader";
import { createBriefingService } from "./service";

/** Shared directly by SSR and the same-origin API. No whole-Briefing cache. */
export const getBriefing = createBriefingService({ clock: Date.now, resolveLocation, loadSources });
export { createBriefingService, briefingFailure } from "./service";
export type { BriefingResult } from "./service";
export { createBriefingGraph, createBriefingGraphBuilder } from "./graph";
export type { BriefingCapabilities, BriefingDependencies, GenreAdviceInput, SummaryInput } from "./contracts";
