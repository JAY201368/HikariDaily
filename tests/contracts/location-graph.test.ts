import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createLocationSearchGraph } from "../../src/server/location-service/graph";
import { createLocationSearchService } from "../../src/server/location-service/service";
import { LocationError, locationErrorResponse } from "../../src/server/http/errors";
import { LocationSchema } from "../../src/domain/schemas";
import type { Location } from "../../src/domain/types";

const location: Location = {
  id: "geonames:1809104", name: "人工海淀", administrativePath: ["北京市", "人工海淀"],
  granularity: "district", latitude: 39.99, longitude: 116.28, timezone: "Asia/Shanghai",
};

describe("location search LangGraph (synthetic provider)", () => {
  it("executes validation, cached search and result validation as distinct nodes", async () => {
    const searchLocations = vi.fn(async () => [location]);
    const graph = createLocationSearchGraph({ searchLocations });
    const visited: string[] = [];
    let output: Location[] | undefined;
    for await (const update of await graph.stream({ query: " 海淀 " }, { streamMode: "updates" })) {
      visited.push(...Object.keys(update));
      if ("validate_results" in update) output = (update.validate_results as { locations: Location[] }).locations;
    }
    expect(visited).toEqual(["validate_query", "search_locations", "validate_results"]);
    expect(searchLocations).toHaveBeenCalledExactlyOnceWith("海淀");
    expect(LocationSchema.array().parse(output)).toEqual([location]);
    expect(await graph.invoke({ query: "海淀" })).toEqual({ locations: [location] });
  });

  it.each([undefined, null, "", "北", "<script>", "北".repeat(41)])("rejects invalid input before calling the provider: %j", async query => {
    const searchLocations = vi.fn(async () => [location]);
    const graph = createLocationSearchGraph({ searchLocations });
    await expect(graph.invoke({ query })).rejects.toMatchObject({ code: "INVALID_LOCATION" });
    expect(searchLocations).not.toHaveBeenCalled();
  });

  it.each([
    null, {}, [{ ...location, timezone: "Europe/Berlin" }], [{ ...location, latitude: 91 }],
    Array.from({ length: 11 }, () => location),
  ])("rejects a malformed provider result without exposing its payload: %j", async value => {
    const searchLocations = vi.fn(async () => value as Location[]);
    const graph = createLocationSearchGraph({ searchLocations });
    await expect(graph.invoke({ query: "海淀" })).rejects.toMatchObject({ code: "LOCATION_UNAVAILABLE" });
    expect(searchLocations).toHaveBeenCalledOnce();
  });

  it("sanitizes unexpected provider errors in both graph and HTTP error envelopes", async () => {
    const searchLocations = vi.fn(async (): Promise<Location[]> => { throw new Error("private transport token"); });
    const graph = createLocationSearchGraph({ searchLocations });
    await expect(graph.invoke({ query: "海淀" })).rejects.toMatchObject({
      code: "LOCATION_UNAVAILABLE", message: "地点服务暂时不可用，请稍后重试。",
    });
    const failure = await createLocationSearchService({ searchLocations })("海淀").then(() => null, error => error);
    expect(failure).toBeInstanceOf(LocationError);
    const response = locationErrorResponse(failure);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ data: null, error: {
      code: "LOCATION_UNAVAILABLE", message: "地点服务暂时不可用，请稍后重试。",
    } });
    expect(String(failure)).not.toContain("private");
  });

  it("keeps explicit validation errors and successful empty results through the facade", async () => {
    const emptySearch = vi.fn(async () => []);
    const service = createLocationSearchService({ searchLocations: emptySearch });
    expect(await service("不存在地点")).toEqual([]);
    await expect(service("北")).rejects.toBeInstanceOf(LocationError);
    expect(emptySearch).toHaveBeenCalledOnce();
    const unavailable = createLocationSearchService({ searchLocations: async () => { throw new LocationError("LOCATION_UNAVAILABLE"); } });
    await expect(unavailable("海淀")).rejects.toMatchObject({ code: "LOCATION_UNAVAILABLE" });
  });
});
