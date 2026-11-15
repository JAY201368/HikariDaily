import "server-only";
import { tokenHash, requireAccount } from "./auth";
import { query } from "./db";
import { invalid, unavailable, WorkspaceError } from "./errors";
export function requireSameOrigin(request: Request) {
    let expected = process.env.HIKARI_APP_ORIGIN;
    if (!expected && process.env.NODE_ENV !== "production")
        expected = "http://localhost:3000";
    if (!expected)
        throw unavailable();
    try {
        if (new URL(expected).origin !== expected || request.headers.get("origin") !== expected || new URL(request.url).origin !== expected)
            throw invalid();
    }
    catch {
        throw new WorkspaceError("ORIGIN_REJECTED", 403, "请求来源不受支持");
    }
}
export async function readJson(request: Request, maxBytes = 16 * 1024): Promise<unknown> {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
        throw invalid();
    const length = Number(request.headers.get("content-length") ?? 0);
    if (!Number.isFinite(length) || length < 0 || length > maxBytes)
        throw new WorkspaceError("BODY_TOO_LARGE", 413, "输入内容过大");
    const reader = request.body?.getReader();
    if (!reader)
        throw invalid();
    let count = 0;
    const chunks: Uint8Array[] = [];
    try {
        while (true) {
            const part = await reader.read();
            if (part.done)
                break;
            count += part.value.byteLength;
            if (count > maxBytes) {
                await reader.cancel();
                throw new WorkspaceError("BODY_TOO_LARGE", 413, "输入内容过大");
            }
            chunks.push(part.value);
        }
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
    catch (error) {
        if (error instanceof WorkspaceError)
            throw error;
        throw invalid();
    }
}
/** Persistent shared limiter; intentionally does not trust user-supplied forwarded-IP headers. */
export async function rateLimit(key: string, limit: number, windowSeconds = 600) {
    const { rows } = await query<{
        hits: number;
    }>(`INSERT INTO workspace_rate_limits(key_hash,starts_at,hits) VALUES($1,now(),1)
    ON CONFLICT(key_hash) DO UPDATE SET
    hits=CASE WHEN workspace_rate_limits.starts_at < now()-make_interval(secs=>$2) THEN 1 ELSE workspace_rate_limits.hits+1 END,
    starts_at=CASE WHEN workspace_rate_limits.starts_at < now()-make_interval(secs=>$2) THEN now() ELSE workspace_rate_limits.starts_at END RETURNING hits`, [tokenHash(key), windowSeconds]);
    if (rows[0].hits > limit)
        throw new WorkspaceError("RATE_LIMITED", 429, "操作频繁，请稍后重试");
}
export async function mutation(request: Request, name: string, limit = 60) {
    requireSameOrigin(request);
    const account = await requireAccount(request);
    await rateLimit(`${name}:${account.id}`, limit);
}
export function json(data: unknown, status = 200, headers?: HeadersInit) {
    const result = new Headers(headers);
    result.set("Cache-Control", "no-store");
    result.set("Content-Type", "application/json; charset=utf-8");
    result.set("X-Content-Type-Options", "nosniff");
    return new Response(JSON.stringify({ data, error: null }), { status, headers: result });
}
export async function route(work: () => Promise<Response>) {
    try {
        return await work();
    }
    catch (error) {
        const known = error instanceof WorkspaceError ? error : unavailable();
        return new Response(JSON.stringify({ data: null, error: { code: known.code, message: known.message, ...known.details } }), {
            status: known.status, headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", ...(known.status === 429 ? { "Retry-After": "600" } : {}) },
        });
    }
}
