# Repository guidance

## Start small

- Start with the user's current task and relevant code/tests. Read only the documentation needed to resolve a concrete uncertainty; no mandatory full-document preflight.
- [requirement.md](requirement.md) defines product goals; [spec.md](spec.md) holds detailed contracts. [docs/DESIGN_REFERENCE.md](docs/DESIGN_REFERENCE.md) describes the current visual experience. Code describes implementation, not permission to discard requirements. Latest explicit user instructions take precedence.
- Use [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) to locate modules, [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for commands/configuration, [docs/CURRENT.md](docs/CURRENT.md) for unfinished work, and [docs/DECISIONS.md](docs/DECISIONS.md) for durable rationale, all as needed.
- `docs/archive/` contains historical evidence, not active instructions. Do not read completed plans/logs by default or resume their task ledger. Search a specific archive only when current sources cannot answer the question. `.rgignore` excludes archives from ordinary ripgrep searches; use `rg --no-ignore <pattern> docs/archive/<specific-directory>` for deliberate retrieval.

## Change boundaries

- Inspect the worktree first. Preserve unrelated edits, `temp/refs/`, and reference assets. Keep `prototype/` independently runnable; its nested instructions apply only there. Formal code/assets live in `src/` and `public/` and must not depend on prototype fixture globals.
- Keep missing data null/unknown, product time `Asia/Shanghai`, and forecast/calculation/inference distinct. Fetch upstream weather only through server-side fixed provider boundaries; safely render user text and keep secrets server-side.
- The core webpage precedes WeChat subscriptions; real WeChat identity, subscription storage, sending and subscription scheduling remain stage two. Account isolation, encrypted model configuration and public photography knowledge support newspaper and handbook AI advice. Fixture data must be explicit and must never silently replace live failures.
- Prefer the smallest sufficient change. Routine tasks do not require task cards, workers, execution logs or new verification reports. Update current documents only when goals, architecture, durable decisions or unfinished work change; replace stale statements instead of appending iteration histories.
- Commit scoped completed work as local checkpoints, excluding unrelated edits, secrets, local references and test recordings. Push, deployment, publishing and paid services require explicit authorization. Preserve source/license metadata; public use rights remain unresolved where recorded.

## Visual design delivery

- For new requirements, features, or pages that introduce or materially change a user-facing interface, treat visual and interaction design as a prerequisite to implementation, alongside functional and backend design. First discuss the intended interface with the user and obtain agreement on its overall style, physical or visual carrier, content hierarchy and presentation, control language, motion and transitions, key states, and desktop layouts. Record the agreed design in the relevant current requirements or design documents as explicit requirements and acceptance criteria before starting implementation. Do not infer agreement from existing code or begin with a placeholder interface.
- For this design discussion, read the relevant requirements and [current design reference](docs/DESIGN_REFERENCE.md), then inspect the adjacent existing surface and its styles. Resolve conflicts between active documents and the user's latest direction before recording the agreed design.
- Review the rendered result when visual correctness is central to the task. Compare the changed surface with the established materials, type, spacing, controls, and object transitions, including the relevant empty, populated, pending, and error states. Functional tests, typecheck, and build do not by themselves establish visual consistency. Record concrete mismatches and correct them before accepting the task; stop visual checks once the distinct changed layouts are sufficiently checked.
- New controls must belong to the surrounding visual system while remaining readable and operable by keyboard and touch. A generic form or card layout is not a substitute for a specified physical object or page composition.

## 产品文案红线：严禁防御性免责声明

- 严禁在任何面向用户的内容中撰写、保留或重新引入防御性免责声明。范围包括首页摘要、三种题材的完整建议、时段说明、晚霞详情、胶片建议、手册图注、仪表说明、提示、页脚及无脚本回退内容，以及模型生成建议。
- 直接写天气条件、判断结果和具体拍摄建议。不得追加“以现场为准”“实际效果仍需现场判断”“不保证发生”等推卸判断、重复免责或降低读者预期的尾句；不得通过换词、改写、移动到其他页面或标为“提醒”“限制”来规避此规则。以下仅为示例，禁令同样适用于语义相同的其他写法。

| 禁止示例 | 合格处理 |
| --- | --- |
| “是否能拍清要看现场亮度” | 删除；可保留“手持要拿稳”等具体操作建议。 |
| “光的软硬仍取决于现场云层” | 图注仅写“受光关系示意”。 |
| “这是对应时段的模型推断，实际有没有出现晚霞要看当时的现场” | 仅保留对应时段的云况判断。 |
| “现场有没有晚霞仍要看实际记录” | 删除；如有必要，仅说明日落已过及所展示数据的时段。 |
| “不是经过统计校准的发生概率” | 删除该声明。 |
| “天光与直射光条件以现场为准”“到现场再判断” | 删除泛泛声明；有具体建议时，直接写拍摄对象、站位或补光做法。 |
| “别抱太大期望”“参考价值打折扣” | 删除主观降预期的尾句，直接说明不利条件或来源分歧。 |

- 数据缺失、来源分歧、旧数据状态、预报/天文计算/摄影推断的类型标识、具体天气风险及必要的来源和许可信息应如实保留。它们必须陈述具体事实，不得附加上述免责尾句，也不得用删除免责声明作为编造确定结论或隐藏缺失数据的理由。
- **验收硬门槛：交付内容中只要出现任意一处上述防御性免责声明或同义表述，本次交付立即判定为验收失败，不得标记完成或通过。功能正常、测试通过、构建成功均不能抵消此项失败；必须清除全部违规文案并重新检查后，才可重新提交验收。**
- 修改产品文案时，交付前检查相关文案来源及其展示出口，确认没有新增或残留违规表述。检查以语义为准，不能仅靠示例关键词匹配；文档中的禁止示例和用于识别违规内容的测试文本不属于产品文案。

## Layout scope

- Desktop layout is the current design and acceptance target. Do not perform narrow-screen/mobile layout checks or add mobile adaptation requirements unless the user explicitly restores that scope (2026-11-13).

## Proportionate verification

- L0 text/cosmetic: review the diff and run `git diff --check`; for documentation moves also check local paths/links. No tests/build/browser by default.
- L1 local behavior: directly relevant checks. L2 cross-component/stateful: targeted tests plus relevant typecheck/build. L3 security/critical flows: comprehensive relevant verification.
- Use browser/interactive checks only when visual correctness or runtime interaction is central, cheaper checks cannot establish correctness, or the user requests them. Do not inherit old browser matrices or full-suite requirements from archived task cards.
- Stop after sufficient evidence. Report what actually ran and any material failures/skips; historical or fixture checks do not establish current live coverage, licensing, shared-cache behavior or deployment readiness.
