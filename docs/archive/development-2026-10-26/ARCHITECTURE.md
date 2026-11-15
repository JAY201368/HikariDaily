# HikariDaily 正式应用架构

2026-10-22 建立。权威输入：[requirement.md](../../../requirement.md)、[spec.md](../../../spec.md)；本文件落实规格，不覆盖产品目标。原型档案不属于当前工作流。实现进度只见 TASKS / PROGRESS，不以本文的计划措辞声明已实现。

## 目标、阶段与边界

第一阶段交付中国大陆地点当天的 24 小时摄影天气简报，以及原型确定的报纸双折入包、仪表选时、抽册翻页。顺序为 A 基础与数据验证、B 真实内容闭环、C 物件体验、D 异常与发布准备；每阶段主 agent 独立验收后本地 Git 提交，必要时单任务也可提交。

第二阶段才做微信身份、订阅设置存储、发送、定时任务；不建账户、数据库、Cron、任意日期或任意坐标查询。尾声纸单只说明未来能力，不采集真实订阅。开发、构建和发布准备在本次授权内；公开部署、push、付费服务和未经确认的素材发布不在本地提交授权内。

质量顺序：真实与风险 > 可读与可访问 > 装饰。预报、天文计算、启发式推断明确分开；不生成实测曝光值，不将 AQI 换算为能见度。

## 技术与模块

采用规格指定 Next.js App Router / React / TypeScript strict / Zod / CSS Modules / Motion / SunCalc **1.9.0** / Vitest / Playwright / pnpm。T01 已从官方文档与包注册表核实并锁定版本：Next16.4.2 / React19.3.1 / Zod4.6.7 / Motion14.6.0 / TS5.9.3 / Vitest5.0.5 / Playwright1.64.1 / pnpm11.26.0（完整见package.json与lockfile），记录 Node 支持区间与实际运行版本；不能将文档当前版本当作 registry 存在性证明。生产使用 Node LTS。应用独立放在根 `src/`、`public/`、`tests/`，保留 `prototype/` 原样可运行。

```text
浏览器 URL/place/genre ── 同源页面与 Route Handlers
  ↓ SSR 直接复用，不 HTTP 请求自己
server/briefing-service → location provider → cached source adapters
  → domain/normalization → domain/solar → domain/photography → Briefing
  → newspaper / bag + instruments / handbook（同一份数据）
```

- `src/domain/` 和 `src/content/` 为纯函数／静态中文内容，不引入 React、Next、server 或网络。显式注入 `now`，不读取墙上时钟。
- `src/server/` 为 server-only 边界，固定 HTTPS 主机、请求参数与超时，不接受客户端 URL。HTTP 响应必须 Zod 校验。
- `src/components/` 只消费已生成结论，不在浏览器重算摄影规则或访问气象源。
- `src/app/api/` 只校验输入、调用服务、返回统一信封；SSR 与 API 使用相同组装器。
- `prototype/` 的数据／globals／计算代码不能成为正式运行依赖。可移植布局与原创 CSS/SVG，正式素材放 `public/` 并记录来源；参考衍生图可用于本地对照，但发布门禁必须拦住未核实素材。

## 领域契约

严格继承 spec §5 的 `Genre`、`Metric`、`Location`、`Source`、`Hour`、`Opportunity`、`Briefing`；TS 类型由对应 Zod schema 推导。`Metric` 缺失必为 null，未知不是 0；状态优先 missing > stale > conflict > ok；其他问题仍保留 notes / alternatives。`hours` 固定 24 个连续北京时间小时格。

补齐规格摘要中的类型，供任务共享，字段名由 T02 固化到 schema：

- WeatherMetricName：`temperature, humidity, weatherCode, precipitation, precipitationProbability, windSpeed, windGust, windFrom, cloudTotal, cloudLow, cloudMid, cloudHigh, visibility`。单位固定 °C / % / mm / m/s / 北0顺时针° / m；空气为 μg/m³ 和 US_EPA 指数。
- LightAssessment：`phase`（night/blue/golden/day/unknown），`character`（direct/diffuse/variable/unknown），`altitude, azimuth` 为 number|null，`description, reasons[], limitations[], sourceIds[]`。
- RiskNote：`code`（thunderstorm/heavy-rain/strong-wind/air-quality），`start,end,message,sourceIds[]`；非官方预警。前三类排除常规户外推荐，AQI 单独提示限制。
- SolarEvents：`sunrise,sunset` 为 ISO|null，`morningBlue,morningGolden,eveningGolden,eveningBlue` 为 `{start,end}|null`，`notes[]`。无法求得时保留原因。
- Summary：`headline, changes[], opportunities[], limitations[]`，`temperatureRange:{min,max,coveredHours,totalHours:24}`（min/max 可 null）。
- RecommendedWindow：`start,end,status`（past/current/future），`reasons[],reasonCodes[],limitations[],sourceIds[]`。评分只在内部生成，不作为概率展示。
- GenreAdvice：`genre, allWindows[], recommendedWindows[], timing, light, opportunities[], limitations[], alternatives[], film:{type,sensitivity,reason,caveat}`。type 为通用胶片类别，sensitivity 为低/中/较高感；文案缺失时有条件性解释。
- 所有公开 ISO 都带时区；日期为 YYYY-MM-DD。`schemaVersion=2`，`rulesVersion=photo-rules-v0.2`（V10第5步已验收）。

内部源边界：`SourceSnapshot` 含 `source:Source`、目标地点／日期、标准化每小时 weather/air 值、每字段 notes 与语义信息。T04 建立并记录具体内部类型；此为服务端内部接口，不改变公开 Briefing。所有有效源保留各自风险输入，即使主值优先采用 Open-Meteo。不同分层云定义不得拼接。源异常使用稳定代码，不把响应栈带到浏览器。

## 时间、归一化与推断不变量

- 产品永远 Asia/Shanghai。创建目标日的 UTC 起点／终点，按 epoch 配对，不按数组下标拼源；两天请求只用次日00补前日23时累计。
- Open-Meteo precipitation / precipitationProbability / windGust 为时间戳前一小时；MET next_1_hours 为后一小时。没有真实小时累计不可拆六小时数据。瞬时字段使用小时起点。
- 天气码白名单跟随已核实的供应商定义：在T02既有WMO列表基础上纳入97（强雷暴），雷暴风险集合为95/96/97/99；未知其他码仍missing。依据2026-10-23的[官方天气码表](https://open-meteo.com/en/docs)，这是既定雷暴风险要求的兼容修正，公开schemaVersion仍1，规则初版仍photo-rules-v0.1。
- 校验坐标、单位、数组长度、排序、范围。坏值 null 并备注；未知天气代码缺失。无多源平均；主源缺失才逐字段回退；分歧阈值严格 spec §4.3。
- SunCalc 在北京时间中午求事件；初始化只一次注册 −4°。蓝调−6到−4、金调−4到+6；方位 `(rad*180/π+180)%360`。无效、跨日、顺序异常事件 null。不使用地点海拔作离地观察高度。
- 光照、风险、候选切片、三题材权重、2h合并、15min剩余、50分门槛、最多3个推荐、晚霞五级及限级严格 spec §6。已过窗口保留回看但不当未来推荐。
- 晚霞仅用主源同一定义的完整分层云、能见度和日落小时降水；缺失 unknown，不是1级；有冲突或旧数据最多3级。输出本地条件、未验证西向远方云场等限制，不展示百分比。
- Briefing 状态：气象与空气均无有效值 unavailable；否则用了旧值 stale；否则源失败/影响分析的缺失 partial；其余 ready。禁用 MET 视为 partial 并解释不能完成交叉检查。

## 地点、公开 HTTP 与客户端状态

保持 spec §3、§5.2：`GET /api/locations?q=` 去空白2–40字符，最多10项中国大陆 city/district，中文行政上下文；合法类别映射明确测试，非大陆和普通村落不能冒作区县。ID `geonames:<positive integer>`，坐标仅由服务端ID解析。无结果200空数组。

`GET /api/briefing?place=` 当天三题材同一 Briefing。统一 `{data,error}`，error 为 `{code,message}`；200 正常/部分/旧，400参数，404不支持地点，503地点服务失败或全部气象不可用。503允许 data 为 unavailable Briefing 保留星历。输入参数仅允许固定契约，不开放 URL/date/coords/fields。

SSR 动态组装，URL `/?place=…&genre=landscape|portrait|street`；非法 genre 默认 landscape。无地点显示选择入口，无假天气。地点/题材写URL，可本地保存；URL优先于保存值。所选小时和滚动进度不发新气象请求。切换地点中止旧请求并以请求代次防止迟到响应污染，清空小时状态。前台15min检查、隐藏暂停、恢复检查、北京时间零点换日，手动重试不绕过缓存。

## 缓存、并发与失败

源请求并行每路4s，聚合6s；不在单请求立即重试。地名24h，气象15min重验证，过期失败最多使用 fetchedAt距今≤3h且覆盖目标时段的源。命中不能刷新 fetchedAt；issuedAt未知null。键包括适配版本、源/模型、四位小数坐标、日期、变量、时区；规则结论不持久缓存，每次重新按 now 计算。

地点继续使用Next共享Data Cache；气象源使用可替换的SharedSourceStore读写边界，Vercel实现仅在单独适配文件通过官方`@vercel/functions.getCache()` Runtime Cache的get/set访问平台共享缓存。它不是业务数据库。主agent于2026-10-23核对官方API后补齐这一实现细节：Next unstable_cache的loader不能读取旧条目，不足以单独实现条件请求/冷却元数据。禁止私有Next内部API。业务层再次执行年龄/有效范围检查。MET 遵守 Expires / Last-Modified / If-Modified-Since，429遵守 Retry-After；跨实例额度保护在发布时验证。不能用进程 Map 冒充共享缓存或配额保证。缓存不可用明确降级和日志。运行配置仅服务端：`MET_NO_USER_AGENT`（缺少真实可联系身份则禁用）、各源启用开关，以及显式非生产 fixture 模式。确切变量名在 T05 写 `.env.example` 并同步文档。任何生产 fixture 尝试必须拒绝或明确禁用，不静默回退。

## 视觉与可访问

最终参考是 docs/DESIGN_REFERENCE.md 与 prototype/；保留暖白纸报刊、写实棕皮包与错层遮挡、风温湿仪、太阳方位仪、条件测光表、六项记录卡、无链24h表盘和黄色手册。数据是 DOM，不能烘焙到图片。使用基于实际内容测量的稳定阅读区间，禁止截断长地点／故障文案或缩小字体硬塞。

单一可逆时间轴：报纸阅读 → 两个独立折叠 → 对准袋口下放（只遮跨口部分）→ 仪表阅读/表盘先提清袋口再位移 → 手册先抽清再移动放大展开 → 三题材翻页 → 额外页发现完整纸单、抬起落定。每阶段可停留、逆向回看。Motion/CSS只平滑视觉，不拦原生滚轮与竖向触摸。48rem分界；宽屏滚动翻页、窄屏原生横滑scroll snap并可纵读，按钮/键盘均可达。

正文保持语义顺序，装饰副本 inert / aria-hidden、去重复ID，不让折后或过渡内容获焦。reduced-motion及用户静态阅读取消固定场景与3D，全部内容可读并保留地点/小时/题材切换。详情对话框 Escape关闭且归还焦点。字体、纹理本地或系统字体，不依赖第三方CDN。

## 安全、部署、许可与可观测性

固定适配器 HTTPS allowlist、输入长度/ID/国家校验、React安全文本输出；不使用用户字符串 innerHTML。无 secrets 到 NEXT_PUBLIC，无真实身份到fixture/日志。日志仅请求ID、耗时、源状态、稳定错误码。配置检查不得打印完整联系方式或凭证。

发布目标Vercel Node Serverless，无数据库/Cron。生产构建不需要真实上游联网。实际发布前核实用途/免费条款、MET真实标识、平台共享缓存/限流、素材授权，以及真实大陆电脑/手机网页/API/字体/纹理可达。没有相应环境不声称通过；提供逐项证据清单。初始查阅官方文档只证明查阅当时约束，不能替代用途许可或覆盖验证。

## 验证与追踪

T01已建立并实测 `pnpm dev` / `typecheck` / `lint` / `test` / `test:e2e` / `build` / `start`，后续复用；未落地之前只是计划。单元/契约：时间、源累计、null/单位、回退/冲突/风险、缓存、五城市太阳、三题材与五级。E2E宽窄各一加减少动效：搜索→URL→24h→题材→来源→竞态/异常→折叠/逆向→翻页。截图放临时目录，仓库仅保留小型证据说明；fixture显式标注，只验证契约不验证真实来源许可、全国覆盖或准确率。

覆盖：R01=T02/03/04/07/08/11，R02=T04/05/07/12，R03-04=T04/06/07/08/09，R05-09=T02/06/07/09，E01-05=T09/10/11，A01=T08-11，A03=T01/05/12，Q01-04贯穿T02-12。A02明确第二阶段，未完成不影响核心实现，但不得宣称已发送订阅。

## T05 平台缓存契约补充（2026-10-23）

- `SharedSourceStore`公开于服务端内部：`get(key)`和`set(key,record,ttlSeconds)`；record保存last-good SourceSnapshot、HTTP metadata、nextAllowedAt / checkedAt / lastError。读取内容需运行时校验。TTL至少覆盖3小时可用旧数据及更长Retry-After/Expires，读取后仍按fetchedAt与时段判资格；缓存可被驱逐，不承诺永久保存。
- Vercel实现用官方公开Runtime Cache get/set，按项目/环境/版本命名空间隔离（Hobby存在团队共享存储）；缓存区域共享、不保证跨区域一致或原子全局限流。多实例冷请求/并发写入的配额保护仍是发布门禁，不能把get/set说成分布式锁。
- 仅本地实现SDK适配和契约测试，不创建账号/缓存服务、不调用真实Vercel缓存、不部署、不产生平台调用费用；运行时启用必须显式配置且在发布前确认套餐/用途/预算。SDK精确版本由T05官方registry锁定。业务层不依赖该SDK，迁移只替换适配器。
- 非Vercel或缓存未配置时明确`cache unavailable/degraded`，可按规格直接获取GFS/CAMS并在结果notes与日志说明没有跨实例缓存/冷却保证；不伪装持久缓存。MET此时禁用（即使有contact）以免不能遵守Expires/条件请求；完整正常模式需要真实身份及可用共享读写缓存。无进程Map/本机磁盘生产持久状态。fixture仍独立非生产显式。
- 若缓存读失败，本次不立即重试；MET fail-closed，GFS/CAMS可直接取但明确降级；写失败保留本次已取得数据并提示后续共享时效/冷却无法保证。429不在同请求重试；有共享记录时将Retry-After保存并阻止冷却期后续调用，不能承诺驱逐/竞态下的全局硬配额。
- 304只更新checkedAt及允许再请求时间，不改原snapshot.fetchedAt；3h上限仍执行。
- 依据：[Vercel getCache API](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)、[Runtime Cache](https://vercel.com/docs/caching/runtime-cache)、[Next unstable_cache](https://nextjs.org/docs/app/api-reference/functions/unstable_cache)。Runtime Cache有计费规则，尚未确认实际账号套餐/成本；不得自动开通付费服务。

T05补充：主agent检查锁定SDK3.10.3的公开导出/实现，确认`getCache`在缺平台上下文时可能退回内存，公开API没有后端探测或自定义onError。适配器必须默认关闭，仅在显式选择Vercel缓存、正式Vercel项目/preview或production环境、以及部署者完成真实跨实例验收后设置的明确共享缓存验证开关同时满足时调用SDK；不能在普通next dev/build/单元测试调用真实getCache。该开关是运维前提声明，不是运行时后端检测或本地验证证据。结果/文档使用“Vercel缓存已配置”而非“已证实共享”；真实共享、驱逐、SDK静默降级和日志行为是发布阻断项，未取得证据前保持开关关闭。禁止读取SDK私有context、猜测私有注入变量或用内存往返探针声称共享。业务cache故障仍按上述降级处理；SDK内部吞错无法由公开API完全检测，不能隐去此限制。


## T11 浏览器验收目录隔离（2026-10-23）

Playwright自管服务器使用显式测试环境标记 `HIKARI_E2E_DIST=1`，通过公开Next `distDir`配置写入 `.next-e2e/`，并使用独立 `tsconfig.e2e.json`，防止与正常 `.next/` 开发服务目录锁冲突及改写根TypeScript配置。常规dev/build/start仍用 `.next/`；该标记不是数据模式、不启用fixture、不改变生产服务契约。生成文件继续忽略，不停止其他会话服务。Next自动生成的忽略文件next-env.d.ts可随typegen刷新，不作为公共源码契约。


## V01 展示层纠偏落实（2026-10-23，验证后回填）

按用户要求主会话直接修复后记录：固定紧凑顶栏；报纸恢复照片/晚霞、天气/题材、逐时、太阳/空气四栏，完整依据可展开；手册恢复920宽双页、610最小页高与可增高的真实内容。BookCover统一袋内册/移动封面比例，器材恢复原型画布和转轴。窄屏折纸按旋转包络收纳；开封共用书脊位置，翻页包含旧右/下一左双面，叶片和纸单承托面取实际页矩形。题材跳转同步测量、避开小数边界，历史导航测量不回写旧题材。纸单阶段导航隐藏且inert，模式退出完整还原。详见 [V01](verification/V01-visual-drift.md)。没有服务/领域/公开契约变更；视觉原型仍独立只读。

V01用户复核后进一步落实：Bag默认及简化模式不铺设重复小时条、说明链接和完整字段面板；选时由24h表盘承担，完整小时表和逐字段依据在表盘明细对话框中读取，说明由器材本体打开。简化模式取消运动并保留静态器材入口。服务/数据契约不变。

## V02 原型界面直接接入（2026-10-23，取代旧前端实现）

用户明确要求新开分支、归档当前前端，并直接使用 `prototype/` 界面接入。分支为 `codex/prototype-frontend`；替换前展示源码和相关浏览器/几何测试保存在 `docs/archive/frontend-before-prototype/`，基线提交 `d461c6a`。旧T09/T10/V01的实现与通过记录仅为历史，不可当作V02验证。

- 正式首页采用从 `prototype/index.html`、`styles.css`、`app.js` 直接移植的DOM结构、CSS和原生滚动动作。允许将原型动作代码模块化并加TypeScript类型及清理生命周期；不再沿用旧React物件组件和旧几何时间轴重新仿制。React/Next承载SSR内容及客户端控制器，原型原有紧凑断点与动作比例优先于旧展示层的48rem/Motion实现选择。
- `prototype/` 本身保持原样可离线运行。正式运行代码放 `src/`，素材放 `public/`；不加载原型 `data.js`、`solar.js`，不依赖 `window.HIKARI` / `window.HIKARI_SOLAR`，不嵌入离线夹具iframe，不复制固定上海文案作为天气。
- 保留T01–T08/T11已实现的服务端、领域、同源API与客户端请求控制器。只通过一层有类型的数据映射将同一 `Briefing` 接入报纸、选时仪表、手册、来源与异常说明，不在浏览器另算摄影结论。小时中点太阳角度、null、单位、来源、风险、五级未知、日期及fixture标签不得丢失。
- 顶栏以原型为基础放置最小的地点选择/刷新入口，完整地点搜索及来源/指标依据可放按需对话框；无地点保留选择入口且不显示假值。现有URL、记忆、请求取消、15min/跨日刷新不变。真实内容可增加阅读高度，原型短文案不构成数据截断许可。
- 原型的两次折叠、分层皮包、表盘、抽册/双面翻页/纸单、手机原生横滑、静态/减少动效和详情焦点保持。订阅纸单仍是本地预览，不创建订阅或发送。
- 新套件必须在宽、窄、减少动效下独立验证原型结构与呈现、数据接线、选时/题材/来源、异常/null、URL及完整动作；归档测试不计通过数。未变更任何服务端公开契约、环境变量、依赖、数据库或部署授权。

## V03 展示文案（2026-10-23）

按用户最新要求，界面及生成文本删除重复防御性免责语句，改用简洁事实和摄影建议；必要来源、时间、单位、美国EPA口径、缺失/旧数据/冲突、具体天气风险、人工演示与订阅预览标识保留。源元数据、计算阈值、API及服务边界不变。

## V04 报纸首屏与交接（2026-10-23，修复后回填）

桌面报纸先根据实体布局高度适配首屏，在同一舞台直接双折；正文标题去除报头/天气栏已有的重复上下文，完整摘要与变化通过按需详情及无脚本 SSR 保留，风险直接显示。手机/异常超长正文保留自然纵读和末屏 sticky 停留，以同一 journey 起点交给等尺寸、等屏幕位置且两折角为零的副本；取 offset 尺寸，load 重建不继承隐藏。两折独立缓动、重心居中、背面阴影端点归零，随后对齐与下放；报纸阶段 resize 重映射阅读比例/进度。此项补正 V02 的长文交接方案，不改变数据/服务契约。见 [V04证据](verification/V04-newspaper-fold.md)。

## V05 固定手册纸面（历史方案，页内滚动由V06撤销）

桌面动态手册恢复原型固定610px纸面和书脊，取消各题材阅读区间的整本向上pan；长文与展开内容在页内原生滚动，手机/静态继续自然阅读。正反翻动副本和纸单承托面同步源页阅读位置，每轮翻动及详情变更刷新内容。此项取代V02通过整本平移读取长页的做法，见 [V05证据](verification/V05-manual-turn.md)。

## V06 印刷手册与完整建议分离（2026-10-23，修复后回填）

用户明确否定V05纸内滚动。当前手册固定纸面只排入完整短段落，过长段落整体移至按题材打开的物件外详情；六张纸面不滚动、不展开，不以裁切/省略号/缩字号掩盖内容。完整题材时机、光线、全部机会/窗口理由/限制/调整/胶片字段同时由详情和无脚本文档提供。保留固定书脊与正反翻页，删除纸面及承托副本的阅读位置同步；左右页仍是spread的两个直接子节点。当前实现以V06为准，V05仅保留历史验证记录。见 [V06](verification/V06-printed-manual.md)。

## V07 解释层与第二阶段执行契约（2026-10-24）

第一阶段基线为 `0e71994`，现有 `Briefing.interpretation` 随 schema v2 返回。第二阶段严格执行 [V07-phase2](plans/V07-phase2.md)，任务采用独立的 V08A–V08F 卡，T12 保持原状态。

- 解释文字全部由 `src/content/interpret/` 的纯函数生成，显式消费小时、太阳位置、风险和现有题材推荐；前端负责安全渲染与交互。评分、阈值、合并、reasonCodes、数据获取、API 路径、服务端、依赖及环境保持现有契约。
- `interpretation.hours[24]` 增加 `sun: Reading` 和 `sentences: string[2..3]`。`sunPositionReading` 使用八方位；高度 ≥0 表述离地平线的角度，−6≤高度<0 表述日出将至或刚落山，高度<−6 表述尚未日出或已落山，缺方位/高度时说明算不出来。`hourReadings` 传入该小时的北京时间，以正午前后区分早晚；独立调用可通过可选时间参数提供这一语境。
- 风读数增加 `short`，集中生成阵风级、气温和湿度的小字；缺阵风时省略。光线读数增加 `short`，保存 `detail` 的第一句。schema 仍为 `"2"`，规则版本仍为 `photo-rules-v0.1`。
- `hourSentence` 输出天色/降水/气温一句、摄影影响一句，并在该小时有风险或与非 D0 推荐相交时加入第三句；风险优先。同一小时的器材、读数和 slider 结论共用解释层结果。
- 保留 data-device、data-detail="hours"、selected-time、slider 及 reading-index 的 aria-live。器材尺寸与动作几何不变；ready 隐藏状态提示，其他状态读取 dataNote。
- 四种器材详情各自只放相关读数、含义、24 格走势和出处入口。逐字段值/状态/来源/对比来源集中收进 sources 的“逐小时原始数据”。24 小时明细采用八列表格，当前/推荐/风险有文字标记，手机横滑且首列固定。
- 印刷手册保留固定纸面与短段原文，时段标签使用“最值得拍的时间”；无推荐用 genres[g].when。ready 页眉无状态，其他状态显示“数据不全”。订阅预览中的“北京时间 · Asia/Shanghai”按计划保留。
- 完成计划建议顺序第 2 步及第 4 步后，主 agent 分别提供实际截图，用户过目后才派发下一步。两处复核状态写入 PROGRESS。

### V08C 器材详情解释契约

第一轮截图已由用户确认“继续后续步骤”。四种详情需要的云层、风向、异常和走势说明仍随解释层生成，前端不自行翻译字段状态。

- 新增纯函数 `deviceReadings(hour, readings, solar?)`，由 `createInterpretation` 组装进 `interpretation.hours[].devices`。键固定 `wind | direction | light | weather`，每项固定为 `{ fields: {name, value}[], meaning: string[], notices: string[], reference: string[], trend: {value: number|null, key: string, label: string} }`。`fields` 是本器材相关读数，`meaning` 为对应 Reading 的拍摄含义，`notices` 只说明本器材的缺失/旧值/分歧，`reference` 放风级对照或三种光线释义。所有文本在解释层生成且由 schema 严格校验；schemaVersion 仍为2。
- 风的 fields 仅阵风级、八方位风向、气温、湿度；太阳仅方位/高度，太阳事件在适配器沿用已有 `solarHtml` 白话版；光线仅总云及低/中/高云；天色与空气仅天色、雨量/概率、能见度、美国标准AQI及实际PM2.5/PM10。主读数继续复用已有 Reading.label。
- 云层可读分类仅用于措辞：<25% 为少，25–75% 为有一些，>75% 为很多，附原百分比；缺值说明该层未提供。此分类与摄影评分相互独立。风向沿用 bearingName 八方位。
- 冲突说明用当前值及已提供的对比值，省略源ID；旧数据直接说明早些时候缓存，缺值沿用相关 Reading 的缺失含义。旧值兼有 alternatives 时两类说明均保留。单位和数值忠实于各自字段；不以AQI生成能见度或PM。
- 太阳事件为空的白话提示也在解释层由显式 solar 生成，进入 direction.notices；solarHtml 不直接回显带内部事件名的 solar.notes。原始 solar.notes 随 V08D 保留到 sources 技术区。
- trend 的 value 为风级/太阳高度，光线与天色的已知类型用固定高度色带；key 沿用解释层分类，label 为可读文字。前端仅计算图形尺寸并复用 `.tl-light`/`.tl-sky` 样式，24格均有小时+标签，选中小时另有指针。太阳高度以地平线上下两色标注。
- 四种 deviceHtml 只渲染该项字段、说明及对应走势，依次为读数、这意味着什么、今天的走势、出处按钮。未知 kind 不继续返回完整小时字段。器材图片副本与对话框生命周期保持原有行为。

### V08D 24 小时表契约（已实施）

- 表格主值直接使用各小时 Reading.label，气温仅做印刷单位格式化为“20°”；列固定时、天色、气温、雨、风、远景、空气、光线。caption为“今天24小时的天气和光线”，列头scope=col、小时scope=row。
- 新增纯函数 `hourMarks(hour, advice, now)`，由 createInterpretation 放进 `hours[].marks: {timing: past|current|future, recommendation: string|null, risks: string[]}`。timing按显式now和小时起止确定；recommendation仅根据既有recommendedWindows与小时有正长度重叠、排除D0后生成“好时段 · 风光、…”；风险短语只翻译该小时已存在的RiskNote.code。标记不改变评分/筛选，不用前端推断语义。
- 当前小时行aria-current=time并显示“现在”；推荐和风险都有文字，风险加⚠；已过行使用较淡但满足对比度的实色文字。详情保留白话Reading.detail和该小时相关说明，不渲染field()技术表。
- 手机横向滚动容器可聚焦且有aria-label，首列sticky。桌面显示全部八列，竖向阅读沿用弹窗滚动。
- 原hourHtml()/field()完整输出迁入sources末尾原生details“逐小时原始数据”（稳定class=sources-raw-hours），原太阳计算notes也保留在sources技术区。pageHtml的noscript移除重复的第二份hourHtml列表，避免sources新增完整列表后出现重复hour-id；无脚本仍可展开全部原始数据。

## V09 实体摄影手册重设计（2026-10-24）

用户授权重做手册外形和翻页，参考深蓝复古摄影指南；替代旧黄色封皮视觉，不复制真实品牌。封皮使用新生成压纹材质和橙黄光圈图案，标题保留DOM。书壳、纸块、书脊与翻叶共享尺寸和坐标，正反滚动连续可逆；不得用端点隐藏封壳造成闪烁。街拍右页与纸单承托副本必须使用相同排版尺寸，禁止交接时缩放正文。内页全部文字及V06/V08内容选择保持不变，手机横滑、减少动效、详情和订阅纸单可达性保留。服务/API/环境和prototype不变。

V09截图复核补正：桌面翻页视觉进度与原生滚动目标分离，以时间连续追随并限制翻动区间单帧幅度；纸页必须完成落平后才交接静态页与纸单。显式题材导航直接定位，手机/减少动效保持原方式。翻叶Z偏移和悬空投影在两端归零。

V09底部纸层补正：实体纸层归属独立`book-shell`中的左右`paper-stack`，不得放在会被clip-path裁切/替换的spread上。桌面spread和book-block不再重复绘制层叠阴影；左纸层随开封绕同一书脊展开，之后两侧持续承托所有题材。订阅纸单动作不变。

## 来源数据阅读分层（2026-10-25）

`prototype-frontend/sources-view.ts` 只消费当前 Briefing，登记 16 项字段、五组表、结构化异常区间和完整依据。adapter 保留来源概览，并为无脚本输出顺序表及原生附录；runtime 在现有 detail 容器内切换视图并恢复滚动/焦点。数据获取、归一化和摄影规则边界不变。旧“逐小时原始数据”长折叠已替换，见 [验收](verification/sources-tables.md)。


## V10 数据解释一致性审查（2026-10-26）

依据 [过程指导](plans/V10-interpretation-review.md)，按 T13–T19（对应第0–6步）串行推进。先建立人工合成场景的一致性失败基线，再修复表达，最后仅在用户确认后变更评分至 v0.2。T12不因本轮启动。

- 同一事实统一分档与措辞；天色只描述天空，光线由 LightReading 解释；空气质量与远景能见度分别表达。
- 雷雨、冻雨、强风、强雨的逐时事实须保留在所属时段和全天概述，不能被多数票或雨量为0吞掉；沿用逐源风险事实，不新增公开风险枚举。
- 缺评分必需字段时解释缺什么，不能把缺数据写成坏天气。带伞建议须有相应时段雨量>0或概率≥40%；雪使用防滑/保暖提示；强雨不同时鼓励积水倒影。
- 建议按显式 now 使用时态，夜间机会与胶片面向夜景；已过日落为回看推断；太阳在地平线下的金调不描述直射暖光。T16允许在纯文案上下文传可选location以精确消费既有太阳位置计算，不改输出schema、评分/切片，浏览器仍只渲染已生成解释；太阳事件与几何高度0分别判断。
- 最高级只用于各题材评分第一的连续推荐区间。合并摘要不能扩大每个题材的实际推荐区间；不得原地修改 advice 数据。
- 第0–4步不得改变评分、筛选、风险阈值或 RULES_VERSION。用户已确认第5步执行A1–A3与A4甲；到第5步时主agent先同步spec/架构/决策，再派发。冻雨暂不新增 RiskNote 代码。
- 保留现有云量措辞分档20/50/85，未核对官方标准前不宣称对齐公众天气标准。新增口径只作为工程规则记载。
- 每步单独本地提交。第0步按指导刻意提交失败测试；中间全套若仅剩已登记的后续步骤不变量失败，逐项如实记录，最终必须全部通过。测试不可 skip/todo 或放宽断言。字数和固定纸面由单元及第2/3步后的显式fixture E2E核对。
- 用户已确认已删除 docs/INTERPRETATION_RULES.md 明确废弃；第6步记录废弃并清理入口，不恢复历史源码快照。服务、schemaVersion、provider、缓存、环境和依赖边界保持现状。


### V10 纯用语表边界（第4步）

晚霞与风险用语按计划集中在content/interpret的纯常量模块，只依赖type、无I/O或初始化副作用。领域函数本来负责附带中文依据，允许仅为解释文字只读引用此表；不能从词表反推分数、风险、缺失状态或新增公开风险枚举。风险去重按结构化code处理，不能解析生成的中文判断危险。


### V10 v0.2评分与推荐资格（第5步，已确认实施）

- A1的W是均风分量与可选原始阵风分量(≤7.9/≤10.7/其他为2/1/0)的最小值；主推荐另行禁止原始阵风>10.7的切片，allWindows保留。原值门槛与四舍五入风级显示不同，不新增正式风险码或改17.2m/s风险阈值。
- A2的56/57/66/67冻雨D0且禁止主推荐，包括零雨量；未来冻雨使tone=poor，标题/导语/题材/手册/夜间给结冰停拍提示，日落行动避开对应冻雨时段。全天记录保留但不称可拍时段；不新增RiskNote码，不扩大为所有D0禁入。
- A3主推荐需L≥1；人像/街拍golden加分需几何高度≥0；在高度0过零点新增内部切片，以有界纯太阳求根保证≤1秒误差，再照旧中点评分。不用日出/日落事件冒充零点，不增加SolarEvents公开字段。部分小时推荐说明给实际交集，marks仍按正重叠。
- A4甲仅白天day/diffuse/总云≥90的风光L0；其他相位/题材按原定义，各题材有效推荐共同决定tone。权重、50分、15分钟、2小时、最多3项以及晚霞五级数值不变。
- 内部components/推荐资格不进入公开RecommendedWindow；输出schemaVersion保持2，rulesVersion改v0.2；当前fixture版本同步。T18已由主agent验收，证据见[V10验证](verification/V10-interpretation.md)。
