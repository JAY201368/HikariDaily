import "server-only";
import type { Briefing, Genre } from "../../domain/types";

/** Future message adapter only: derives from the same Briefing; never sends or schedules. */
export function buildBriefingSummary(briefing: Briefing, genre: Genre = "landscape") {
  const now = Date.parse(briefing.generatedAt);
  const risk = briefing.hours.flatMap((h) => h.risks).filter((r) => Date.parse(r.end) > now)
    .sort((a, b) => Number(a.code === "air-quality") - Number(b.code === "air-quality") || Date.parse(a.start) - Date.parse(b.start))[0];
  const window = briefing.advice[genre].recommendedWindows.find((w) => w.status !== "past" && Date.parse(w.end) > now);
  return {
    location: briefing.location.name, localDate: briefing.localDate, generatedAt: briefing.generatedAt,
    state: briefing.state, headline: briefing.summary.headline,
    risk: risk?.message ?? null,
    opportunity: window ? { start: window.start, end: window.end, reasons: window.reasons } : null,
    link: `/?${new URLSearchParams({ place: briefing.location.id, genre })}`,
  };
}
