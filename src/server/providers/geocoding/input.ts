import "server-only";
import { LocationError } from "../../http/errors";

export function parseLocationQuery(value: unknown): string {
  if (typeof value !== "string") throw new LocationError("INVALID_LOCATION");
  const query = value.trim();
  if ([...query].length < 2 || [...query].length > 40 || /[\u0000-\u001f\u007f<>]/u.test(query)) {
    throw new LocationError("INVALID_LOCATION");
  }
  return query;
}
export function parseLocationId(value: unknown): string {
  if (typeof value !== "string" || !/^geonames:[1-9]\d{0,15}$/.test(value) ||
      !Number.isSafeInteger(Number(value.slice(9)))) throw new LocationError("INVALID_LOCATION");
  return value;
}
