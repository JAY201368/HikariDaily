# 来源数据表与依据详情验收（2026-10-25）

## 范围与交付

用户授权按聊天 01a17140-9323-7003-9eeb-429ed16ce108 的方案直接在主对话执行，每阶段本地提交；未派 worker。

- ① `8ea870a`：16 项字段登记、五组阅读表、标准化单位与时间口径。
- ② `e466d71`：同份 Briefing 派生连续异常、来源变化、筛选行和表格值。
- ③ `c8dd385`：分组表、单项完整依据、来源比较、无脚本完整附录。
- ④ `f9b91d2`：替换长展开入口；分组、筛选、所选小时定位、同容器返回及响应式样式。
- ⑤ 本记录所在提交：定向验收、来源概览语义比较表、手机卡片、表头与关闭栏保持可见、页脚遮挡修复及旧断言迁移。

来源概览保留生成时间、数据获取、上游发布、适用范围与诊断；逐项异常不受整体 ready 状态隐藏。连续异常只合并同指标、同 state、完全相同原因，正常小时和原因变化均断开。自由文字和 alternatives 不用于另判分歧。

数值表每小时一行，16 项指标按温湿降水、风况、云量能见度、空气分组；太阳与光线独立一组。表内能见度 km、太阳角度一位小数；单项详情保留完整标准化精度。仅异常筛选针对结构化 metric state；太阳组筛选未知光线或风险小时。查看数据不改变仪表所选小时。

同一个 dialog 内查看、返回；返回恢复分组、筛选、横向位置、纵向位置与原单元格焦点，分组间保存阅读位置。关闭和 Escape 回到原入口。状态属于当前 mount 的同一份 Briefing，重新挂载后清空，不拼接新旧数据。无新增路由、历史项或额外弹窗。

无脚本顺序显示五组完整表与 24 小时原生折叠依据附录，16 项详情、光线原因/限制及风险时间/来源均保留。动态文本转义，缺少来源记录时保留编号。

## 实际检查

L2，未执行全量测试或 build；不涉及数据源、规则、API、环境变量或依赖变更。

```sh
pnpm exec vitest run tests/unit/prototype-adapter.test.ts tests/unit/sources-view.test.ts
pnpm typecheck
pnpm exec eslint src/components/prototype-frontend/{adapter,runtime,sources-view}.ts tests/unit/{sources-view,prototype-adapter}.test.ts tests/e2e/{sources-detail,prototype-frontend}.spec.ts --max-warnings 0
git diff --check
```

最终单元 31/31、typecheck、定向 lint（零警告）、diff 检查通过。单元覆盖完整字段、非变异、异常区间、ready 局部缺失、真实零值/null、旧值、分歧、来源变化、完整精度/备注/对比值、缺记录、动态文字转义、太阳与风险依据。

浏览器均显式人工 fixture，统一前缀：

```sh
HIKARI_SOURCE_MODE=fixture NODE_OPTIONS='--import=./tests/fixtures/briefing-browser-preload.mjs' pnpm test:e2e
```

- `tests/e2e/sources-detail.spec.ts`：初次 3/3，最终结构及固定表头/关闭栏调整后再验 3/3（5.5 秒），宽 1440×1000、窄 390×844、减少动效 390×844。
- `tests/e2e/sources-detail.spec.ts tests/e2e/prototype-frontend.spec.ts --grep 'source tables|sources, metric|no-script reading|partial|unavailable'`：初次 8/12；其中缺失/分歧/旧数据/全部不可用和无脚本两项 × 三视口共 6/6 通过。
- 对失败相关的 `--grep 'source tables|sources, metric'` 修正后 6/6（8.4 秒）；最后仅因来源概览表结构、表头/关闭栏调整，定向复跑 sources-detail 的 3/3。未重新跑已经通过的异常和无脚本用例。

实际验证鼠标报纸/页脚入口、键盘进入数值详情、返回焦点与横向位置、分组/筛选/定位、手机只在表内横滑且首列位置不变、dialog 无横溢出、表头随 dialog 纵向阅读保持可见、太阳风险依据、关闭归焦。保存于 `/tmp/hikari-sources-tables/` 的三视口截图未入 Git；主对话审查桌面/手机概览与表、手机依据详情。

## 失败与纠正

- 字段清单初次 lint 有未使用 Briefing import 警告；第二阶段实际使用后最终定向 lint 零警告。
- 初次模型测试错误地假设 syntheticBriefing 默认有有效温度；该 fixture 实际全缺失。显式建立正常小时后测试通过。初次 typecheck 指出 light 无 status 字段，改用已有 character。
- 旧 adapter 测试要求比较值直接出现在概览；迁移到单项依据及无脚本完整保真断言。
- 旧浏览器断言寻找当前器材详情不存在的来源按钮；改为当前单控制项的 Tab 与 Escape 归焦断言。
- 桌面页脚来源入口被 stage 拦截，trace 留于忽略目录；给实际页脚建立正常层级并取消纯装饰提示的指针事件。修正后真实鼠标路径通过。

## 边界

人工数据只证明展示与交互。未检查真实上游覆盖、数据准确性、公开素材权利、生产平台或实体手机；T12 未启动。未 push、部署或发布。原有 `.gitignore`、`prototype/.DS_Store`、`prototype/review/.DS_Store` 修改保留，不入本次提交。

## 用户收口调整（2026-10-25）

用户指定截图底部只留“署名与使用许可”并直接展示。已删除该块的时间口径/空气说明、太阳备注、24 小时表入口及说明文字，署名正文与许可链接保留。上方异常提醒的对应数据入口和无脚本附录不在截图指定范围。相应断言同步调整。

本次属 L0 展示内容删除：审查差异、adapter 定向单元 25/25、`git diff --check` 通过；未运行浏览器、截图、构建或全量测试。浏览器测试源码已按新入口更新，本次未执行。

## 来源名弹窗调整（2026-10-25）

按用户截图指令，来源比较表删除“上游发布”和“详情”列，只保留来源/数据集、类型、状态、数据获取。来源名为真实按钮，点击在独立原生 dialog 展示完整来源元数据，避免窄列展开长文。上游发布时间仅保留在完整元数据详情。关闭按钮、Escape、遮罩外点击返回父来源说明；恢复原来源按钮焦点和列表位置；键盘 Tab 在弹窗内循环。销毁时关闭弹窗，防止地点/数据更新留下旧窗口。无脚本完整来源记录追加于静态附录。

L2 定向验证：

- `pnpm exec vitest run tests/unit/prototype-adapter.test.ts tests/unit/sources-view.test.ts`：最终 31/31。旧元数据概览断言迁至详情；纠正编辑时误改的八列小时表断言。
- `pnpm typecheck`：通过。
- `pnpm exec eslint src/components/prototype-frontend/{adapter,sources-view,runtime,template}.ts tests/unit/prototype-adapter.test.ts tests/e2e/sources-detail.spec.ts --max-warnings 0`：通过，零警告。
- `HIKARI_SOURCE_MODE=fixture NODE_OPTIONS='--import=./tests/fixtures/briefing-browser-preload.mjs' pnpm test:e2e tests/e2e/sources-detail.spec.ts --grep 'source-name popup'`：首次详情将模型/分辨率合写，与“原生分辨率”独立字段断言不符；拆为单独标签后最终宽/窄/减少动效 3/3，6.5 秒。逐一打开每个来源验证完整模型、数据集、来源编号、适用时段、键盘焦点循环、按钮/Escape 关闭与父列表滚动恢复，弹窗无横向溢出。
- 主对话审查 `/tmp/hikari-source-popup/wide.png`、`narrow.png`，图片不入 Git。
- 差异审查与 `git diff --check` 通过。未跑全套/build，未验证真实上游或部署。原有三项工作区修改不入提交。

## 来源页顺序与提醒调整（2026-10-25）

按用户截图删除“这些信息从哪里来”，顺序改为本次简报 → 各来源的状态 → 缺失与使用提醒 → 署名与使用许可。提醒去除左侧竖线与缩进；来源诊断改为标题加完整去重列表，直接展示，不使用展开控件。

L0：差异审查、`git diff --check`、`pnpm exec vitest run tests/unit/prototype-adapter.test.ts` 最终 25/25 通过。旧测试中仅存在于删除区的“模型预报/摄影建议”文字断言同步替换；首次旧断言失败后修正。未运行浏览器、截图、构建或全套。用户原有三项工作区修改保留。

## 页眉自然滚出（2026-10-25）

用户指出页眉吸顶时上方透出正文，并要求随内容自然滑走。移除来源说明与来源详情弹窗 `.dialog-top` 的 sticky/top/z-index/background 覆盖，回到正常文档流；数据表列标题定位改以 dialog 顶边为参照，不再依赖滚走的弹窗页眉。

L1 定向验证：`pnpm exec eslint src/components/prototype-frontend/runtime.ts tests/e2e/sources-detail.spec.ts --max-warnings 0`、`git diff --check` 通过。显式 fixture 的 `pnpm test:e2e tests/e2e/sources-detail.spec.ts --grep 'source-name popup'` 三项目 3/3 通过（6.2 秒）；使用各项目原宽度、520px 高度确保弹窗有真实滚动，断言主来源页眉/子弹窗页眉为 static，屏幕位移等于实际滚动距离（误差 <1px），同时保留原焦点/关闭/返回检查。未跑全套、build 或额外截图复核；fixture 不证明真实上游。原有三项无关修改保留。

## 删除两段说明与滚动条外观（2026-10-25）

按用户框选删除标题下导读及“本次简报”下地点粒度/模型格网说明。来源页复用现有隐藏滚动条样式（scrollbar-width 与 WebKit scrollbar），仅隐藏右侧外观，不改变 overflow、滚轮、触摸或键盘滚动。L0：审查源码差异、`git diff --check` 通过；未运行测试、浏览器或构建。原有三项无关修改保留。

## 弹窗页眉分类与建议滚动条（2026-10-25）

完整外拍建议弹窗复用隐藏滚动条样式，保留内容滚动。主详情页眉按当前类型显示风光/人像/街拍建议、天气概览、数据与出处、晚霞判断、24 小时明细及四种器材说明；不再通用显示“读数说明”。来源表格与指标/光线依据切换时同步修改页眉，返回时恢复对应页眉，独立来源/小时弹窗继续使用已有专属名称。

L1：差异审查、`pnpm typecheck`、`pnpm exec eslint src/components/prototype-frontend/runtime.ts src/components/prototype-frontend/template.ts --max-warnings 0` 与 `git diff --check` 通过。未运行浏览器、截图、全量测试或 build。原有三项无关修改保留。
