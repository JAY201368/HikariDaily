import { HAZARD_WORDS } from "../../content/interpret/hazard-words";
import type { NormalizedHour, SourceRiskInput } from "../normalization";
import type { RiskNote } from "../types";
import { present, unique } from "./shared";

const round1 = (value: number) => String(Math.round(value * 10) / 10).replace(/\.0$/, "");

export const HEAVY_RAIN_MM = 5;

const THUNDER_CODES = new Set([95, 96, 97, 99]);
type Range = Pick<NormalizedHour, "start" | "end">;

/** P6.2: assess a source before combining; merged primary values never veto backup hazards. */
export function assessSourceRisks(input: SourceRiskInput, range: Range): RiskNote[] {
  if (input.source.status !== "ok" && input.source.status !== "stale") return [];
  const { weather: w, air } = input;
  const results: RiskNote[] = [];
  // Callers may pass a full hour; TypeScript's Pick does not strip runtime keys.
  const add = (code: RiskNote["code"], message: string) => results.push({
    start: range.start, end: range.end, code, message, sourceIds: [input.source.id],
  });
  if (present(w.weatherCode) && THUNDER_CODES.has(w.weatherCode.value)) add("thunderstorm", `${HAZARD_WORDS.thunderstorm.label}，${HAZARD_WORDS.thunderstorm.detail}。`);
  if (present(w.precipitation) && w.precipitation.value >= HEAVY_RAIN_MM) add("heavy-rain", `${HAZARD_WORDS["heavy-rain"].label}（约 ${round1(w.precipitation.value)} 毫米/小时），${HAZARD_WORDS["heavy-rain"].action}。`);
  if ((present(w.windSpeed) && w.windSpeed.value >= 17.2) || (present(w.windGust) && w.windGust.value >= 17.2)) {
    add("strong-wind", `${HAZARD_WORDS["strong-wind"].label}（8 级或以上），${HAZARD_WORDS["strong-wind"].detail}。`);
  }
  if (present(air.referenceAqi) && air.referenceAqi.value >= 151) {
    add("air-quality", `空气不健康（美国标准 AQI ${Math.round(air.referenceAqi.value)}），${HAZARD_WORDS["air-quality"].action}。`);
  }
  return results;
}

export function assessHourRisks(hour: NormalizedHour): RiskNote[] {
  const perSource = hour.riskInputs.map((input) => assessSourceRisks(input, hour));
  return unique(perSource.flat().map((risk) => risk.code)).map((code) => {
    const matches = perSource.flat().filter((risk) => risk.code === code);
    const sourceIds = unique(matches.flatMap((risk) => risk.sourceIds));
    // Only compare sources that actually supply this hazard's inputs.
    const evaluable = hour.riskInputs.filter((input) => (input.source.status === "ok" || input.source.status === "stale") &&
      (code === "thunderstorm" ? present(input.weather.weatherCode)
        : code === "heavy-rain" ? present(input.weather.precipitation)
        : code === "strong-wind" ? present(input.weather.windSpeed) || present(input.weather.windGust)
        : present(input.air.referenceAqi)));
    const disagreement = evaluable.some((input) => !sourceIds.includes(input.source.id));
    return { ...matches[0], sourceIds,
      message: `${unique(matches.map((risk) => risk.message)).join(" ")}${disagreement ? " 两家预报对这一点有分歧，按更危险的一家算。" : ""}` };
  });
}
export const excludesOutdoor = (risks: RiskNote[]) => risks.some((risk) => risk.code !== "air-quality");
