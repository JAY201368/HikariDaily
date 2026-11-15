import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { z } from "zod";
import SunCalc from "suncalc";
import { renderToStaticMarkup } from "react-dom/server";
import HomePage from "../../src/app/page";

describe("foundation toolchain", () => {
  it("loads runtime validation and the pinned solar dependency in Node", () => {
    const coordinate = z.object({ latitude: z.number().min(-90).max(90) });
    expect(coordinate.safeParse({ latitude: 91 }).success).toBe(false);
    const position = SunCalc.getPosition(new Date("2026-10-22T04:00:00Z"), 31.23, 121.47);
    expect(Number.isFinite(position.altitude)).toBe(true);
  });

  it("server-renders the no-location state without weather placeholders", async () => {
    const html = renderToStaticMarkup(await HomePage({}));
    expect(html).toContain("尚未选择地点");
    expect(html).toContain("请选择中国大陆城市或区域");
    expect(html).not.toContain('id="newspaper"');
    expect(html).not.toMatch(/°C|μg|PM2\.5|晴天/);
  });
});
