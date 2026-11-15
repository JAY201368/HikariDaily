# 当前架构

本页描述当前源码的模块关系，末节说明已接入的AI 摄影建议边界；产品目标见 [需求](../requirement.md)，详细约定见 [规格](../spec.md)。依赖版本由 [package.json](../package.json) 与锁文件决定。

## 数据流

```text
页面 /api/briefing
  → 简报 LangGraph：参数校验 → 地点解析 → 北京时间目标日
  → 并行：取数 LangGraph（GFS / MET / CAMS / ECMWF）＋太阳计算
  → 装配时钟与跨日校验 → 逐时归一化
  → 并行：光线 / 风险 / 晚霞 → 小时组装
  → 并行：风光 / 人像 / 街拍建议 → 解释 → 摘要
  → 并行：出处 / 数据状态 → 组装 → 公开契约校验 → 错误信封
  → 同一份 Briefing
  → 报纸 / 选时仪表 / 三题材手册 / 数据与出处
```

SSR 直接调用简报服务，不请求自己的 HTTP API；SSR/API 均由同一个22节点主图执行。取数入口内部调用7节点取数图，live 分支四源并行，fixture 分支单独运行。`/api/locations` 使用独立3节点地点搜索图，依次校验查询、调用缓存provider和校验候选结果。完整职责映射、图状态与扩展方式见 [后端节点图](backend-graph.md)。

节点只读取所需状态并返回更新，I/O 客户端、时钟函数、取消控制器和定时器通过依赖或请求闭包管理。结论按每次请求的显式时间生成；公共主图没有持久 checkpointer、整份 Briefing 缓存或大模型调用；私有增强在主图之外执行。

## 定位源码

| 职责 | 入口 |
| --- | --- |
| 动态 SSR、参数和页面状态 | [src/app/page.tsx](../src/app/page.tsx)、[API](../src/app/api/) |
| 简报主图、独立职责节点、错误信封和能力注入 | [graph.ts](../src/server/briefing-service/graph.ts)、[nodes](../src/server/briefing-service/nodes/)、[contracts.ts](../src/server/briefing-service/contracts.ts) |
| 地点搜索图、查询及候选结果校验 | [location-service](../src/server/location-service/) |
| GFS / MET / CAMS / ECMWF空间云场 / 地点固定端点与输入校验 | [providers](../src/server/providers/) |
| 取数图、单源用例、传输超时、缓存决策和存储边界 | [source-loader](../src/server/source-loader/)、[cache](../src/server/cache/) |
| Zod 契约和类型、北京时间、标准化与太阳 | [domain](../src/domain/) |
| 上下文校验、光线、风险、小时组装、单题材建议及晚霞 | [photography](../src/domain/photography/)；原 `analyzePhotography` 保留为纯函数组合入口 |
| 白话解释、时态、分档及胶片内容 | [content](../src/content/)、[interpret](../src/content/interpret/) |
| URL/记忆、刷新、跨日及迟到请求控制 | [controller.ts](../src/components/briefing-client/controller.ts) |
| React 宿主、Briefing 映射、原生物件动作与出处表 | [prototype-frontend](../src/components/prototype-frontend/) |
| 拍摄计划本、独立纸页编辑器、本机保存与账户同步 | [shooting-planner](../src/components/shooting-planner/)、[文档契约](../src/domain/planner/)、[私有服务](../src/server/workspace/planner/) |
| 正式全局样式 | [globals.css](../src/app/globals.css) |

前端来自原型移植后的独立实现：React 管理宿主与请求状态，原生 runtime 管理物件子树、动作与销毁；adapter 安全生成文本与详情，sources-view 组织来源表和单项依据。正式应用不加载 `prototype/data.js`、`solar.js` 或原型全局变量。

## 必须保持的语义

- `src/server/` 是 server-only 网络边界；固定主机和参数，不接收任意 URL。`domain` / `content` 通过显式输入计算，不自行请求网络或读取系统时钟。前端消费结果，不另算一套摄影结论。
- `Briefing` 当前 `schemaVersion="2"`，规则 `photo-rules-v0.3`；晚霞空间模型为 `ecmwf-spatial-2026-10`。精确公开结构由 [schemas](../src/domain/schemas/) 定义，包括服务端生成的 `interpretation`。调整版本和阈值时同步规格及有意义的回归证据。
- 产品日固定为北京时间24格，按绝对时刻对齐来源。Open-Meteo 前一小时累计与 MET 后一小时累计分别处理；缺失为 null，来源、时间、单位、冲突、旧值和备用值保留。
- 逐源风险在主值选择后仍保留；主推荐资格独立于评分。冻雨、强阵风、L=0 等资格与几何地平线切片契约见 [规格第6节](../spec.md#6-摄影计算与内容生成)，不能用高分覆盖。
- 预报、天文计算与经验推断分开；AQI 不换算能见度，光线解释不伪装测光值，晚霞五级不表示概率。未知独立于最低等级。
- 晚霞正式使用独立ECMWF IFS 9km空间云场：沿实际日落方位及左右25°，取本地与25–400km共16点，比较日落前后半小时的受光与遮挡。云层、本地能见度及降水均来自同一IFS源；GFS总云／降水仅用于分歧限级。空间源缺失时晚霞未知，不回退旧GFS单点评分。

## 缓存与故障

地点使用 Next Data Cache；逐时气象使用可替换的 `SharedSourceStore`，晚霞空间源使用独立的 `SunsetSourceStore` 与记录schema。PostgreSQL适配器将两类记录写入已迁移的 `source_cache_entries` 表，本机共用同一数据库的进程可复用。Vercel适配器隔离在单个模块，只有显式配置及运维验证声明满足时才创建 SDK 客户端；两种记录共用项目命名空间，通过各自key隔离。默认无源缓存；本地可显式选择 `HIKARI_SOURCE_CACHE=postgres`，Vercel仍需独立运行时验证。未配置或读取失败时，GFS/CAMS/ECMWF空间源可直接请求并标明降级，MET 关闭；`shared-configured` 只是适配器已配置的事实。

地点24小时、逐时源15分钟、晚霞空间源1小时重验证；晚霞失败冷却15分钟。失败旧值最多保留原始获取时间起3小时且覆盖目标日。缓存命中或304不刷新 `fetchedAt`。单源4秒、聚合6秒，四路并行，单次请求不立即重试；`createSourceLoader` 管理整个取数图的6秒预算，各源节点保留原有降级和故障隔离。遵守 Expires 和 Retry-After。16点空间请求按16个地点的API额度计算，不视为一个免费调用。真实共享、配额和 SDK 回退的限制见 [CURRENT](CURRENT.md)，精确实现说明见 [来源技术细节](data-sources.md)。

未选地点不生成天气；部分来源失败保留其他内容；整体天气不可用可保留太阳计算并返回明确故障。客户端中止旧请求并检查代次，按可见性、15分钟与北京时间跨日刷新。

## AI 摄影建议与账户

`src/components/account/` 提供全局账户与模型设置，`src/components/shared/` 提供模态锁与手册纸页手势。服务由 `src/server/workspace/` 承接。

同一 Briefing 经账户模型能力检查、公共知识条件检索和受约束叙述生成，返回同源短全文、规则约束与实际引用，供报纸、手册、详情及无脚本出口使用。

- 用户名密码、HttpOnly 不透明会话与所有者隔离保护账户。模型 Key 由独立密钥环 AES-GCM 加密，更新或删除使旧调用失效。
- 模型传输固定公共 HTTPS、DNS 解析和实际连接地址，验证 TLS 主机并禁止重定向。天气仍通过固定 provider 获取。
- 模型生成七类摄影叙述。天气数值、风险资格、分数、窗口与胶片类型由规则服务提供。SSR 复用同一事实生成一次，客户端核对账户、配置、时间、请求代次与配对 hash。
- PostgreSQL 保存账户、模型配置、限流、公共摄影知识和可选来源缓存。迁移005、013、015建立当前使用的表；旧数据库中的历史资料保留。
- AI 建议预算为一次调用、60秒、24 KiB 输入，能力检测保留独立文本、图像和工具探测。精确服务契约见[服务说明](../src/server/workspace/README.md)。

## 拍摄计划本

`ShootingPlanner` 位于账户提供者内，拥有独立于天气 HTML 子树的稳定宿主。纸页模板和编辑状态位于 ShadowRoot，正式纸张样式从 `public/planner/planner.css` 加载。背包入口和阅读层通过 `peer-objects` 与手册、订阅单协调取放。天气刷新只向计划本传递新的可收录快照。

`domain/planner` 定义版本为1的文档契约，分页结果由编辑器按固定纸幅计算。IndexedDB 保存本机原稿、账户缓存、原图、批注草稿和阅读位置。账户同步由该账户的显式选择开启，导入使用来源身份去重。本机原稿持续保留，账户缓存与资源按账户 ID 分区。

`/api/workspace/planner` 读写整个文档快照，写入使用基础版本与操作 UUID。客户端先保存本机，再上传引用图片，最后提交快照。未确认的请求保留操作身份，迟到响应只确认对应版本。多窗口写入通过本机时钟检测，账户写入通过数据库版本检测，合并保留双方不同内容。

迁移016建立 `planner_notebooks` 和 `planner_images`。图片服务当前使用 PostgreSQL bytea，独立适配器可按部署环境更换。原图以 SHA-256 寻址，引用实例独立保存批注、裁剪与旋转。图片上传校验类型、字节、尺寸与摘要，每张限15 MB、4000万像素。读写均核对会话账户及请求预期账户，响应禁止缓存，账户删除级联清理。回收夹与撤销使用到的原图继续保留。

报纸选时仪表与手册可将当前地点、日期时段、建议正文和来源收进已有或新建计划。引用保存快照，匹配地点与日期的新内容由用户主动更新。天气、天文计算和摄影推断分别标识。
