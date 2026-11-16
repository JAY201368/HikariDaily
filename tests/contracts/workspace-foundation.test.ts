import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { inflateSync } from "node:zlib";
import https from "node:https";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { closeDatabase, getPool, lockOwner, query, transaction, withOwnerLock } from "../../src/server/workspace/db";
import { migrate } from "../../src/server/workspace/migrate";
import { requireAccount, tokenHash } from "../../src/server/workspace/auth";
import { register } from "../fixtures/workspace/identity";
import { handleAuth } from "../../src/server/workspace/auth-routes";
import { handleModel } from "../../src/server/workspace/model-routes";
import { assertConfigVersion, deleteModelConfig, getModelConfig, putModelConfig } from "../../src/server/workspace/config";
import { decryptCredential, encryptCredential } from "../../src/server/workspace/credentials";
import { createModelRun, type ChatInput } from "../../src/server/workspace/model";
import { probeModel } from "../../src/server/workspace/probe";
import { rateLimit, readJson, requireSameOrigin, route } from "../../src/server/workspace/http";
import { createModelTransport, modelHttpError, type ModelTransport } from "../../src/server/workspace/transport";
const testUrl = process.env.HIKARI_TEST_DATABASE_URL;
const database = testUrl ? describe : describe.skip;
const ownerIds: string[] = [];
const password = "a-long-test-password-47";
const origin = "http://localhost:3000";
const req = (path: string, method = "GET", body?: unknown, token?: string) => new Request(`${origin}${path}`, { method, headers: { origin, "content-type": "application/json", ...(token ? { cookie: `hikari_identity.session_token=${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const input: ChatInput = { messages: [{ role: "user", content: "hello" }] };
const success = { choices: [{ message: { role: "assistant", content: "hello" } }] };
async function account() { const result = await register({ username: `u_${randomUUID().replaceAll("-", "").slice(0, 20)}`, password }); ownerIds.push(result.account.id); return result; }
async function configured() { const result = await account(); await putModelConfig(result.account.id, { baseVersion: 0, baseUrl: "https://8.8.8.8/v1", model: "test-model", apiKey: "private-test-api-key" }); return result; }
function deferred<T = void>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
}
/** Records headers only at HTTP dispatch, not while they remain buffered during TLS. */
function preparedConnection(autoSecure: boolean, status = 200) {
    const ready = deferred(), dispatched = deferred(), sent: { headers: unknown; body: Buffer }[] = [];
    let secure!: () => void;
    let respond!: () => void;
    const spy = vi.spyOn(https, "request").mockImplementation(((_url: URL, options: https.RequestOptions) => {
        const request = new EventEmitter() as EventEmitter & { end: (body: Buffer) => void; destroy: () => void };
        request.destroy = () => {};
        request.end = body => {
            sent.push({ headers: options.headers, body });
            dispatched.resolve();
            respond = () => {
                const response = new PassThrough() as PassThrough & { statusCode: number };
                response.statusCode = status;
                request.emit("response", response);
                response.end(JSON.stringify(success));
            };
        };
        queueMicrotask(() => {
            const socket = Object.assign(new EventEmitter(), { remoteAddress: "8.8.8.8" });
            request.emit("socket", socket);
            secure = () => socket.emit("secureConnect");
            ready.resolve();
            if (autoSecure) secure();
        });
        return request;
    }) as typeof https.request);
    return { ready: ready.promise, dispatched: dispatched.promise, sent, secure: () => secure(), respond: () => respond(), restore: () => spy.mockRestore() };
}
beforeAll(() => { process.env.HIKARI_APP_ORIGIN = origin; process.env.HIKARI_CREDENTIAL_KEYS = JSON.stringify({ test: randomBytes(32).toString("base64") }); });
describe("workspace HTTP and credential boundaries", () => {
    it("bounds streamed and declared JSON bodies and rejects malformed data", async () => {
        await expect(readJson(req("/", "POST", { value: "x".repeat(17000) }))).rejects.toMatchObject({ status: 413 });
        await expect(readJson(new Request(origin, { method: "POST", headers: { "content-type": "application/json" }, body: "{" }))).rejects.toMatchObject({ status: 400 });
        await expect(readJson(new Request(origin, { method: "POST", body: "{}" }))).rejects.toMatchObject({ status: 400 });
        await expect(readJson(new Request(origin, { method: "POST", headers: { "content-type": "application/json", "content-length": "999999" }, body: "{}" }))).rejects.toMatchObject({ status: 413 });
    });
    it("requires exact configured same-origin, including missing and forged origins", () => {
        expect(() => requireSameOrigin(req("/", "POST", {}))).not.toThrow();
        for (const headers of [{} as Record<string, string>, { origin: "https://attacker.example" }, { origin, host: "localhost:3000" }]) {
            const url = "host" in headers ? "https://attacker.example" : origin;
            expect(() => requireSameOrigin(new Request(url, { method: "POST", headers }))).toThrow();
        }
    });
    it("sanitizes internal/upstream errors and marks responses private", async () => {
        const response = await route(async () => { throw Error("secret-key private body upstream stack"); });
        expect(response.status).toBe(503);
        expect(response.headers.get("cache-control")).toBe("no-store");
        const body = await response.text();
        expect(body).not.toMatch(/secret-key|private body|upstream stack/);
    });
    it("binds AES GCM to owner/version and supports a rotated key ring", () => {
        const original = process.env.HIKARI_CREDENTIAL_KEYS!;
        const value = encryptCredential("owner", 1, "never-return-this");
        expect(JSON.stringify(value)).not.toContain("never-return-this");
        expect(decryptCredential("owner", 1, value)).toBe("never-return-this");
        expect(() => decryptCredential("other", 1, value)).toThrow();
        expect(() => decryptCredential("owner", 2, value)).toThrow();
        process.env.HIKARI_CREDENTIAL_KEYS = JSON.stringify({ new: randomBytes(32).toString("base64"), ...JSON.parse(original) });
        expect(decryptCredential("owner", 1, value)).toBe("never-return-this");
        const changed = { ...value, data: Buffer.from("corrupt").toString("base64") };
        expect(() => decryptCredential("owner", 1, changed)).toThrow();
        process.env.HIKARI_CREDENTIAL_KEYS = original;
    });

});
database("workspace foundation real PostgreSQL (explicit HIKARI_TEST_DATABASE_URL only)", () => {
    beforeAll(async () => {
        process.env.HIKARI_DATABASE_URL = testUrl!;
        await Promise.all([migrate(), migrate()]);
        await query("DELETE FROM workspace_rate_limits WHERE key_hash=ANY($1::text[])", [[tokenHash("auth-global:login"), tokenHash("auth-global:register")]]);
    });
    afterAll(async () => {
        for (const id of ownerIds) {
            const { rows } = await query("SELECT username FROM accounts WHERE id=$1", [id]);
            if (rows[0])
                await query("DELETE FROM workspace_rate_limits WHERE key_hash=ANY($1::text[])", [[tokenHash(`auth-user:login:${rows[0].username}`), tokenHash(`auth-user:register:${rows[0].username}`)]]);
            await query("DELETE FROM accounts WHERE id=$1", [id]);
        }
        await query("DELETE FROM workspace_rate_limits WHERE key_hash=ANY($1::text[])", [[tokenHash("auth-global:login"), tokenHash("auth-global:register")]]);
        await closeDatabase();
    });
    it("uses one transaction connection, rolls back errors and owner-lock serializes writers", async () => {
        const { account: a } = await account();
        await expect(transaction(async (client) => { await client.query("UPDATE accounts SET model_version=7 WHERE id=$1", [a.id]); throw Error("rollback"); })).rejects.toThrow("rollback");
        expect((await getModelConfig(a.id)).version).toBe(0);
        const first = await getPool().connect(), second = await getPool().connect();
        try {
            await first.query("BEGIN");
            await lockOwner(first, a.id);
            await second.query("BEGIN");
            let entered = false;
            const waiting = lockOwner(second, a.id).then(() => { entered = true; });
            await new Promise(resolve => setTimeout(resolve, 20));
            expect(entered).toBe(false);
            await first.query("COMMIT");
            await waiting;
            expect(entered).toBe(true);
            await second.query("COMMIT");
        }
        finally {
            first.release();
            second.release();
        }
    });
    it("reads signed library sessions, rejects expiry and revocation, and rejects legacy cookies", async () => {
        const result = await account();
        expect(await requireAccount(req("/", "GET", undefined, result.token))).toEqual(result.account);
        await expect(requireAccount(new Request(origin, { headers: { cookie: `hikari_session=${result.token}` } }))).rejects.toMatchObject({ status: 401 });
        await query('UPDATE identity_sessions SET "expiresAt"=now()-interval \'1 second\' WHERE token=$1', [result.session]);
        await expect(requireAccount(req("/", "GET", undefined, result.token))).rejects.toMatchObject({ status: 401 });
        const other = await account();
        await query('DELETE FROM identity_sessions WHERE "userId"=$1', [other.userId]);
        await expect(requireAccount(req("/", "GET", undefined, other.token))).rejects.toMatchObject({ status: 401 });
    });
    it("API requires auth, same-origin, rejects invalid config without leaking input, and caps login attempts despite retired login credentials", async () => {
        expect((await handleModel("get", req("/api/workspace/model"))).status).toBe(401);
        const { account: a, token } = await account();
        const badOrigin = new Request(`${origin}/api/workspace/model`, { method: "PUT", headers: { cookie: `hikari_identity.session_token=${token}`, "content-type": "application/json" }, body: "{}" });
        expect((await handleModel("put", badOrigin)).status).toBe(403);
        const response = await handleModel("put", req("/api/workspace/model", "PUT", { apiKey: "sensitive-input" }, token));
        expect(response.status).toBe(400);
        expect(await response.text()).not.toContain("sensitive-input");
        const attempts = [];
        for (let i = 0; i < 11; i++)
            attempts.push(await handleAuth("login", req("/api/workspace/auth/login", "POST", { username: a.username, password: "bad-password-long" }, randomBytes(32).toString("base64url"))));
        expect(attempts.every(response => response.status === 410)).toBe(true);
    });
    it("limits atomically across concurrent clients", async () => {
        const key = `test:${randomUUID()}`;
        const results = await Promise.allSettled(Array.from({ length: 8 }, () => rateLimit(key, 3)));
        expect(results.filter(r => r.status === "fulfilled")).toHaveLength(3);
        await query("DELETE FROM workspace_rate_limits WHERE key_hash=$1", [tokenHash(key)]);
    });
    it("encrypts isolated config, never returns Key, advances CAS versions and deletes credentials", async () => {
        const { account: a, token } = await configured();
        const { account: b } = await account();
        expect(await getModelConfig(b.id)).toMatchObject({ configured: false, version: 0 });
        const view = await handleModel("get", req("/api/workspace/model", "GET", undefined, token));
        const body = await view.text();
        expect(body).not.toMatch(/private-test-api-key|credential|keyId|ciphertext/);
        const row = (await query("SELECT credential FROM model_configs WHERE owner_id=$1", [a.id])).rows[0];
        expect(JSON.stringify(row)).not.toContain("private-test-api-key");
        await expect(deleteModelConfig(a.id, 0)).rejects.toMatchObject({ status: 409 });
        const deleted = await deleteModelConfig(a.id, 1);
        expect(deleted).toMatchObject({ configured: false, version: 2 });
        expect((await query("SELECT 1 FROM model_configs WHERE owner_id=$1", [a.id])).rowCount).toBe(0);
        await expect(withOwnerLock(a.id, client => assertConfigVersion(client, a.id, 1))).rejects.toThrow();
        const restored = await putModelConfig(a.id, { baseVersion: 2, baseUrl: "https://8.8.8.8/v1", model: "other", apiKey: "changed-private-key" });
        expect(restored.version).toBe(3);
    });
    it("aborts local calls on revoke and rejects stale generated commits", async () => {
        const { account: a } = await configured();
        let entered!: () => void;
        const started = new Promise<void>(r => { entered = r; });
        let aborted = false;
        const transport: ModelTransport = async (_url, _key, _body, signal) => { entered(); signal.addEventListener("abort", () => { aborted = true; }); return new Promise(() => { }); };
        const run = await createModelRun(a.id, "probe", { transport });
        const result = run.call(input);
        const checked = expect(result).rejects.toMatchObject({ code: "CONFIG_CHANGED" });
        await started;
        await deleteModelConfig(a.id, 1);
        await checked;
        expect(aborted).toBe(true);
        await expect(withOwnerLock(a.id, client => assertConfigVersion(client, a.id, 1))).rejects.toMatchObject({ code: "CONFIG_CHANGED" });
    });
    it.each(["delete", "update"])("rejects uncancellable late responses after external-process %s on a second DB connection", async (action) => {
        const { account: a } = await configured();
        let release!: (value: unknown) => void;
        let entered!: () => void;
        const started = new Promise<void>(r => { entered = r; });
        const run = await createModelRun(a.id, "advice", { transport: async () => { entered(); return new Promise(r => { release = r; }); } });
        const result = run.call(input);
        const checked = expect(result).rejects.toMatchObject({ code: "CONFIG_CHANGED" });
        await started;
        const external = new Pool({ connectionString: testUrl });
        const client = await external.connect();
        try {
            await client.query("BEGIN");
            await lockOwner(client, a.id);
            if (action === "delete")
                await client.query("DELETE FROM model_configs WHERE owner_id=$1", [a.id]);
            else
                await client.query("UPDATE model_configs SET version=2,credential=$2 WHERE owner_id=$1", [a.id, encryptCredential(a.id, 2, "external-new-key")]);
            await client.query("UPDATE accounts SET model_version=model_version+1 WHERE id=$1", [a.id]);
            await client.query("COMMIT");
        }
        finally {
            client.release();
            await external.end();
        }
        release(success);
        await checked;
    });
    it.each(["dns-delete", "dns-update", "tls-delete", "tls-update"])("does not dispatch Key after external %s commits during transport preparation", async scenario => {
        const { account: a } = await configured();
        await query("UPDATE model_configs SET endpoint='https://model.example/v1/chat/completions' WHERE owner_id=$1", [a.id]);
        const dnsStarted = deferred(), releaseDns = deferred();
        const connection = preparedConnection(scenario.startsWith("dns"));
        const wire = createModelTransport(async () => {
            dnsStarted.resolve();
            if (scenario.startsWith("dns")) await releaseDns.promise;
            return [{ address: "8.8.8.8", family: 4 }];
        });
        const run = await createModelRun(a.id, "advice", { transport: wire });
        const result = run.call(input);
        const checked = expect(result).rejects.toMatchObject({ code: "CONFIG_CHANGED" });
        await dnsStarted.promise;
        if (scenario.startsWith("tls")) await connection.ready;
        const external = new Pool({ connectionString: testUrl });
        const client = await external.connect();
        try {
            await client.query("BEGIN");
            await lockOwner(client, a.id);
            if (scenario.endsWith("delete"))
                await client.query("DELETE FROM model_configs WHERE owner_id=$1", [a.id]);
            else
                await client.query("UPDATE model_configs SET version=2,credential=$2 WHERE owner_id=$1", [a.id, encryptCredential(a.id, 2, "external-new-key")]);
            await client.query("UPDATE accounts SET model_version=2 WHERE id=$1", [a.id]);
            await client.query("COMMIT");
            if (scenario.startsWith("dns")) releaseDns.resolve();
            else connection.secure();
            await checked;
            expect(connection.sent).toEqual([]);
            expect(JSON.stringify(connection.sent)).not.toContain("private-test-api-key");
        }
        finally {
            client.release();
            await external.end();
            connection.restore();
        }
    });
    it.each([false, true])("holds owner authorization through synchronous send only (cancel while waiting: %s)", async cancel => {
        const { account: a } = await configured();
        const external = new Pool({ connectionString: testUrl });
        const client = await external.connect();
        const connection = preparedConnection(true);
        const authorizing = deferred(), authorized = deferred();
        const controller = new AbortController();
        const wire = createModelTransport();
        let dispatched = false;
        const transport: ModelTransport = (url, key, body, signal, authorize) => wire(url, key, body, signal, async dispatch => {
            authorizing.resolve();
            try {
                await authorize!(() => { dispatch(); dispatched = true; });
            }
            finally { authorized.resolve(); }
        });
        try {
            await client.query("BEGIN");
            await lockOwner(client, a.id);
            const run = await createModelRun(a.id, "advice", { transport, signal: controller.signal });
            const result = run.call(input);
            const checked = cancel ? expect(result).rejects.toMatchObject({ code: "MODEL_CANCELLED" }) : result;
            await authorizing.promise;
            expect(dispatched).toBe(false);
            if (cancel) {
                controller.abort();
                await checked;
            }
            await client.query("COMMIT");
            await authorized.promise;
            expect(connection.sent).toHaveLength(cancel ? 0 : 1);
            if (!cancel) {
                expect(connection.sent[0].headers).toMatchObject({ Authorization: "Bearer private-test-api-key" });
                // A second writer can finish while the model response is still withheld.
                await client.query("BEGIN");
                await client.query("SET LOCAL lock_timeout='1s'");
                await lockOwner(client, a.id);
                await client.query("COMMIT");
                connection.respond();
                expect((await checked as { configVersion: number }).configVersion).toBe(1);
            }
        }
        finally {
            await client.query("ROLLBACK");
            client.release();
            await external.end();
            connection.restore();
        }
    });
    it("rejects old configuration on update and enforces call/input/output budgets, safe error envelopes", async () => {
        const { account: a } = await configured();
        let calls = 0;
        const transport: ModelTransport = async () => { calls++; return success; };
        const run = await createModelRun(a.id, "advice", { transport });
        expect((await run.call(input)).configVersion).toBe(1);
        await expect(run.call(input)).rejects.toMatchObject({ code: "MODEL_BUDGET_EXCEEDED" });
        expect(calls).toBe(1);
        const oversized = await createModelRun(a.id, "probe", { transport });
        await expect(oversized.call({ messages: [{ role: "user", content: "x".repeat(65536) }] })).rejects.toMatchObject({ status: 413 });
        const failing = await createModelRun(a.id, "probe", { transport: async () => { throw Error("upstream private-test-api-key private body"); } });
        await expect(failing.call(input)).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE", message: "模型调用失败，请检查配置或稍后重试" });
        const output = await createModelRun(a.id, "probe", { transport: async () => ({ choices: [{ message: { content: "x".repeat(300000) } }] }) });
        await expect(output.call(input)).rejects.toMatchObject({ status: 400 });
        const stale = await createModelRun(a.id, "probe", { transport });
        await putModelConfig(a.id, { baseVersion: 1, baseUrl: "https://8.8.4.4/v1", model: "changed", apiKey: "next-secret" });
        await expect(stale.call(input)).rejects.toMatchObject({ code: "CONFIG_CHANGED" });
    });
    it("enforces whole-run deadline, cancellation and cumulative input/image limits", async () => {
        const { account: a } = await configured();
        const expired = await createModelRun(a.id, "probe", { transport: async () => success });
        const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 46000);
        await expect(expired.call(input)).rejects.toMatchObject({ code: "MODEL_BUDGET_EXCEEDED" });
        clock.mockRestore();
        const controller = new AbortController();
        let entered!: () => void;
        const started = new Promise<void>(r => { entered = r; });
        const pending = await createModelRun(a.id, "probe", { signal: controller.signal, transport: async () => { entered(); return new Promise(() => { }); } });
        const result = pending.call(input);
        const checked = expect(result).rejects.toMatchObject({ code: "MODEL_CANCELLED" });
        await started;
        controller.abort();
        await checked;
        const cumulative = await createModelRun(a.id, "probe", { transport: async () => success });
        const medium: ChatInput = { messages: [{ role: "user", content: "x".repeat(13000) }] };
        await cumulative.call(medium);
        await expect(cumulative.call(medium)).rejects.toMatchObject({ status: 413 });
        const images = await createModelRun(a.id, "probe", { transport: async () => success });
        await expect(images.call({ messages: [{ role: "user", content: Array.from({ length: 5 }, () => ({ type: "image_url" as const, image_url: { url: "data:image/png;base64,aGVsbG8=" } })) }] })).rejects.toMatchObject({ status: 413 });
        await expect(images.call({ messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://attacker.example/image.png" } }] }] })).rejects.toMatchObject({ status: 400 });
    });
    it("probes text, actual pixels and actual tool call separately and persists distinct statuses", async () => {
        const { account: a } = await configured();
        const transport: ModelTransport = async (_url, _key, body) => {
            const value = body as ChatInput;
            const message = value.messages[0].content;
            if (value.tools) {
                const token = (message as string).split(" ").at(-1)!.slice(0, -1);
                return { choices: [{ message: { tool_calls: [{ id: "call", type: "function", function: { name: "capability_check", arguments: JSON.stringify({ token }) } }] } }] };
            }
            if (typeof message === "string")
                return { choices: [{ message: { content: message.split(": ")[1] } }] };
            const url = (message as {
                type: string;
                image_url?: {
                    url: string;
                };
            }[]).find(p => p.type === "image_url")!.image_url!.url;
            const png = Buffer.from(url.split(",")[1], "base64");
            let offset = 8;
            let data = Buffer.alloc(0);
            while (offset < png.length) {
                const size = png.readUInt32BE(offset);
                if (png.toString("ascii", offset + 4, offset + 8) === "IDAT")
                    data = png.subarray(offset + 8, offset + 8 + size);
                offset += 12 + size;
            }
            const pixels = inflateSync(data);
            const colors: Record<string, string> = { "255,0,0": "red", "0,255,0": "green", "0,0,255": "blue", "255,255,0": "yellow" };
            const content = [[0, 0], [32, 0], [0, 32], [32, 32]].map(([x, y]) => colors[[...pixels.subarray(y * 193 + 1 + x * 3, y * 193 + 4 + x * 3)].join(",")]).join(",");
            return { choices: [{ message: { content } }] };
        };
        expect((await probeModel(a.id, { transport })).capabilities).toEqual({ text: "available", image: "available", tools: "available" });
        const partial: ModelTransport = async (_u, _k, body) => { const m = (body as ChatInput).messages[0].content; return { choices: [{ message: { content: typeof m === "string" && m.startsWith("Reply") ? m.split(": ")[1] : "unsupported" } }] }; };
        expect((await probeModel(a.id, { transport: partial })).capabilities).toEqual({ text: "available", image: "unavailable", tools: "unavailable" });
        expect((await getModelConfig(a.id)).capabilities.tools).toBe("unavailable");
    });
    it.each([401, 403, 402, 429, 500, 302])("preserves actionable HTTP %s probe errors in public API envelopes", async status => {
        const { account: a, token } = await configured();
        const failure = modelHttpError(status);
        const connection = preparedConnection(true, status);
        try {
            const pending = handleModel("probe", req("/api/workspace/model/probe", "POST", {}, token));
            await connection.dispatched;
            connection.respond();
            const response = await pending;
            expect(response.status).toBe(failure.status);
            expect(await response.json()).toMatchObject({ error: { code: failure.code } });
            expect(connection.sent).toHaveLength(1);
            expect((await getModelConfig(a.id)).capabilities).toEqual({ text: "untested", image: "untested", tools: "untested" });
        }
        finally { connection.restore(); }
    });
    it("retains unavailable capability results for unsupported probe requests", async () => {
        const { account: a } = await configured();
        const result = await probeModel(a.id, { transport: async () => { throw modelHttpError(400); } });
        expect(result.capabilities).toEqual({ text: "unavailable", image: "unavailable", tools: "unavailable" });
    });
    it("deletes account/session/config and account foundation rows without touching other owners", async () => {
        const { account: a } = await configured();
        const b = await account();
        await query("DELETE FROM accounts WHERE id=$1", [a.id]);
        for (const table of ["accounts", "sessions", "model_configs"]) {
            const result = await query(`SELECT 1 FROM ${table} WHERE ${table === "accounts" ? "id" : "owner_id"}=$1`, [a.id]);
            expect(result.rowCount).toBe(0);
        }
        expect(await requireAccount(req("/", "GET", undefined, b.token))).toEqual(b.account);
    });
});
