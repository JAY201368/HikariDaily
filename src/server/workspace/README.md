# Account and photography advice services

## Persistence and identity

PostgreSQL15+ stores accounts, opaque sessions, encrypted model configuration, shared photography knowledge, rate limits and optional weather-source cache. Apply migrations explicitly with `pnpm workspace:migrate`.

The current migration set contains 005 (knowledge), 013 (source cache) and 015 (account foundation). Migration015 uses idempotent table creation for existing installations. Previously applied migration records and stored data are retained.

Private writes validate same origin, authenticate the account and apply persistent rate limits. Account and model mutations serialize on the owner row. Passwords use scrypt and sessions use hashed opaque tokens in HttpOnly cookies. Credential encryption uses an owner/version-bound AES-GCM key ring.

## HTTP API

- `/api/workspace/auth/register`, `/login`, `/logout`, `/session`, `/password` and `/account` manage identity.
- `/api/workspace/model` reads or changes configuration, and `/api/workspace/model/probe` independently checks text, image and tool capabilities.
- `/api/workspace/advice/context` exposes current owner/configuration eligibility.
- `/api/workspace/advice` returns authoritative paired briefing and private advice.
- `/api/workspace/knowledge` retrieves the public photography corpus for an authenticated account.

All responses use no-store envelopes. Model Keys never return to clients or enter logs, public caches or generation prompts.

## Model boundary

Custom endpoints require public HTTPS with DNS and connection pinning, TLS hostname validation and no redirects. Calls recheck current owner/configuration immediately before dispatch. Revocation cancels local calls and rejects stale responses across processes.

Advice permits one call within 60 seconds and 24 KiB text input. Capability probes permit three calls within 45 seconds, 24 KiB text and at most four images totalling 8 MiB. Input and output validation remain local and deterministic.

## Shared knowledge and bounded advice

Apply explicit migration `005_knowledge.sql` before use. The public knowledge store contains only reviewed original photography passages; it never queries `records`, private plans, assets or user feedback. Import the project-authored CC BY 4.0 corpus (30 passages, including distinct light/night/rain conditions) with:

```sh
pnpm workspace:knowledge import src/content/knowledge/original-fieldcraft.v1.json
pnpm workspace:knowledge withdraw hikari-original-fieldcraft 1
```

The CLI loads `.env`, then `.env.local`; keep database credentials private. Import is an operator action, not an authenticated end-user HTTP write. `knowledgeImportSchema` validates permission/provenance, source version, locators, unique chunk IDs and conditions. Revisions use a new file/source version exactly one higher, atomically replace the active searchable version and retain immutable history. Withdrawal deactivates only the expected current version. Re-enable by importing the next version; the application never auto-seeds missing knowledge or substitutes fixtures.

`knowledge/index.ts` exports `retrieveKnowledge(context,query,limit?)`, `rankKnowledge`, `applicable`, `evidenceReference`, `assertKnowledgeActive`, `importKnowledge`, `withdrawKnowledge`. `KnowledgeContext` supplies genre plus arrays of light phases/characters, weather, equipment, aesthetics and blocking risks. Empty entry conditions are unrestricted. Specific conditions require known matching context; every sampled light value must fit its allowed range; weather/equipment/aesthetic entry tags are required predicates, so every required tag must exist without excluding independent extra context (mixed or unknown light cannot establish all-day direct/diffuse light). Condition filtering always precedes keyword ranking. Search returns complete passages with source ID/version/file/JSON pointer, author, license and update time. Equipment/aesthetic tags must be supplied by a trusted caller; they are not inferred from model claims.

`advice.enhanceBriefing(ownerId, baseBriefing, {signal?,transport?,now?})` is the shared generation boundary. Pass the **same already fetched deterministic Briefing** for SSR; do not fetch the advice API as well and charge twice. There is no generated-content cache or generated persistence. The service checks an available text capability, retrieves applicable public evidence and makes at most one bounded call using the current owner's configuration. The strict JSON prompt does not require an optional `response_format` extension. `buildAdviceInput` exposes the exact serialized input for budget evaluation, including instructions, compact factual slots and complete retrieved passages. Model risk facts contain code/status/time ranges; original risk prose stays unchanged in returned constraints, avoiding repeated long risk descriptions in the model budget. Existing model cancellation and final owner/config-version checks apply.

The result is `{baseBriefing,factsHash,enhancement,metadata}`. `factsHash` is the canonical SHA-256 of the untouched full base. `metadata` includes owner ID, location/date, `snapshotGeneratedAt` (base time), `generatedAt` (actual finish), rules/prompt/quality/model/config versions, used source versions and non-content duration/usage. Each genre has generated/fallback status, a stable reason code, nullable seven-facet `full` narrative, same-source `short` projections and actual cited evidence. Missing or invalid one-genre output falls back independently; malformed whole JSON, call failure or revocation falls back all genres. Symmetric duplicate-subject rejection affects every repeated genre. No returned text replaces a numeric weather, solar, risk, film, grade, window or unknown object.

Always render each genre's deterministic `constraints` with its narrative and obtain fallback content from `baseBriefing.advice` / `baseBriefing.interpretation`. Constraints preserve timing eligibility, limitations, missing/conflict/stale note, film caveat and all-day risks. Selected recommended-window hours determine blocking risks using the existing `excludesOutdoor` semantics; unrelated later storms and air-quality-only notes do not disqualify otherwise valid windows. Keep film type/sensitivity from the base and use only generated film rationale. A genre crossing a solar, product-day or recommended-window status boundary while waiting returns `TIMING_CHANGED`; fetch a fresh base before trying again.

Facet short limits (characters) are timing52/light44/subject36/composition44/viewpoint44/alternative28/film45. Short text must be a complete sentence appearing verbatim in full text; nothing truncates it. Citations must be supplied, applicable, current and topic-relevant; final source SHARE locks serialize return authorization with revision/withdrawal. Free prose supplies specific technique, including conditional weather actions, window/artificial side light and non-numeric exposure methods. Measured weather/times/grades remain service-rendered facts. Unsupported solar light, wet-ground observations, false clear distance, past sunset, changed film, risk violations and disclaimer semantics are rejected deterministically. These guards constrain common failure classes; novel language and photographic insight still require the actual configured model's human quality review, not merely schema success.

HTTP boundaries (Node runtime, private/no-store):

- `POST /api/workspace/advice` body `{place:"geonames:<id>"}` requires Origin/session, rate-limits the owner and fetches authoritative `getBriefing` once. A client cannot submit a forged base. The response pairs the actual base/hash with the narrative; The homepage verifies request generation, owner/config, location/date, timing and canonical hash, then installs the returned base and enhancement atomically in both newspaper and manual. The returned base may be newer than the previous SSR snapshot.
- `GET /api/workspace/advice/context` requires a session and returns only `{ownerId,configVersion,enabled,reason}`. The homepage revalidates on focus, visible resume and payload-free `hikari:workspace:invalidate` storage events; old enhancements clear immediately. Private SSR calls `loadHomeAdvice` with its already loaded base once; hydration reuses the initial attempt without another charged generation. No generated result persists in browser storage or shared caches. Full narrative, factual constraints and evidence are available in details, static reading and no-script HTML; printed pages consume the bounded complete short sentences.
- `GET /api/workspace/knowledge?genre=landscape|portrait|street&query=...` requires a session and searches unrestricted/unknown-safe public passages only. Trusted condition-based advice search uses `retrieveKnowledge` directly. Empty evidence returns explicit `not-covered`.

Verification:

```sh
HIKARI_TEST_DATABASE_URL=postgresql://user@127.0.0.1:port/hikari_test pnpm exec vitest run tests/contracts/workspace-advice.test.ts tests/contracts/workspace-foundation.test.ts tests/contracts/workspace-transport.test.ts
```

Tests migrate the disposable test database explicitly, use random source/owner IDs and clean only their own records. They verify real import/revision/withdrawal, active-source lock conflicts, owner/config revocation and no shared generation; injected transport supplies authored outputs, not live-provider quality evidence. Versioned adversarial text/recall cases and editorial review rubric are under `tests/fixtures/workspace/`. Actual user model and mainland/target environment acceptance remain unverified until configured.


Operation commands and remaining environment checks are in [DEVELOPMENT](../../../docs/DEVELOPMENT.md) and [CURRENT](../../../docs/CURRENT.md).
