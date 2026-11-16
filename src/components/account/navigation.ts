"use client";
export const AUTH_NAVIGATION = "hikari:auth-navigation";
export const ACCOUNT_DELETED = "hikari:account-deleted";
export async function prepareAuthNavigation() {
  const pending: Promise<unknown>[] = [];
  window.dispatchEvent(new CustomEvent(AUTH_NAVIGATION, { detail: { waitUntil: (work: Promise<unknown>) => pending.push(work) } }));
  await Promise.all(pending);
}
export async function authAction(action: "sign-in/social" | "sign-out") {
  await prepareAuthNavigation();
  sessionStorage.setItem("hikari:auth-return", location.href);
  const callbackURL = `${location.origin}/auth/return`;
  const response = await fetch(`/api/auth/${action}`, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action === "sign-in/social" ? { provider: "authing", callbackURL, errorCallbackURL: callbackURL } : { callbackURL, disableRedirect: true }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "账户服务连接失败，请重试");
  if (result.url) { location.assign(result.url); return; }
  if (action === "sign-out") location.reload();
}

export async function clearDeletedAccount(ownerId: string) {
  const pending: Promise<unknown>[] = [];
  window.dispatchEvent(new CustomEvent(ACCOUNT_DELETED, { detail: { ownerId, waitUntil: (work: Promise<unknown>) => pending.push(work) } }));
  await Promise.all(pending);
}
