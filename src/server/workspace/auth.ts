import "server-only";
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { query, transaction, withOwnerLock } from "./db";
import { invalid, unauthorized, WorkspaceError } from "./errors";
import { cancelOwnerCalls } from "./inflight";
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
});
export const SESSION_COOKIE = "hikari_session";
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export type Account = {
    id: string;
    username: string;
};
export function parseCredentials(value: unknown) {
    if (!value || typeof value !== "object")
        throw invalid();
    const { username, password } = value as Record<string, unknown>;
    if (typeof username !== "string" || !/^[a-zA-Z0-9_]{3,32}$/.test(username) || typeof password !== "string" || password.length < 12 || password.length > 256)
        throw invalid();
    return { username: username.toLowerCase(), password };
}
export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const hash = await derive(password, salt);
    return `scrypt$32768$${salt}$${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
    const [kind, cost, salt, hash] = encoded.split("$");
    if (kind !== "scrypt" || cost !== "32768" || !/^[a-f0-9]{32}$/.test(salt ?? "") || !/^[a-f0-9]{128}$/.test(hash ?? ""))
        return false;
    const actual = await derive(password, salt);
    return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}
async function newSession(client: PoolClient, ownerId: string) {
    const token = randomBytes(32).toString("base64url");
    await client.query("INSERT INTO sessions(token_hash,owner_id,expires_at) VALUES($1,$2,now()+interval '30 days')", [tokenHash(token), ownerId]);
    return token;
}
export async function register(input: unknown) {
    const { username, password } = parseCredentials(input);
    const hash = await hashPassword(password);
    return transaction(async (client) => {
        const account = { id: randomUUID(), username };
        const result = await client.query("INSERT INTO accounts(id,username,password_hash) VALUES($1,$2,$3) ON CONFLICT(username) DO NOTHING RETURNING id", [account.id, username, hash]);
        if (!result.rowCount)
            throw new WorkspaceError("ACCOUNT_UNAVAILABLE", 409, "该用户名无法注册");
        return { account, token: await newSession(client, account.id) };
    });
}
export async function login(input: unknown) {
    const { username, password } = parseCredentials(input);
    const { rows } = await query<Account & {
        password_hash: string;
    }>("SELECT id,username,password_hash FROM accounts WHERE username=$1", [username]);
    // Same expensive path when the account does not exist.
    const encoded = rows[0]?.password_hash ?? `scrypt$32768$${"0".repeat(32)}$${"0".repeat(128)}`;
    const valid = await verifyPassword(password, encoded);
    if (!rows[0] || !valid)
        throw new WorkspaceError("LOGIN_FAILED", 401, "用户名或密码不正确");
    const row = rows[0];
    return withOwnerLock(row.id, async (client) => {
        const current = await client.query("SELECT password_hash FROM accounts WHERE id=$1", [row.id]);
        if (current.rows[0].password_hash !== encoded)
            throw unauthorized();
        return { account: { id: row.id, username: row.username }, token: await newSession(client, row.id) };
    });
}
export function sessionToken(request: Request): string | null {
    const raw = request.headers.get("cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
    return raw && /^[A-Za-z0-9_-]{43}$/.test(raw) ? raw : null;
}
export async function requireAccount(request: Request): Promise<Account> {
    const token = sessionToken(request);
    if (!token)
        throw unauthorized();
    const { rows } = await query<Account>("SELECT a.id,a.username FROM sessions s JOIN accounts a ON a.id=s.owner_id WHERE s.token_hash=$1 AND s.expires_at>now()", [tokenHash(token)]);
    if (!rows[0])
        throw unauthorized();
    return rows[0];
}
export async function logout(request: Request) {
    const token = sessionToken(request);
    if (token)
        await query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash(token)]);
}
export async function changePassword(ownerId: string, currentPassword: string, nextPassword: string) {
    if (typeof currentPassword !== "string" || currentPassword.length > 256 || typeof nextPassword !== "string" || nextPassword.length < 12 || nextPassword.length > 256)
        throw invalid();
    const nextHash = await hashPassword(nextPassword);
    return withOwnerLock(ownerId, async (client) => {
        const { rows } = await client.query("SELECT password_hash FROM accounts WHERE id=$1", [ownerId]);
        if (!await verifyPassword(currentPassword, rows[0].password_hash))
            throw new WorkspaceError("PASSWORD_INCORRECT", 401, "当前密码不正确");
        await client.query("UPDATE accounts SET password_hash=$2 WHERE id=$1", [ownerId, nextHash]);
        await client.query("DELETE FROM sessions WHERE owner_id=$1", [ownerId]);
        return newSession(client, ownerId);
    });
}
export async function deleteAccount(ownerId: string, password: string) {
    if (typeof password !== "string" || password.length > 256)
        throw invalid();
    await withOwnerLock(ownerId, async (client) => {
        const { rows } = await client.query("SELECT password_hash FROM accounts WHERE id=$1", [ownerId]);
        if (!await verifyPassword(password, rows[0].password_hash))
            throw new WorkspaceError("PASSWORD_INCORRECT", 401, "当前密码不正确");
        await client.query("DELETE FROM accounts WHERE id=$1", [ownerId]);
    });
    cancelOwnerCalls(ownerId);
}
export function cookieHeader(token: string | null): string {
    return `${SESSION_COOKIE}=${token ?? ""}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? SESSION_SECONDS : 0}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
