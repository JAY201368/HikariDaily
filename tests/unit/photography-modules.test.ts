import { describe, expect, it } from "vitest";
import {
  analyzeGenreAdvice, analyzeHourlyLight, analyzeHourlyRisks, analyzePhotography,
  assemblePhotographyHours, assessSunsetOpportunity, validatePhotographyContext,
} from "../../src/domain/photography";
import { createInterpretation } from "../../src/content/interpret";
import { createSummary } from "../../src/content/summary";
import { PHOTO_NOW, photoDay, photoLocation, photoMetric, photoSolar, photoSunsetField } from "../fixtures/photography-synthetic";

describe("independently composable photography responsibilities", () => {
  it("joins light and risks into public hours while preserving source hazards and missing values", () => {
    const day = photoDay();
    day.hours[12].weather.cloudTotal = photoMetric(null);
    day.hours[12].riskInputs[0].weather.windGust = photoMetric(22);
    const before = structuredClone(day);

    const light = analyzeHourlyLight(day, photoSolar, photoLocation);
    const risks = analyzeHourlyRisks(day);
    const hours = assemblePhotographyHours(day, light, risks);

    expect(hours).toHaveLength(24);
    expect(hours[12].light.character).toBe("unknown");
    expect(hours[12].weather.cloudTotal.value).toBeNull();
    expect(hours[12].risks).toEqual([expect.objectContaining({ code: "strong-wind", sourceIds: [day.sources[0].id] })]);
    expect(Object.keys(hours[12]).sort()).toEqual(["air", "end", "light", "risks", "start", "weather"]);
    expect(day).toEqual(before);
  });

  it("composes independent genre nodes, interpretation and summary into the existing facade result", () => {
    const day = photoDay();
    const sunset = photoSunsetField();
    validatePhotographyContext(day, photoLocation, PHOTO_NOW);
    const hours = assemblePhotographyHours(day,
      analyzeHourlyLight(day, photoSolar, photoLocation), analyzeHourlyRisks(day));
    const sunsetOpportunity = assessSunsetOpportunity(day, photoSolar, PHOTO_NOW, sunset);
    const advice = {
      landscape: analyzeGenreAdvice(day, photoSolar, photoLocation, "landscape", PHOTO_NOW, sunsetOpportunity),
      portrait: analyzeGenreAdvice(day, photoSolar, photoLocation, "portrait", PHOTO_NOW, sunsetOpportunity),
      street: analyzeGenreAdvice(day, photoSolar, photoLocation, "street", PHOTO_NOW, sunsetOpportunity),
    };
    const interpretation = createInterpretation({
      hours, solar: photoSolar, advice, sunsetOpportunity, sources: [...day.sources, sunset.source],
      now: PHOTO_NOW, location: photoLocation,
    });
    expect(analyzePhotography(day, photoSolar, photoLocation, PHOTO_NOW, sunset)).toEqual({
      rulesVersion: "photo-rules-v0.3", hours, sunsetOpportunity, advice, interpretation,
      summary: createSummary(hours, advice, interpretation),
    });
  });

  it("rejects mismatched context and invalid time before rule execution", () => {
    const day = photoDay();
    expect(() => validatePhotographyContext(day, photoLocation, "invalid")).toThrow();
    expect(() => validatePhotographyContext(day, { ...photoLocation, longitude: photoLocation.longitude + 1 }, PHOTO_NOW)).toThrow("不匹配");
    expect(() => validatePhotographyContext(day, { ...photoLocation, id: "geonames:1" }, PHOTO_NOW)).toThrow("不匹配");
  });

  it("rejects incomplete independent hourly results instead of emitting missing rule objects", () => {
    const day = photoDay();
    const light = analyzeHourlyLight(day, photoSolar, photoLocation);
    const risks = analyzeHourlyRisks(day);
    expect(() => assemblePhotographyHours(day, light.slice(1), risks)).toThrow("不匹配");
    expect(() => assemblePhotographyHours(day, light, risks.slice(1))).toThrow("不匹配");
  });
});
