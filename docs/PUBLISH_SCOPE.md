# GitHub 发布产物范围

本仓库包含 2026-11-16 的可用原型源码快照、图文 README 与交互展示。展示页通过 GitHub Pages 发布，使用明确标注的固定天气和计划样例。完整应用的天气获取、账户与同步功能按开发文档配置后运行。

## 纳入

- `README.md`、`public/showcase/`、`src/app/showcase/`、`src/components/showcase/`、`src/content/showcase/` 与 `.github/workflows/showcase-pages.yml` 承载展示与发布。
- 正式网页：`src/`、`public/`、`scripts/` 及依赖锁文件和构建配置。
- 独立离线视觉原型：`prototype/` 中的页面、脚本、运行所需素材和素材出处。
- 当前产品与开发文档：`requirement.md`、`spec.md`、`docs/`、已有说明文件和仓库协作规则。
- 单元、契约、端到端测试及显式人工数据：`tests/` 和测试配置。
- 仅含空值或示例值的环境变量模板：`.env.example`。

## 不纳入

- 原型过程截图和验证输出：`prototype/review/`。
- 本机参考资料、真实环境变量、密钥、数据库及备份：`temp/`、`.env*`（`.env.example` 除外）。
- 依赖安装、构建缓存、覆盖率和浏览器测试输出：`node_modules/`、`.next*/`、`out/`、`coverage/`、`test-results/`、`playwright-report/`。
- 本地开发分支的历史提交；本快照从独立初始提交开始，避免将已排除的历史截图带入 GitHub。

项目负责人已确认这些素材可以随公开仓库发布。现有素材出处记录仍保留，未据此宣称商业使用或第三方服务部署条件已满足。GitHub Pages 展示采用纯静态构建。完整应用的持久数据库、模型服务和天气来源用量按运行环境分别配置。
