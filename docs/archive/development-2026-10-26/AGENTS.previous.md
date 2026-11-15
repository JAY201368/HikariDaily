# Repository execution rules

## Current stage and authority

- The visual prototype is complete. Formal core website implementation is authorized; active architecture and task state live in the root workflow documents. Do not infer completion from planned contracts.
- Before planning or editing, read `requirement.md`, `spec.md`, `docs/DEVELOPMENT.md` and `docs/DESIGN_REFERENCE.md`, plus instructions applicable to the edited directory.
- Latest explicit user instructions take precedence. Product goals come from `requirement.md`; planned production contracts come from `spec.md`. The visual baseline describes presentation and does not silently extend data/API/service scope.
- `docs/archive/visual-prototype/` contains historical documents, not active architecture, task cards or execution instructions. Do not resume its completed T01–T07 ledger or apply its prototype-only scope to the formal application.
- Before formal implementation, establish fresh production architecture, task DAG, progress, decisions and dispatch prompts from current requirements/spec. Keep that workflow separate from the archived prototype ledger. Do not claim planned work is implemented.

## Preservation and ownership

- Inspect the worktree first; preserve unrelated edits and reference assets. Never reset, broadly format, delete or commit unrelated files. Do not modify `temp/refs/`.
- Keep `prototype/` runnable as the visual reference. Formal application code must not replace its fixtures with live services or depend on prototype runtime globals.
- Main agent owns authoritative workflow/design documents and acceptance. Workers own only their assigned scope; they must preserve others' work and leave acceptance checkboxes to the main agent.
- When the spec-driven implementation loop is used, use one fresh dedicated worker per task, at most one implementation worker active. No recursive delegation or later task reuse. Start at or below `spec-worker-sol-high`; Astra requires the applicable explicit task-specific request or evidenced failure escalation. Follow the installed routing reference, and distinguish configured model/thinking from observed runtime metadata.
- Preserve the user's Git checkpoint preference: commit scoped accepted work; never include secrets, local reference material or unrelated changes. No push, deployment or publishing is implied by a local commit.

## Production boundaries

- First stage: mainland-China location selection, same-day24h data, multi-source normalization, photography analysis, three-genre advice, complete object experience and Serverless delivery. Real WeChat identity/subscription/storage/sending/scheduling belongs to stage two.
- Product time is `Asia/Shanghai`; preserve source/time/unit context, distinguish forecast/calculation/inference, keep missing values null/unknown, and do not infer visibility or pollutant concentration from AQI.
- Fetch upstream weather only through the formal server-side provider boundary specified in `spec.md`. Do not expose secrets or create an arbitrary URL proxy. User-entered text must be safely rendered.
- Fixed fixtures must be explicitly labelled; do not silently fall back to prototype data in production. Fixture tests do not validate live-service coverage, licensing, accuracy or delivery.
- Source/reference-derived image rights remain unverified for public deployment; retain provenance and verify or replace assets before publication.

## Commands and verification

- Production install/dev/typecheck/lint/test/test:e2e/build/start commands are established by accepted T01; exact commands and environment are in docs/DEVELOPMENT.md. There is no authorized deployment command or database migration.
- Prototype viewing and checks are documented in `prototype/README.md`; its nested instructions apply to prototype changes only.
- Documentation-only changes require link/path and diff checks; no browser/build suite is needed when runtime files are unchanged.
- Once production tooling exists, use the task's meaningful unit/contract/browser checks. Report exact commands, outcomes, skipped checks, limitations and contract/environment impacts. Do not equate mocked fixtures with real upstream validation.

## Active production workflow

- Read root `ARCHITECTURE.md`, `TASKS.md`, `PROGRESS.md`, `DECISIONS.md` before editing production files; root T01–T12 are distinct from archived prototype IDs.
- Every task receives a fresh clean-context worker, one implementation worker active; never recursively delegate or reuse a worker for a later task. Main agent owns architecture, task acceptance and stage Git commits. Workers may append clearly unaccepted evidence to progress and propose durable decisions; no worker commits.
- Verified canonical commands are `pnpm install --frozen-lockfile`, `pnpm dev`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, `pnpm start`. T01 verification is recorded in docs/verification/T01.md. Stop dev/start via Ctrl-C. No database migrations or Cron in stage one.
- Minimum checks after tooling exists: domain/provider changes require unit/contract tests + typecheck/lint/build; client/scene changes also require meaningful wide/narrow/reduced-motion browser checks; docs-only changes require workflow validator if cards change, local links and `git diff --check`. Fixtures and live checks remain separate.
- Preserve package lockfile, strict TypeScript, server-only provider imports, and source/license metadata. Never include `.env`, secrets, local references or test recordings in commits. No blanket reset/format, no push/deploy without explicit user authorization.
- Handoff includes owned files, actual behavior, exact commands and outcomes (including failures/skips), per-criterion evidence, environment/contract impacts, limitations, configured worker/model/effort and observed metadata when available. Acceptance boxes belong to main agent.
