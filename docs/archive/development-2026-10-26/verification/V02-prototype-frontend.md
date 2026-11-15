# V02 · 原型前端直接接入

2026-10-23。用户要求归档当前前端、新开分支，直接以 `prototype/` 界面接入正式应用。本记录只针对V02；旧T09/T10/V01的通过数量不计入本次验收。

## 范围与归档

- 分支：`codex/prototype-frontend`，基线：`d461c6a`。
- [归档目录](../../frontend-before-prototype/README.md)保存替换前34个源码/测试文件，[摘要清单](../../frontend-before-prototype/SHA256SUMS)逐项与该Git基线匹配，主agent独立校验34/34。
- 现有用户修改 `.gitignore`、`prototype/.DS_Store`、`prototype/review/.DS_Store` 保留，不纳入提交。原型、参考资产及其他会话服务保持。
- 服务端、领域规则、内容、API和客户端请求控制器属于既有能力；本次接入不得用原型夹具替代。

## 实施与配置

- 单个全新干净上下文实施worker：`spec-worker-sol-high`，配置 `gpt-6.1-sol` / `high`。未派Astra、未递归委派；实际运行model/thinking没有可观察metadata时不声称已验证。
- 主agent负责架构/卡、归档快照、独立验收及本地Git提交；已完成V02验收，下列结果区分worker与主agent独立运行。
- 首worker在写入模板、数据映射与动作模块、退出旧展示后因usage limit中断，没有最终验证报告；主agent检查后保留全部未验收改动，以全新干净上下文同ID/Sol-high worker续作。没有因额度问题升级Astra。

## 独立视觉基线

主agent从未改动的原型实际运行页面采集1440×1000宽屏、390×844窄屏和390×844减少动效的报纸/皮包/手册/订阅单截图及物件几何。临时证据位于 `/tmp/hikari-v02-acceptance/prototype-*.png` 与 `prototype-geometry.json`，不提交大图。正式接入后逐阶段对照，真实内容长度差异单独说明。

主agent独立检查：原型HTML/CSS/app/data/solar与 `d461c6a` 完全相同；12个正式物件/纹理与原型逐字节相同。样式主体直接继承原型220行，差异为路径重写、来源注释及正式数据的可读性扩展。

## 复核中发现的问题

- 接续worker新浏览器首轮27项中19通过、8失败；其中实测宽屏题材导航覆盖URL并重复历史、手机详情关闭焦点未还、正式长报纸1027px被780px舞台裁切。异常测试的一部分fixture不符合既有RiskNote schema，需要修测试数据，不放宽契约。
- 独立只读explorer复核补充：详情Tab循环遗漏原生summary，键盘无法展开完整依据；同步渲染可能使先前排队RAF失去跟踪，销毁仅取消最后一帧。两项已交同ID实施worker聚焦修正，不能仅凭静态审查声称行为通过。
- 初审同时要求温度范围直接消费Summary及24小时覆盖数，未知太阳方位不画成0°，生成时间与源抓取时间分别标注，三题材保留原型各自图解。

## 最终实现与逐项验收

| 标准 | 实现及证据 |
| --- | --- |
| 旧前端归档并退出 | 34个历史源码/测试完整快照；首页只导入 `src/components/prototype-frontend/`，旧物件/场景/样式/浏览器测试退出活动树，保留既有请求controller。归档不参与lint/typecheck/test/build。 |
| 直接继承原型 | `template.ts`、`adapter.ts`、`runtime.ts`、`globals.css`直接承接原型DOM/CSS/native动作与原比例。三题材保留各自原创图解；主agent实际查看宽窄报纸/包体/手册/折页/双面翻页/纸单画面，包体、器材和手册与原型对照。 |
| 接入正式数据 | 同一Briefing映射报纸/24h仪表/三题材手册/详情，保留Summary温度范围及覆盖数、显著风险、null、来源notes/alternatives、单位、生成/抓取/发布时间、五级unknown及fixture标记。扫描src无原型data/solar、globals、iframe、原型固定日期或固定样例。 |
| 保留交互 | 地点弹窗与300ms防抖/行政上下文、URL/记忆/精确history、表盘键盘/按钮/触摸且不重取天气、原生横滑、题材导航、15min/隐藏暂停/北京时间跨日、迟到请求、详情Escape/还焦/Tab展开及预览安全均有新E2E。 |
| 动作及长内容 | 原型双折/分层收纳/提表/抽册/双面翻页/完整纸单正反路径保留。正式长报纸先正常流阅读再接原型双折；展开手册按真实页高读取。系统/用户静态模式与刷新保持，快速销毁RAF不再操作移除DOM。 |

新源码仅展示与接线；服务端/domain/content/API、BriefingController、依赖及lock、环境变量契约无diff。归档排除仅修改eslint配置。主agent收尾删除已无引用的空首页CSS占位并清除一处尾空格；首次暂存diff检查另发现地点选择器末尾多余空行，仅移除空行后复查通过，不改变已验证运行行为。

## 精确命令与结果

实际环境：Node `v24.3.0`、pnpm `11.26.0`，macOS。下面五项由接续worker和主agent分别串行运行，主agent独立复验结果：

| 命令 | 主agent结果 |
| --- | --- |
| `pnpm typecheck` | exit0，路由类型及strict TS通过 |
| `pnpm lint` | exit0，无警告 |
| `pnpm test` | exit0，12文件、390/390 |
| `HIKARI_SOURCE_MODE=fixture NODE_OPTIONS='--import=./tests/fixtures/briefing-browser-preload.mjs' pnpm test:e2e` | exit0，39/39、0跳过；宽/窄/减少动效各13，26.8s |
| `pnpm build` | exit0，动态首页和同源API正常构建 |
| `pnpm start --hostname 127.0.0.1 --port 3102` | Ready；生产模式无fixture。首页无地点200、非法地点API400；上海live SSR200，partial，GFS/CAMS可用，MET缺身份禁用、共享缓存降级。浏览器上游请求0、JS错误0。Ctrl-C停止（exit130为主动停止） |

worker另跑普通 `pnpm test:e2e`：exit0，无上游基础smoke3通过，其余36项因未显式fixture按环境门禁跳过；这不计作36项行为通过，完整行为以39/39显式运行证明。未重装依赖（manifest/lock未变），未执行数据库迁移、T12、push或部署。

主agent额外Playwright生产smoke直接访问本地3102：390×844触摸下题材导航可见、选时01:00、运行中切换减少动效成功、横向溢出false、JS错误0。首版人工脚本在媒体change事件前同步断言而失败；改为等待body静态模式生效后复验成功，无需产品修改。独立截图与JSON在 `/tmp/hikari-v02-acceptance/production-*`。原型静态对照服务18765也已Ctrl-C停止，原有3000开发服务未停。

## 验证边界

本地fixture/browser只验证界面接线和交互，不证明真实天气、许可、全国覆盖、大陆部署、素材公开权、共享缓存或气象准确率。微信订阅仍仅纸单预览。无push、部署或发布授权，T12不在本次范围。

本次上海生产模式请求只证明该地点当时可取得并呈现数据，不扩展为全国覆盖或气象准确性证据。Runtime Cache真实共享/配额与MET身份、素材授权及真实大陆设备访问继续为原有发布门禁。workflow结构脚本检查T01–T12通过，附加V02卡由主agent人工核对依赖和证据；本地链接、归档hash及最终暂存diff检查由主agent完成。


## 接续worker交接原始证据（主agent验收前记录）

- 配置：`spec-worker-sol-high / gpt-6.1-sol / high`，新干净上下文，仅继续V02。可观察运行环境Node `v24.3.0` / pnpm `11.26.0`；工具未提供实际模型/推理档位metadata，不能将配置写成运行观测。无递归委派、commit、push、部署、原型修改或服务/domain/API/依赖变更。
- 保留首worker的直接DOM/CSS/runtime移植，修正摘要温度范围与覆盖缺口、概览显著风险、三种原型原创图解及手册层次；null太阳方位隐藏指针，生成时间不冒充来源抓取时间。完整原型CSS经public资源路径映射后逐字保留，原型本体与控制器无diff。
- 原生动作修正：长报纸正常流阅读后衔接双折；长手册在同题材稳定阅读区按页高读取底部，手机保留原生横滑和可达题材按钮；细节列表不继承外层网格。修复初始/历史题材回写与重复history、触摸详情还焦、Tab到summary、运行中模式/刷新、排队RAF销毁门禁及重复DOM清理。
- 精确最终验证：`pnpm typecheck` exit0；`pnpm lint` exit0；`pnpm test` exit0，390/390；`HIKARI_SOURCE_MODE=fixture NODE_OPTIONS='--import=./tests/fixtures/briefing-browser-preload.mjs' pnpm test:e2e` exit0，39/39、0跳过；`pnpm build` exit0。均串行，浏览器服务由Playwright使用3100/.next-e2e自管，未停其他服务。
- 普通 `pnpm test:e2e` exit0：无上游基础smoke 3/3；36项人工数据测试因未显式fixture而按环境门禁跳过。普通命令不自动启用fixture；完整显式fixture运行全部执行。
- 首轮新浏览器套件19/27通过，后续22/27；真实发现并纠正题材/历史、底栏可达/焦点、长内容与键盘问题。扩大套件后29/36通过，纠正长页几何、手机按钮与测试选择器/环境断言后定向12/12，最后完整39/39。异常fixture首版违反RiskNote/Opportunity严格schema，修正人工样例而未放宽契约；一次typecheck因新测试offsetHeight联合类型失败后补HTMLElement类型；一次unit旧首页文案断言失败（389/390），按新无地点入口迁移后390/390。失败未记为通过，未以skip掩盖功能。
- 新浏览器证据覆盖wide1440×1000/narrow390×844/reduced：无地点、300ms搜索/行政上下文、URL/记忆/精确历史增量、表盘键盘/按钮/触摸不重取、CDP原生横滑、三题材、来源/指标notes与alternatives、missing/conflict/stale/unavailable保留星历、双折/入包/提表/抽册/双面叶片/完整纸单正反、模式与RAF快速销毁、迟到响应、15min/后台/上海跨日、订阅仅预览和不可信文本。
- 临时截图：`/tmp/hikari-v02-recovery/`，含三视口newspaper/bag/street-book/fold-one/fold-two/extracted-cover/loose-sheet-lift/subscription/reverse-newspaper/expanded-book与wide-turn；各视口geometry.json。worker已查看宽报纸/包体/长手册、窄手册/纸单图片。主agent独立图像对照、生产start smoke、归档hash/链接/workflow检查与最终接受尚待主agent完成。
- `git diff --check` exit0；对server/domain/content/app/api/package/lock/prototype运行文件/BriefingController检查无diff。未验证真实上游覆盖、许可、气象准确率、共享缓存、大陆部署和实体设备；装饰素材权利门禁继续保留。无数据库迁移、新环境变量或公开数据契约影响。用户.gitignore与两处原型.DS_Store保留。
