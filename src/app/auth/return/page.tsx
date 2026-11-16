"use client";
import { useEffect, useState } from "react";
import "@/components/account/account.css";
export default function AccountReturn() {
  const [returnTo, setReturnTo] = useState("/");
  const [failed, setFailed] = useState(false);
  const [failureMessage, setFailureMessage] = useState("请返回原页面，重新连接登录页。");
  useEffect(() => {
    let destination = new URL("/", location.origin);
    try {
      const saved = new URL(sessionStorage.getItem("hikari:auth-return") || "/", location.origin);
      if (saved.origin === location.origin && saved.pathname !== "/auth/return") destination = saved;
      sessionStorage.removeItem("hikari:auth-return");
    } catch { /* Return to the ordinary newspaper if navigation storage is unavailable. */ }
    const error = new URLSearchParams(location.search).get("error");
    if (error) {
      queueMicrotask(() => { setFailed(true); setReturnTo(destination.href); if (error === "email_not_found" || error === "email_not_verified") setFailureMessage("当前身份缺少已验证邮箱，请返回原页面，使用邮箱验证码登录。"); });
    } else location.replace(destination.href);
  }, []);
  return <main className="account-app account-return"><section className="account-settings">
    <h1>{failed ? "登录未完成" : "正在返回逐光"}</h1>
    <p role="status">{failed ? failureMessage : "正在恢复原页面与阅读位置…"}</p>
    {failed && <a className="text-button" href={returnTo}>返回原页面</a>}
  </section></main>;
}
