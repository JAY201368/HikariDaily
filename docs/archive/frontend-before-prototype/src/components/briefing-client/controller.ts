import { z } from "zod";
import { BriefingSchema, GenreSchema, LocationSchema } from "../../domain/schemas";
import { shanghaiDate, shanghaiDayBounds } from "../../domain/time";
import type { Genre } from "../../domain/types";
import type { BriefingResult } from "../../server/briefing-service";

export const MEMORY_KEY = "hikari-daily.preferences.v1";
export const REFRESH_MS = 15 * 60 * 1000;
const placeId = z.string().regex(/^geonames:[1-9]\d*$/);
const memorySchema = z.strictObject({ place: placeId.nullable(), genre: GenreSchema });
const envelope = z.strictObject({ data: BriefingSchema.nullable(), error: z.strictObject({ code: z.string(), message: z.string() }).nullable() });
const searchEnvelope = z.strictObject({ data: z.array(LocationSchema).max(10), error: z.null() });
const errorCodes = ["INVALID_LOCATION", "LOCATION_NOT_FOUND", "LOCATION_UNAVAILABLE", "WEATHER_UNAVAILABLE", "BRIEFING_UNAVAILABLE"];
const failed = (): BriefingResult => ({ status: 503, data: null, error: { code: "BRIEFING_UNAVAILABLE", message: "简报暂时不可用，请检查网络后重试。" } });
export type Selection = { place: string | null; genre: Genre };
export type ClientState = Selection & { result: BriefingResult | null; loading: boolean; selectedHour: number | null };
export type ClientRuntime = {
  now: () => number;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  visible: () => boolean;
  timer: (callback: () => void, ms: number) => () => void;
  readUrl: () => string;
  writeUrl: (selection: Selection, replace: boolean) => void;
  readMemory: () => string | null;
  writeMemory: (value: string) => void;
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
  constructor(initial: Selection & { result: BriefingResult | null }) {
    this.state = { ...initial, loading: false, selectedHour: null };
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
    if (!changed) { if (this.state.loading) void this.load(); else this.check(); }
    return () => this.stop();
  }
  stop() { this.cancelTimer?.(); this.cancelTimer = null; this.request?.abort(); this.request = null; this.generation++; this.runtime = null; }
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
    this.update({ place, result: null, selectedHour: null, loading: false });
    if (place !== null) void this.load(); else this.schedule();
  }
  retry = () => { if (this.state.place !== null) void this.load(); };
  visibilityChanged = () => { this.check(); };
  private check() {
    const runtime = this.runtime;
    this.cancelTimer?.(); this.cancelTimer = null;
    if (!runtime?.visible() || this.state.place === null) return;
    const now = runtime.now();
    const wrongDay = (this.checkedAt !== null && shanghaiDate(this.checkedAt) !== shanghaiDate(now)) ||
      (this.state.result?.data && this.state.result.data.localDate !== shanghaiDate(now));
    if (wrongDay || (this.checkedAt !== null && now - this.checkedAt >= REFRESH_MS)) void this.load();
    else this.schedule();
  }
  private schedule() {
    this.cancelTimer?.(); this.cancelTimer = null;
    const runtime = this.runtime;
    if (!runtime?.visible() || this.state.place === null) return;
    const now = runtime.now();
    const midnight = shanghaiDayBounds(shanghaiDate(now)).end;
    const due = Math.min(midnight, (this.checkedAt ?? now) + REFRESH_MS);
    this.cancelTimer = runtime.timer(() => this.check(), Math.max(1, due - now));
  }
  private async load() {
    const runtime = this.runtime, place = this.state.place;
    if (!runtime || place === null) return;
    this.request?.abort();
    const request = new AbortController(), generation = ++this.generation;
    this.request = request;
    const targetDay = shanghaiDate(runtime.now());
    this.checkedAt = runtime.now();
    // A whole result is replaced atomically; cross-day and cross-place content is cleared.
    const sameDay = this.state.result?.data?.localDate === targetDay;
    this.update({ loading: true, result: sameDay ? this.state.result : null, selectedHour: sameDay ? this.state.selectedHour : null });
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
  }
}
