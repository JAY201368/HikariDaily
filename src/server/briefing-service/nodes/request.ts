import "server-only";
import { LocationSchema } from "../../../domain/schemas";
import { shanghaiDate, toEpoch } from "../../../domain/time";
import { LocationError } from "../../http/errors";
import { parseLocationId } from "../../providers/geocoding/adapter";
import { briefingFailure } from "../result";
import type { BriefingDependencies } from "../contracts";
import type { BriefingGraphState } from "../state";

export function createRequestNodes(deps: BriefingDependencies) {
  return {
    validateRequest({ place }: BriefingGraphState) {
      try {
        const id = parseLocationId(place);
        return { id, requestedAt: toEpoch(deps.clock()) };
      } catch (error) {
        return { result: briefingFailure(error instanceof LocationError ? error.code : "LOCATION_UNAVAILABLE") };
      }
    },
    async resolveLocation({ id }: BriefingGraphState) {
      try {
        const location = LocationSchema.parse(await deps.resolveLocation(id));
        return location.id === id ? { location } : { result: briefingFailure("LOCATION_UNAVAILABLE") };
      } catch (error) {
        return { result: briefingFailure(error instanceof LocationError ? error.code : "LOCATION_UNAVAILABLE") };
      }
    },
    refreshTime({ requestedAt, localDate }: BriefingGraphState) {
      const now = Math.max(requestedAt, toEpoch(deps.clock()));
      return shanghaiDate(now) === localDate ? { now } : { result: briefingFailure("BRIEFING_UNAVAILABLE") };
    },
  };
}
export function prepareTarget({ location, requestedAt }: BriefingGraphState) {
  const localDate = shanghaiDate(requestedAt);
  return { localDate, target: { locationId: location.id, latitude: location.latitude, longitude: location.longitude, localDate } };
}
