# Repository execution rules

- Read requirement.md, spec.md, VISUAL_DESIGN.md, ARCHITECTURE.md, TASKS.md, PROGRESS.md and DECISIONS.md before editing. Current scope: local visual prototype, not production implementation.
- Preserve pre-existing README.md changes, untracked spec.md/temp/ and all reference assets. Never reset, broadly format, commit or delete unrelated files. Do not modify temp/refs/.
- Product prototype changes belong in prototype/; workflow/design docs are main-agent authority. Workers may update PROGRESS.md (unaccepted evidence) and append justified DECISIONS.md entries. Do not check task completion boxes.
- Runtime: file:// prototype/index.html; optional `python3 -m http.server 8765 --directory prototype`. Static local HTML/CSS/JS/SVG, no build/bootstrap/install requirement for viewing. No production test/build commands exist yet.
- Minimum verification: JS change → node --check each script + interaction check; visual/animation change → desktop/mobile screenshots and keyframe inspection where tooling permits; fixture change → 24 hours, time/context consistency, missing/state checks. Document canonical browser-check command when created.
- No remote scripts/fonts/fetch, telemetry, secrets, external service calls, identity collection or real subscription. All user-entered text must be escaped or inserted with textContent. Fixture mode explicitly labelled, missing values never become zero.
- Prefer original CSS/SVG bag art + provided unbranded tactile device assets. Copy needed assets into prototype/assets with provenance; asset licensing remains unverified for public deployment.
- Each task gets one fresh dedicated subagent, no delegation or later task reuse; main agent owns acceptance and architecture. Stop for scope/contract changes.
- Handoff: task ID, configured profile/model/thinking (distinguish observed), changed files, behavior, exact commands/results, each acceptance evidence, limitations and impacts. Tests on fixtures do not verify production services.
