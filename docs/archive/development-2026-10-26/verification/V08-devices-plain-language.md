# V08 器材、24 小时明细与手册白话化

2026-10-24。执行依据为 [V07 第二阶段计划](../plans/V07-phase2.md)，第一阶段基线 `0e71994` 已获用户认可。V08A–V08F已完成主agent验收，两轮截图均由用户确认继续。

## 实现范围与执行顺序

| 任务 | 内容 | 当前状态 |
| --- | --- | --- |
| V08A | 太阳位置、风与光线小字、每小时 2–3 句 | 已验收 |
| V08B | 四件器材屏幕、表盘读数与读屏标签 | 已验收 |
| 截图复核 1 | 器材屏幕与读数 | 用户已确认继续 |
| V08C | 四种相关详情与 24 格走势 | 已验收 |
| V08D | 24 小时表、原始数据迁入出处 | 已验收 |
| 截图复核 2 | 明细表、手机横滑 | 用户已确认继续 |
| V08E | 印刷手册与残留措辞 | 已验收 |
| V08F | 全站扫描、实况矩阵与最终交接 | 已验收 |

解释层继续随 `Briefing` 返回，schema 为 `"2"`，规则为 `photo-rules-v0.1`。保留固定物件尺寸、双折入包、抽册翻页、小时/题材交互与详情焦点。订阅预览中的“北京时间 · Asia/Shanghai”依照计划第六节保留。

## 证据与配置

- V08A 配置：`spec-worker-sol-high` / `gpt-6.1-sol` / `high`，全新干净上下文，单任务执行。运行工具未提供独立的 model/effort 元数据。
- V08B 配置：新的 `spec-worker-sol-high` / `gpt-6.1-sol` / `high` 专用 worker，运行 model/effort 元数据未提供。B 结束后再派发新的同配置 V08A 纠正 worker，保持单实施 worker 串行。
- 主 agent 维护契约、任务验收、截图复核和本地提交。现有 `.gitignore` 与两处原型 `.DS_Store` 改动保留。
- 根工作流校验器通过，识别 12 张 T 系列卡；额外结构核对覆盖 8 张 V 系列卡及 V08A–V08F 串行依赖。

## 命令和结果

### V08A

| 命令 | 结果 |
| --- | --- |
| `pnpm typecheck` | 首次 exit2，测试构造缺显式题材键；修正后 exit0 |
| `pnpm lint` | exit0 |
| `pnpm test` | 487/487，13 文件，无跳过，exit0 |
| `pnpm build` | exit0 |
| `TZ=UTC pnpm exec vitest run tests/unit/interpret.test.ts` | 93/93，exit0 |
| 主 agent：`pnpm exec vitest run tests/unit/interpret.test.ts tests/unit/schemas.test.ts` | 107/107，exit0 |
| `git diff --check` | exit0 |

主 agent 已逐条审读五场景的当前小时与 12 时共 10 组短句，核对太阳边界、推荐排除 D0、风险优先及缺失状态。`wind.short` 在阵风/气温/湿度全部缺失时允许空字符串；其他新增文字均必填。

### V08B 固定数据与展示验证

四件器材直接消费解释层；SSR 也输出选中小时标签与短句。旧光线/阶段映射已删除，保留单测所用的数字读取工具。`aria-live` 与原型动作钩子保留，拨针读屏标签采用小时、天色、光线。

| 命令 | worker 最终结果 |
| --- | --- |
| `pnpm typecheck` | exit0 |
| `pnpm lint` | exit0 |
| `pnpm test` | 489/489，无跳过，exit0 |
| `pnpm build` | exit0 |
| `HIKARI_SOURCE_MODE=fixture NODE_OPTIONS='--import=./tests/fixtures/briefing-browser-preload.mjs' pnpm test:e2e` | 54/54，0 跳过，exit0，41.4 秒 |
| `git diff --check` | exit0 |

浏览器新增检查遍历 24 小时，逐项核对四件器材、选时文字、指针、2–3 句与读屏标签；覆盖长空气等级、12 级风、蓝调长句及 ready/其他状态。首轮人工截图发现记录卡底部出处超出约 2px，已收紧留白并补整卡及底部内边距断言；显示窗取消 `overflow:hidden`。既有正反折叠、入包、翻页和详情焦点套件全部通过。

主 agent 的首轮实时采集完成 18 组 LCD/读数检查，桌面报纸 1120×760。上海某次 SSR 上游缺天气，而随后独立 API 已恢复，最终截图采集改为观察页面真实刷新响应并逐句核对同一简报后拍摄。

### 实时短句复核发现

主 agent 于北京时间 02:27 通过正式同源 API 核对两地当日预报：均为 HTTP200/partial，GFS 与 CAMS 可用，MET 关闭。上海 12/18/22 时天气码提示毛毛雨、小时雨量为 0，首句出现“毛毛雨，无雨”；乌鲁木齐 0 时平均风 2 级、阵风 3 级，第二句仍只解释平均风。V08A 重新打开，以新的专用 worker 补边界用例和文字选择；B 前端继续直接消费解释结果。源响应仅存 /tmp。纠正已验收：降水天气与零雨量首句保留天气类型；已知较强阵风优先用于解释影响。

### V08A 实时纠正与主 agent 最终复验

| 命令 | 结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/interpret.test.ts -t 'keeps precipitation code\|wind impact for average\|keeps the light effect'` | 修前13失败、9通过、93按筛选未运行，复现降水型天气与较强阵风问题 |
| `pnpm exec vitest run tests/unit/interpret.test.ts --update` | 修后116/116，新增两地4组短句快照，原五场景不变 |
| `pnpm typecheck` | 首次新增快照天气码类型扩宽导致exit2；加 `as const` 后exit0 |
| `pnpm lint` | exit0 |
| `pnpm test` | 512/512，0跳过，exit0；主 agent 独立重跑同结果 |
| `pnpm build` | exit0 |
| `TZ=UTC pnpm exec vitest run tests/unit/interpret.test.ts` | 116/116，exit0 |
| 主 agent：`HIKARI_SOURCE_MODE=fixture NODE_OPTIONS='--import=./tests/fixtures/briefing-browser-preload.mjs' pnpm test:e2e` | 54/54，0跳过，exit0，40.3秒 |

主 agent 已读完原五场景当前小时/12时共10组短句，以及新增两地4组短句。新增测试覆盖9种降水码、缺阵风/缺平均风、较弱/同级阵风与风力较小的边界。

## 第一轮实际截图

北京时间 02:43:24–02:43:48，`pnpm dev` 实时模式下，上海 `geonames:1796236` 和乌鲁木齐 `geonames:1529102`：

- 桌面1440×900、手机390×844、减少动效390×844；每种视口检查12时、日落所在小时（上海17时、乌鲁木齐19时）和22时，共18组。主 agent 已逐张查看。
- 每次通过页面真实刷新响应取得同一份简报，逐句核对渲染结果后截图；均HTTP200/partial、无人工演示标记，GFS/CAMS可用，MET关闭。
- LCD及整张记录卡的scroll/client、出处底部、2–3句、禁用词均通过；字号和物件外框按既定尺寸。桌面报纸1120×760，满足1120×760上限。
- 读屏标签如“12 时，毛毛雨，柔光”“19 时，毛毛雨，黄金时刻”“22 时，雪，天黑”；指针与所选小时同步。
- 截图为 `/tmp/hikari-v08-gate1/{shanghai,urumqi}-{desktop,mobile,reduced}-{day,sunset,night}.png`；同目录 `results.json` 保存逐项几何和文字证据，城市简报JSON仅存 /tmp。
- 3200开发服务已按计划以SIGINT（Ctrl-C信号）停止，端口关闭；Playwright自管3100服务随套件结束关闭。

用户已回复“继续后续步骤”，第一轮截图复核通过；后续器材详情、明细表与手册的验收见下文。

## 验证范围与阶段边界

- 两处用户截图复核均已完成；各卡实际结果按上表及下文记录。
- 截图矩阵覆盖上海与乌鲁木齐，1440×900、390×844和减少动效；器材白天/日落前后/夜间、四详情、24小时表和三题材印刷页分阶段采集，已成功的内容复用。
- VoiceOver/NVDA 人工实测按计划另行安排；本阶段检查语义结构、读屏标签与文字标记。


## V08C 四种器材详情验收

- 新增 hours[].devices 的四种纯函数解释、对应严格schema和独立器材详情；每种只展示本器材字段、拍摄含义、24格走势与出处入口。
- 从详情进入出处时保留最初的器材焦点入口，避免重绘后归焦目标被移除。
- 太阳空事件的白话进入direction.notices，内部事件名与原始solar.notes移交V08D出处技术区。
- 首轮typecheck因测试中的天气码枚举类型扩宽失败，改用显式null字面量后通过；首轮全量530/530与构建通过。
- 主agent审查追加小正能见度、降水型天气与零累计量、天色已显示总云时的双异常边界；修正后定向159/159通过，最终全量检查通过。


| 精确命令 | 最终结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/interpret.test.ts tests/unit/prototype-adapter.test.ts` | worker和主agent各159/159，exit0 |
| `pnpm typecheck` | exit0 |
| `pnpm lint` | exit0 |
| `pnpm test` | 546/546，13文件，exit0 |
| `pnpm build` | exit0 |
| `HIKARI_SOURCE_MODE=fixture NODE_OPTIONS='--import=./tests/fixtures/briefing-browser-preload.mjs' pnpm test:e2e` | 57/57，0跳过，42.1秒，exit0 |
| `git diff --check` | exit0 |

主agent独立查看 `/tmp/hikari-v02-recovery/{wide,narrow}-v08c-{wind,direction,light,weather}-{readings,trend}.png` 中的8张读数/走势截图，确认四种字段、白话、图形、指针与出处可读，弹窗可正常滚动。worker另验证三模式共24张截图。四详情的全部新增文字已纳入解释层禁用词单测。配置为新的spec-worker-sol-high / gpt-6.1-sol / high，工具未提供独立运行模型/effort元数据；3100随套件关闭，3200尚未重启。两地实时详情截图在V08D后合并验收。

## V08D 明细表与出处验收

- 八列24行直接渲染解释层的label、detail和marks。当前小时以显式now确定；拨针选中12时，09时仍显示「现在」。非D0推荐按正长度重叠标明题材，风险只翻译既有代码，不增加评分或阈值。
- 列头scope=col，小时scope=row；现在、好时段、风险均有文字。逐小时更多保留白话，完整hourHtml/field与太阳原始notes集中在sources技术区；无脚本只保留一份24小时原始表。
- 手机可聚焦横滑容器为310px，表宽700px，键盘方向键可滚动；首列x始终40px。桌面容器与表均738px，八列完整显示，纵向沿用弹窗滚动。已过行正文对比度5.6878:1。
- D配置为全新spec-worker-sol-high / gpt-6.1-sol / high专用worker，与C串行；运行工具未提供独立model/effort元数据。worker最终交接遭额度中断，以下最终命令、diff审查与验收均由主agent独立完成。

| 精确命令 | 主agent结果 |
| --- | --- |
| `pnpm typecheck` | exit0 |
| `pnpm lint` | exit0 |
| `pnpm test` | 553/553，13文件，0跳过，exit0 |
| `pnpm build` | exit0 |
| `TZ=UTC pnpm exec vitest run tests/unit/interpret.test.ts tests/unit/prototype-adapter.test.ts` | 166/166，exit0 |
| `HIKARI_SOURCE_MODE=fixture NODE_OPTIONS='--import=./tests/fixtures/briefing-browser-preload.mjs' pnpm test:e2e` | 首次59通过/1失败，0跳过，53.0秒，exit1；完整复跑60/60，0跳过，44.1秒，exit0 |
| `node /tmp/hikari-v08-capture-details.cjs` | 24个实时详情、6张实时表的检查通过，exit0 |
| `python3 /Users/jay/.codex/skills/orchestrate-spec-driven-development/scripts/validate_workflow.py --repo /Users/jay/Desktop/SE/课题/HikariDaily` | 12张T卡结构通过；额外Python检查8张V卡的依赖与完成证据通过 |
| 本地文档链接与 `git diff --check` | 82个本地链接全部存在，diff无空白错误 |

首次浏览器失败位于既有宽屏地点搜索：`/api/locations?q=同名`返回503/LOCATION_UNAVAILABLE，结果列表为0。失败trace和页面快照保存在`/tmp/hikari-v08-e2e-search-failure/`。无代码变更完整复跑后通过；未修改地点服务或测试等待条件。

## 第二轮实际截图

- 北京时间2026-10-24 09:46:42–09:47:19，实时模式开发服务在3200运行。上海`geonames:1796236`与乌鲁木齐`geonames:1529102`，分别覆盖1440×900、390×844、390×844减少动效。
- 每份实际页面刷新响应均HTTP200/partial，GFS/CAMS可用，MET禁用，未使用人工数据。截图与同一份响应核对，避免独立请求状态不同。
- 每种视口分别打开四详情的读数、含义和走势，共72张；检查24格、字段隔离、无水平溢出、禁用词和关闭归焦。每个表检查24行/8列/scope/当前小时、无原始字段泄漏及手机sticky首列。
- 主agent已查看24张读数截图、两地手机四种走势共8张及8张桌面/手机/减少动效明细截图；字体、单位、光线时刻、相关字段、走势指针和出处入口可读，表格标题及列没有溢出。
- 证据位于`/tmp/hikari-v08-gate2/`：`{shanghai,urumqi}-{desktop,mobile,reduced}-{wind,direction,light,weather}-{readings,meaning,trend}.png`、`*-hours-{left,right}.png`及`results.json`；真实简报JSON仅存/tmp。桌面无right副本，手机/减少动效各保留横滑末端。
- 3200已以Ctrl-C停止，3100随Playwright关闭；第二轮截图备齐，等待用户过目后继续V08E。

本轮schema仍为2，新增已批准的devices和marks解释字段；规则版本、服务端来源获取、API路径、依赖和环境配置保持现状。V08E/F的手册、全局状态与最终扫描结果见下文。

## 收尾验证策略

用户确认第二轮截图时要求重新读取并遵守`~/.codex/AGENTS.md`。主agent已读取，V08E采用L2定向检查，V08F采用L1扫描与证据审读；A–D已经成功的测试和截图复用。收尾只检查改动后的手册原文选择、状态分支、纸面边界及两地三题材内容，不重复全量测试/build或器材、详情、明细表截图。实际命令和结果按各卡记录。

## V08E 手册与残留措辞验收

- 用户确认第二轮截图后由全新`spec-worker-sol-high / gpt-6.1-sol / high`专用worker实施；工具未提供独立有效model/effort元数据。
- 手册时段标题、aria-label、空推荐when、ready/非ready页眉、空时间、overview、页脚及出处按钮统一。states仅保留在sources；顶栏保留日期/人工标签，具体数据说明继续来自报纸和器材状态区的dataNote；订阅时区保留。
- 六项印刷段落的52/44/44/45/28/28字上限未变。长的调整方向拆为两条完整句子；短风险首句优先尚未结束的风险，全量时间、数值及建议继续保留在详情。少数小时缺值只说明跳过这些时段，其他推荐保持可用。

| 精确命令 | 实际结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/interpret.test.ts tests/unit/prototype-adapter.test.ts tests/unit/photography.test.ts` | worker最终294/294，0跳过，exit0 |
| `pnpm typecheck` | worker最终exit0 |
| `pnpm exec eslint src/components/prototype-frontend/adapter.ts src/components/prototype-frontend/template.ts src/components/prototype-frontend/index.tsx src/content/advice.ts tests/unit/interpret.test.ts tests/unit/prototype-adapter.test.ts tests/unit/photography.test.ts tests/e2e/prototype-frontend.spec.ts --max-warnings=0` | worker exit0 |
| `HIKARI_SOURCE_MODE=fixture NODE_OPTIONS='--import=./tests/fixtures/briefing-browser-preload.mjs' pnpm test:e2e tests/e2e/prototype-frontend.spec.ts -g 'printed advice stays\|manual stays anchored\|no-script reading'` | worker9/9，0跳过，12.0秒，exit0 |
| `V08_FINAL=1 pnpm exec vitest run tests/unit/v08-copy-stat.test.ts` | 临时统计1/1，exit0；脚本已删除 |
| 主agent：`pnpm exec vitest run tests/unit/interpret.test.ts tests/unit/prototype-adapter.test.ts tests/unit/photography.test.ts -t 'skips isolated\|prints an upcoming\|V08E printed\|fits timing'` | 5/5，289项按筛选未执行，exit0 |
| `git diff --check` | exit0 |

失败与纠正：首轮定向292通过/1失败，旧条件词断言需要保留条件语义，修后通过；首轮typecheck因临时统计构造缺Briefing字段失败，补全后以及删脚本后均通过。首次手机locator长图出现导航隐藏超时、空白或固定顶栏叠入，改用上下两个真实视口帧，保留成功桌面图并移除无效图。主agent审查追加孤立缺值与未来风险优先两项边界，纠正后各有直接回归。

### 手册字数与实况证据

五个既有场景和上海/乌鲁木齐共21题材×6字段，126/126段显示原文，100%，无超限。最大长度依次为timing43/52、light26/44、opportunity35/44、film35/45、limitation21/28、alternative22/28。统计结果为`/tmp/hikari-v08-manual-final/copy-summary.json`与`copy-statistics.json`。

北京时间10:11:10–10:14:34，上海与乌鲁木齐分别覆盖1440×900、390×844、390×844减少动效，三题材共18组。每组使用页面正式同源刷新响应核对原文，均HTTP200/partial、GFS/CAMS可用、MET禁用；36张纸边界、纸内不滚动、18次document.body.innerText可见禁用词检查通过。6张桌面图、手机/减少动效上下各一帧共24张在`/tmp/hikari-v08-manual-final/`，完整事实与几何见`results.json`。worker查看全部组，主agent查看3张桌面、3张手机和1张减少动效代表帧；不再重复采集已成功的A–D截图。

主agent确认临时统计测试已删除、3100/3200均无监听；本轮未跑全量测试/build。修改限于4个内容/渲染源码及直接相关测试；CSS、runtime、评分规则、公开schema/API、服务端获取、依赖和环境保持现状，无迁移。

## V08F 最终扫描与交接

- 配置为新的`spec-worker-sol-medium / gpt-6.1-sol / medium`专用worker；与E串行，工具未提供独立运行model/effort元数据。只修改三个既有测试文件的扫描与断言。
- 解释层五场景全文、24小时器材LCD与读数、四种详情、小时表、三题材印刷页均纳入扫描，sources原始技术区排除。用户点名句式与计划禁用词统一检查，出处保留US_EPA审计断言。首次交接的较窄句式匹配由主agent指出，同ID纠正后覆盖完整措辞；小时表独立于选中小时，只扫描一次。
- E2E只补既有断言与手册`body.innerText`检查，本卡未运行；实际可见文字证据复用E的18次扫描。A–D器材、详情、明细、报纸尺寸与动作证据保持，E的18组手册、36纸边界与126/126段原文复用。
- 主agent及worker均审读五场景当前/12时共10组短句、两地历史输入4组快照，未修改这些快照。只读证据核对首次因手机截图路径为数组产生TypeError，纠正核对脚本后通过，无产品修改。

| 精确命令 | 实际结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/interpret.test.ts tests/unit/prototype-adapter.test.ts` | worker最终169/169，0跳过，exit0 |
| `pnpm exec eslint tests/unit/interpret.test.ts tests/unit/prototype-adapter.test.ts tests/e2e/prototype-frontend.spec.ts --max-warnings=0` | worker exit0 |
| `git diff --check` | worker及主agent exit0 |

本卡按L1停止于充分证据，未执行全量测试、typecheck、build、浏览器、E2E或截图。主agent静态扫描`src/`确认用户点名句式无匹配；已收敛任务/进度/两条决策与数据目录。A–F的接口变化只包括前述schema2的解释字段；评分、阈值、合并、reasonCodes及服务端边界保持现状。所有临时简报、统计与图像留在/tmp，统计测试已删除，服务已关闭，T12保持未启动。

最终文档校验：工作流校验器12张T卡通过，额外8张V卡依赖/完成证据通过；87个本地链接全部存在，`git diff --check`通过。3100/3200关闭状态与临时统计测试删除状态再次确认。
