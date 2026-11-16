import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const sdk = vi.hoisted(() => ({ profile: vi.fn(), email: vi.fn(), verify: vi.fn(), users: vi.fn(), remove: vi.fn(), token: vi.fn() }));
vi.mock("authing-node-sdk", () => ({
  AuthenticationClient: class { getUserInfoByAccessToken = sdk.profile; sendEmail = sdk.email; verifyDeleteAccountRequest = sdk.verify; },
  ManagementClient: class { getUserBatch = sdk.users; deleteUsersBatch = sdk.remove; },
  Models: { SendEmailDto: { channel: { CHANNEL_DELETE_ACCOUNT: "CHANNEL_DELETE_ACCOUNT" } }, VerifyDeleteAccountRequestDto: { verifyMethod: { EMAIL_PASSCODE: "EMAIL_PASSCODE" } } },
}));
vi.mock("../../src/server/workspace/identity", () => ({
  identityConfig: () => ({ clientId: "app", clientSecret: "secret", host: "https://identity.invalid" }), getIdentity: () => ({ api: { getAccessToken: sdk.token } }),
}));
import { deleteExternalIdentity, sendDeletionCode, verifyDeletionCode } from "../../src/server/workspace/authing";
const identity = { subject: "verified-subject", email: "account@example.invalid", username: "account", userId: "local-user", accountId: "provider-account" };
const req = new Request("http://localhost:3000");
beforeEach(() => {
  vi.resetAllMocks();
  process.env.AUTHING_USER_POOL_ID = "test-pool"; process.env.AUTHING_USER_POOL_SECRET = "test-secret";
  sdk.token.mockResolvedValue({ accessToken: "provider-access" });
  sdk.profile.mockResolvedValue({ sub: identity.subject, email: identity.email, email_verified: true });
});
describe("Authing official SDK boundary", () => {
  it("sends only deletion-purpose email to the session email, using the session's exact provider account", async () => {
    sdk.email.mockResolvedValue({ statusCode: 200 });
    await sendDeletionCode(req, identity);
    expect(sdk.token).toHaveBeenCalledWith({ headers: req.headers, body: { accountId: identity.accountId } });
    expect(sdk.email).toHaveBeenCalledWith({ channel: "CHANNEL_DELETE_ACCOUNT", email: identity.email });
  });
  it.each([429, 500])("reports unsuccessful email delivery (%s) with a retry delay", async status => {
    sdk.email.mockResolvedValue({ statusCode: status });
    await expect(sendDeletionCode(req, identity)).rejects.toMatchObject({ code: "DELETE_EMAIL_FAILED", status: status === 429 ? 429 : 502, details: { retryAfter: 60 } });
  });
  it("rejects changed email, mismatched subject, and unverified email before sending or verifying", async () => {
    for (const profile of [{ sub: "attacker", email: identity.email, email_verified: true }, { sub: identity.subject, email: "changed@example.invalid", email_verified: true }, { sub: identity.subject, email: identity.email, email_verified: false }]) {
      sdk.profile.mockResolvedValueOnce(profile);
      await expect(sendDeletionCode(req, identity)).rejects.toMatchObject({ code: "IDENTITY_CHANGED" });
    }
    expect(sdk.email).not.toHaveBeenCalled();
  });
  it("checks provider verification results, including missing deletion proof", async () => {
    for (const result of [{ statusCode: 400 }, { statusCode: 200, data: {} }]) {
      sdk.verify.mockResolvedValueOnce(result);
      await expect(verifyDeletionCode(req, identity, "123456")).rejects.toMatchObject({ code: "DELETE_CODE_INVALID" });
    }
    sdk.verify.mockResolvedValueOnce({ statusCode: 200, data: { deleteAccountToken: "proof" } });
    await verifyDeletionCode(req, identity, "123456");
    expect(sdk.verify).toHaveBeenLastCalledWith({ verifyMethod: "EMAIL_PASSCODE", emailPassCodePayload: { email: identity.email, passCode: "123456" } });
  });
  it("deletes exactly the verified subject and requires explicit successful absence confirmation", async () => {
    sdk.users.mockResolvedValueOnce({ statusCode: 200, data: [{ userId: identity.subject }] }).mockResolvedValueOnce({ statusCode: 200, data: [] });
    sdk.remove.mockResolvedValue({ statusCode: 200 });
    await deleteExternalIdentity(identity.subject);
    expect(sdk.remove).toHaveBeenCalledWith({ userIds: [identity.subject] });
    expect(sdk.users).toHaveBeenLastCalledWith({ userIds: [identity.subject], userIdType: "user_id" });
  });
  it("never treats provider/network errors, malformed responses or a different identity as absence", async () => {
    for (const result of [{ statusCode: 401, data: [] }, { statusCode: 200 }, { statusCode: 200, data: [{ userId: "different" }] }]) {
      sdk.users.mockResolvedValueOnce(result);
      await expect(deleteExternalIdentity(identity.subject)).rejects.toMatchObject({ code: "IDENTITY_UNAVAILABLE" });
    }
    sdk.users.mockRejectedValueOnce(Error("network"));
    await expect(deleteExternalIdentity(identity.subject)).rejects.toThrow("network");
    expect(sdk.remove).not.toHaveBeenCalled();
  });
  it("allows retry after the external identity has already gone", async () => {
    sdk.users.mockResolvedValue({ statusCode: 200, data: [] });
    await deleteExternalIdentity(identity.subject);
    expect(sdk.remove).not.toHaveBeenCalled();
  });
});
