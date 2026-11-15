# Visual prototype tasks

Fresh dedicated implementation worker per task; serial dispatch and independent main-agent acceptance. Do not alter user requirements, spec or references. Dependency graph: T01 (accepted) → T02, T03; T03 → T04. T02–T04 are the historical first revision. Current screenshot corrections execute T05 → T06 → T06A → T07 serially, with independent acceptance after each. This is a bounded visual-design milestone, not the whole product delivery plan.

### [x] T01 — Reviewable tactile, editorial, continuous visual prototype

**Dependencies:** None (requirements, reference inspection and VISUAL_DESIGN.md authored by main agent).
**Worker:** spec-worker-astra-high
**Routing rationale:** Difficult coupled CSS 3D folding, bag occlusion, page turning, tactile art and responsive editorial layout require visual reasoning.
**Scope:** Implement `prototype/` as the self-contained offline synthesis in VISUAL_DESIGN.md and ARCHITECTURE.md; include local fixture, artwork/assets provenance, usage README and proportionate reproducible browser checks. Preserve original reference files and all existing user changes. No production backend or Next.js setup.
**Acceptance:**
- Newspaper uses a disciplined Claude-inspired editorial grid and concise useful Chinese content; mobile typography reflows rather than shrinking the entire page.
- A convincing brown leather shoulder bag with soft pockets, stitching, brass hardware and dark lining replaces the hard toolbox. Four reference tactile devices, DOM LCD readings and whole-device click explanations; no pasted tags.
- Native reversible scrolling distinctly folds newspaper twice, inserts it behind a pocket lip, exposes instruments, extracts the same visible handbook and opens it; wide-screen scroll turns three genre spreads; stable reading windows and navigation. Mobile has understandable physical handoffs and horizontally swipeable handbook.
- Exactly 24 selectable fixture hours; 09/16/18 change LCDs, annotations and modal labels coherently without rewriting daily or sunset context. Missing/stale/conflict demonstrations and five opportunity levels + independent unknown.
- Landscape, portrait, street have distinct actionable windows/reasons/limitations and generic film suggestions. No false EV, branded films, AQI standard confusion, calibrated sunset percentages or fake live claims.
- Subscription form requires a place, offers 07:00/12:00, shows a clearly non-sending preview registration and edit/stop preview. No QR, external requests or personal identity collection.
- Keyboard-focusable instruments, accessible modal close/Escape/focus return, hidden animation controls not focusable, complete reduced-motion/static reading. File:// local references resolve without network dependencies.
- Include verification evidence at desktop 1440×960, mobile 390×844 and reduced motion; capture key animation midpoints and reverse checks when browser tools available. Explicitly disclose skipped checks and asset licensing limits.
**Verification:** `node --check prototype/app.js` (and other scripts), local-reference check; browser smoke check script documented in `prototype/README.md`, screenshots and evidence report. Main agent independently repeats relevant checks before acceptance.
**Exclusions:** Real data/API/provider integration, production deployment, actual geocoding, WeChat subscription/account/queue, public asset licensing verification, edits to original reference drafts.

**Completion — 2026-10-21:** Accepted by main agent after independent code/screenshot review and rerun: four `node --check` commands passed; `node prototype/check-local.cjs` passed (14 references + fixture regressions); env-configured `node prototype/check-browser.cjs` passed 185 checks, Chrome 155.0.8059.85 at 1440×960 / 390×844 touch / reduced motion, zero page errors or external requests. Independent screenshots: `/tmp/hikari-review-final/`; durable worker evidence and limitations: `prototype/review/VERIFICATION.md`. Offline prototype, design document, asset provenance and usage instructions complete. No production services, actual subscription, public asset license clearance or real-device validation claimed. Initial quota interruption was closed through a fresh invocation for this same task; no worker reused for another task.

## User visual revision

### [x] T02 — Existing worn paper creases remain continuous at fold onset

**Dependencies:** T01
**Worker:** spec-worker-sol-high
**Routing rationale:** Paper-surface texture, clipped shared content and CSS 3D hinge seams require focused visual debugging.
**Scope:** Fix newspaper creases and fold rendering only in prototype/, preserving newspaper layout, two-fold timeline and other scenes. Use user screenshot and GPT reference crease treatment as evidence. Add reusable local crease artwork if useful; update checks/evidence.
**Acceptance:**

- Flat newspaper already has two subtle worn fold axes with irregular fibres/highlight/shadow and width variation, not uniform straight strokes. Text stays readable.
- Switching from reading DOM to folding surfaces does not introduce rectangular quadrant borders, sudden cross or different texture registration; internal panel border/shadow artifacts removed. Active hinges deepen naturally, inactive fold stays faint.
- Both independent 180° folds remain reversible, safe/inert replicas remain, mobile/static readable. No bag/time/form redesign in this card.
- Visual review captures before/onset/after at .139/.140/.141 and fold midpoints at 1440×960 and 1920×958; mobile/static also checked. Regression scripts pass, no remote requests.
**Verification:** Four JS syntax checks, `node prototype/check-local.cjs`, env-configured `node prototype/check-browser.cjs`, focused screenshots/test for seam continuity. Evidence under prototype/review/ with T02 prefix or subdirectory; preserve older evidence as historical.
**Exclusions:** Backpack/pocket watch, device markings, subscription extraction, production interfaces.

**Completion — 2026-10-22:** Main accepted existing worker artifacts after quota interruption, independently running five syntax checks, local check (17 references), focused fold script (70 checks at both desktop sizes/mobile/static) and aggregate browser (185 checks). Inspected onset triptych and hinge midpoint: no sudden quadrant borders, aligned irregular worn axes. Outputs `/tmp/hikari-t02-main` and `/tmp/hikari-t02-main-regression`; durable worker results `prototype/review/T02/final/results.json`. Earlier draft failures are historical, not current pass evidence. No changes to bag/time/form.

### [x] T03 — Spacious tactile backpack, customized instruments and dial-based hour selection

**Dependencies:** T01
**Worker:** spec-worker-sol-high
**Routing rationale:** New volumetric bag art, occlusion anchors, nonlinear object arrangement and scaled pointer/touch dial geometry are tightly coupled in the instrument scene.
**Scope:** Replace narrow satchel with capacious worn leather photography backpack, stagger four instruments across multiple pocket levels, add fictional housing maker/model/owner lettering, replace visible hour strip/range with chained 24-hour pocket watch. Update paper/book storage anchors and foreground masking coherently. Preserve T02 creases and all data/handbook/form behavior.
**Acceptance:**

- Backpack is materially more spacious/tall and convincingly deep, not a flat enlarged satchel: visible side gussets, bulging hide, local creases/pores, seams, brass, lined pockets and contact shadows. Instruments have separate staggered heights and breathing room, readable screens, unblocked whole-device interaction.
- Four housings have tasteful original fictional maker/model/owner markings integrated with surface angle/texture; no real brands, pasted explanation labels or covering LCDs. Markings also appear coherently in enlarged details.
- A tactile pocket watch with chain replaces the visible horizontal slider/strip. 24-hour dial (00 top; 06 right; 12 bottom; 18 left), snapping pointer press/drag picks all 24 hours, wrap 23↔00, scales correctly. Touch only captures the dial. Arrows ±1 modulo 24, Home/End and visible previous/next hour controls with slider ARIA values/text; exact current hour visible.
- One hour state synchronizes all LCDs, accessibility labels, annotations/details and watch hand; day advice/solar/sunset unchanged. Missing/stale/conflict semantics preserved. Old slider/strip not retained as hidden functional relics; adapt test helpers to watch semantics.
- Paper inserts behind new front pocket, same visible handbook extracts from actual new pocket in forward/reverse; static/mobile anchors agree, no overlaps or clipped controls.
- Desktop 1440×960, 1920×958, mobile 390×844 and reduced mode visually checked; pointer, actual touch drag, keyboard, cancellation/outside release and data regressions tested. Usage/provenance/evidence updated for this scene.
**Verification:** Four JS syntax checks, local check, browser smoke adapted to new hour control, focused watch/backpack screenshots and reverse keyframes. Preserve historical evidence; current evidence labelled T03.
**Exclusions:** Subscription-slip extraction (T04), real APIs/location/WeChat, other editorial redesign, real-world instrument branding.

**Completion — 2026-10-22:** Main accepted after code/report and desktop/mobile/modal screenshot review; independently reran all prototype JS/CJS syntax checks, local26, watch246 and aggregate185 (Chrome155, zero errors/external requests). Confirmed deep multilayer backpack, staggered housings/fictional marks, scale-aware 24h dial including touch/keyboard/wrap, updated masked anchors. Worker also passed folds70; main independently passed folds70 before this task and will repeat in final gate. Evidence `prototype/review/T03/VERIFICATION.md`, independent `/tmp/hikari-t03-main-focused` and `-regression`. Worker recorded one earlier focus-timeout; latest worker isolated reruns and main run passed, not falsely labelled diagnosed. Sol/high used per user's routing change. T04 remains separate.

### [x] T04 — Subscription slip is physically extracted from the handbook

**Dependencies:** T03
**Worker:** spec-worker-sol-high
**Routing rationale:** Reversible cross-layout object extraction, page occlusion and preserving a single interactive form across handoffs need complex visual/state reasoning.
**Scope:** Replace independent subscription-page arrival with continuous extraction from handbook pages, retaining existing non-sending form and validation. May append linked sticky extraction interval after current reading timeline; preserve all prior scene behavior.
**Acceptance:**

- Identifiable red-lined subscription slip peeks from handbook pages before movement, then slides out from behind actual page/sleeve, clears edge and settles into readable form with paper depth/contact shadow. No cut, fade-only replacement or unrelated viewport-edge entry.
- Forward/reverse onset, extraction midpoint and final handoff continuous; desktop scene book position is measured/shared, mobile extracts from currently visible genre without resetting horizontal choice or blocking vertical reading.
- One active canonical form only. Any decorative replica is ID-free, inert/aria-hidden and precisely aligned on handoff. Typed place/slot/preview state survives reverse scroll, resize/static mode. Hidden/transitional controls unfocusable; final form keyboard reachable and chapter navigation reliable.
- Static/reduced mode shows one sequential readable fully functional form without unnecessary extraction; 07:00/12:00, validation, literal text safety, edit/stop, no real sending retained.
- Desktop 1440×960 and 1920×958, mobile390×844, reduced/static screenshots plus forward/reverse geometry and inputs-preservation tests pass. README final timing, provenance/evidence updated; no regression to creases/backpack/watch/hour data/handbook.
**Verification:** Four JS syntax checks, local check, aggregate browser smoke plus focused extraction/handoff/resize/input preservation/touch-read checks. Screenshot/evidence labelled T04; old evidence preserved as history.
**Exclusions:** Real subscription/backend, new content/features, redoing accepted bag art or newspaper layout.

**Completion — 2026-10-22:** Main accepted after reviewing implementation/report and desktop/mobile tucked/mid/final screenshots. Independently reran all eight JS/CJS syntax checks, local26, slip256, aggregate186, watch246, folds70: all pass, Chrome155, zero errors/external requests. Original canonical form extracts from real page sleeve; reversible measured handoff, input/preview and mobile genre retained, static/reduced single normal-flow form. Historical modal-focus race diagnosed and narrowly guarded, deterministic regression retained. Evidence `prototype/review/T04/VERIFICATION.md`; independent `/tmp/hikari-t04-main-{slip,browser,watch,folds}`. No production/backend/API/dependency changes; Sol/high fresh worker per user routing.

## Second visual correction — 2026-10-22

Serial order T05 → T06 → T06A → T07; each gets one fresh dedicated worker. Latest user correction supersedes earlier visual acceptance judgments.

### [x] T05 — Blank newsprint backs on both folds
**Dependencies:** T02
**Worker:** spec-worker-luna-max
**Routing rationale:** Bounded reverse-paper surface correction. This is retrospective classification only; the historical worker actually inherited configuration as recorded below.
**Scope:** Only reverse paper surfaces, including static pocket replica, in prototype/; preserve front content, worn creases and timeline.
**Acceptance:** No invented printed headlines/body/mini-lines on fold backs; warm-white paper texture and faint wear retained. Both folds/reverse/mobile/static remain coherent. Capture desktop/mobile midpoints and run syntax/local/focused fold checks; update narrow assertions only when they encode removed reverse content.
**Verification:** Syntax of changed JS/CJS; local check; check-folds.cjs with screenshots. Document evidence in prototype/review/T05/VERIFICATION.md.
**Exclusions:** Bag/watch/form, production, root design/workflow edits except unaccepted PROGRESS entry.

**Completion — 2026-10-22:** Main independently inspected desktop/mobile blank backs and reran syntax/local26/folds80, all pass; /tmp/hikari-t05-main. Textures/creases/front/timing retained. Fresh worker with inherited configuration, no override; detailed evidence prototype/review/T05/VERIFICATION.md.

### [x] T06 — Photoreal backpack and instruments, physically extracted watch
**Dependencies:** T05, T03
**Worker:** spec-worker-astra-medium
**Routing rationale:** Photoreal layered occlusion and reversible extraction geometry. Retrospective classification only; actual historical inherited worker configuration remains recorded below.
**Scope:** prototype/ bag/device art and layered occlusion, reversible watch extraction; update scene anchors only as needed. Use imagegen skill/built-in generator for photoreal replacement art, preserve local originals and document exact prompts/provenance. Main may supply generated source art.
**Acceptance:** Bag reads as worn physical leather object with seams, volumetric folds, natural hide/light; four instruments visually cohere and keep legible DOM LCDs/housing marks/full-object interaction. Generated art is locally copied with provenance. Same watch starts visibly within bag, lifts clear then travels continuously to final reading position before stable bag interval, reverse returns; chain follows, no pop or fade-only reveal. Paper/book masks align on desktop/mobile/static. All 24 hours, touch/keyboard, missing/data/modal behavior retained. Desktop1440/1920/mobile390/reduced screenshots and forward/reverse watch keyframes visually inspected; syntax/local/watch/folds/aggregate checks pass or failures truthfully recorded.
**Verification:** Existing documented local/browser tooling, focused extraction samples and evidence prototype/review/T06/VERIFICATION.md. Record imagegen tool mode, prompts and output paths.
**Exclusions:** Subscription leaf/intro (T07), production/services, requirement/spec/reference changes. Root docs main-owned except unaccepted PROGRESS append.

**Completion — 2026-10-22:** Main accepted after independent desktop/mobile stable/lift/travel screenshot and alpha-mask source review; all eight syntax checks, local26, watch346 passed independently (/tmp/hikari-t06-main-watch). Worker additionally passed folds80/aggregate186/slip256, zero errors/HTTP(S). Five built-in imagegen assets locally persisted with exact prompts, registered pixel-preserving masks, reversible same-watch extraction and updated pocket anchors. Fresh dedicated worker; inherited model/thinking, no override or independent runtime attestation. Full handoff prototype/review/T06/VERIFICATION.md. User then inserted T06A; T07 remains unstarted.

### [x] T06A — Photography-purpose objects aligned with spec §7.2
**Dependencies:** T06
**Worker:** spec-worker-sol-high
**Routing rationale:** User explicitly requires Sol takeover of remaining T06A work under the updated routing policy. A fresh Sol/high worker will finish the modal-overlap correction, verify the inherited fixed-date solar/state/geometry implementation and produce the handoff. Earlier Astra/medium artifacts remain historical, unaccepted evidence.
**Status:** ACCEPTED — 2026-10-22 after independent main review; T07 is now ready.
**Scope:** Preserve accepted photoreal backpack appearance and same 24-hour watch selection/extraction mechanics; remove chain/attachment decoration, correct paper/book pocket paths and anchors. Retain wind instrument functional structure with bounded retro appearance refinement. Replace pressure object with solar-direction instrument; radiation object with classic light-meter interpretation object; GPS object with in-bag paper weather record card. Design/information contract in T06A_DESIGN.md governs implementation after approval.
**Acceptance:**
- Newspaper completes both folds, fits and aligns over the real open main-compartment mouth before descending into its front inner divider. Only portions crossing the lip are occluded; no passage through side walls/front leather or rectangular cutout through airborne paper. Reverse path and static/mobile endpoints agree. Densely inspect alignment/lip-crossing/mask boundaries, not only final rectangles.
- Watch renders as standalone dial plus necessary bezel, with no chain or exposed chain attachment decoration; preserve same-node lift/travel, all hour controls, state and inert transition behavior.
- Handbook sits visibly within the main compartment's right-rear inner divider, within bag silhouette, with recognizable title/top/spine and lining/contact depth. It does not sit in an exterior sleeve or merely behind the whole bag. Extract through the real inner pocket/open mouth before travel/opening; reverse/static/mobile agree.
- Instrument appearances have deliberate retro photographic-design detail (functional form, restrained metal edging/knurled controls, clear dial hierarchy, integrated markings, localized wear), consistent photographic material and light. Wind instrument retains exposed impeller/controls; solar-direction and classic meter retain credible functional silhouettes. Readable DOM areas remain; no appearance implies measured exposure values.
- Wind object displays mean wind, gust, temperature, humidity for selected fixture hour, with units, same hour in details/index.
- Solar-direction object displays calculated solar azimuth and altitude for fixed Shanghai reference point/date/selected Beijing hour, explicit north=0° clockwise azimuth and altitude relative to horizon; related solar period/times and permanent wording that it is calculated, not device heading. No compass/geolocation sensor or live orientation.
- Classic meter object displays forecast-derived light nature (possible direct/diffuse/changing light or unknown/night), selected solar stage and blue/golden explanations; no radiation value, lux/EV/exposure/colour-temperature claims.
- Weather record card displays cloud, precipitation, visibility, reference AQI (US EPA/CAMS), PM2.5, PM10, with units and source/forecast context; all main scene/detail/index values agree. New PM10 must be an explicitly authored local fixture, never inferred from AQI or PM2.5. Missing remains independent, not zero.
- Existing pressure/radiation/GPS visuals/readouts/labels and obsolete claims no longer appear in current product scene/details/index/source notes. Historical assets/evidence are preserved. Only necessary local fixture metadata/calculation added, never production interfaces/services.
- Fixed-date solar calculations and period labels are verified together before claimed consistency; any inherited illustrative event times that differ must be reconciled and recorded across newspaper/book/card within this task, with no silent mix of calculated angles and contradictory stages. No solar model accuracy certification implied.
- Photoreal style and direct full-object actions, all 24 watch hours/touch/keyboard/wrap, missing/stale/conflict, modal focus, fold/book/subscribe regressions remain. Desktop1440/1920/mobile390/static/reduced snapshots checked; main numbers have readable index/expanded alternatives.
**Verification:** All JS/CJS syntax; local-reference and exactly24h fixture consistency/missing checks; adapt focused object/watch and aggregate checks to authorized mapping (retain watch mechanics and unchanged scene contracts); folds/slip regressions. Verify solar direction conventions/night/edge cases/selected hours with documented deterministic reference. Record exact prompts/provenance for two new instrument housings and bounded wind-instrument refinement; card native CSS/DOM, screenshots and commands in prototype/review/T06A/VERIFICATION.md.
**Exclusions:** No changes before design confirmation; no replacement of accepted bag appearance or watch hour semantics beyond the explicit chain removal/pocket-path corrections, T07 leaf/intro, real services/sensors/geolocation, real subscription, production spec/API changes. Fresh dedicated implementation worker only after approval; root docs main-owned.

**Completion — 2026-10-22:** Main accepted mapping, standalone dial, main-mouth newspaper entry and inner-divider handbook after source/desktop/mobile/static/modal/keyframe review. Independently passed syntax11, local27, solar120 in both UTC/Asia-Shanghai, objects594 and watch346 (independent /tmp/hikari-t06a-main-*). Fresh Sol/high takeover completed the concrete enlarged-card overlap fix and final worker objects594/watch346/folds80/browser186/slip256 plus upstream32; all final error/request arrays empty. Earlier Astra/medium attempt and quota interruption retain historical attribution, no worker reused for a later task. Solar times reconciled across carriers; independent PM10 fixture and local BSD2 solar subset documented. Evidence prototype/review/T06A/VERIFICATION.md. Offline fixture only, no production contract/service change.

### [x] T07 — Turn a page to discover loose slip, animate final text
**Dependencies:** T06A, T04
**Worker:** spec-worker-sol-high
**Routing rationale:** Extra leaf, reversible loose-paper lift and responsive measured handoff have coupled visual/state correctness risk; start at Sol/high under the updated non-Astra first-dispatch ceiling.
**Scope:** prototype/ additional reversible leaf and loose subscription slip discovery/extraction, final intro entrance. Replace sleeve/lip geometry and its tests; preserve existing genre reading positions, canonical form and native scrolling.
**Acceptance:** After genre reading, continued scrolling visibly turns an additional page and reveals full loose slip lying between pages; no slit/sleeve or apparent emerging from cut page. Slip then lifts clear and moves/scales to final form. Mobile same current genre and natural vertical reading; reverse continuous. Intro groups fade/translate in during settling, fully present before normal-flow handoff, no visibility pop. Single canonical form/state/focus safety/07:00/12:00/text safety/static/reduced intact. Desktop1440/1920/mobile390 plus reduced, discover/turn/lift/settle/reverse screenshots visually inspected. Syntax/local/focused slip/aggregate and watch/fold regressions pass; update exact tests for new authorized geometry without weakening retained invariants.
**Verification:** Document canonical focused check command and exact timing in prototype README; evidence prototype/review/T07/VERIFICATION.md.
**Exclusions:** Further art redesign, production, requirement/spec/reference changes; root docs main-owned except unaccepted PROGRESS append.


**Completion — 2026-10-22:** Main independently accepted the extra180° leaf, complete loose-slip rest/lift/travel/settle and staggered intro before normal-flow handoff after source/diff and desktop1440/1920/mobile390/reverse/reduced visual review. Main passed syntax11/local27/solar120 in UTC and Asia-Shanghai, focused571 and aggregate186 at /tmp/hikari-t07-main-{slip,browser}, zero browser errors/external requests. Fresh dedicated Sol/high worker also passed watch346/folds80/objects594, with original state/focus/mobile-genre/native-scroll/text/07:00/12:00 invariants retained. Exact timing, screenshots, commands and draft corrections: prototype/review/T07/VERIFICATION.md. No production/service/dependency or new raster impact. All8 local visual prototype cards accepted; production remains outside this milestone.
