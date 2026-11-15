import { SUNSET_WORDS } from "./sunset-words";
import type { Genre, GenreAdvice, Hour, Location, Opportunity, SolarEvents, Source } from "../../domain/types";
import { timeLabel } from "../../domain/photography/shared";
import { toEpoch } from "../../domain/time";
import { deviceReadings } from "./devices";
import { genreLine } from "./genres";
import { hourReadings } from "./levels";
import { hourMarks } from "./marks";
import { createPeriods, weatherLine } from "./periods";
import { groupRisks } from "./risks";
import { hourSentence } from "./sentences";
import { dataNote, dayLine, decideTone, headline, lead, nextUp } from "./verdict";

export { GENRE_NAMES } from "./genres";
export { HEADLINE_MAX } from "./verdict";
export * from "./levels";
export { deviceReadings, cloudLayerText } from "./devices";
export { hourSentence } from "./sentences";
export { hourMarks } from "./marks";

export type InterpretationInput = {
  hours: Hour[]; solar: SolarEvents; advice: Record<Genre, GenreAdvice>;
  location?: Pick<Location, "latitude" | "longitude">; sunsetOpportunity: Opportunity; sources: Source[]; now: string | number;
};

function sunsetText(sunset: Opportunity, now: string | number) {
  const passed = sunset.targetTime !== null && toEpoch(now) >= Date.parse(sunset.targetTime);
  const reason = sunset.reasons[0] ?? "日落前后的云和雨暂时没有预报。";
  return {
    title: sunset.level === null ? SUNSET_WORDS.unknown.label : `${sunset.level}/5 ${SUNSET_WORDS[sunset.level].label}`,
    line: passed && sunset.targetTime ? `今天的日落（${timeLabel(sunset.targetTime)}）已经过去。${reason}` : reason,
  };
}

/** Pure: everything a reader needs to understand the day, derived only from public Briefing fields. */
export function createInterpretation({ hours, solar, advice, sunsetOpportunity, sources, now, location }: InterpretationInput) {
  toEpoch(now);
  const readings = hours.map(hourReadings);
  const periods = createPeriods(hours, readings, solar, now);
  const risks = groupRisks(hours, now);
  const context = { hours, readings, periods, risks, advice, sunset: sunsetOpportunity, solar, sources, now, location };
  const tone = decideTone(context);
  const line = dayLine(hours, readings, periods, tone === "done");
  return {
    tone, headline: headline(tone, context, line), lead: lead(tone, context),
    weatherLine: tone === "unknown" ? "天气预报暂缺" : weatherLine(periods, hours, readings),
    nextUp: nextUp(tone, context), risks, periods,
    hours: readings.map((reading, index) => ({ ...reading, marks: hourMarks(hours[index], advice, now), devices: deviceReadings(hours[index], reading, solar), sentences: hourSentence(reading, hours[index], hours[index].risks, advice) })),
    genres: {
      landscape: genreLine("landscape", advice.landscape, hours, readings, solar, now, location),
      portrait: genreLine("portrait", advice.portrait, hours, readings, solar, now, location),
      street: genreLine("street", advice.street, hours, readings, solar, now, location),
    },
    sunset: sunsetText(sunsetOpportunity, now),
    dataNote: dataNote(context),
  };
}
export type Interpretation = ReturnType<typeof createInterpretation>;
