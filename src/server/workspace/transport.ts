import "server-only";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { pinEndpoint, type Resolver } from "./endpoint";
import { WorkspaceError } from "./errors";
function canonicalPeer(value: string | undefined): string | undefined {
    if (!value)
        return undefined;
    const address = value.replace(/^::ffff:/i, "");
    if (isIP(address) === 6)
        return new URL(`https://[${address}]/`).hostname;
    return address;
}
export const MAX_MODEL_RESPONSE_BYTES = 256 * 1024;
/** Authorize and synchronously dispatch under the caller's owner transaction; never await the response here. */
export type DispatchAuthorizer = (dispatch: () => void) => Promise<void>;
export type ModelTransport = (endpoint: string, key: string, body: unknown, signal: AbortSignal, authorizeDispatch?: DispatchAuthorizer) => Promise<unknown>;
const transportFailure = () => new WorkspaceError("MODEL_UNAVAILABLE", 502, "模型调用失败，请检查配置或稍后重试");
export function modelHttpError(status: number): WorkspaceError {
    if (status === 401 || status === 403)
        return new WorkspaceError("MODEL_AUTH_FAILED", 422, "模型凭证无效或无访问权限，请更新配置");
    if (status === 402)
        return new WorkspaceError("MODEL_QUOTA_EXCEEDED", 429, "模型账户额度不足，请检查服务商账户");
    if (status === 429)
        return new WorkspaceError("MODEL_RATE_LIMITED", 429, "模型服务调用受限，请稍后重试或检查额度");
    if (status >= 300 && status < 400)
        return new WorkspaceError("MODEL_REDIRECT_REJECTED", 422, "模型端点返回重定向，请填写最终 HTTPS 地址");
    if (status === 400 || status === 404 || status === 405 || status === 422)
        return new WorkspaceError("MODEL_REQUEST_REJECTED", 422, "模型端点、模型名或请求能力不兼容，请检查配置");
    return transportFailure();
}
/** Resolves once, validates EVERY answer, pins the TLS socket lookup, checks peer before sending Key. No redirects/retries. */
export function createModelTransport(resolver?: Resolver): ModelTransport {
    return async (endpoint, key, body, signal, authorizeDispatch) => {
        const pinned = await pinEndpoint(endpoint, resolver);
        signal.throwIfAborted();
        return new Promise((resolve, reject) => {
            const selected = pinned.addresses[0];
            const lookup: LookupFunction = (_host, options, callback) => {
                if (typeof options === "object" && options.all)
                    callback(null, [selected]);
                else
                    callback(null, selected.address, selected.family);
            };
            const bytes = Buffer.from(JSON.stringify(body));
            const request = https.request(pinned.url, {
                method: "POST", agent: false, lookup, family: selected.family,
                signal, headers: { "Content-Type": "application/json", "Content-Length": bytes.length, Authorization: `Bearer ${key}` },
            });
            request.on("socket", socket => {
                socket.once("secureConnect", () => {
                    // Socket address is commonly represented as IPv4-mapped IPv6 by Node.
                    const peer = canonicalPeer(socket.remoteAddress);
                    if (peer !== canonicalPeer(selected.address)) {
                        request.destroy(transportFailure());
                        return;
                    }
                    const dispatch = () => {
                        // The callback may have waited for a database lock after TLS completed.
                        signal.throwIfAborted();
                        request.end(bytes);
                    };
                    // HTTP headers remain buffered until end; DNS/TLS never hold the owner lock.
                    void (async () => {
                        if (authorizeDispatch)
                            await authorizeDispatch(dispatch);
                        else
                            dispatch();
                    })().catch(error => {
                        reject(error);
                        request.destroy();
                    });
                });
            });
            request.on("response", response => {
                if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
                    response.destroy();
                    request.destroy();
                    reject(modelHttpError(response.statusCode ?? 500));
                    return;
                }
                let size = 0;
                const chunks: Buffer[] = [];
                response.on("data", (chunk: Buffer) => {
                    size += chunk.length;
                    if (size > MAX_MODEL_RESPONSE_BYTES) {
                        response.destroy();
                        reject(transportFailure());
                    }
                    else
                        chunks.push(chunk);
                });
                response.on("error", () => reject(transportFailure()));
                response.on("end", () => {
                    try {
                        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
                    }
                    catch {
                        reject(transportFailure());
                    }
                });
            });
            request.on("error", () => reject(transportFailure()));
        });
    };
}
export const modelTransport = createModelTransport();
