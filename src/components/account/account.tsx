"use client";
import { lockModalPage, unlockModalPage } from "../shared/modal-lock";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ModelConfigView } from "@/domain/workspace/model";
import { workspaceApi, WorkspaceError } from "./api";
import { AccountGate, Settings } from "./settings";
export const WORKSPACE_EVENT = "hikari:workspace-invalidated";
export const WORKSPACE_STORAGE = "hikari:workspace:invalidate";
export function announceWorkspaceChange() {
  window.dispatchEvent(new Event(WORKSPACE_EVENT));
  try { localStorage.setItem(WORKSPACE_STORAGE, crypto.randomUUID()); } catch { }
}
type Account = { id: string; username: string };
type AccountContext = { owner: Account | null; config: ModelConfigView | null; booting: boolean; epoch: number;
  accountBusy: boolean; runAccountAction: (task: () => Promise<unknown>) => Promise<void>; refreshConfig: () => Promise<void>; openAccount: () => void;
  requestPlannerSync: () => void; registerPlannerSync: (handler: () => void) => () => void; };
const Context = createContext<AccountContext | null>(null);
export function useWorkspaceAccount() { const value = useContext(Context); if (!value) throw Error("WorkspaceAccountProvider missing"); return value; }
/** One authoritative client identity; private readers still fence every resource response. */
export function WorkspaceAccountProvider({ children }: { children: ReactNode }) {
  const [formEpoch, setFormEpoch] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false), [accountBusy, setAccountBusy] = useState(false);
  const mutation = useRef(false);
  const runAccountAction = useCallback(async (task: () => Promise<unknown>) => {
    if (mutation.current) throw new Error("账户操作正在处理，请等待完成");
    mutation.current = true; setAccountBusy(true);
    try { await task(); } finally { mutation.current = false; setAccountBusy(false); }
  }, []);
  const [owner, setOwner] = useState<Account | null>(null), [config, setConfig] = useState<ModelConfigView | null>(null);
  const [booting, setBooting] = useState(true), [epoch, setEpoch] = useState(0), [message, setMessage] = useState("");
  const latestConfig = useRef<ModelConfigView | null>(null);
  const ownerRef = useRef<Account | null>(null), generation = useRef(0), request = useRef(0), modelRequest = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null), returnFocus = useRef<HTMLElement | null>(null), scrollLock = useRef(Symbol("account"));
  const plannerSyncAction = useRef<(() => void) | null>(null);
  const replaceOwner = useCallback((next: Account | null) => {
    if (ownerRef.current?.id === next?.id) return;
    generation.current++; modelRequest.current++;
    ownerRef.current = next; latestConfig.current = null; setOwner(next); setConfig(null); setEpoch(generation.current);
  }, []);
  const refreshConfig = useCallback(async () => {
    const account = ownerRef.current, token = generation.current, modelToken = ++modelRequest.current; if (!account) return;
    try { const next = await workspaceApi<ModelConfigView>("model"); if (token === generation.current && modelToken === modelRequest.current) { if (!latestConfig.current || latestConfig.current.version <= next.version) latestConfig.current = next; setConfig(latestConfig.current); } }
    catch (error) { if (token === generation.current && modelToken === modelRequest.current) { if ((error as WorkspaceError).code === "UNAUTHORIZED") replaceOwner(null); else setMessage((error as Error).message); } }
  }, [replaceOwner]);
  const revalidate = useCallback(async () => {
    const token = ++request.current;
    try { const next = await workspaceApi<Account>("auth/session"); if (token !== request.current) return; replaceOwner(next); await refreshConfig(); }
    catch (error) { if (token === request.current) { if ((error as WorkspaceError).code === "UNAUTHORIZED") replaceOwner(null); else setMessage((error as Error).message); } }
    finally { if (token === request.current) setBooting(false); }
  }, [replaceOwner, refreshConfig]);
  const invalidateRequests = useCallback(() => { request.current++; modelRequest.current++; }, []);
  const registerPlannerSync = useCallback((handler: () => void) => {
    plannerSyncAction.current = handler;
    return () => { if (plannerSyncAction.current === handler) plannerSyncAction.current = null; };
  }, []);
  const requestPlannerSync = useCallback(() => {
    if (plannerSyncAction.current) plannerSyncAction.current();
    else setMessage("拍摄计划本正在载入，请稍后重试");
  }, []);
  useEffect(() => {
    queueMicrotask(() => void revalidate()); const changed = () => { setConfig(null); void revalidate(); };
    const storage = (event: StorageEvent) => { if (event.key === WORKSPACE_STORAGE || event.key === null) changed(); };
    window.addEventListener("focus", revalidate); window.addEventListener("storage", storage); window.addEventListener(WORKSPACE_EVENT, changed);
    return () => { invalidateRequests(); window.removeEventListener("focus", revalidate); window.removeEventListener("storage", storage); window.removeEventListener(WORKSPACE_EVENT, changed); };
  }, [revalidate, invalidateRequests]);
  useEffect(() => { const holder = scrollLock.current; return () => unlockModalPage(holder); }, []);
  const openAccount = useCallback(() => { if (dialog.current?.open) return; returnFocus.current = document.activeElement as HTMLElement; setFormEpoch(n => n + 1); setAccountOpen(true); dialog.current?.showModal(); lockModalPage(scrollLock.current); }, []);
  const close = () => { unlockModalPage(scrollLock.current); setAccountOpen(false); dialog.current?.close(); };
  function signedIn(next: Account) { request.current++; replaceOwner(next); setBooting(false); void refreshConfig(); announceWorkspaceChange(); close(); }
  function signedOut() { request.current++; replaceOwner(null); announceWorkspaceChange(); }
  return <Context.Provider value={{ owner, config, booting, epoch, refreshConfig, openAccount, accountBusy, runAccountAction, requestPlannerSync, registerPlannerSync }}>{children}
    <dialog ref={dialog} className="workspace-account-dialog account-app" aria-label="全局账户与模型设置" onCancel={() => { unlockModalPage(scrollLock.current); setAccountOpen(false); }} onClose={() => { if (dialog.current?.open) return; setAccountOpen(false); unlockModalPage(scrollLock.current); const target = returnFocus.current?.isConnected ? returnFocus.current : document.querySelector<HTMLElement>(".header-account"); target?.focus({ preventScroll: true }); }}>
      <div className="workspace-account-heading"><span>逐光 · 通行与工具</span><button aria-label="关闭账户设置" onClick={close}>×</button></div>
      {accountOpen && (owner ? <Settings key={`${owner.id}:${epoch}:${formEpoch}`} onClose={close} onLogout={signedOut} /> : <AccountGate key={`${epoch}:${formEpoch}`} onAccount={signedIn} />)}
      {message && <p role="alert">{message}</p>}
    </dialog>
  </Context.Provider>;
}
export function WorkspaceAccountButton() {
  const { owner, booting, openAccount } = useWorkspaceAccount();
  return <button className="header-account" onClick={openAccount} disabled={booting}>{booting ? "账户…" : owner ? `${owner.username} · 设置` : "登录 / 注册"}</button>;
}
