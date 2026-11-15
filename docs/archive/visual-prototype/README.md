# 视觉原型开发档案

归档日期：2026-10-22。用户确认原型开发完毕，仓库进入正式网页开发准备阶段。归档前基准提交为`fc38a5e`；原型主体验收提交为`9cb9d15`（T06A）、`4ca0ff6`（T07），排版修正为`89ef898`，刊名更新为`546b6e9`。

## 档案目录

| 文档 | 历史内容 |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 离线视觉原型的模块与逐次修正契约 |
| [TASKS.md](TASKS.md) | 已完成T01–T07（含T06A）的任务卡与验收 |
| [PROGRESS.md](PROGRESS.md) | 阶段进度、代理交接、检查结果与后续排版修正 |
| [DECISIONS.md](DECISIONS.md) | 视觉取舍、用户修正与代理路由历史 |
| [PROMPT_TEMPLATE.md](PROMPT_TEMPLATE.md) | 原型任务派发模板 |
| [VISUAL_DESIGN.md](VISUAL_DESIGN.md) | 完整视觉提案、分镜和后续覆盖条款 |
| [T06A_DESIGN.md](T06A_DESIGN.md) | 摄影用途映射与袋内空间修正提案 |
| [AGENTS.prototype.md](AGENTS.prototype.md) | 当时的仓库规则快照，文件名已避免作为活动AGENTS规则加载 |
| [PROTOTYPE_GUIDE.md](PROTOTYPE_GUIDE.md) | 归档时的完整原型说明、历史几何与检查命令 |

前七份文档移动时内容保持不变；旧规则快照保留原文。完整操作指南仅校正迁移后的Markdown相对链接。文中的代码路径、命令与“当前／待确认／下一任务”等描述属于写作时点，有些已被后续记录覆盖，不能据此恢复旧任务或限制正式开发。

## 仍保留在原型目录的资料

- [原型与简明使用说明](../../../prototype/README.md)。
- [素材出处](../../../prototype/assets/PROVENANCE.md)、[T06生成提示词](../../../prototype/assets/T06-IMAGEGEN-PROMPTS.md)、[T06A生成提示词](../../../prototype/assets/T06A-IMAGEGEN-PROMPTS.md)，继续与本地素材放在一起。
- [T06A验收记录](../../../prototype/review/T06A/VERIFICATION.md)、[T07验收记录](../../../prototype/review/T07/VERIFICATION.md)及其余`prototype/review/`截图／采样。保留原位以维持历史相对路径和检查脚本的证据结构；归档不删除或重新生成这些文件。

原型结果只验证对应固定样例与记录的浏览器行为，不等于正式天气服务、生产构建或部署完成。最后排版修正由用户人工复核，本次归档不补写自动视觉验收结果。

当前正式开发请从[仓库入口](../../../README.md)按需查阅；本目录只用于历史追溯。
