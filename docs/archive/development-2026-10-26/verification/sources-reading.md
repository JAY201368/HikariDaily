# 来源说明阅读页调整（2026-10-25）

## 范围与取舍

- 来源详情改为本次简报、缺失与使用提醒、各来源状态和次级参考四层。生成、获取、上游发布时间分别说明；缓存保留原获取时刻，太阳计算单独标识。
- 直接显示已有缺失说明与一条人工数据提示。完整来源诊断去重后折叠，模型、分辨率、编号、有效范围可展开；太阳备注、署名许可与24小时原始字段完整保留。
- 暖白阅读纸沿用原详情容器；新增样式限定来源页，标签对齐，来源状态具有文字标识，小屏自然换行。
- 不改上游获取、解释规则、数据契约、依赖、环境或其他物件交互。

## 验证

- 主会话 `pnpm typecheck`、`git diff --check` 通过。
- worker `pnpm exec vitest run tests/unit/prototype-adapter.test.ts`：25/25 通过；第一次旧结构断言因新增 article 外层失败，已同步该断言。
- `HIKARI_SOURCE_MODE=fixture NODE_OPTIONS='--import=./tests/fixtures/briefing-browser-preload.mjs' pnpm test:e2e tests/e2e/sources-detail.spec.ts`：最终 wide / narrow / reduced-motion 3/3 通过，5.7 秒，0 跳过。
- 改动 TypeScript 文件定向 ESLint 通过。
- 主会话审查桌面首屏、手机首屏与手机展开来源详情截图，确认层次、人工提示去重与长文本换行。截图保存在临时目录 `/tmp/hikari-sources-review/`，不提交。
- 定向测试及失败纠正见下方最终记录；未运行全量测试或生产构建。人工 fixture 只验证展示与交互，不能作为实时数据验证。

## 已知验证边界

首轮浏览器测试遇到嵌套 summary 选择器歧义，改为直属 summary。宽屏页脚鼠标入口被既有场景覆盖；尝试旧器材入口时发现其已移除。最终测试使用页脚入口的键盘 focus / Enter，验证详情内容、折叠与 Escape 归焦；未宣称页脚鼠标入口通过，也未扩展修改场景行为。

由一个 worker 实现局部展示与定向用例，主会话负责审查、类型检查与本地提交。worker 继承本会话配置，未提供可核实的运行模型元数据。
