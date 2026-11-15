import "server-only";
import type { Briefing } from "../../domain/types";
import type { BriefingResult } from "./contracts";

const errors = {
  INVALID_LOCATION: { status: 400, message: "地点参数无效，请使用有效地点 ID。" },
  LOCATION_NOT_FOUND: { status: 404, message: "地点不存在或不在当前服务范围内，请选择所属城市。" },
  LOCATION_UNAVAILABLE: { status: 503, message: "地点服务暂时不可用，请稍后重试。" },
  WEATHER_UNAVAILABLE: { status: 503, message: "天气与空气数据暂不可用；太阳时段仅为天文计算。" },
  BRIEFING_UNAVAILABLE: { status: 503, message: "简报暂时不可用，请稍后重试。" },
} as const;

export function briefingFailure(code: keyof typeof errors, data: Briefing | null = null): BriefingResult {
  const { status, message } = errors[code];
  return { status, data, error: { code, message } };
}
export function briefingResult(data: Briefing): BriefingResult {
  return data.state === "unavailable" ? briefingFailure("WEATHER_UNAVAILABLE", data) : { status: 200, data, error: null };
}
