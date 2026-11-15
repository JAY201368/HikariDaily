import type { NormalizedDay } from "../normalization";
import type { Location } from "../types";
import { toEpoch } from "../time";

/** Validate the explicit analysis context before independent rule nodes run. */
export function validatePhotographyContext(day: NormalizedDay, location: Location, now: string | number): void {
  toEpoch(now);
  if (day.target.locationId !== location.id || day.target.latitude !== location.latitude || day.target.longitude !== location.longitude) {
    throw new RangeError("摄影规则地点与归一化目标不匹配");
  }
}
