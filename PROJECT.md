# pi-pew-pew

## Objective

Maintain one small, read-only Pi web tool that prefers cached retrieval and only contacts original websites when browser rendering or visual/authenticated inspection is actually required.

## Current direction

Refactor `fetch` to Exa's Contents API in explicit cache-only mode (`maxAgeHours: -1`). `render` and `screenshot` use one dedicated persistent Chromium profile so ephemeral Pi workers can reuse legitimate institutional SSO state. Remove PEW-PEW's crawler-like origin preflight, robots, llms, and pacing machinery rather than adapting it to the new architecture.

## Invariants

- One model-facing `web({url, mode})` tool.
- `fetch` never intentionally contacts the requested origin and never silently falls back to live crawling.
- `render` and `screenshot` are read-only browser navigation through a dedicated local Chromium profile.
- No click, type, submit, arbitrary JavaScript, proxy rotation, CAPTCHA solving, crawling, or automatic retry.
- No credentials are handled by PEW-PEW; humans establish browser sessions directly in Chromium.
- Normal tests are hermetic. Real-provider tests are explicit opt-in and excluded from CI.

## Definition of done

The obsolete policy/queue/preflight implementation is deleted; cache-only Exa behavior and persistent-profile Chromium behavior are covered by focused tests; `npm run check` and package dry-run pass; project state and documentation match the implementation. Merge, versioning, tagging, and publication remain explicit human actions.
