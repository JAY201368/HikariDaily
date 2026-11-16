import "server-only";
import { requireIdentity, type Account } from "./auth";
import { query, transaction } from "./db";
import { cancelOwnerCalls } from "./inflight";
import { deleteExternalIdentity, verifyDeletionCode } from "./authing";
import { WorkspaceError } from "./errors";
export type Deletion = { owner_id: string; subject: string; identity_user_id: string; stage: "verified" | "external_deleted" | "complete" };
export async function deletionFor(subject: string) {
  return (await query<Deletion>("SELECT * FROM account_deletions WHERE subject=$1", [subject])).rows[0] ?? null;
}
export async function startDeletion(request: Request, identity: Awaited<ReturnType<typeof requireIdentity>>, account: Account, code: string) {
  // No durable destructive intent before provider verification succeeds.
  await verifyDeletionCode(request, identity, code);
  await transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [identity.subject]);
    const row = await client.query("SELECT id FROM accounts WHERE id=$1 AND identity_subject=$2 FOR UPDATE", [account.id, identity.subject]);
    if (!row.rowCount) throw new WorkspaceError("UNAUTHORIZED", 401, "请先登录");
    await client.query("INSERT INTO account_deletions(owner_id,subject,identity_user_id) VALUES($1,$2,$3) ON CONFLICT(subject) DO NOTHING", [account.id, identity.subject, identity.userId]);
    await client.query("UPDATE accounts SET deletion_pending=true, model_version=model_version+1 WHERE id=$1 AND NOT deletion_pending", [account.id]);
  });
  cancelOwnerCalls(account.id);
}
/** Safe to run without a browser session: only verified durable jobs can enter. */
export async function resumeDeletion(ownerId: string): Promise<Deletion> {
  const job = (await query<Deletion>("SELECT * FROM account_deletions WHERE owner_id=$1", [ownerId])).rows[0];
  if (!job) throw new WorkspaceError("DELETE_NOT_STARTED", 404, "没有待处理的注销请求");
  if (job.stage === "complete") return job;
  cancelOwnerCalls(ownerId);
  if (job.stage === "verified") {
    await deleteExternalIdentity(job.subject);
    await query("UPDATE account_deletions SET stage='external_deleted', updated_at=now() WHERE owner_id=$1 AND stage='verified'", [ownerId]);
  }
  await transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [job.subject]);
    await client.query("DELETE FROM accounts WHERE id=$1 AND identity_subject=$2 AND deletion_pending", [ownerId, job.subject]);
    await client.query("DELETE FROM identity_users WHERE id=$1", [job.identity_user_id]);
    await client.query("UPDATE account_deletions SET stage='complete', updated_at=now() WHERE owner_id=$1", [ownerId]);
  });
  return { ...job, stage: "complete" };
}
