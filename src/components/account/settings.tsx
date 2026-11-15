"use client";
import { useState, useRef, type FormEvent } from "react";
import { workspaceApi } from "./api";
import type { ModelConfigView } from "@/domain/workspace/model";
import { announceWorkspaceChange, useWorkspaceAccount } from "./account";

export function AccountGate({ onAccount }: { onAccount: (account: { id: string; username: string; }) => void; }) {
  const life = useLifetime();
  const { accountBusy, runAccountAction } = useWorkspaceAccount();
  const [register, setRegister] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setBusy(true); setMessage("");
    try { await runAccountAction(async () => { const account = await workspaceApi<{ id: string; username: string; }>(`auth/${register ? "register" : "login"}`, "POST", { username: data.get("username"), password: data.get("password") }); if (life.current) form.reset(); onAccount(account); }); }
    catch (error) { if (life.current) setMessage((error as Error).message); } finally { if (life.current) setBusy(false); }
  }
  return <section className="account-gate">
    <p className="account-eyebrow">HIKARI ACCOUNT</p>
    <h1>登录逐光<br />配置摄影建议</h1>
    <p>报纸与摄影手册共用账户中的模型配置。登录后可设置自己的模型服务，生成 AI 摄影建议。</p>
    <form onSubmit={submit}>
      <h2>{register ? "注册账户" : "登录逐光账户"}</h2>
      <label>用户名<input name="username" autoComplete="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_]+" />
      </label>
      <small>3–32 位英文字母、数字或下划线</small>
      <label>密码<input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={12} maxLength={256} />
      </label>
      <small>至少 12 个字符</small>
      <button disabled={busy || accountBusy}>{busy ? "正在处理…" : register ? "注册" : "登录"}</button>
      <button type="button" disabled={busy || accountBusy} className="account-quiet" onClick={() => { setRegister(!register); setMessage(""); }}>{register ? "已有账户，登录" : "第一次来，注册"}</button>
      <p role="alert">{message}</p>
    </form>
  </section>;
}
export function Settings({ onLogout, onClose }: { onLogout: () => void; onClose: () => void; }) {
  const { owner, config, refreshConfig, accountBusy, runAccountAction, requestPlannerSync } = useWorkspaceAccount();
  const [key, setKey] = useState(""), [url, setUrl] = useState(config?.baseUrl || ""), [model, setModel] = useState(config?.model || ""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const urlEdited = useRef(false), modelEdited = useRef(false);
  useEffect(() => { if (!config) return; queueMicrotask(() => { if (!urlEdited.current) setUrl(config.baseUrl || ""); if (!modelEdited.current) setModel(config.model || ""); }); }, [config]);
  // Settings unmounts on close/account changes; identity mutation serialization lives above it.
  const life = useLifetime();
  async function action(fn: () => Promise<unknown>, success: string) { setBusy(true); setMessage(""); try { await runAccountAction(fn); await refreshConfig(); if (!life.current) return; setMessage(success); } catch (error) { if (life.current) { setMessage((error as Error).message); await refreshConfig(); } } finally { if (life.current) setBusy(false); } }
  const announce = announceWorkspaceChange;
  return <section className="account-settings" aria-label="账户与模型设置">
    <div className="account-row">
      <h2>账户与模型设置</h2>
      <button onClick={onClose}>收起</button>
    </div>
    <p>{owner?.username} · 全局账户</p>
    <section className="account-planner-settings" aria-label="拍摄计划同步">
      <div><h3>拍摄计划</h3><p>导入本机计划并开启账户同步，或继续在此浏览器使用。</p></div>
      <button type="button" disabled={busy || accountBusy} onClick={requestPlannerSync}>导入与同步</button>
    </section>
    <form onSubmit={e => { e.preventDefault(); void action(async () => { await workspaceApi<ModelConfigView>("model", "PUT", { baseVersion: config?.version ?? 0, baseUrl: url, model, apiKey: key }); setKey(""); announce(); }, "配置已保存；请检测所需能力"); }}>
      <h3>共用模型</h3>
      <p role="status">{config ? config.configured ? `已配置 · 版本 ${config.version}` : "当前为规则建议 · 尚未配置模型" : "正在读取模型配置…"}</p>
      <p>同一配置用于报纸和摄影手册的 AI 摄影建议。</p>
      <p>生成建议时，相关天气、太阳、摄影规则结果与检索到的摄影知识将发送至你配置的模型服务。</p>
      <label>服务地址<input type="url" value={url} onChange={e => { urlEdited.current = true; setUrl(e.target.value); }} placeholder="https://…/v1" required />
      </label>
      <label>模型名称<input value={model} onChange={e => { modelEdited.current = true; setModel(e.target.value); }} required maxLength={200} />
      </label>
      <label>API Key（每次更新需重新输入）<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} required maxLength={4096} />
      </label>
      <div className="account-row">
        <button disabled={busy || accountBusy}>保存配置</button>
        <button type="button" disabled={busy || accountBusy || !config?.configured} onClick={() => void action(async () => { await workspaceApi("model", "DELETE", { baseVersion: config!.version }); setKey(""); announce(); }, "模型配置已移除")}>移除配置</button>
        <button type="button" disabled={busy || accountBusy || !config?.configured} onClick={() => void action(async () => { await workspaceApi("model/probe", "POST"); announce(); }, "能力检测已完成")}>检测三项能力</button>
      </div>
      <small>能力检测会向所配置服务发送文本、图像、工具三次请求。</small>
      <ul className="account-capabilities">{([["text", "文本"], ["image", "图像"], ["tools", "工具"]] as const).map(([id, name]) => <li key={id}>{name}：{({ available: "可用", unavailable: "检测未通过", untested: "未检测" })[config?.capabilities[id] || "untested"]}</li>)}</ul>
    </form>
    <details>
      <summary>修改密码</summary>
      <form onSubmit={e => { e.preventDefault(); const form = e.currentTarget, data = new FormData(form); void action(async () => { await workspaceApi("auth/password", "PUT", { currentPassword: data.get("currentPassword"), nextPassword: data.get("nextPassword") }); form.reset(); announce(); }, "密码已更新，其他会话已退出"); }}>
        <label>当前密码<input name="currentPassword" type="password" autoComplete="current-password" required />
        </label>
        <label>新密码<input name="nextPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={256} />
        </label>
        <button disabled={busy || accountBusy}>更新密码</button>
      </form>
    </details>
    <details>
      <summary>删除账户与全部私人资料</summary>
      <p>删除账户将清除模型配置、登录会话和该账户关联的私人资料。</p>
      <form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void action(async () => { await workspaceApi("auth/account", "DELETE", { password: data.get("password") }); setKey(""); announce(); onLogout(); }, "账户已删除"); }}>
        <label>输入密码确认删除<input name="password" type="password" required autoComplete="current-password" />
        </label>
        <button className="account-danger" disabled={busy || accountBusy}>永久删除账户</button>
      </form>
    </details>
    <button disabled={busy || accountBusy} onClick={() => void action(async () => { await workspaceApi("auth/logout", "POST"); setKey(""); announce(); onLogout(); }, "已退出")}>退出登录</button>
    <p role="status">{busy ? "正在处理…" : message}</p>
  </section>;
}
import { useEffect } from "react";
function useLifetime() { const life = useRef(true); useEffect(() => { life.current = true; return () => { life.current = false; }; }, []); return life; }
