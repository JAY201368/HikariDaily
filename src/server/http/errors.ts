import "server-only";

const errors = {
  INVALID_LOCATION: { status: 400, message: "地点参数无效，请输入 2–40 个字符的名称或有效地点 ID。" },
  LOCATION_NOT_FOUND: { status: 404, message: "地点不存在或不在当前服务范围内，请选择所属城市。" },
  LOCATION_UNAVAILABLE: { status: 503, message: "地点服务暂时不可用，请稍后重试。" },
} as const;
export type LocationErrorCode = keyof typeof errors;
export class LocationError extends Error {
  constructor(public readonly code: LocationErrorCode) { super(errors[code].message); }
}
export function locationErrorResponse(error: unknown): Response {
  const code = error instanceof LocationError ? error.code : "LOCATION_UNAVAILABLE";
  const { status, message } = errors[code];
  return Response.json({ data: null, error: { code, message } }, { status });
}
