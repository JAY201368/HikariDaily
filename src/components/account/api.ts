export class WorkspaceError extends Error {
  constructor(message: string, public code = "NETWORK", public ambiguous = false) {
    super(message);
  }
}
export async function workspaceApi<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api/workspace/${path}`, { method, credentials: "same-origin", cache: "no-store", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal }); }
  catch { throw new WorkspaceError("网络连接中断", "NETWORK", method !== "GET"); }
  let envelope;
  try { envelope = await response.json(); } catch { throw new WorkspaceError("服务响应未确认", "RESPONSE", method !== "GET"); }
  if (!response.ok || envelope.error) throw new WorkspaceError(envelope.error?.message || "请求未完成", envelope.error?.code, response.status >= 500 && method !== "GET");
  return envelope.data as T;
}
