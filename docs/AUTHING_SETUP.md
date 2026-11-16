# Authing 本地接入与恢复

身份应用使用逐光专用免费用户池，应用域名 `https://hikari-daily.authing.cn`。账户身份由 Authing 提供；Better Auth 1.7.25 保存 OIDC 关联与应用会话，模型 Key 继续使用原独立密钥环。

## 控制台配置

1. 使用自建 Web 应用，开启授权码流程、PKCE S256，Token 端点认证选择 `client_secret_basic`，身份令牌签名选择 RS256。
2. 登录回调填写 `http://localhost:3000/api/auth/callback/authing`。登出回调填写 `http://localhost:3000/auth/return`。正式域名确定后分别添加相应地址。
3. 启用邮箱验证码登录与注册、中文托管页、默认邮件服务和账户注销邮件通道。请求权限为 `openid profile email`。个人中心为应用域名下 `/u`。
4. 本地 `.env.local` 填入 `AUTHING_APP_HOST`、`AUTHING_APP_ID`、`AUTHING_APP_SECRET`、`AUTHING_USER_POOL_ID`、`AUTHING_USER_POOL_SECRET`。后两项位于控制台“设置 → 基础设置 → 密钥管理”，使用用户池 ID 和“当前密钥”；用于按已验证的 subject 删除并查询确认身份。应用密钥与用户池密钥不能互换。`HIKARI_AUTH_SECRET` 已在本机独立生成，用于会话签名与 OAuth Token 加密。
5. `HIKARI_APP_ORIGIN` 为 `http://localhost:3000`，不得附带斜线或路径。按 `.env.example` 配置数据库与模型加密密钥。真实凭证只写入私有配置，不提交。
6. 运行 `pnpm workspace:migrate`、`pnpm dev`。迁移017为独立身份表、本地 UUID 关联和注销进度，不修改旧账户内容；旧登录接口返回410，旧 `hikari_session` 无权访问私人接口。

登录和退出都经过固定 `/auth/return` 页面，再恢复当前标签页保存的原页面、查询参数与片段。该地址既是登出白名单地址，也避免在控制台为每个天气参数配置回跳地址。跳转前等待计划文字、本机文档和批注草稿保存；保存失败会停留当前页并显示错误。登录后必须主动导入／开启计划同步。

不要将已用过的本地身份库切换到另一个 Authing 用户池；另一个池应使用独立身份数据库，以避免 subject 命名空间冲突。

## 注销与失败恢复

注销验证码由 Authing 的 `CHANNEL_DELETE_ACCOUNT` 发送。服务器使用会话的提供方关联、subject 和邮箱，核对实时身份资料后，通过官方 SDK 验证注销验证码。浏览器无法指定邮箱或目标身份。发送成功后显示60秒重发倒计时；服务端分别限制一分钟内一次及十分钟内三次，限流响应携带重试时间。

验证通过后事务记录 `account_deletions`，标记账户停用并递增模型版本，立即中止本进程在途模型调用；其他进程的模型结果在版本核对时被拒绝。私人写入的所有者锁拒绝停用账户。通过官方管理 SDK 仅删除已验证 subject，并用同一 subject 的成功查询确认其不存在；网络或权限错误不能视作删除成功。之后事务清理本地账户、模型、计划、图片和 Better Auth 用户／所有会话。注销墓碑保留 subject、内部 ID 与完成状态，防止旧身份重新创建本地账户。

阶段依次为 `verified`、`external_deleted`、`complete`。前两阶段账户弹窗提供重试，只有 `complete` 才返回成功。浏览器清除该账户的计划、图片、批注和同步设置，保留游客原稿及其他账户；已注销分区的迟到写入被本机墓碑拒绝。

若浏览器会话过期、响应丢失或关闭，使用内部账户 UUID 恢复：

```sh
pnpm workspace:resume-deletion <本地账户UUID>
```

命令只接受已持久化且完成邮箱验证的注销任务，不接受外部身份或邮箱，也不创建新的注销意图。重复执行安全。查询待恢复任务时仅取必要字段：

```sql
SELECT owner_id, stage, updated_at FROM account_deletions WHERE stage <> 'complete';
```

## 验证边界

自动验证使用隔离 PostgreSQL 库和明确的 OIDC／SDK 模拟服务，覆盖 PKCE、签名、nonce、issuer、audience、到期、缺失令牌、UserInfo subject、状态重放／丢失、跨源请求、返回地址、会话撤销、旧凭证、注销失败与恢复、模型和计划隔离。本机真实免费应用已完成邮箱收信、托管登录、退出、再次登录和注销；注销后成功查询确认外部身份不存在，本地相关表与会话均无该账户记录，旧账户保留。QQ 邮箱将注销验证码放入垃圾箱。当前验证经过代理；大陆直连按用户要求暂缓。

参考：[Better Auth Generic OAuth](https://better-auth.com/docs/plugins/generic-oauth)、[Authing 认证 API](https://api.authing.cn/openapi/v3/authentication/)、[Authing 管理 API](https://api.authing.cn/openapi/v3/management/)、[Authing 个人中心](https://docs.authing.cn/v2/guides/basics/authenticate-first-user/use-hosted-login-page.html)。
