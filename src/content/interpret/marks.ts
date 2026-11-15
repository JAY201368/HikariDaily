import { HAZARD_WORDS } from "./hazard-words";
import type { Genre, GenreAdvice, Hour, RiskNote } from "../../domain/types";
import { windowStatus } from "../../domain/time";
import { GENRE_NAMES, rainy, snowing } from "./genres";
import { hourRain, wet } from "./periods";

const GENRES: Genre[] = ["landscape", "portrait", "street"];
const overlaps = (hour: Hour, range: { start: string; end: string }) =>
  Math.max(Date.parse(hour.start), Date.parse(range.start)) < Math.min(Date.parse(hour.end), Date.parse(range.end));

/** Marks only existing recommendations and risks; never scores or infers new conditions. */
export function hourMarks(hour: Hour, advice: Record<Genre, GenreAdvice>, now: string | number): { timing: "past" | "current" | "future"; recommendation: string | null; risks: string[] } {
  const genres = wet(hourRain(hour)) && !snowing(hour) ? []
    : GENRES.filter((genre) => advice[genre].recommendedWindows.some((range) => !rainy(range) && overlaps(hour, range)));
  return {
    timing: windowStatus(hour.start, hour.end, now),
    recommendation: genres.length ? `好时段 · ${genres.map((genre) => GENRE_NAMES[genre]).join("、")}` : null,
    risks: (Object.keys(HAZARD_WORDS).filter(code => code !== "sleet") as RiskNote["code"][])
      .filter((code) => hour.risks.some((risk) => risk.code === code && overlaps(hour, risk)))
      .map((code) => code === "air-quality" ? `${HAZARD_WORDS[code].label}，${HAZARD_WORDS[code].action}` : HAZARD_WORDS[code].label),
  };
}
