import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getIdentity, sessionToken } from "./identity";
import { query, transaction } from "./db";
import { unauthorized, WorkspaceError } from "./errors";
export { sessionToken } from "./identity";
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export type Account = { id: string; username: string; email: string };
export async function requireIdentity(request: Request) {
  if (!sessionToken(request)) throw unauthorized();
  const session = await getIdentity().api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
  if (!session || !session.user.emailVerified) throw unauthorized();
  const { rows } = await query<{ subject: string; accountId: string }>('SELECT "accountId" AS subject, id AS "accountId" FROM identity_accounts WHERE "userId"=$1 AND "providerId"=\'authing\'', [session.user.id]);
  if (rows.length !== 1) throw unauthorized();
  return { accountId: rows[0].accountId, userId: session.user.id, subject: rows[0].subject, username: session.user.name, email: session.user.email };
}
export async function requireAccount(request: Request): Promise<Account> {
  const identity = await requireIdentity(request);
  return transaction(async client => {
    // Serializes first access and deletion; no email-based linking to legacy accounts.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [identity.subject]);
    const deleted = await client.query("SELECT 1 FROM account_deletions WHERE subject=$1", [identity.subject]);
    if (deleted.rowCount) throw new WorkspaceError("ACCOUNT_DELETING", 403, "账户正在注销，请在账户设置中重试");
    const existing = await client.query<{ id: string }>("SELECT id FROM accounts WHERE identity_subject=$1 AND NOT deletion_pending", [identity.subject]);
    let id = existing.rows[0]?.id;
    if (!id) {
      id = randomUUID();
      await client.query("INSERT INTO accounts(id,username,password_hash,identity_subject) VALUES($1,$2,'!external-identity',$3)", [id, `authing_${id}`, identity.subject]);
    }
    return { id, username: identity.username || identity.email, email: identity.email };
  });
}
