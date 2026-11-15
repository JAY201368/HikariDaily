# 原创摄影知识

`original-fieldcraft.v1.json` 为本项目此次编写的原创文字，未摘录教材、网站或图片。作者为 HikariDaily 项目原创知识编辑，按 CC BY 4.0 授权；使用时保留作者、文件路径、JSON pointer、来源 ID、版本、更新时间与许可链接。共30条，覆盖三题材、用光、主体、构图、视角、天气适用性、器材与通用胶片特性，不含真实天气或私人材料。

导入：`pnpm workspace:knowledge import src/content/knowledge/original-fieldcraft.v1.json`。修订时保存新版本文件，将来源版本连续增加后导入；旧条目保留作历史证据，检索只读取当前 active 版本。撤回：`pnpm workspace:knowledge withdraw hikari-original-fieldcraft 1`。重新启用需导入下一版本。命令自动加载 `.env` 和 `.env.local`，不输出连接串或模型凭证。先执行 `pnpm workspace:migrate`。应用不会静默导入或用 fixture 补齐缺失库。

适用条件在关键词排序前过滤；具体条件遇到未知不匹配。通用条目允许未知，但不是天气证据。私人知识检索属于独立所有者服务，不能写入本公共来源。
