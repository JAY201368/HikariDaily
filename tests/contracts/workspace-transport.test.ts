import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import https from "node:https";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { isPublicAddress, normalizeEndpoint, pinEndpoint } from "../../src/server/workspace/endpoint";
import { createModelTransport } from "../../src/server/workspace/transport";
afterEach(() => vi.restoreAllMocks());
describe("public HTTPS endpoint validation", () => {
    it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "2001:4860:4860::8888", "2606:4700:4700::1111"])("permits public unicast %s", address => expect(isPublicAddress(address)).toBe(true));
    it.each(["0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "192.0.0.1", "192.0.2.1", "192.88.99.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "240.0.0.1", "255.255.255.255", "::", "::1", "fe80::1", "fc00::1", "fd00::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:8.8.8.8", "::ffff:0808:0808", "2001:db8::1", "2001::1", "2001:20::1", "2002:0808:0808::1", "3fff::1", "fe80::1%en0"])("rejects reserved/private/transition %s", address => expect(isPublicAddress(address)).toBe(false));
    it.each(["http://example.com/v1", "https://user:password@example.com/v1", "https://example.com:444/v1", "https://example.com/v1?key=secret", "https://example.com/#redirect", "https://127.1/v1", "https://2130706433/v1", "https://0x7f000001/v1", "https://0177.0.0.1/v1", "https://%31%32%37.0.0.1/v1", "https://[::ffff:127.0.0.1]/v1", "https://[::ffff:8.8.8.8]/v1", "https://localhost/v1", "https://example.com./v1", "https://example.com/%2e%2e/%2fadmin", "https://example.com\\@127.0.0.1", " https://example.com/v1"])("rejects unsafe URL %s", url => expect(() => normalizeEndpoint(url)).toThrow());
    it("normalizes completion path without duplicate suffix", () => {
        expect(normalizeEndpoint("https://example.com:443/v1/")).toBe("https://example.com/v1/chat/completions");
        expect(normalizeEndpoint("https://example.com/v1/chat/completions")).toBe("https://example.com/v1/chat/completions");
    });
    it("rejects mixed/private DNS answers, empty DNS and family inconsistencies", async () => {
        for (const entries of [[], [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }], [{ address: "8.8.8.8", family: 6 }], [{ address: "::ffff:8.8.8.8", family: 6 }]])
            await expect(pinEndpoint("https://example.com/v1", async () => entries)).rejects.toThrow();
    });
});
function fakeConnection(options: {
    peer?: string;
    status?: number;
    body?: string;
} = {}) {
    const sent: Buffer[] = [];
    let requestOptions: https.RequestOptions | undefined;
    let target: URL | undefined;
    let destroyed = false;
    vi.spyOn(https, "request").mockImplementation(((url: URL, config: https.RequestOptions) => {
        requestOptions = config;
        target = url;
        const request = new EventEmitter() as EventEmitter & {
            end: (body: Buffer) => void;
            destroy: (error?: Error) => void;
        };
        request.destroy = (error?: Error) => { destroyed = true; if (error)
            queueMicrotask(() => request.emit("error", error)); };
        request.end = (body: Buffer) => { sent.push(body); const response = new PassThrough() as PassThrough & {
            statusCode: number;
        }; response.statusCode = options.status ?? 200; queueMicrotask(() => { request.emit("response", response); response.end(options.body ?? '{"choices":[{"message":{"content":"ok"}}]}'); }); };
        queueMicrotask(() => { const socket = new EventEmitter() as EventEmitter & {
            remoteAddress: string;
        }; socket.remoteAddress = options.peer ?? "8.8.8.8"; request.emit("socket", socket); socket.emit("secureConnect"); });
        return request;
    }) as typeof https.request);
    return { sent, get requestOptions() { return requestOptions!; }, get target() { return target!; }, get destroyed() { return destroyed; } };
}
describe("pinned model transport (injected DNS/socket; no live external model)", () => {
    it("resolves once, pins verified lookup, preserves TLS hostname and sends Key only after peer validation", async () => {
        const connection = fakeConnection();
        const resolver = vi.fn().mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }]).mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
        await createModelTransport(resolver)("https://model.example/v1", "key-secret", { hello: "world" }, new AbortController().signal);
        expect(resolver).toHaveBeenCalledTimes(1);
        expect(connection.target.hostname).toBe("model.example");
        expect(connection.requestOptions.agent).toBe(false);
        expect(connection.requestOptions.rejectUnauthorized).not.toBe(false);
        expect(connection.requestOptions.headers).toMatchObject({ Authorization: "Bearer key-secret" });
        expect(connection.sent).toHaveLength(1);
        const callback = vi.fn();
        connection.requestOptions.lookup!("model.example", { family: 4 }, callback);
        expect(callback).toHaveBeenCalledWith(null, "8.8.8.8", 4);
    });
    it("supports equivalent public IPv6 socket notation and IPv4-mapped socket representation", async () => {
        const connection = fakeConnection({ peer: "2001:4860:4860::8888" });
        await createModelTransport(async () => [{ address: "2001:4860:4860:0:0:0:0:8888", family: 6 }])("https://model.example/v1", "key-secret", {}, new AbortController().signal);
        expect(connection.sent).toHaveLength(1);
        vi.restoreAllMocks();
        const mapped = fakeConnection({ peer: "::ffff:8.8.8.8" });
        await createModelTransport(async () => [{ address: "8.8.8.8", family: 4 }])("https://model.example/v1", "key-secret", {}, new AbortController().signal);
        expect(mapped.sent).toHaveLength(1);
    });
    it("rejects a changed actual peer before transmitting request headers/body", async () => {
        const connection = fakeConnection({ peer: "127.0.0.1" });
        await expect(createModelTransport(async () => [{ address: "8.8.8.8", family: 4 }])("https://model.example/v1", "key-secret", {}, new AbortController().signal)).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
        expect(connection.sent).toHaveLength(0);
        expect(connection.destroyed).toBe(true);
    });
    it("rejects redirects without following or forwarding Key and never returns upstream error body", async () => {
        const connection = fakeConnection({ status: 302, body: "upstream secret-key private-body" });
        await expect(createModelTransport(async () => [{ address: "8.8.8.8", family: 4 }])("https://model.example/v1", "key-secret", {}, new AbortController().signal)).rejects.toMatchObject({ code: "MODEL_REDIRECT_REJECTED", message: "模型端点返回重定向，请填写最终 HTTPS 地址" });
        expect(https.request).toHaveBeenCalledTimes(1);
        expect(connection.destroyed).toBe(true);
    });
    it.each([[401, "MODEL_AUTH_FAILED"], [403, "MODEL_AUTH_FAILED"], [402, "MODEL_QUOTA_EXCEEDED"], [429, "MODEL_RATE_LIMITED"], [404, "MODEL_REQUEST_REJECTED"], [500, "MODEL_UNAVAILABLE"]])("classifies HTTP %s without exposing upstream bodies", async (status, code) => {
        fakeConnection({ status: status as number, body: "private-provider-content key-secret" });
        await expect(createModelTransport(async () => [{ address: "8.8.8.8", family: 4 }])("https://model.example/v1", "key-secret", {}, new AbortController().signal)).rejects.toMatchObject({ code });
    });
    it("bounds response bytes and rejects invalid JSON", async () => {
        fakeConnection({ body: "x".repeat(256 * 1024 + 1) });
        await expect(createModelTransport(async () => [{ address: "8.8.8.8", family: 4 }])("https://model.example/v1", "key-secret", {}, new AbortController().signal)).rejects.toThrow();
        vi.restoreAllMocks();
        fakeConnection({ body: "invalid JSON private-content" });
        await expect(createModelTransport(async () => [{ address: "8.8.8.8", family: 4 }])("https://model.example/v1", "key-secret", {}, new AbortController().signal)).rejects.toThrow();
    });
});
