"use client";
import { useState, useRef } from "react";
import { workspaceApi } from "./api";
import type { ModelConfigView } from "@/domain/workspace/model";
import { authAction, prepareAuthNavigation, clearDeletedAccount } from "./navigation";
import { purgePlannerAccount } from "../shooting-planner/storage";
import { announceWorkspaceChange, useWorkspaceAccount } from "./account";

export function Settings({ onLogout, onClose, onDeleted }: { onLogout: () => void; onClose: () => void; onDeleted: () => void; }) {
  const { owner, config, refreshConfig, accountBusy, runAccountAction, requestPlannerSync } = useWorkspaceAccount();
  const [resendAt, setResendAt] = useState(0), [clock, setClock] = useState(Date.now);
  const resendSeconds = Math.max(0, Math.ceil((resendAt - clock) / 1000));
  useEffect(() => { if (!resendAt) return; const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, [resendAt]);
  const [deleting, setDeleting] = useState(!!owner?.deletionStage), [codeSent, setCodeSent] = useState(false);
  const [key, setKey] = useState(""), [url, setUrl] = useState(config?.baseUrl || ""), [model, setModel] = useState(config?.model || ""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const urlEdited = useRef(false), modelEdited = useRef(false);
  useEffect(() => { if (!config) return; queueMicrotask(() => { if (!urlEdited.current) setUrl(config.baseUrl || ""); if (!modelEdited.current) setModel(config.model || ""); }); }, [config]);
  // Settings unmounts on close/account changes; identity mutation serialization lives above it.
  const life = useLifetime();
  async function action(fn: () => Promise<unknown>, success: string) { setBusy(true); setMessage(""); try { await runAccountAction(fn); await refreshConfig(); if (!life.current) return; setMessage(success); } catch (error) { if (life.current) { if ((error as { code?: string }).code === "DELETE_PENDING") { setDeleting(true); sessionStorage.setItem("hikari:deleting-owner", owner!.id); } setMessage((error as Error).message); await refreshConfig(); } } finally { if (life.current) setBusy(false); } }
  const announce = announceWorkspaceChange;
  return <section className="account-settings" aria-label="账户与模型设置">
    <div className="account-row">
      <h2>账户与模型设置</h2>
      <button onClick={onClose}>收起</button>
    </div>
    <p>{owner?.username}{owner?.username !== owner?.email && <> · {owner?.email}</>}</p>
    {!deleting && <>
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
    <a className="account-quiet" href="/api/workspace/auth/profile">管理账户资料 ↗</a>
    </>}
    <details open={deleting || undefined}>
      <summary>注销账户与全部私人资料</summary>
      <p>{deleting ? "账户正在注销，私人功能已停用。重试将继续完成身份与私人资料清理。" : "注销将删除登录身份、模型配置、账户计划和图片。本机游客计划保留。"}</p>
      {!deleting && <button type="button" disabled={busy || accountBusy || resendSeconds > 0} onClick={() => void action(async () => { try { await workspaceApi("auth/delete-code", "POST"); } catch (error) { const seconds = (error as { retryAfter?: number }).retryAfter; if (seconds) { setClock(Date.now()); setResendAt(Date.now() + seconds * 1000); } throw error; } setCodeSent(true); setClock(Date.now()); setResendAt(Date.now() + 60000); }, "注销验证码已发送至账户邮箱")}>{resendSeconds ? `${resendSeconds} 秒后可重发` : codeSent ? "重新发送验证码" : "发送注销验证码"}</button>}
      <form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void action(async () => {
        await prepareAuthNavigation();
        const ownerId = owner!.id;
        try { await workspaceApi("auth/account", "DELETE", deleting ? {} : { code: data.get("code") }); }
        catch (error) { if ((error as { code?: string }).code === "DELETE_PENDING") { setDeleting(true); announce(); } throw error; }
        sessionStorage.setItem("hikari:deleting-owner", ownerId);
        await clearDeletedAccount(ownerId);
        await purgePlannerAccount(ownerId);
        sessionStorage.removeItem("hikari:deleting-owner");
        setKey(""); onDeleted(); announce();
      }, "账户与私人资料已注销"); }}>
        {!deleting && <label>邮箱验证码<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6} /></label>}
        <button className="account-danger" disabled={busy || accountBusy || (!deleting && !codeSent)}>{deleting ? "重试完成注销" : "验证并永久注销账户"}</button>
      </form>
    </details>
    <button disabled={busy || accountBusy} onClick={() => void action(async () => { await authAction("sign-out"); setKey(""); announce(); onLogout(); }, "已退出")}>退出登录</button>
    <p role="status">{busy ? "正在处理…" : message}</p>
  </section>;
}
import { useEffect } from "react";
function useLifetime() { const life = useRef(true); useEffect(() => { life.current = true; return () => { life.current = false; }; }, []); return life; }
