import { analyzePhotography } from "../../src/domain/photography";
import { BriefingSchema, SCHEMA_VERSION, InterpretationSchema } from "../../src/domain/schemas";
import type { Metric, WeatherMetricName } from "../../src/domain/types";
import { PHOTOGRAPHY_FIXTURE_NOTICE, PHOTO_DATE, photoDay, photoLocation, photoMetric, photoSolar, photoSunsetField } from "./photography-synthetic";

export const at = (hour: number, minute = 0) => `${PHOTO_DATE}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`;
export const missing = (): Metric<number> => ({ value: null, state: "missing", sourceIds: [], notes: [] });
export type SunsetEdit = (field: ReturnType<typeof photoSunsetField>) => void;
export function run(now: string, edit: (day: ReturnType<typeof photoDay>) => void = () => {}, editSunset: SunsetEdit = () => {}) {
  const day = photoDay(now);
  edit(day);
  const sunset = photoSunsetField(now, day.target); editSunset(sunset);
  const result = analyzePhotography(day, photoSolar, photoLocation, now, sunset);
  return { ...result, interpretation: InterpretationSchema.parse(result.interpretation) };
}
/** One edited day and one analysis: dates, provenance and rules stay internally aligned. */
export function sceneBriefing(now: string, edit: Parameters<typeof run>[1] = () => {}, editSunset: SunsetEdit = () => {}) {
  const day = photoDay(now);
  edit(day);
  const sunset = photoSunsetField(now, day.target);
  editSunset(sunset);
  const result = analyzePhotography(day, photoSolar, photoLocation, now, sunset);
  return BriefingSchema.parse({ schemaVersion: SCHEMA_VERSION, ...result, generatedAt: now, localDate: PHOTO_DATE,
    location: photoLocation, solar: photoSolar, sources: [...day.sources, sunset.source], state: "partial",
    warnings: [`演示数据：${PHOTOGRAPHY_FIXTURE_NOTICE}`] });
}
export function setAll(day: ReturnType<typeof photoDay>, values: Partial<Record<WeatherMetricName, number | null>>,
  hours = day.hours.map((_, index) => index)) {
  for (const index of hours) for (const [name, value] of Object.entries(values)) {
    const metric = value === null ? missing() : photoMetric(value);
    Object.assign(day.hours[index].weather, { [name]: metric });
    Object.assign(day.hours[index].primaryWeather, { [name]: metric });
    day.hours[index].riskInputs.forEach((input) => Object.assign(input.weather, { [name]: metric }));
  }
}
export type InterpretationScene = ReturnType<typeof run>;
export type VisibleScope = "all" | "current-advice";

/** All printed/detail text, including advice and reasons. Current advice excludes historical
 * hour/period tables and allWindows, which remain valid records for looking back. */
export function visibleEntries(scene: InterpretationScene, scope: VisibleScope = "all") {
  const { interpretation: view } = scene;
  const entries: { path: string; text: string }[] = [];
  const add = (path: string, text: string | null) => { if (text) entries.push({ path, text }); };
  const walk = (value: unknown, path: string) => {
    if (typeof value === "string") add(path, value);
    else if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}[${index}]`));
    else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => walk(item, `${path}.${key}`));
  };
  for (const key of ["headline", "lead", "weatherLine", "dataNote"] as const) add(`interpretation.${key}`, view[key]);
  walk(view.nextUp, "interpretation.nextUp");
  view.risks.forEach((risk, index) => add(`interpretation.risks[${index}].text`, risk.text));
  Object.entries(view.genres).forEach(([genre, value]) => {
    add(`interpretation.genres.${genre}.when`, value.when);add(`interpretation.genres.${genre}.line`, value.line);
  });
  add("interpretation.sunset.title", view.sunset.title);add("interpretation.sunset.line", view.sunset.line);
  if (scope === "all") {
    view.periods.forEach((period, index) => {
      add(`interpretation.periods[${index}].summary`, period.summary);
      add(`interpretation.periods[${index}].sky.label`, period.sky.label);add(`interpretation.periods[${index}].sky.detail`, period.sky.detail);
    });
    view.hours.forEach(({ sentences, devices, marks, ...readings }, index) => {
      const path = `interpretation.hours[${index}]`;
      walk(sentences, `${path}.sentences`);add(`${path}.marks.recommendation`, marks.recommendation);walk(marks.risks, `${path}.marks.risks`);
      Object.entries(devices).forEach(([key, device]) => {
        const target = `${path}.devices.${key}`;
        walk(device.fields, `${target}.fields`);walk(device.meaning, `${target}.meaning`);
        walk(device.notices, `${target}.notices`);walk(device.reference, `${target}.reference`);add(`${target}.trend.label`, device.trend.label);
      });
      Object.entries(readings).forEach(([key, reading]) => {
        add(`${path}.${key}.label`, reading.label);add(`${path}.${key}.detail`, reading.detail);
        if ("short" in reading) add(`${path}.${key}.short`, reading.short);
      });
    });
    walk(scene.summary.headline, "summary.headline");
    for (const key of ["changes", "opportunities", "limitations"] as const) walk(scene.summary[key], `summary.${key}`);
    scene.hours.forEach((hour, index) => {
      add(`hours[${index}].light.description`, hour.light.description);
      walk(hour.light.reasons, `hours[${index}].light.reasons`);walk(hour.light.limitations, `hours[${index}].light.limitations`);
      hour.risks.forEach((risk, riskIndex) => add(`hours[${index}].risks[${riskIndex}].message`, risk.message));
    });
  }
  add("sunsetOpportunity.label", scene.sunsetOpportunity.label);
  walk(scene.sunsetOpportunity.reasons, "sunsetOpportunity.reasons");walk(scene.sunsetOpportunity.limitations, "sunsetOpportunity.limitations");
  Object.entries(scene.advice).forEach(([genre, advice]) => {
    const path = `advice.${genre}`;
    for (const key of ["timing", "light", "opportunities", "limitations", "alternatives", "film"] as const) walk(advice[key], `${path}.${key}`);
    for (const key of scope === "all" ? ["allWindows", "recommendedWindows"] as const : ["recommendedWindows"] as const) {
      advice[key].forEach((window, index) => {
        walk(window.reasons, `${path}.${key}[${index}].reasons`);walk(window.limitations, `${path}.${key}[${index}].limitations`);
      });
    }
  });
  return entries;
}
export const visibleText = (scene: InterpretationScene, scope: VisibleScope = "all") =>
  visibleEntries(scene, scope).map(({ text }) => text).join("\n");
