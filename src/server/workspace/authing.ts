import "server-only";
import { AuthenticationClient, ManagementClient, Models } from "authing-node-sdk";
import { getIdentity, identityConfig } from "./identity";
import { requireIdentity } from "./auth";
import { WorkspaceError, unavailable } from "./errors";

const providerFailure = () => new WorkspaceError("IDENTITY_UNAVAILABLE", 502, "身份服务暂不可用，请重试");
function checked<T extends { statusCode: number }>(result: T): T {
  if (result.statusCode !== 200) throw providerFailure();
  return result;
}
export async function authenticationClient(request: Request, identity: Awaited<ReturnType<typeof requireIdentity>>) {
  const config = identityConfig();
  const token = await getIdentity().api.getAccessToken({ headers: request.headers, body: { accountId: identity.accountId } });
  const client = new AuthenticationClient({ appId: config.clientId, appSecret: config.clientSecret, appHost: config.host, accessToken: token.accessToken, timeout: 10000 });
  // Re-fetch provider profile: email and subject must still match the authenticated session.
  const profile = await client.getUserInfoByAccessToken(token.accessToken);
  if (profile.sub !== identity.subject || profile.email?.toLowerCase() !== identity.email.toLowerCase() || !profile.email_verified) {
    throw new WorkspaceError("IDENTITY_CHANGED", 409, "邮箱资料已更新，请退出后重新登录");
  }
  return client;
}
export async function sendDeletionCode(request: Request, identity: Awaited<ReturnType<typeof requireIdentity>>) {
  const client = await authenticationClient(request, identity);
  const result = await client.sendEmail({ channel: Models.SendEmailDto.channel.CHANNEL_DELETE_ACCOUNT, email: identity.email });
  if (result.statusCode !== 200) throw new WorkspaceError("DELETE_EMAIL_FAILED", result.statusCode === 429 ? 429 : 502, "注销验证码邮件未发送，请稍后重试", { retryAfter: 60 });
}
export async function verifyDeletionCode(request: Request, identity: Awaited<ReturnType<typeof requireIdentity>>, code: string) {
  const client = await authenticationClient(request, identity);
  const result = await client.verifyDeleteAccountRequest({ verifyMethod: Models.VerifyDeleteAccountRequestDto.verifyMethod.EMAIL_PASSCODE,
    emailPassCodePayload: { email: identity.email, passCode: code } });
  if (result.statusCode !== 200 || !result.data?.deleteAccountToken) throw new WorkspaceError("DELETE_CODE_INVALID", 400, "验证码错误或已过期，请重新发送");
}
export function managementClient() {
  const accessKeyId = process.env.AUTHING_USER_POOL_ID, accessKeySecret = process.env.AUTHING_USER_POOL_SECRET;
  if (!accessKeyId || !accessKeySecret) throw unavailable();
  return new ManagementClient({ accessKeyId, accessKeySecret, timeout: 10000 });
}
export async function deleteExternalIdentity(subject: string) {
  const manager = managementClient();
  const exists = async () => {
    const result = checked(await manager.getUserBatch({ userIds: [subject], userIdType: "user_id" }));
    if (!Array.isArray(result.data) || result.data.some(user => user.userId !== subject)) throw providerFailure();
    return result.data.some(user => user.userId === subject);
  };
  if (!await exists()) return;
  checked(await manager.deleteUsersBatch({ userIds: [subject] }));
  if (await exists()) throw providerFailure();
}
