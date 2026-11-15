# V10 数据解释层优化验证

2026-10-26。依据 [审查与操作指导](../plans/V10-interpretation-review.md)，T13–T19分别对应第0–6步，每步本地提交。合成fixture验证规则与表达一致性，不证明真实预报出现频率或气象准确率。

## 环境与范围

- 分支：`codex/prototype-frontend`；Node `v24.3.0`，pnpm `11.26.0`。无依赖、provider、缓存、数据库、环境变量或部署变更。
- 初始工作区：`.gitignore`、两处原型`.DS_Store`修改、`docs/INTERPRETATION_RULES.md`删除以及用户提供的未跟踪V10计划；无关改动不纳入提交。用户已确认解释规则文档保持删除，最后一步明确废弃并清理入口。
- T13–T18配置专属新worker `spec-worker-sol-high / gpt-6.1-sol / high`；运行时未单独提供模型/有效thinking元数据时不推断。只读A类审查由独立explorer提供，未实施产品修改。T18 worker及后续只读复核遇额度中断，主agent接续修复与验收；不以额度问题升级模型。T19计划配置 `spec-worker-sol-medium / gpt-6.1-sol / medium`，实际执行另见下文。

## 过程中的验收语义

第0步按指导先提交失败不变量。后续每步保留全部断言，中间全套测试若有后续步骤尚未修复的失败，必须按问题ID记录，不写成全部通过；最终一致性必须全部通过。快照更新先审读实际差异。第2/3步后运行显式人工fixture E2E，包含宽屏、窄屏和减少动效的固定纸面/报纸边界。

### 预审发现的规则边界（已确认，第5步落实）

- A1仅把阵风11m/s的W降到0，风光/人像/街拍仍可能≥50分；若执行原计划“该小时无好时段”验收，需在主推荐中另排除已知阵风>10.7m/s的切片，并保留allWindows条件回看。不得只隐藏小时标记而保留手册推荐。
- 风级显示先四舍五入至0.1m/s；原始值>10.7的工程门槛会略保守地包含显示仍为5级的一小段，不把两个边界宣称严格等价。
- A4甲只影响白天diffuse且总云≥90%的风光L；其他题材若仍有有效推荐，全局tone仍按所有题材决定。黄金/蓝调风光沿用原有定义。

- A2仅将冻雨D改0也不能清除advice.recommendedWindows，完整手册仍会推荐；需冻雨主推荐资格禁入，其他D0条件暂不扩改。
- A3现有片段中点有时仍在日落前，而片段末尾已在地平线下。若执行端到端验收，需在太阳高度0处切片；SunCalc日出/日落事件与几何高度0并不等价。
- B1示例“概率缺失仍建议备伞”与第2节“行动建议必须有触发数据”冲突，本轮按后者处理：无雨量/概率触发时，各处理由均如实说明缺概率，不额外给出带伞行动。

## 分步证据

### T13 / 第0步

已验收。新增15场景×3时刻矩阵450项、助手2项、具体回归80项，共532；174预期失败/358通过。原有interpret/photography/adapter共298/298通过。主agent复验四套合计830项：174失败、656通过，0跳过；JSON `/tmp/hikari-v10-step0-main.json`。

- `pnpm exec vitest run tests/unit/interpret-consistency.test.ts`：exit1，174 failed/358 passed；这是要求建立的红基线。矩阵I01=4/I02=3/I03=6/I04=3/I05=3/I06=15/I07=3/I08=26/I09=45失败，I10标题45/45通过；具体回归66失败。
- `pnpm exec vitest run tests/unit/interpret.test.ts tests/unit/photography.test.ts tests/unit/prototype-adapter.test.ts`：exit0，298/298。
- `pnpm typecheck`、`pnpm lint`、`pnpm build`最终exit0；初次typecheck的非法胶片marker已改为合法字段路径测试。`git diff --check` exit0。未运行全套test/E2E，无产品源码变化。
- B11使用显式重叠建议输入，验证各题材端点和输入不变，不依赖A3即将移除的人像硬光推荐；夜间检查排除历史小时/allWindows。
- 代表失败：中雨小时仍“适合人像”；强阵风摘要只写5级平均风；21时仍“傍晚有机会出晚霞”；AQI180导语无空气提示；冻雨tone=go；日落后人像L2。完整ID `/tmp/hikari-v10-step0-failure-ids.log`。

### T14 / 第1步

已验收。B3/B6/B14/B16/B17和B5数据说明完成。源码仅levels/verdict/index的时态参数/advice；评分/版本不动。

- `pnpm typecheck`、`pnpm lint`最终exit0；`pnpm build` exit0（最后阵风纯文字精修前），`git diff --check` exit0。
- `pnpm test --reporter=json --outputFile=/tmp/hikari-v10-step1-test-final.json`：最后阵风精修前exit1，1168项1042过/126失败/0pending；124为后续一致性，另外2项SSR/503陈旧展示词断言在HEAD409fc27独立副本复现19/21。这2项由T15校正语义断言，不属本步引入。
- 精修后5套相关命令（interpret、consistency、data-truth、photography、adapter）：901项777过/124后续失败，0pending。interpret150、photography125、adapter25、T14新增69全部通过；532一致性408过，修复50项且失败为原基线子集。
- 主agent审读全部源码/快照差异，独立 `pnpm exec vitest run tests/unit/interpret-data-truth.test.ts --reporter=json --outputFile=/tmp/hikari-v10-step1-main.json`：exit0，69/69。
- 初次8项旧词/快照差异经逐行审读修正；快照只变晴/少云、厚云句与夜间雨量事实兜底。第一次B17兜底误将已知trace写缺失，主agent指出后新增trace/高概率零雨量边界并修正。阵风文字精修后只复验类型/lint/相关测试，未再跑full/build；没有把此前全套数写成最终全套数。
- 低能见度需湿度/天气码支持才称雾；均风缺失保留未知且另说已知阵风。全部日志和剩余失败ID见 `/tmp/hikari-v10-step1-handoff.md`；未跑浏览器/真实上游。

### T15 / 第2步

已验收B1/B2/B4/B5/B7/B8/B11/B13/B15。主agent审读源码/快照/不变量提取diff及旧E2E的具体失败路径，独立65/65（44新增+21契约）。

- `pnpm typecheck`、`pnpm lint`、`pnpm build`、`git diff --check`最终exit0。
- `pnpm test`最终1215项1149过/66失败：I09/B12=42、I06/B9=15、I01/A2=2；具体B9/B10/B12各1、A2两项、A3两项。修58项，无新增后续失败。相关4套284/284，含本步44回归。
- 新15场景@09×三视口：实际标题<=28且严格匹配，报纸横向溢出、六页边界/页脚/固定纸面与完整建议检查均过，无新截图。
- 显式fixture `pnpm test:e2e`首轮120项：94过、22失败、4个既有desktop-only跳过。15新wide为测试错误假设纸面610（实际正文598+边12=壳610）；1次旧地点503；旧设备用例等已移除的inline来源入口3项，旧sources用例的route未触发refresh/信封缺error:null导致SSR未用注入样例3项。生产adapter/sources-view/runtime在此步无diff，旧假设以源码/SSR路径和HEAD一致证据确认。
- 保留语义断言并仅修测试测量/真实来源入口/fixture准备后，`pnpm test:e2e --grep 'V10 .*paper and complete advice|no location has no fake weather|four dedicated details|source tables, evidence'`：54/54，exit0。最后B5缺码题材行改变，另跑新套件`--grep 'V10 missing-code@09'`：3/3，exit0。复用全套其余成功证据，不声称完整120项一次全绿。既有4个跳过未变，新套件0跳过。
- 主审补出20分钟端点差、备用源危险+柔光矛盾、单雪小时被写小雨、雪↔雨同强度转换、unknown缺口连续性；全部补定向测试并修正。最后B5点名本题材必需字段，when用“暂时排不出”。原532断言正文与15场景输入逐字保留。
- 主agent命令：`pnpm exec vitest run tests/unit/interpret-conclusion.test.ts tests/contracts/briefing-entrypoints.test.ts --reporter=json --outputFile=/tmp/hikari-v10-step2-main-final.json`：exit0，65/65。完整命令、失败和复用范围：`/tmp/hikari-v10-step2-handoff.md`；66失败ID：`/tmp/hikari-v10-step2-failure-ids-final.log`。
- 导出5mm常量仅复用既有阈值；windows只改雨雪/缺概率理由。评分/版本/来源页面/样式/服务/依赖/环境不变。

### T16 / 第3步

已验收B9/B10。晚霞使用>=日落的回看时态；当前剩余晨昏整段以既有太阳位置分辨dawn/afterglow/transition；夜间机会、调整、光线与胶片统一，未来危险/较强阵风优先，历史白天记录保留。

- `pnpm typecheck`、`pnpm lint`、`pnpm build`、`git diff --check`最终exit0；`pnpm test`最终1246项1197过/49后续失败（42 I09/B12、1 B12、2 I01/A2、2 A2、2 A3）。新增temporal31/31；原532为483过/49红，未放宽。
- 主agent审读全部源码/最小location调用链/快照，独立 `pnpm exec vitest run tests/unit/interpret-temporal.test.ts --reporter=json --outputFile=/tmp/hikari-v10-step3-main.json`：exit0，31/31。原B10只补显式solar/now/location输入，断言预期不变。
- 显式fixture全套 `pnpm test:e2e`：exit0，206过/4既有desktop-only跳过（narrow/reduced各两项桌面翻面落平/纸厚检查）；新15×05/09/21×三项目135 DOM全过。
- 主审补已知eveningBlue.end不能被小时中点night提前覆盖；dawn不把几何0等同日出事件。精修前后45份完整Briefing比较：44完全相同，只有missing-code@21三题材when变化，未声称全等；该项最后额外三视口3/3过，复用其余成功证据。
- 新31覆盖日出前/日落后、跨越两方向晨昏、now裁剪、set±1ms、夜间各危险/过去危险、gust11、混合题材gloss、星历及光线都未知、已知端点20:05/20:20等。初次Metric测试类型、AQI fixture漏riskInputs、createPeriods多参、晨间过早done等失败经修正，未删除断言；3处快照逐行审读更新。
- 具体命令/失败/复用范围：`/tmp/hikari-v10-step3-handoff.md`；49失败ID：`/tmp/hikari-v10-step3-failure-ids-final.log`。无评分/切片/阈值/版本/schema/服务/依赖/环境变更。

### T17 / 第4步

已验收B12/C1/C2及C3相关措辞。SUNSET_WORDS统一五级/unknown的前瞻、回看、行动；HAZARD_WORDS仅纯文案，sleet不是公开风险码。小时按已表达code去重并保留所有其他风险，日落风险覆盖到位邀请，空气与能见度分开。

- 精修前 `pnpm test`：1284项1278过/6失败，均为A2/A3（I01冻雨两项、A2 tone两项、A3两项）；`pnpm build` exit0。43个B12红项消除，原532文件未改。
- 最终 `pnpm typecheck`、`pnpm lint`、`git diff --check` exit0；wording38+temporal31共69/69。主agent独立wording38/38（`/tmp/hikari-v10-step4-main-final.json`），审读词表、消费者、风险结构和快照。
- 初次306项的快照/精确词和新测试输入等4项差异逐一处理；194项初轮新测试重复子串计数/过宽预算前提修正，保留原摄影遮云因果断言，未放宽原532。1份快照逐行审读后定向-u，interpret150/150。
- 初次与T16 HEAD的45场景比较810字段完全相同，但发现62个光线字段原49字超过44预算，导致新晨昏解释落入手册详情入口。主agent要求收短过渡句并恢复完整预算断言：句37→22字、带区间49→34。最终99字段变短（62 light、37 opportunity），810/810全部符合预算，超预算0；45场景所有非文案规则payload仍相同。比较中误猜仅62变化已纠正，最终统计未声称字段全等。
- 此最后短句精修实际改变印刷内容，因此仅补 `pnpm test:e2e tests/e2e/interpretation-v10.spec.ts --grep 'V10 clear@05'`（显式fixture/preload）三视口3/3，并断言三题材实际印出完整光线句；其余T16成功DOM复用，未重跑135或最后full/build。精修后类型/lint/相关测试已验证，前述full/build明确属于精修前。
- 空气“两回事”概念检查移至devices.weather.reference保留，24个hour/detail不再重复；V2/Sunset理由不说空气通透，未排名的最好改客观效果。完整命令和限制：`/tmp/hikari-v10-step4-handoff.md`；最终对照 `/tmp/hikari-v10-step4-output-comparison-final.json`。评分/阈值/筛选/版本/输出schema不变。

### T18 / 第5步

已验收。用户已确认A1–A3与A4甲；实施前先同步spec §6.3、ARCHITECTURE和DECISIONS，再改评分。当前 `rulesVersion=photo-rules-v0.2`，公开schemaVersion仍为既有`2`。spec/架构原残留的schemaVersion1文字同步纠正，不是本轮新增schema迁移。

| 边界/场景 | v0.1 | v0.2 |
| --- | --- | --- |
| A1，均风2.5、阵风11m/s | W2；三题材各3条主推荐 | W0；三题材主推荐均0，全天记录保留 |
| A1，阵风7.9 / 7.9001 / 10.7 / 10.7001 | W只看均风 | 阵风分量分别2/1/1/0；>10.7禁主推荐；缺阵风不补值 |
| A2，56/57/66/67，雨量0或0.3 | 仅按雨量/概率给D；冻雨可tone=go | D0、禁主推荐；未来冻雨poor并明确结冰停拍；记录保留 |
| A3，晴天正午人像 | L0仍能50分入选 | 50分记录保留，L0不入主推荐 |
| A3，真实清晨人像最佳段 | 05:55:19–06:36:23；起点高度−2.29878°，中点+1.97655° | 06:06:20–06:36:23；起点+0.000255°，中点+3.11493° |
| A3，经度119，日落后10分钟 | 跨越片段可由正高度中点保留L2 | 几何0处切片，人像L≤1且该测试时刻无主推荐；风光余晖仍L2 |
| A4甲，白天漫射、总云95%风光 | L1、80分可推荐 | L0、60分仅记录；黄金/蓝调及人像/街拍规则不变 |

修改前后差异保留：最初26条新测试在v0.1为21失败/5通过；worker最终32条在隔离的`6893783`副本复放为22失败/10通过（`/tmp/hikari-v10-step5-baseline-final.log`）。v0.2的版本/阵风/冻雨/清晨探针见`/tmp/hikari-v10-step5-probe-final.log`。主agent新增6条冻雨缺字段、日落提前到位及过时到位邀请回归，修复前38条中6失败、32通过，修复后v02+wording+temporal共107/107。

- A1取均风与可选原始阵风的较差分量；资格差异参与合并，强阵风不得借相邻同理由W0片段恢复推荐。已知风况写平均风/更强阵风等级，无“较强阵风但风不大”的理由。7.9/10.7为未校准工程初值，显示风级与原值门槛区别保留。
- A2用共享冻雨谓词，不新增RiskNote代码。冻雨与必需字段缺失同时出现，即使没有评分窗口，仍优先结冰停拍，取消树荫、倒影等户外邀请。日落行动检查包含提前20分钟到位至日落小时结束的区间，覆盖前一小时冻雨/雷雨；其他安全时段保留。已过到位时刻改为“现在留意西边的天空”。
- A3内部保留components与eligible，publicWindow显式仅输出原有公开字段，严格schema测试通过。几何0有界求根的时间包围区间≤1秒；原15分钟/2小时/50分/最多3项不变。部分小时最佳推荐句说明实际交集；T16注入dawn的严格无直射断言保留，真实推荐测试改核对新选中的较晚正高度段。
- A4甲只降低day/diffuse/总云≥90的风光L；阴天人像仍可有主推荐，因此不强制全局tone=maybe。所有D0或W0未被一概禁入，保留针对性正向回归。
- 主agent末审再复现普通小雨0.8mm仍有好时段标记，以及大部分雨量缺失却因一个已知湿小时断言“阴雨/下雪/雨雪一整天”：新增4条先失败（42项38过/4失败），再修表达。湿雨小时不打好时段标记，评分推荐与记录保留；微量雨和雪的既有区别保留。雨量不全只说明已知雨/雪/雨雪，危险汇总优先级不变。这两处不改变分数。

最终主agent验证（含末审两处表达修正）：

- `pnpm test --reporter=json --outputFile=/tmp/hikari-v10-step5-final-test.json`：exit0，**1372/1372，0pending**。原532一致性全部保留，新增45条A1矩阵及1正向控制后为**578/578**；v0.2专项**42/42**。15场景×3时刻的标题≤28及**810/810**印刷字段预算全部通过。
- `pnpm typecheck`、`pnpm lint`、`pnpm build`、`git diff --check`均exit0；日志`/tmp/hikari-v10-step5-final-{typecheck,lint,build}.log`。build在浏览器/类型生成工作结束后运行，未调用真实天气上游。
- worker显式fixture全E2E：200通过、6失败、4既有desktop-only跳过；135个原矩阵DOM全通过。6失败均为旧长建议/无脚本测试仍查找“今天所有可以拍的时间”，实际已改为中性记录标题。主agent仅更新这两处文字断言及空推荐标题条件，保留完整阅读/焦点/纸面断言。
- 随后运行 `HIKARI_SOURCE_MODE=fixture NODE_OPTIONS='--import=./tests/fixtures/briefing-browser-preload.mjs' pnpm test:e2e --grep 'printed advice stays|no-script reading|V10 (dry-thunder@(05|09)|freezing-(missing-cloud|arrival)@09)'`：exit0，**18/18**，涵盖上述6失败、6个受提前到位风险修正影响的原矩阵用例、6个新增冻雨边界DOM。复用全套其余通过证据，**没有声称全套一次全绿**。日志`/tmp/hikari-v10-step5-{e2e-final,main-e2e}.log`。
- 最后湿雨标记/缺雨量概括只影响原矩阵之外的输入；原15场景的雨量均完整，已有湿雨情景无推荐标记。最终全套unit/contract验证这些改动及原矩阵，复用已成功的DOM，不再重复浏览器或截图。

快照16行差异逐行审读：移除晴/大风样例的正午硬光人像推荐和相应导语/小时邀请，改选下午斜射光；厚云雨景风光从L1改L0后限制句随之改变。没有盲目放宽原一致性断言。公开schema/风险枚举、权重/正式风险阈值/晚霞数值、provider/缓存/依赖/环境未变；无真实上游或发布验证。

### T19 / 第6步

用户已确认保持删除并明确废弃：删除旧`docs/INTERPRETATION_RULES.md`，README取消旧链接并指向spec第6节和本文；数据目录§7/7a同步v0.2、推荐资格/几何0切片和雨雪/缺失/夜间表达。旧验证记录中的v0.1保留为历史，不作全局替换。

T19尝试派发全新`spec-worker-sol-medium`，工具返回`agent thread limit reached`，未实际启动；本步文档由主agent完成。末次只读审查也遇同一线程上限而未启动，不计作独立审查证据。运行文件与T18提交`46bb105`相同，复用该步测试/类型/lint/build及DOM证据，不重复浏览器或截图。一次性唤醒`automation-2`已删除，无重复安排。

本步验收：本地文档路径检查123项通过，新增spec章节锚点和废弃入口检查通过；`python3 /Users/jay/.codex/skills/orchestrate-spec-driven-development/scripts/validate_workflow.py --repo .` exit0（19任务），`git diff --check` exit0。根TASKS/PROGRESS与计划第6节验收清单同步，原有v0.1历史证据保留。

## 验收对应

| V10验收项 | 证据 |
| --- | --- |
| 原一致性不放宽并全部通过 | 原532保留；加入A1后578/578，全部0pending |
| 第3节场景复核 | 15场景×05/09/21矩阵，data-truth/conclusion/temporal/wording与v0.2专项；问题句对应断言及快照全部通过 |
| 仅第5步升版本且有前后差异 | 第0–4步提交仍v0.1；第5步46bb105含spec/DECISIONS/评分与测试差异，schema仍2 |
| 标题与手册预算、DOM | 最终45场景标题≤28、810字段预算通过；原135场景DOM及修正/新增18项的聚合证据详见T18，4个既有跳过保留 |
| 旧规则文档处理已确认 | 用户选择保持删除并明确废弃；README和当前目录已清理入口，现行规格与验证可达 |

所有结论限于本地规则/表达一致性；未push、部署或新增真实上游验证，T12仍未启动。
