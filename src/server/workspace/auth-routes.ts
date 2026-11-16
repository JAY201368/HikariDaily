import "server-only";
import { z } from "zod";
import { requireAccount, requireIdentity } from "./auth";
import { invalid, WorkspaceError } from "./errors";
import { json, rateLimit, readJson, requireSameOrigin, route } from "./http";
import { sendDeletionCode } from "./authing";
import { getIdentity, identityConfig } from "./identity";
import { deletionFor, resumeDeletion, startDeletion } from "./account-deletion";
export type AuthAction = "register" | "login" | "logout" | "session" | "password" | "account" | "delete-code";
export function handleAuth(action: AuthAction, request: Request) {
  return route(async () => {
    if (["register", "login", "password", "logout"].includes(action)) throw new WorkspaceError("AUTH_RETIRED", 410, "请使用托管账户入口");
    if (action === "session") {
      const identity = await requireIdentity(request);
      const deletion = await deletionFor(identity.subject);
      if (deletion) return json({ id: deletion.owner_id, username: identity.username, email: identity.email, deletionStage: deletion.stage });
      return json(await requireAccount(request));
    }
    requireSameOrigin(request);
    const identity = await requireIdentity(request);
    if (action === "delete-code") await rateLimit(`auth:delete-code-cooldown:${identity.userId}`, 1, 60);
    await rateLimit(`auth:${action}:${identity.userId}`, action === "delete-code" ? 3 : 10);
    let deletion = await deletionFor(identity.subject);
    if (action === "delete-code") {
      if (deletion) throw new WorkspaceError("ACCOUNT_DELETING", 409, "账户已开始注销，请重试完成注销");
      await sendDeletionCode(request, identity);
      return json({ sent: true });
    }
    if (!deletion) {
      const input = z.object({ code: z.string().regex(/^\d{6}$/) }).strict().safeParse(await readJson(request));
      if (!input.success) throw invalid();
      await startDeletion(request, identity, await requireAccount(request), input.data.code);
      deletion = await deletionFor(identity.subject);
    }
    try {
      await resumeDeletion(deletion!.owner_id);
    } catch {
      const stage = (await deletionFor(identity.subject))?.stage;
      throw new WorkspaceError("DELETE_PENDING", 503, stage === "external_deleted" ? "登录身份已删除，逐光私人资料清理尚未完成，请重试" : "Authing 身份删除尚未完成，私人功能已停用，请重试");
    }
    // Both deletions are durable. A cookie cleanup failure cannot undo completion;
    // the deleted session rows already make every outstanding cookie invalid.
    const signedOut = await getIdentity().api.signOut({ headers: request.headers, body: { callbackURL: `${identityConfig().origin}/auth/return`, disableRedirect: true }, asResponse: true }).catch(() => null);
    const headers = new Headers();
    for (const cookie of signedOut?.headers.getSetCookie() ?? []) headers.append("Set-Cookie", cookie);
    return json({ deleted: true }, 200, headers);
  });
}
