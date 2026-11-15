# 本地开发

环境和脚本以 [package.json](../package.json)、[.nvmrc](../.nvmrc)、锁文件与配置文件为准。本页记录操作方式，不保存历次测试计数；未完成事项见 [CURRENT](CURRENT.md)。

## 环境与命令

Node.js `>=24.3.0 <25`，`.nvmrc` 为 `24.3.0`；pnpm `11.26.0`。依赖精确版本由 package 与 lockfile 固定，不以整理文档为由升级。基础环境无需 `.env`；可选服务端设置见 [.env.example](../.env.example)。

| 命令 | 用途 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 按锁文件安装，不升级依赖 |
| `pnpm dev` | 开发服务，默认 `http://localhost:3000`，Ctrl-C 停止 |
| `pnpm typecheck` | 生成 Next 路由类型后执行 strict TypeScript |
| `pnpm lint` | ESLint；警告也视为失败 |
| `pnpm test` | Vitest：`tests/unit/` 与 `tests/contracts/` |
| `pnpm test:workspace` | 必须显式指定独立测试库，串行运行完整单元／契约套件，包含真实PostgreSQL验证；不读取.env |
| `pnpm exec vitest run <test-file>` | 只运行相关单元或契约测试 |
| `pnpm exec playwright install chromium` | 首次需要浏览器检查时安装 Chromium |
| `pnpm test:e2e` | Playwright，自管 `127.0.0.1:3100` 开发服务；须端口空闲 |
| `pnpm build` | 生产构建，不依赖外部天气或字体请求 |
| `pnpm start` | 运行已有生产构建，默认3000，Ctrl-C 停止 |

按 [AGENTS](../AGENTS.md) 的风险分级选择验证，不必逐条运行上表。文档、文案和纯样式小改动通常只需 diff 检查；视觉/交互任务才按实际风险使用浏览器。

当前仅核对桌面布局；界面定向检查使用 `--project=wide` / `--grep`。现有其他 project 配置保留，不作为当前验收要求，不执行窄屏检查。它通过 `HIKARI_E2E_DIST=1` 与 [独立 tsconfig](../tsconfig.e2e.json) 使用 `.next-e2e/`，不占用普通 `.next/` 服务；不能停止其他会话的进程来释放目录锁。类型生成和构建共享生成文件，避免同时运行。

## 后端图与能力扩展

后端使用精确依赖 `@langchain/langgraph@1.5.3`、`@langchain/core@1.3.0`。现有 SSR/API 经 `createBriefingService` 调用真实主图，`loadSources` 经 `createSourceLoader` 调用真实取数图，`/api/locations` 经 `createLocationSearchService` 调用地点搜索图；无需额外启动图服务、配置模型密钥或启用 LangSmith。

[后端节点图](backend-graph.md)列出全部职责、输入输出、并行汇合、`invoke` / `stream` 示例及异步 `capabilities` 注入方式。新增模型或 agent 能力时优先使用现有题材建议、解释或摘要接口；需要改变拓扑时使用 `createBriefingGraphBuilder`，保持状态通道所有权、公开 schema 和数据来源语义。

改动主图与来源编排时，可定向运行：

```sh
pnpm exec vitest run tests/contracts/briefing-graph.test.ts tests/contracts/briefing-service.test.ts tests/contracts/briefing-entrypoints.test.ts tests/contracts/source-graph.test.ts tests/contracts/source-loader.test.ts tests/contracts/sunset-source.test.ts tests/contracts/location-graph.test.ts tests/contracts/geocoding.test.ts tests/unit/photography-modules.test.ts
```

上述测试使用注入依赖及人工样例，不会自行启用共享缓存或大模型服务。按照实际改动再选择类型检查或构建，避免把整套检查作为局部修改的固定前置。

## 显式人工数据检查

普通命令不会自动启用人工天气。需要确定性浏览器样例时：

```sh
HIKARI_SOURCE_MODE=fixture NODE_OPTIONS='--import=./tests/fixtures/briefing-browser-preload.mjs' pnpm test:e2e
```

preload 提供测试地名，仅用于非生产检查。fixture 明确标记人工数据；生产拒绝此模式，live 失败不回退。可在命令末尾加测试文件、`--project` 和 `--grep` 缩小范围。样例测试不能证明真实源覆盖、准确率、许可或部署可用。

## 服务端来源配置

开关只接受字面 `true` / `false`，不使用 `NEXT_PUBLIC_*`，不提交真实联系方式或密钥。

| 变量 | 默认与作用 |
| --- | --- |
| `HIKARI_SOURCE_MODE` | `live`；`fixture` 仅非 production 可用 |
| `HIKARI_GFS_ENABLED` / `HIKARI_MET_ENABLED` / `HIKARI_CAMS_ENABLED` | `true`；源级启用，MET 还有下方前提 |
| `HIKARI_SUNSET_ENABLED` | `true`；正式ECMWF IFS 9km晚霞空间源，无需密钥；关闭或缺数据时晚霞未知 |
| `MET_NO_USER_AGENT` | 空；须真实项目及可联系入口，缺少或占位值时 MET 禁用 |
| `HIKARI_SOURCE_CACHE` | `disabled`；`postgres` 使用 `HIKARI_DATABASE_URL` 中已迁移的 PostgreSQL；`vercel` 使用平台缓存 |
| `HIKARI_SHARED_CACHE_VERIFIED` | `false`；仅 Vercel 模式需要部署者完成真实跨实例、SDK 回退与日志/额度验证后设为 true |
| Vercel 平台环境 | 还需平台提供 `VERCEL=1`、合法 `VERCEL_PROJECT_ID` 和 `VERCEL_ENV=preview\|production`，不在本地伪造 |

本地已有 PostgreSQL 时，可设置 `HIKARI_SOURCE_CACHE=postgres` 并先运行 `pnpm workspace:migrate`；迁移013建立来源缓存表，使用同一数据库的本机进程会复用记录。没有数据库、迁移缺失或缓存读不可用时明确降级：GFS/CAMS/ECMWF晚霞空间源可直接获取，MET 禁用。晚霞使用独立缓存记录，正常1小时重验证、失败冷却15分钟，旧数据年龄最多3小时，遵守更长的Retry-After。Vercel模式仍需实际平台与跨实例验证；`shared-configured` 只表示适配器已配置，不能写成已证实共享。Vercel平台缓存可能涉及费用，启用前核实用途、套餐与预算。精确时效、条件请求和失败处理见 [来源说明](data-sources.md)；真实平台待验事项见 [CURRENT](CURRENT.md)。

Open-Meteo免费托管API无需密钥，但仅限非商业用途，当前条款要求每日少于10,000次、每小时5,000次、每分钟600次；16点晚霞请求按16个地点计量，不能按一条HTTP请求估算额度。数据的CC BY 4.0许可不替代免费服务的用途与配额限制，见[官方条款](https://open-meteo.com/en/terms)。

原型单独离线运行的方法见 [prototype/README](../prototype/README.md)。微信订阅与发送仍未接通；账户与模型配置服务当前 AI 摄影建议。

## 产品展示

运行开发服务后访问 `/showcase`。页面的独立展示视图位于 `/showcase/demo`，共用正式物件 runtime 与计划本编辑器，使用 `src/content/showcase/` 的固定人工样例。展示过程读取本地素材，计划编辑与上传图片保留在页面内存中，刷新后恢复。README 与页面载入图位于 `public/showcase/`。更新界面后需要同步使用当前演示视图采集的画面。

`pnpm build:showcase` 将同一展示组件构建到 `out/showcase/`，可用于 GitHub Pages。默认公开路径为 `/HikariDaily/`，可用 `SHOWCASE_BASE_PATH` 指定以斜线起止的目录。构建时为资源路径添加目录前缀，保留正式应用的根路径。线上展示的源码与本地运行入口指向 GitHub 仓库。`main` 更新后由 `.github/workflows/showcase-pages.yml` 构建并部署。

## 账户、模型与公共摄影知识

账户及 AI 建议使用 PostgreSQL15+。在本机私有环境中配置 `HIKARI_DATABASE_URL`、`HIKARI_CREDENTIAL_KEYS` 和 `HIKARI_APP_ORIGIN`。密钥环为 key-id 到 base64 编码32字节密钥的 JSON 对象，首项用于新加密，旧项用于解密历史凭证。

```sh
pnpm workspace:migrate
pnpm workspace:knowledge import src/content/knowledge/original-fieldcraft.v1.json
pnpm dev
```

通过主页顶栏登录／注册并设置模型地址、模型名与 API Key。能力检测调用用户模型；文本、图像和工具分别检测。迁移005、013、015分别建立公共知识、来源缓存与账户基础表，运行时不自动迁移或植入样例。旧库已执行的迁移记录与资料继续保留。

模型凭证与私人生成内容按账户隔离。删除 Key 使旧配置调用与迟到结果失效。知识缺失或生成失败时显示具体状态并保留规则建议。

## 持久数据与备份

账户、会话、加密模型配置、公共知识和可选来源缓存保存在 PostgreSQL。数据库与备份使用访问受限的账户及目录，密钥环与数据库备份分开保管。项目尚无自动备份服务，启用前应明确保留期限、删除重放和恢复隔离。

恢复先进入隔离数据库，核对迁移、账户与会话撤销记录，验证后再用于目标环境。

## 隔离数据库验证

```sh
HIKARI_TEST_DATABASE_URL=postgresql://user@127.0.0.1:port/hikari_test pnpm test:workspace
```

命令要求显式独立测试库，拒绝名称不含 test 的数据库，不加载用户环境文件。知识修订与撤回检查串行运行，具体文件按变更选择。模型和天气注入样例只证明本地服务行为，真实模型质量与目标环境另验。

## 拍摄计划本的本机与账户保存

未登录即可在浏览器使用计划本。文字、图片、批注草稿和阅读位置保存在 IndexedDB，数据库名为 `hikari-shooting-planner`。登录后在账户管理的“拍摄计划”区域选择导入与同步操作。开启同步后，导入与保存写入当前账户。

运行 `pnpm workspace:migrate` 应用迁移016。当前私有图片与计划文档共用 `HIKARI_DATABASE_URL` 指定的 PostgreSQL。部署时可替换 `src/server/workspace/planner/images.ts` 的图片存储适配器，保持账户校验、内容摘要与私有读取约定。

针对计划本的本机存储和分页检查可运行 `pnpm exec vitest run tests/unit/shooting-planner-storage.test.ts tests/unit/shooting-planner-pagination.test.ts tests/unit/peer-objects.test.ts`。账户、版本和图片隔离检查使用显式隔离数据库运行 `pnpm test:workspace tests/contracts/shooting-planner.test.ts`。
