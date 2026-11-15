# 逐光日刊 · HikariDaily

为摄影师准备的当天气象简报，以老报纸、皮革摄影背包、随身仪表和摄影手册讲述天气与光线。

核心网页已实现地点查询、当天24小时、多源数据处理、太阳计算、三题材摄影建议和连续物件交互。当前规则为 `photo-rules-v0.3`，后端已使用 LangGraph，公共天气事实仍由确定性规则生成，私有AI叙述在主图之外增强；网站尚未部署，微信订阅仍属第二阶段。未完成事项见 [CURRENT](docs/CURRENT.md)，实际行为以当前代码和测试为准。

AI 摄影建议使用账户模型配置和公共 RAG 知识，增强报纸与摄影手册。真实用户模型质量、目标持久环境及大陆访问仍待验收。见[当前状态](docs/CURRENT.md)与[规格第13节](spec.md#13-ai-摄影建议契约)。

## 本地运行

要求 Node.js `>=24.3.0 <25`（`.nvmrc` 为 24.3.0）、pnpm `11.26.0`。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开 `http://localhost:3000`，按 Ctrl-C 停止。默认获取真实来源；共享缓存默认关闭，MET 缺少真实身份或可用共享缓存时禁用。live 失败不会切换为人工天气。配置、检查命令和显式演示模式见 [开发说明](docs/DEVELOPMENT.md)。

账户与 AI 摄影建议需要 PostgreSQL15+。准备私有环境后运行 `pnpm workspace:migrate` 和知识导入，在主页顶栏注册并配置模型。操作说明见[开发说明](docs/DEVELOPMENT.md)，隔离数据库验证使用 `pnpm test:workspace`。

## 按需查阅

从当前任务和相关代码开始，不必逐份阅读下表。

| 需要了解 | 文档 |
| --- | --- |
| 产品目标、范围和交付顺序 | [requirement.md](requirement.md) |
| AI 摄影建议与账户模型配置 | [spec.md 第13节](spec.md#13-ai-摄影建议契约) |
| 数据、时间、接口和摄影规则的详细契约 | [spec.md](spec.md) |
| 当前模块职责与数据流 | [ARCHITECTURE](docs/ARCHITECTURE.md) |
| 当前目标、未完成事项与已知限制 | [CURRENT](docs/CURRENT.md) |
| 值得保留的决策与失败经验 | [DECISIONS](docs/DECISIONS.md) |
| 物件、纸面与连续交互约束 | [视觉基线](docs/DESIGN_REFERENCE.md) |
| 命令、环境与配置 | [开发说明](docs/DEVELOPMENT.md) |
| 来源字段与能力边界 | [后端数据清单](docs/BACKEND_DATA_CATALOG.md)、[来源技术细节](docs/data-sources.md) |
| Agent 的检索、修改与验证规则 | [AGENTS.md](AGENTS.md) |

## 仓库布局

```text
src/app/                       SSR 页面与同源 API
src/server/                    固定来源、缓存、简报与私有工作区服务
src/domain/                    类型、时间、太阳、归一化与摄影规则
src/content/                   中文解释、胶片建议与原创许可知识
src/components/                正式界面、数据接线与请求控制器
public/                        正式素材与出处
tests/                        单元、契约、浏览器测试与人工样例
docs/                         当前知识与按需参考
docs/archive/                 已完成计划、执行证据及旧前端
prototype/                     独立离线视觉参考
temp/                         本地参考材料（不入 Git）
```

直接打开 [prototype/index.html](prototype/index.html) 可查看固定上海样例；使用与检查方式见 [原型说明](prototype/README.md)。正式界面已按后续确认演化，当前设计以视觉基线为准。素材出处见 [正式素材](public/PROVENANCE.md)及[原型素材](prototype/assets/PROVENANCE.md)。

[历史归档](docs/archive/README.md)保留追溯入口，默认不参与日常开发；旧通过记录仅适用于当时的代码。小改动无需新增计划、执行和验收报告。
