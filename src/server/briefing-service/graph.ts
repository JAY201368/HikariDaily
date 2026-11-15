import "server-only";
import { END, START, StateGraph } from "@langchain/langgraph";
import type { BriefingCapabilities, BriefingDependencies } from "./contracts";
import { BriefingInput, BriefingOutput, BriefingState } from "./state";
import type { BriefingGraphState } from "./state";
import { createRequestNodes, prepareTarget } from "./nodes/request";
import { calculateSolar, createSourceNode, normalizeWeather } from "./nodes/weather";
import { analyzeLight, analyzeRisks, assembleHours, assessSunset } from "./nodes/photography";
import { collectAdvice, createAdviceNode } from "./nodes/advice";
import { createInterpretationNode } from "./nodes/interpretation";
import { createSummaryNode } from "./nodes/summary";
import { collectProvenance } from "./nodes/provenance";
import { classifyQuality } from "./nodes/quality";
import { assembleBriefing, buildResult, validateBriefing } from "./nodes/output";

const proceed = ({ result }: BriefingGraphState) => result ? "stop" : "continue";

/** Exposed builder supports adding future nodes; production compiles this same graph. */
export function createBriefingGraphBuilder(deps: BriefingDependencies, capabilities: BriefingCapabilities = {}) {
  const request = createRequestNodes(deps);
  return new StateGraph(BriefingState, { input: BriefingInput, output: BriefingOutput })
    .addNode("validate_request", request.validateRequest)
    .addNode("resolve_location", request.resolveLocation)
    .addNode("prepare_target", prepareTarget)
    .addNode("load_sources", createSourceNode(deps))
    .addNode("calculate_solar", calculateSolar)
    .addNode("refresh_time", request.refreshTime)
    .addNode("normalize_weather", normalizeWeather)
    .addNode("analyze_light", analyzeLight)
    .addNode("analyze_risks", analyzeRisks)
    .addNode("assess_sunset", assessSunset)
    .addNode("assemble_hours", assembleHours)
    .addNode("advise_landscape", createAdviceNode("landscape", capabilities))
    .addNode("advise_portrait", createAdviceNode("portrait", capabilities))
    .addNode("advise_street", createAdviceNode("street", capabilities))
    .addNode("collect_advice", collectAdvice)
    .addNode("interpret", createInterpretationNode(capabilities))
    .addNode("summarize", createSummaryNode(capabilities))
    .addNode("collect_provenance", collectProvenance)
    .addNode("classify_quality", classifyQuality)
    .addNode("assemble_briefing", assembleBriefing)
    .addNode("validate_briefing", validateBriefing)
    .addNode("build_result", buildResult)
    .addEdge(START, "validate_request")
    .addConditionalEdges("validate_request", proceed, { stop: END, continue: "resolve_location" })
    .addConditionalEdges("resolve_location", proceed, { stop: END, continue: "prepare_target" })
    .addEdge("prepare_target", "load_sources")
    .addEdge("prepare_target", "calculate_solar")
    .addEdge(["load_sources", "calculate_solar"], "refresh_time")
    .addConditionalEdges("refresh_time", proceed, { stop: END, continue: "normalize_weather" })
    .addEdge("normalize_weather", "analyze_light")
    .addEdge("normalize_weather", "analyze_risks")
    .addEdge("normalize_weather", "assess_sunset")
    .addEdge(["analyze_light", "analyze_risks", "assess_sunset"], "assemble_hours")
    .addEdge("assemble_hours", "advise_landscape")
    .addEdge("assemble_hours", "advise_portrait")
    .addEdge("assemble_hours", "advise_street")
    .addEdge(["advise_landscape", "advise_portrait", "advise_street"], "collect_advice")
    .addEdge("collect_advice", "interpret")
    .addEdge("interpret", "summarize")
    .addEdge("summarize", "collect_provenance")
    .addEdge("summarize", "classify_quality")
    .addEdge(["collect_provenance", "classify_quality"], "assemble_briefing")
    .addEdge("assemble_briefing", "validate_briefing")
    .addEdge("validate_briefing", "build_result")
    .addEdge("build_result", END);
}

export function createBriefingGraph(deps: BriefingDependencies, capabilities: BriefingCapabilities = {}) {
  return createBriefingGraphBuilder(deps, capabilities).compile();
}
