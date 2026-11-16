import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { identityEnvironment, register } from "../fixtures/workspace/identity";
import { requireAccount, requireIdentity, tokenHash } from "../../src/server/workspace/auth";
import { handleAuth } from "../../src/server/workspace/auth-routes";
import { deletionFor, resumeDeletion, startDeletion } from "../../src/server/workspace/account-deletion";
import { closeDatabase, query, lockOwner, transaction } from "../../src/server/workspace/db";
import { migrate } from "../../src/server/workspace/migrate";
import { GET, POST } from "../../src/app/api/auth/[...all]/route";
import { getModelConfig, putModelConfig } from "../../src/server/workspace/config";
vi.mock("../../src/server/workspace/authing", () => ({
  verifyDeletionCode: vi.fn(), deleteExternalIdentity: vi.fn(), sendDeletionCode: vi.fn(),
}));
import { deleteExternalIdentity, verifyDeletionCode } from "../../src/server/workspace/authing";
const suite = process.env.HIKARI_TEST_DATABASE_URL ? describe : describe.skip;
const origin = "http://localhost:3000", host = "https://identity.example.invalid";
const owners: Awaited<ReturnType<typeof register>>[] = [];
const request = (token: string, method = "GET", body?: unknown) => new Request(`${origin}/api/workspace/auth/account`, { method, headers: { cookie: `hikari_identity.session_token=${token}`, origin, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const wrongKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...keys.publicKey.export({ format: "jwk" }), kid: "test", alg: "RS256", use: "sig" };
let claims: Record<string, unknown> = {}, expectedNonce = "", pkce = "", subject = "", tokenMode = "good";
function jwt() {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", kid: "test" })}.${encode({ iss: `${host}/oidc`, sub: subject, aud: "test-client", iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+300, nonce: expectedNonce, email: `${subject}@example.invalid`, email_verified: true, name: "测试账户", ...claims })}`;
  return `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), tokenMode === "signature" ? wrongKeys.privateKey : keys.privateKey).toString("base64url")}`;
}
suite("Authing OIDC and durable account deletion", () => {
  beforeAll(async () => {
    identityEnvironment(); process.env.HIKARI_DATABASE_URL = process.env.HIKARI_TEST_DATABASE_URL;
    process.env.HIKARI_CREDENTIAL_KEYS = JSON.stringify({ test: Buffer.alloc(32, 7).toString("base64") });
    await migrate();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      let data: unknown;
      if (url.endsWith("openid-configuration")) data = { issuer: `${host}/oidc`, authorization_endpoint: `${host}/oidc/auth`, token_endpoint: `${host}/oidc/token`, userinfo_endpoint: `${host}/oidc/me`, jwks_uri: `${host}/oidc/jwks`, end_session_endpoint: `${host}/oidc/logout` };
      else if (url.endsWith("/jwks")) data = { keys: [jwk] };
      else if (url.endsWith("/token")) {
        const params = new URLSearchParams(String(init?.body));
        expect(createHash("sha256").update(params.get("code_verifier")!).digest("base64url")).toBe(pkce);
        data = { access_token: "provider-access", token_type: "Bearer", expires_in: 300, id_token: tokenMode === "missing" ? undefined : jwt() };
      } else if (url.endsWith("/me")) data = { sub: "wrong-subject", email: "wrong@example.invalid", email_verified: true };
      else throw Error(`Unexpected provider request: ${url}`);
      return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
    }));
  });
  afterAll(async () => { vi.unstubAllGlobals(); for (const a of owners) { await query("DELETE FROM accounts WHERE id=$1", [a.account.id]); await query("DELETE FROM identity_users WHERE id=$1", [a.userId]); await query("DELETE FROM account_deletions WHERE owner_id=$1", [a.account.id]); } await closeDatabase(); });
  async function seed() { const a = await register({ username: `migration_${randomUUID()}` }); owners.push(a); return a; }
  async function begin() {
    subject = randomUUID(); claims = {}; tokenMode = "good";
    const response = await POST(new Request(`${origin}/api/auth/sign-in/social`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ provider: "authing", callbackURL: `${origin}/?place=nanchang&hour=17` }) }));
    expect(response.status).toBe(200);
    const url = new URL((await response.json()).url);
    expect(url.origin).toBe(host); expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expectedNonce = url.searchParams.get("nonce")!; pkce = url.searchParams.get("code_challenge")!;
    expect(expectedNonce).toBeTruthy(); expect(pkce).toBeTruthy();
    return { state: url.searchParams.get("state")!, cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") };
  }
  async function callback(flow: Awaited<ReturnType<typeof begin>>, cookie = flow.cookie) {
    return GET(new Request(`${origin}/api/auth/callback/authing?code=fixture-code&state=${flow.state}`, { headers: { cookie } }));
  }
  it("uses verified OIDC + PKCE, restores page parameters, and creates an isolated local UUID", async () => {
    const flow = await begin(), response = await callback(flow);
    expect(response.headers.get("location")).toBe(`${origin}/?place=nanchang&hour=17`);
    const cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    const account = await requireAccount(new Request(origin, { headers: { cookie } }));
    expect(account.email).toBe(`${subject}@example.invalid`); expect(account.id).toMatch(/^[\da-f-]{36}$/);
    await query("DELETE FROM accounts WHERE id=$1", [account.id]);
    await query('DELETE FROM identity_users WHERE email=$1', [account.email]);
    const replay = await callback(flow);
    expect(replay.headers.get("location")).not.toBe(`${origin}/?place=nanchang&hour=17`);
  });
  it.each(["nonce", "issuer", "audience", "expiry", "signature", "missing", "userinfo"])("rejects invalid %s without creating an account", async mode => {
    const flow = await begin();
    if (mode === "nonce") claims.nonce = "wrong";
    if (mode === "issuer") claims.iss = "https://attacker.invalid";
    if (mode === "audience") claims.aud = "wrong-client";
    if (mode === "expiry") claims.exp = 1;
    if (mode === "signature") tokenMode = "signature";
    if (mode === "missing") tokenMode = "missing";
    if (mode === "userinfo") claims.email = undefined;
    const response = await callback(flow);
    expect(response.headers.get("location")).not.toBe(`${origin}/?place=nanchang&hour=17`);
    expect((await query('SELECT 1 FROM identity_accounts WHERE "accountId"=$1', [subject])).rowCount).toBe(0);
  });
  it("rejects state cookie loss, foreign redirects/origins, and public token/management endpoints", async () => {
    const flow = await begin();
    expect((await callback(flow, "")).headers.get("location")).not.toBe(`${origin}/?place=nanchang&hour=17`);
    expect((await POST(new Request(`${origin}/api/auth/sign-in/social`, { method: "POST", headers: { origin: "https://evil.invalid", "content-type": "application/json" }, body: '{}' }))).status).toBe(403);
    const foreign = await POST(new Request(`${origin}/api/auth/sign-in/social`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ provider: "authing", callbackURL: "https://evil.invalid" }) }));
    expect(foreign.status).toBe(403);
    expect((await POST(new Request(`${origin}/api/auth/get-access-token`, { method: "POST" }))).status).toBe(404);
  });
  it("retains legacy accounts without email linking and retires old credentials", async () => {
    const legacyId = randomUUID(), legacyToken = randomUUID(), legacyName = `legacy_${randomUUID()}`;
    await query("INSERT INTO accounts(id,username,password_hash) VALUES($1,$2,'legacy-password-hash')", [legacyId, legacyName]);
    await query("INSERT INTO sessions(token_hash,owner_id,expires_at) VALUES($1,$2,now()+interval '1 day')", [tokenHash(legacyToken), legacyId]);
    const a = await register({ username: legacyName }); owners.push(a);
    expect(a.account.id).not.toBe(legacyId);
    expect((await query("SELECT password_hash FROM accounts WHERE id=$1", [legacyId])).rows[0].password_hash).toBe('legacy-password-hash');
    await expect(requireAccount(new Request(origin, { headers: { cookie: `hikari_session=${legacyToken}` } }))).rejects.toMatchObject({ status: 401 });
    await query("DELETE FROM accounts WHERE id=$1", [legacyId]);
    for (const action of ["register", "login", "password", "logout"] as const) expect((await handleAuth(action, request(a.token, "POST", {}))).status).toBe(410);
    await expect(requireAccount(new Request(origin, { headers: { cookie: `hikari_session=${a.session}` } }))).rejects.toMatchObject({ status: 401 });
    const b = await seed(); expect(a.account.id).not.toBe(b.account.id);
  });
  it("wrong or expired verification does not block or erase data", async () => {
    const a = await seed(), req = request(a.token), identity = await requireIdentity(req);
    for (const message of ["wrong", "expired"]) {
      vi.mocked(verifyDeletionCode).mockRejectedValueOnce(Error(message));
      await expect(startDeletion(req, identity, a.account, "123456")).rejects.toThrow(message);
      expect(await deletionFor(a.subject)).toBeNull(); expect(await requireAccount(req)).toEqual(a.account);
    }
  });
  it("retries the business deletion endpoint without re-verifying and expires application cookies after completion", async () => {
    const a = await seed();
    vi.mocked(verifyDeletionCode).mockResolvedValueOnce(undefined);
    vi.mocked(deleteExternalIdentity).mockRejectedValueOnce(Error("offline"));
    const first = await handleAuth("account", request(a.token, "DELETE", { code: "123456" }));
    expect(first.status).toBe(503);
    expect((await first.json()).error.code).toBe("DELETE_PENDING");
    const verified = vi.mocked(verifyDeletionCode).mock.calls.length;
    vi.mocked(deleteExternalIdentity).mockResolvedValueOnce(undefined);
    const second = await handleAuth("account", request(a.token, "DELETE", {}));
    expect(second.status).toBe(200);
    expect((await second.json()).data.deleted).toBe(true);
    expect(vi.mocked(verifyDeletionCode).mock.calls.length).toBe(verified);
    expect(second.headers.getSetCookie().some(cookie => cookie.includes('hikari_identity.session_token=;') && cookie.includes('Max-Age=0'))).toBe(true);
    expect((await deletionFor(a.subject))?.stage).toBe('complete');
  });
  it("blocks every private owner write after verification, survives both deletion failures and retries idempotently", async () => {
    const a = await seed(), b = await seed(), req = request(a.token), identity = await requireIdentity(req);
    await putModelConfig(a.account.id, { baseVersion: 0, baseUrl: "https://8.8.8.8/v1", model: "fixture", apiKey: "private" });
    vi.mocked(verifyDeletionCode).mockResolvedValueOnce(undefined);
    await startDeletion(req, identity, a.account, "123456");
    await expect(requireAccount(req)).rejects.toMatchObject({ code: "ACCOUNT_DELETING" });
    await expect(transaction(c => lockOwner(c, a.account.id))).rejects.toMatchObject({ status: 401 });
    vi.mocked(deleteExternalIdentity).mockRejectedValueOnce(Error("provider offline"));
    await expect(resumeDeletion(a.account.id)).rejects.toThrow("provider offline");
    expect((await deletionFor(a.subject))?.stage).toBe("verified");
    expect((await getModelConfig(a.account.id)).configured).toBe(true);
    // Simulate local cleanup failure AFTER external deletion; durable stage must survive rollback.
    await query("CREATE FUNCTION test_reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test local failure'; END $$");
    await query("CREATE TRIGGER test_reject_delete BEFORE DELETE ON accounts FOR EACH ROW EXECUTE FUNCTION test_reject_delete()");
    try { await expect(resumeDeletion(a.account.id)).rejects.toThrow("test local failure"); }
    finally { await query("DROP TRIGGER test_reject_delete ON accounts"); await query("DROP FUNCTION test_reject_delete()"); }
    expect((await deletionFor(a.subject))?.stage).toBe("external_deleted");
    expect((await resumeDeletion(a.account.id)).stage).toBe("complete");
    expect((await resumeDeletion(a.account.id)).stage).toBe("complete");
    expect((await query('SELECT 1 FROM identity_sessions WHERE "userId"=$1', [a.userId])).rowCount).toBe(0);
    expect((await query("SELECT 1 FROM model_configs WHERE owner_id=$1", [a.account.id])).rowCount).toBe(0);
    expect(await requireAccount(request(b.token))).toEqual(b.account);
  });
});
