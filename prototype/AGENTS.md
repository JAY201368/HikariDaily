# Prototype reference rules

- This is the completed offline visual reference, not the formal application's source tree. Read the root `AGENTS.md`, this directory's README and `docs/DESIGN_REFERENCE.md` before changing it.
- Keep direct `file://` viewing and optional local static serving working. No install/build/network dependency, remote scripts/fonts/fetch, telemetry, secrets, live location or real subscription in this directory.
- Preserve historical assets; local `review/` evidence is excluded from the GitHub snapshot. Do not modify `temp/refs/`. Asset provenance and licensing limits remain in `assets/PROVENANCE.md`.
- Render user text safely, retain explicit fixed-fixture labels, and preserve independent missing/unknown states rather than zero-filling.
- JS changes require syntax and relevant interaction checks; visual changes require proportionate desktop/mobile review unless the user explicitly owns manual review; fixture changes require24h/time/context/state consistency checks. Exact available commands are in this directory's README.
- Use a new review output directory and run browser suites serially; never overwrite historical evidence to make a check appear passed. Report skipped checks and fixture-versus-production limits truthfully.
