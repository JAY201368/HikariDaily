# 第一阶段验证矩阵

本页汇总 spec §9 的证据归属；T11 已由主 agent 验收（2026-10-23）。最新执行、失败→修复和真实来源记录见 [T11](verification/T11.md)。自动 fixture、截图人工审查、外部环境待验分开记账。截图在忽略的 `test-results/`，不作为发布许可或实体手机证据。

| spec §9 测试组 | 自动证据 | 本机人工审查 | 外部待验 / 限制 |
| --- | --- | --- | --- |
| 地点 | `contracts/geocoding.test.ts`：行政分类、CN/省级过滤、同名上下文；`e2e/interactions.spec.ts`：防抖、一字不请求、无结果城市引导、URL/记忆 | 地点与长文本在 T09/T11 截图中可读；真实搜索结果见 T11 | 全国区县、中文完整性未验证；本次朝阳仅一个合规结果，不等于所有同名区县覆盖 |
| 时间 | `unit/time.test.ts`、`unit/briefing-client.test.ts`、`contracts/briefing-service.test.ts`：北京时间/24格/午夜/跨日请求；`e2e/interactions.spec.ts`：23:59:59.900→00:00及隐藏恢复 | 所选小时、日期、模型时间与来源语境截图审查 | 后台可见性由浏览器注入，非手机系统后台验证 |
| 时段语义 | `contracts/weather-sources.test.ts`：前/后一小时、次日00补23、不拆6h；T11真实输出24格 | 记录卡与小时详情时间解释 | 实况准确性与上游模型效果另验 |
| 单位与字段 | `contracts/weather-sources.test.ts`、`unit/schemas.test.ts`：异常/null/未知码；`e2e/provenance.spec.ts`：所有天气/空气字段值、单位、notes、sourceIds及独立缺失 | 宽/窄冲突记录卡：AQI有值而能见度暂无，文本未截断 | 不以单机数据推全国覆盖 |
| 空气质量 | 同上；US_EPA、CAMS 45km/原生3h/含插值，能见度独立 | T11记录卡/来源截图审查 | 非中国站点实况，不验证污染预报准确率 |
| 多源 | `contracts/weather-sources.test.ts`：逐字段回退、阈值冲突、不混层云；service四风险回归；`e2e/interactions.spec.ts`全部失败保星历；`e2e/provenance.spec.ts`冲突及备用值 | 宽窄冲突、缺失、故障截图 | MET无真实contact及共享缓存，未完成真实交叉天气检查 |
| 缓存 | `contracts/source-loader.test.ts`：命中原fetchedAt、15min/3h、304/Expires/429、4s/6s取消、版本化key、降级；service规则不缓存；browser旧状态 | T11旧数据来源时间/发布未知保留 | Runtime Cache实际跨实例、驱逐、SDK回退/日志、限额与预算仍阻断发布 |
| 星历 | `unit/solar.test.ts`：北京/上海/广州/成都/乌鲁木齐固定样例、角度与无效事件；UTC及上海双TZ再验 | T09详情方位说明、T11真实太阳事件 | 不考虑建筑/山体遮挡；不是现场测光/设备朝向 |
| 推荐 | `unit/photography.test.ts`：三题材、风险优先、短窗口/已过/午夜、排序；service四风险全链路schema回归 | T10宽屏人像稳定页与T09手机手册审查 | 初版启发式，未证明推荐效果；不替代官方安全信息 |
| 五级机会 | `unit/photography.test.ts`：八组基准、五级可达、unknown、限级；schema拒绝概率字段；T11浏览器3级冲突说明 | 报纸明确规则推断与等级，图像并非实况 | 未经统计校准，不声明发生概率 |
| 视觉叙事 | `e2e/visual-fidelity.spec.ts`：首屏/器材比例/书脊连接/双面翻叶/完整承托/过渡导航；`e2e/journey.spec.ts`：独立双折、对准入包、先提清再移动、桌面滚动/窄屏横滑、完整纸单、正反路径几何 | T09/T10历史视觉判断由V01实际原型对照补正；V01宽窄构图、双面叶、承托页及完整正反路径复核 | 本机Chromium截图，真实电脑/手机触摸体验待验 |
| 异常与竞态 | `unit/briefing-client.test.ts`：忽略abort仍丢迟到、跨日迟到；`e2e/interactions.spec.ts`：loading/partial/stale/503/bad JSON/network；T11冲突与stale并存 | 故障页无假天气、可重试；冲突详情可读 | 实际断网/手机恢复/部署网络另验 |
| 简化阅读 | 全套E2E三project（1440×1000、390×844触摸、390×844减少动效）；保留T10 runtime simple/reduced focus纠正；搜索/选时/题材/来源/异常/跨日/迟到均实际执行 | 减少动效来源页和正常窄屏截图审查 | 读屏软件及真实手机系统减少动态未验 |
| 许可与构建 | typecheck/lint/unit/E2E/build；输入安全文本、不从客户端请求气象上游、生产fixture拒绝、默认缓存/MET关闭；原型独立local检查 | 来源与CAMS口径可读；未把素材声明为已授权 | 用途/免费托管条款、真实MET身份、素材授权、共享额度、Vercel成本、大陆网页/API/字体/纹理均为外部门禁 |

表中测试路径相对于 `tests/`。既有验收证据：[T02](verification/T02.md)、[T03](verification/T03.md)、[T04](verification/T04.md)、[T05](verification/T05.md)、[T06](verification/T06.md)、[T07](verification/T07.md)、[T08](verification/T08.md)、[T09](verification/T09.md)、[T10](verification/T10.md)。

第一阶段不包含微信身份/订阅存储/发送/调度；纸单只预留，不因此新增验收承诺。T12另处理发布准备；没有push、部署、费用开通或数据库迁移。


最新展示层纠偏及失败→修复记录见 [V01](verification/V01-visual-drift.md)。最终本地389/389、fixture浏览器48/48、typecheck/lint/build及start通过；T11真实来源记录仍只代表其当轮live检查，本次未重新请求真实天气上游。

当前前端的报纸专项修复见 [V04](verification/V04-newspaper-fold.md)：392/392 单元/契约、显式 fixture E2E45/45、typecheck/lint/build与本地start通过。新增首屏四边、正文/折面交接、两折独立顺序、load/resize及反向几何检查；上表涉及旧展示文件的条目仍为历史验证，当前浏览器入口为 `tests/e2e/prototype-frontend.spec.ts`。

手册稳定翻页专项见 [V05](verification/V05-manual-turn.md)：392/392、fixture E2E48/48、typecheck/lint/build通过；覆盖两种桌面视口两次翻页正反15个关键点、页内长文、正反副本阅读位置、手机/减少动效与纸单承托。

用户已否定V05纸内滚动，当前印刷实体边界见 [V06](verification/V06-printed-manual.md)：393/393、fixture E2E51/51、typecheck/lint/build通过。保留V05固定翻页，替换其页内阅读断言为纸内无滚动/无越界、物件外全量详情和禁用JavaScript的完整阅读检查。
