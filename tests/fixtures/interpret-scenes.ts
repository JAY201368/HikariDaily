import { run, setAll } from "./interpret-helpers";
import { photoMetric } from "./photography-synthetic";

const hours = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
type Edit = Parameters<typeof run>[1];
export const SCENARIOS: { id: string; edit?: Edit }[] = [
  { id: "clear" },
  { id: "overcast", edit: day => setAll(day, { cloudTotal: 95, cloudLow: 90, weatherCode: 3 }) },
  { id: "afternoon-rain", edit: day => setAll(day, { precipitation: 3, precipitationProbability: 80, cloudTotal: 100, weatherCode: 63 }, hours(13, 18)) },
  { id: "trace-005", edit: day => setAll(day, { precipitation: 0.05, weatherCode: 51 }) },
  { id: "gust-11", edit: day => setAll(day, { windSpeed: 2.5, windGust: 11 }) },
  { id: "gust-18", edit: day => setAll(day, { windSpeed: 9, windGust: 18 }, [14, 15]) },
  { id: "dry-thunder", edit: day => setAll(day, { weatherCode: 95, precipitation: 0 }, [15, 16]) },
  { id: "freezing-rain", edit: day => setAll(day, { weatherCode: 66, precipitation: 0.3, precipitationProbability: 30, temperature: -1 }) },
  { id: "snow", edit: day => setAll(day, { weatherCode: 73, precipitation: 0.8, precipitationProbability: 30, cloudTotal: 100 }) },
  { id: "aqi-180", edit: day => {
    for (const hour of day.hours) {
      hour.air.referenceAqi = photoMetric(180);
      // Risk assessment reads each source, not the displayed merged air metric.
      hour.riskInputs.forEach(input => { input.air.referenceAqi = photoMetric(180, input.source.id); });
    }
  } },
  { id: "missing-probability", edit: day => setAll(day, { precipitationProbability: null }) },
  { id: "probability-60", edit: day => setAll(day, { precipitationProbability: 60 }) },
  { id: "missing-code", edit: day => setAll(day, { weatherCode: null, cloudTotal: 80 }) },
  { id: "rain-55", edit: day => setAll(day, { precipitation: 5.5, weatherCode: 63 }, [10]) },
  { id: "visibility-850", edit: day => setAll(day, { visibility: 850, humidity: 50, weatherCode: 1 }) },
];
