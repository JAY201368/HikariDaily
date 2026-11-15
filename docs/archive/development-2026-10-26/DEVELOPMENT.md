# 正式网页开发交接

## V02 原型前端替换（2026-10-23）

按用户最新指令，在 `codex/prototype-frontend` 直接移植原型界面并接入正式简报；替换前的展示源码及相关测试已保存为[旧前端快照](../frontend-before-prototype/README.md)，对应Git基线 `d461c6a`。`prototype/` 保持独立、只读和离线可运行；正式源码不加载其固定数据或计算globals。已有服务端/领域/API与请求控制器继续复用，命令、依赖和运行配置不因展示替换改变。

V02已由主agent独立验收：typecheck/lint、390项单元/契约测试、显式fixture浏览器39/39（0跳过）、build及本地start smoke通过。普通 `pnpm test:e2e` 保留不依赖上游的基础3项，其余36项仅在显式fixture/preload时运行；普通命令不自动切换数据模式。长正式报纸可自然滚动读完后衔接原型双折，手册展开依据按实际页高读取，手机保留横滑和底部题材导航。证据、失败与限制见 [V02记录](verification/V02-prototype-frontend.md)。下方T01–T11/V01均为对应历史版本的验证记录。

2026-10-22。用户确认视觉原型开发完毕；当时完成过程文档归档与仓库整理，正式应用尚未初始化；T01 骨架进展见下方命令节。

## 当前已有

- [需求基线](../../../requirement.md)和[实现规格草案](../../../spec.md)，原文保持不变。
- [可运行视觉原型](../../../prototype/index.html)及[最终视觉基线](DESIGN_REFERENCE.md)。中文刊名为「逐光日刊」，英文项目名为HikariDaily。
- 原型的本地素材、检查脚本、固定夹具和历史证据。最后的链接间距／仪器读数修正未补跑浏览器套件，由用户人工复核；本次不新增自动视觉验收声明。
- [原型档案](../visual-prototype/README.md)：T01–T07（含T06A）的任务、架构、决策、交接及旧规则，已退出根目录活动工作流。

交接时尚无正式应用；现在T01–T11均已有主agent验收记录。已有正式工具链、领域/时间/太阳、地点API、多源适配、受控缓存、纯摄影规则、动态SSR/API、完整可读界面及地点/小时/题材/刷新交互；T09/T10的视觉/动作忠实度在用户指出漂移后由V01纠偏补正，T11回归已完成；T12尚未启动，未部署。历史原型检查结果只能说明对应版本的本地演示行为。

## 继承边界

正式网页继承物件造型、信息层次与连续交互，不把原型当作数据服务或生产领域模型。原型继续独立留在`prototype/`；正式应用按`spec.md`组织自己的领域类型、服务端适配器、计算规则和界面。

以下内容需要在正式实现中重新建立：地点搜索、当天北京时间与跨日处理、24小时归一化、多源回退／冲突、缓存时效、太阳计算适配层、确定性摄影规则、真实异常状态与来源说明。原型的固定上海坐标、手工天气／PM10、固定文案和单日太阳求根不能替代这些能力。

原型尾声的订阅单只提供视觉参考。第一阶段不因此引入微信身份、订阅数据库、消息发送或定时任务。公开素材权利和数据服务许可仍按实现规格核实。

## 正式开发起步顺序

沿用`spec.md`第10节，不在整理阶段新增技术选型或安装依赖：

1. 建立正式架构与依赖明确的任务计划，覆盖规格中的接口、时间语义、失败状态、来源边界和验收；创建新的活动ARCHITECTURE／TASKS／PROGRESS／DECISIONS／PROMPT_TEMPLATE，不复用已完成的原型任务。
2. 初始化Next.js App Router、React、TypeScript及pnpm工具链，核实并锁定相互兼容版本；建立可复现的运行、类型检查、测试和构建命令。
3. 建立领域类型、固定测试样例、地点查询与太阳计算；核实候选来源许可、覆盖和小时字段。MET Norway的实际联系信息不能伪造。
4. 完成服务端多源获取、归一化、缓存、光照／晚霞规则和三题材建议，先形成真实内容的可读闭环。
5. 将内容接入已确定的物件体验，保留手机、静态阅读、键盘与异常状态，再完成部署环境和实际访问验证。

微信订阅号继续作为第二阶段。新任务的具体编号、分工和验收在正式计划中定义；这份交接说明不宣称上述步骤已开工或通过。


## 正式应用命令（T01）

环境要求 Node.js `>=24.3.0 <25`、pnpm `11.26.0`（`packageManager` 固定）；本次实际环境为 Node v24.3.0 / pnpm 11.26.0，macOS。`.nvmrc` 固定 24.3.0，部署阶段再核对平台支持的 Node 24 LTS。`.npmrc` 固定官方 registry，启用 engine-strict，并将下载超时设为 180 秒、并发设为 8（本环境首次安装大型包超时后的调整）；直接依赖均使用精确版本，传递依赖由 lockfile 固定。`pnpm-workspace.yaml` 仅允许 sharp 与 unrs-resolver 的安装构建；运行脚本时检查依赖一致性并在不一致时报错，不自动联网安装。pnpm 首次安装为 Motion 14.6.0 及其三个同版依赖生成了精确版本的 minimumReleaseAgeExclude，保留于配置中供审查。

| 命令 | 行为 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 按锁文件安装；不升级依赖 |
| `pnpm exec playwright install chromium` | 首次安装 E2E 所需浏览器（需要联网） |
| `pnpm dev` | Next 开发服务器，默认 localhost:3000，Ctrl-C 停止 |
| `pnpm typecheck` | 先生成 Next 路由类型，再执行 strict TypeScript；不要求先 build |
| `pnpm lint` | ESLint Next core-web-vitals / TypeScript，警告也视为失败 |
| `pnpm test` | Vitest Node 环境，tests/unit 与 tests/contracts，不含 E2E |
| `pnpm test:e2e` | Playwright Chromium：1440×1000、390×844 触摸、390×844 减少动效；自动启停 3100 端口开发服务器，测试生成目录独立为 `.next-e2e/` |
| `pnpm build` | Next 生产构建；不依赖上游天气或第三方字体网络 |
| `pnpm start` | 运行已有生产构建，默认 localhost:3000，Ctrl-C 停止 |

### 固定直接依赖与核对依据

2026-10-22 从 `https://registry.npmjs.org` 实际查询版本、engines 和 peerDependencies，而非仅依据网站页面版本。Next 16.4.2 支持 React ^19.0.0、Node >=20.9.0；Motion 14.6.0 支持 React ^19.0.0；Vitest 5.0.5 支持 Node ^24.0.0 和 Vite ^8.0.0；Playwright 1.64.1 要求 Node >=20。当前选定环境满足这些交集。

- 运行：Next **16.4.2**，React / React DOM **19.3.1**，Zod **4.6.7**，Motion **14.6.0**，SunCalc **1.9.0**，server-only **0.0.1**。
- 开发：TypeScript **5.9.3**，ESLint **9.39.4**，eslint-config-next **16.4.2**，Vitest **5.0.5**，Vite **8.3.5**，@playwright/test **1.64.1**。
- 类型：@types/node **24.19.2**，@types/react / @types/react-dom **19.3.0**，@types/suncalc **1.9.2**。
- 兼容性限制：registry 对 ESLint 9.39.4 给出停止支持提示；Next 16.4.2 自带的 react/import/jsx-a11y 插件 peer 目前最高支持 9，因此暂固定该兼容版本，没有强行采用 ESLint 10。后续须随 Next 插件兼容进展升级。
- 参考：[Next 安装与手动配置](https://nextjs.org/docs/app/getting-started/installation)、[Vitest 安装](https://vitest.dev/guide/)、[Playwright 安装](https://playwright.dev/docs/intro)。

基础环境不需要 `.env`；[.env.example](../../../.env.example) 已由 T05 定义可选服务端来源配置，见下节。不引入 NEXT_PUBLIC 凭证、数据库或 Cron。应用独立于 `prototype/`，不读取其固定夹具或 globals。Next 的 agentRules 自动写入已关闭，避免 dev 改写仓库权威 AGENTS.md。测试输出目录与 tsbuildinfo 被忽略，浏览器下载在本机缓存中。

Playwright 的自管服务器显式设置 `HIKARI_E2E_DIST=1`，由公开 Next `distDir` / `typescript.tsconfigPath` 配置使用 `.next-e2e/` 和 [tsconfig.e2e.json](../../../tsconfig.e2e.json)。它可与普通 `.next/` 开发服务并存，不自动启用 fixture；人工数据仍须使用下方显式 fixture 命令。正常 `pnpm dev`、`pnpm build`、`pnpm start` 不设置此标记，保持 `.next/` 与根 `tsconfig.json`。测试服务器只由 Playwright 启停，不停止其他会话服务；忽略的 `next-env.d.ts` 会随当前 Next 类型生成路径刷新，可用 `pnpm typecheck` 恢复普通类型入口。

T01 测试只证明工具链、无地点首页和本机 Chromium 基础阅读；不证明真实气象服务、来源许可、全国覆盖、最终物件体验、真实手机或大陆部署访问。具体执行结果记录于 [PROGRESS.md](PROGRESS.md)。

## 服务端源加载与缓存配置（T05，已验收）

T05 提供源级 `loadSources`，已由T07接入首页/BriefingService；普通构建不拉天气、不调用平台缓存。配置仅在服务器读取，非法枚举抛稳定错误码，不回显配置值或联系方式。开关只接受字面 `true` / `false`。

| 变量 | 默认值与行为 |
| --- | --- |
| `HIKARI_SOURCE_MODE` | `live`；非生产可显式设 `fixture`，返回醒目标记的人工数据。production 拒绝 fixture，无静默回退 |
| `HIKARI_GFS_ENABLED` / `HIKARI_MET_ENABLED` / `HIKARI_CAMS_ENABLED` | 均 `true`；关闭返回 disabled；MET 另受真实身份及可用缓存前提限制 |
| `MET_NO_USER_AGENT` | 空；须由部署者提供真实项目及可联系入口，语法验证不能证明归属；缺少/常见 placeholder 时 MET disabled，不发匿名请求 |
| `HIKARI_SOURCE_CACHE` | `disabled`；只有显式 `vercel` 才可能构造官方 Runtime Cache 客户端 |
| `HIKARI_SHARED_CACHE_VERIFIED` | `false`；部署者完成真实跨实例缓存、SDK 回退/日志和额度验证后才可声明 `true`，不是运行时后端探测 |
| Vercel 平台环境 | 还要求 `VERCEL=1`、合法 `VERCEL_PROJECT_ID`、`VERCEL_ENV=preview` 或 `production`。由平台提供，不在本地伪造来通过共享缓存门禁 |

本地默认 `cacheStatus=degraded`：GFS/CAMS 可直接取，MET 即使有身份也会关闭；结果 notes/warnings 说明没有跨实例缓存/冷却保证。正常平台配置返回 `shared-configured`（“Vercel 缓存已配置”）；这是配置事实，不能写成实际共享已验证。公开 SDK 会在部分环境回退内存，公开 API 不能探测所有回退/吞错；未获得真实平台证据不得启用验证声明。SDK 版本精确固定为 `@vercel/functions@3.10.3`（registry 要求 Node >=20，本项目 Node24 满足），本次 pnpm 自动增加三个精确 minimumReleaseAgeExclude（functions / cli-config / oidc），不扩大为包名前缀豁免。

无需数据库迁移、Cron 或新公开接口。共享缓存为区域性非耐久存储，可能驱逐，get/set 不是分布式锁。TTL 不延长 fetchedAt 的 3 小时业务上限；429/MET 缓存头、故障处理和跨实例限制详见 [数据来源说明](../../data-sources.md)。实际 Runtime Cache 使用可能计费，需后续明确确认套餐/预算；本次只实现与 mock 验证适配器，没有平台调用、账号开通或部署。关闭缓存恢复默认降级模式，关闭单源可停该源请求；这不等于生产配额问题已解决。

## 阶段B验收（2026-10-23）

主agent独立复验最终382/382单元/契约、显式人工fixture浏览器21/21、typecheck/lint/build通过。浏览器运行：`HIKARI_SOURCE_MODE=fixture NODE_OPTIONS='--import=./tests/fixtures/briefing-browser-preload.mjs' pnpm test:e2e`；preload仅测试地名，不能用于生产启动；普通命令不会自动注入。实际来源/许可/共享缓存/实体设备检查仍另验。完整状态见根PROGRESS/TASKS与docs/verification/T05–T08.md。

## 阶段C验收（2026-10-23）

报纸/三层皮包/仪表/黄手册与连续双折、入包、提取、翻页、完整纸单均已接同Briefing。主agent最终独立385/385测试、fixture浏览器42/42、typecheck/lint/build全通过，审查正反关键帧及焦点纠正。正文先自然纵读，再按实高进入动作；手机手册原生横滑。显式简化及运行中减少动效保留全部操作。素材公开授权/约11MB装饰资源优化、实体设备与实际平台仍是后续门禁，不将本地截图称发布通过。


## V01 界面与物件动作纠偏（2026-10-23）

按用户要求，主会话先对照并直接修复，再回填文档。紧凑顶栏、报纸四栏与居中双页恢复原型构图，同时修复器材比例、横置入袋、书脊开封、双面翻页、纸单承托及题材/历史导航边界。最终389/389、显式fixture E2E48/48、typecheck/lint/build、本地start通过，详见 [V01记录](verification/V01-visual-drift.md)。命令/环境变量/服务边界不变；公开Next配置关闭开发浮钮，避免遮住表盘按钮。浏览器测试与typegen/build顺序执行。普通运行不因此启用fixture，T12未启动。

V01用户截图复核后补正：删除皮包下的遗留普通文档区，小时表与完整字段通过表盘“24 小时明细”打开，各说明通过器材本体打开。简化阅读保留静态器材。最终389/389、fixture E2E48/48、typecheck/lint/build通过；旧测试不再依赖外露面板，详见V01后续节。

## V04 报纸首屏与双折复核

2026-10-23，按用户要求由主会话先修复后回填。桌面正常报纸完整入屏，手机/异常长文自然阅读后在同一坐标连续交给双折；完整原摘要和变化改在报纸详情及无脚本内容中读取。两折缓动、居中、背面阴影与 load/报纸阶段 resize 已补正。最终 392/392、fixture浏览器45/45、typecheck/lint/build及本地start smoke通过；命令、环境和服务契约不变，见 [V04记录](verification/V04-newspaper-fold.md)。

## V05 手册翻页复核

2026-10-23，取消整本手册随阅读上移和题材切换归零；桌面固定纸面，长文页内原生滚动，正反副本同步阅读位置。主会话直接修复后回填，最终392/392、fixture浏览器48/48、typecheck/lint/build通过。命令/环境/服务契约不变，见 [V05记录](verification/V05-manual-turn.md)。

## V06 印刷页内容纠正

用户明确否定V05页内滚动；当前纸内滚动/展开及副本阅读位置同步已删除，固定纸面仅保留完整短段落，按题材详情和无脚本文档保留全量长建议。393/393、fixture浏览器51/51、typecheck/lint/build通过；命令和服务契约不变。V05相关条款仅为历史，当前以 [V06记录](verification/V06-printed-manual.md) 为准。
