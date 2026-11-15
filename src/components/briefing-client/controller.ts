import { z } from "zod";
import { BriefingSchema, GenreSchema, LocationSchema } from "../../domain/schemas";
import { shanghaiDate, shanghaiDayBounds } from "../../domain/time";
import type { Briefing, Genre } from "../../domain/types";
import { adviceContextSchema, adviceResultSchema, adviceTimingValid, type AdviceContext, type AdviceEnhancementResult } from "../../domain/workspace/advice";
import { snapshotHash } from "../../domain/workspace/snapshot";
import { canonicalSnapshot } from "../../domain/workspace/snapshot";
import type { BriefingResult } from "../../server/briefing-service";

export const MEMORY_KEY = "hikari-daily.preferences.v1";
export const REFRESH_MS = 15 * 60 * 1000;
export const WORKSPACE_INVALIDATION_KEY = "hikari:workspace:invalidate";
const placeId = z.string().regex(/^geonames:[1-9]\d*$/);
const memorySchema = z.strictObject({ place: placeId.nullable(), genre: GenreSchema });
const envelope = z.strictObject({ data: BriefingSchema.nullable(), error: z.strictObject({ code: z.string(), message: z.string() }).nullable() });
const searchEnvelope = z.strictObject({ data: z.array(LocationSchema).max(10), error: z.null() });
const errorCodes = ["INVALID_LOCATION", "LOCATION_NOT_FOUND", "LOCATION_UNAVAILABLE", "WEATHER_UNAVAILABLE", "BRIEFING_UNAVAILABLE"];
const failed = (): BriefingResult => ({ status: 503, data: null, error: { code: "BRIEFING_UNAVAILABLE", message: "简报暂时不可用，请检查网络后重试。" } });
export type Selection = { place: string | null; genre: Genre };
export type ClientState = Selection & { result: BriefingResult | null; loading: boolean; selectedHour: number | null;
  advice: AdviceEnhancementResult | null; adviceContext: AdviceContext | null; adviceLoading: boolean; adviceError: string | null };
export type ClientRuntime = {
  now: () => number;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  visible: () => boolean;
  timer: (callback: () => void, ms: number) => () => void;
  readUrl: () => string;
  writeUrl: (selection: Selection, replace: boolean) => void;
  readMemory: () => string | null;
  writeMemory: (value: string) => void;
  workspace?: boolean;
};
export function readSelection(url: string, stored: string | null = null): Selection {
  let memory: z.infer<typeof memorySchema> | null = null;
  try { memory = memorySchema.parse(JSON.parse(stored ?? "null")); } catch { /* Storage is optional and untrusted. */ }
  const params = new URL(url, "https://local.invalid").searchParams;
  const genre = params.has("genre") ? GenreSchema.safeParse(params.get("genre")) : GenreSchema.safeParse(memory?.genre);
  return { place: params.has("place") ? (params.getAll("place").length === 1 ? params.get("place") : "") : memory?.place ?? null,
    genre: genre.success ? genre.data : "landscape" };
}
export async function fetchBriefing(runtime: Pick<ClientRuntime, "fetch">, place: string, signal: AbortSignal): Promise<BriefingResult> {
  const response = await runtime.fetch(`/api/briefing?${new URLSearchParams({ place })}`, { signal, cache: "no-store" });
  const parsed = envelope.parse(await response.json());
  if (![200, 400, 404, 503].includes(response.status) ||
    (response.status === 200 ? parsed.error !== null || !parsed.data || parsed.data.state === "unavailable"
      : !parsed.error || !errorCodes.includes(parsed.error.code) || (parsed.data !== null && (response.status !== 503 || parsed.data.state !== "unavailable"))) ||
    (parsed.data && parsed.data.location.id !== place)) throw new Error("INVALID_BRIEFING_RESPONSE");
  return { status: response.status as BriefingResult["status"], ...parsed };
}
export async function fetchLocations(fetcher: ClientRuntime["fetch"], query: string, signal: AbortSignal) {
  const response = await fetcher(`/api/locations?${new URLSearchParams({ q: query })}`, { signal });
  if (!response.ok) throw new Error("LOCATION_UNAVAILABLE");
  return searchEnvelope.parse(await response.json()).data;
}

/** Client orchestration only: never computes weather or photography conclusions. Clock and I/O are injectable. */
export class BriefingController {
  private state: ClientState;
  private listeners = new Set<() => void>();
  private runtime: ClientRuntime | null = null;
  private cancelTimer: (() => void) | null = null;
  private request: AbortController | null = null;
  private generation = 0;
  private checkedAt: number | null;
  private adviceRequest: AbortController | null = null;
  private adviceGeneration = 0;
  private lastAttempt: { base: Briefing; context: string; advice: AdviceEnhancementResult | null } | null = null;
  constructor(initial: Selection & { result: BriefingResult | null; workspace?: { context: AdviceContext | null; advice: AdviceEnhancementResult | null } }) {
    const context = initial.workspace?.context ?? null, supplied = initial.workspace?.advice ?? null;
    // RSC may serialize repeated objects separately. Restore only the exact paired base identity.
    const advice = supplied && initial.result?.data && canonicalSnapshot(supplied.baseBriefing) === canonicalSnapshot(initial.result.data)
      ? { ...supplied, baseBriefing: initial.result.data } : null;
    this.state = { place: initial.place, genre: initial.genre, result: initial.result, loading: false, selectedHour: null,
      advice, adviceContext: context, adviceLoading: false, adviceError: null };
    if (context && initial.result?.data) this.lastAttempt = { base: initial.result.data, context: this.contextKey(context), advice };
    this.checkedAt = initial.result?.data ? Date.parse(initial.result.data.generatedAt) : null;
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<ClientState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach((listener) => listener()); }
  private remember(replace = false) {
    const selection = { place: this.state.place, genre: this.state.genre };
    this.runtime?.writeUrl(selection, replace);
    try { this.runtime?.writeMemory(JSON.stringify(selection)); } catch { /* Private mode/quota must not break reading. */ }
  }
  start(runtime: ClientRuntime) {
    this.runtime = runtime;
    let stored = null;
    try { stored = runtime.readMemory(); } catch { /* Optional browser storage. */ }
    const selection = readSelection(runtime.readUrl(), stored);
    const changed = selection.place !== this.state.place;
    this.update({ genre: selection.genre });
    this.checkedAt ??= runtime.now();
    if (changed) this.changePlace(selection.place);
    this.remember(true);
    if (!changed) { if (this.state.loading) void this.load(); else { this.check(); void this.revalidateAdvice(); } }
    return () => this.stop();
  }
  stop() { this.cancelTimer?.(); this.cancelTimer = null; this.request?.abort(); this.request = null; this.generation++; this.cancelAdvice(); this.runtime = null; }
  navigate() {
    if (!this.runtime) return;
    const selection = readSelection(this.runtime.readUrl());
    this.update({ genre: selection.genre });
    if (selection.place !== this.state.place) this.changePlace(selection.place);
    try { this.runtime.writeMemory(JSON.stringify(selection)); } catch { /* Optional storage. */ }
  }
  selectPlace(place: string | null) { this.changePlace(place); this.remember(); }
  selectGenre(genre: Genre) { this.update({ genre }); this.remember(); }
  selectHour(hour: number) { if (Number.isInteger(hour) && hour >= 0 && hour < 24) this.update({ selectedHour: hour }); }
  private changePlace(place: string | null) {
    this.request?.abort(); this.generation++; this.request = null;
    this.cancelAdvice(); this.lastAttempt = null;
    this.update({ place, result: null, selectedHour: null, loading: false, advice: null, adviceLoading: false, adviceError: null });
    if (place !== null) void this.load(); else this.schedule();
  }
  retry = () => { if (this.state.place !== null) void this.load(); };
  visibilityChanged = () => { this.check(); };
  workspaceChanged = () => { this.lastAttempt = null; void this.revalidateAdvice(); };
  focusChanged = () => { this.check(); void this.revalidateAdvice(); };
  retryAdvice = () => { this.lastAttempt = null; void this.revalidateAdvice(); };
  private contextKey(context: AdviceContext) { return `${context.ownerId}:${context.configVersion}:${context.enabled}`; }
  private cancelAdvice() { this.adviceRequest?.abort(); this.adviceRequest = null; this.adviceGeneration++; }
  private async readContext(runtime: ClientRuntime, signal: AbortSignal): Promise<AdviceContext | null> {
    const response = await runtime.fetch("/api/workspace/advice/context", { signal, cache: "no-store", credentials: "same-origin" });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error("CONTEXT_UNAVAILABLE");
    return adviceContextSchema.parse((await response.json()).data);
  }
  /** Revalidate identity before and after generation. Only the returned authoritative pair is installed. */
  private async revalidateAdvice() {
    const runtime = this.runtime;
    if (!runtime?.workspace) return;
    this.cancelAdvice();
    const request = new AbortController(), generation = this.adviceGeneration;
    this.adviceRequest = request;
    const base = this.state.result?.data, place = this.state.place;
    const current = () => this.runtime === runtime && generation === this.adviceGeneration && !request.signal.aborted &&
      this.state.result?.data === base && this.state.place === place && (!base || adviceTimingValid(base, runtime.now()));
    this.update({ advice: null, adviceContext: null, adviceError: null, adviceLoading: !!base && !this.state.loading });
    try {
      const context = await this.readContext(runtime, request.signal);
      if (!current()) return;
      this.update({ adviceContext: context });
      if (!context?.enabled || !base || this.state.loading || base.state === "unavailable") return;
      const key = this.contextKey(context);
      if (this.lastAttempt?.base === base && this.lastAttempt.context === key) {
        this.update({ advice: this.lastAttempt.advice }); return;
      }
      this.lastAttempt = { base, context: key, advice: null };
      const response = await runtime.fetch("/api/workspace/advice", { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ place }), signal: request.signal });
      if (!response.ok) throw new Error("ADVICE_UNAVAILABLE");
      const advice = adviceResultSchema.parse((await response.json()).data);
      if (!current() || advice.metadata.ownerId !== context.ownerId || advice.metadata.configVersion !== context.configVersion ||
        advice.baseBriefing.location.id !== place || advice.baseBriefing.localDate !== base.localDate || !adviceTimingValid(advice.baseBriefing, runtime.now()) ||
        await snapshotHash(advice.baseBriefing) !== advice.factsHash) throw new Error("ADVICE_MISMATCH");
      const verified = await this.readContext(runtime, request.signal);
      if (!current()) return;
      if (!verified || this.contextKey(verified) !== key) { this.lastAttempt = null; this.update({ adviceContext: verified }); return; }
      this.lastAttempt = { base: advice.baseBriefing, context: key, advice };
      this.checkedAt = runtime.now();
      // API fetched its own newer facts; replace both together, never mutate the old base.
      this.update({ result: { status: 200, data: advice.baseBriefing, error: null }, advice, adviceContext: verified });
      this.schedule();
    } catch (error) {
      if (current()) this.update({ advice: null, adviceError: error instanceof Error && error.message === "CONTEXT_UNAVAILABLE"
        ? "账户与模型状态暂不可用，当前展示天气与规则建议。" : "AI 建议暂未生成，当前展示天气与规则建议。" });
    } finally {
      if (generation === this.adviceGeneration && this.runtime === runtime) { this.adviceRequest = null; this.update({ adviceLoading: false }); }
    }
  }
  private check() {
    const runtime = this.runtime;
    this.cancelTimer?.(); this.cancelTimer = null;
    if (!runtime?.visible() || this.state.place === null) return;
    const now = runtime.now();
    const wrongDay = (this.checkedAt !== null && shanghaiDate(this.checkedAt) !== shanghaiDate(now)) ||
      (this.state.result?.data && this.state.result.data.localDate !== shanghaiDate(now));
    if (wrongDay || (this.state.advice && !adviceTimingValid(this.state.advice.baseBriefing, now)) || (this.checkedAt !== null && now - this.checkedAt >= REFRESH_MS)) void this.load();
    else this.schedule();
  }
  private schedule() {
    this.cancelTimer?.(); this.cancelTimer = null;
    const runtime = this.runtime;
    if (!runtime?.visible() || this.state.place === null) return;
    const now = runtime.now();
    const midnight = shanghaiDayBounds(shanghaiDate(now)).end;
    const base = this.state.advice?.baseBriefing;
    const transitions = base ? [base.solar.sunrise, base.solar.sunset, ...Object.values(base.advice).flatMap(a => a.recommendedWindows.flatMap(w => [w.start, w.end]))]
      .filter((t): t is string => !!t).map(Date.parse).filter(t => t > now) : [];
    const due = Math.min(midnight, (this.checkedAt ?? now) + REFRESH_MS, ...transitions);
    this.cancelTimer = runtime.timer(() => this.check(), Math.max(1, due - now));
  }
  private async load() {
    const runtime = this.runtime, place = this.state.place;
    if (!runtime || place === null) return;
    this.request?.abort();
    this.cancelAdvice(); this.lastAttempt = null;
    const request = new AbortController(), generation = ++this.generation;
    this.request = request;
    const targetDay = shanghaiDate(runtime.now());
    this.checkedAt = runtime.now();
    // A whole result is replaced atomically; cross-day and cross-place content is cleared.
    const sameDay = this.state.result?.data?.localDate === targetDay;
    this.update({ loading: true, result: sameDay ? this.state.result : null, selectedHour: sameDay ? this.state.selectedHour : null, advice: null, adviceLoading: false, adviceError: null });
    this.schedule();
    let result: BriefingResult;
    try { result = await fetchBriefing(runtime, place, request.signal); } catch { result = failed(); }
    if (generation !== this.generation || request.signal.aborted || this.runtime !== runtime) return;
    this.request = null;
    if (shanghaiDate(runtime.now()) !== targetDay) {
      this.update({ result: null, selectedHour: null, loading: false });
      if (runtime.visible()) void this.load();
      return;
    }
    // Reject stale/wrong-day payloads as a whole, including valid but mismatched API documents.
    if (result.data && result.data.localDate !== targetDay) result = failed();
    this.update({ result, loading: false });
    this.schedule();
    void this.revalidateAdvice();
  }
}
