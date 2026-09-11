# pi-pew-pew

## Objective

Maintain one small, read-only Pi web tool for known URLs: Exa cache-only
retrieval first, followed only when needed by a persistent authenticated
Chromium profile.

## Current direction

`fetch` sends one cache-only Exa Contents request (`maxAgeHours: -1`) and
never requests the target origin. `render` and `screenshot` directly navigate
with the same dedicated persistent Chromium profile. Search/discovery and
interactive browsing are outside PEW-PEW.

## Invariants

- One model-facing `web({url, mode})` tool.
- No origin preflight, `robots.txt`/`llms.txt` probing, crawling, interaction,
  credential handling, or automatic retries.
- Browser modes remain read-only; humans establish SSO directly in Chromium.
- Normal tests are hermetic; the real Exa smoke test is opt-in.

## Definition of done

Keep Exa and Chromium behavior bounded and separately tested; run `npm ci`,
`npm run check`, and `npm pack --dry-run` before changes. Keep project state
synchronized with canonical files.

## Previous action

Reviewed the Exa-cache/persistent-profile refactor, corrected Exa protocol and
response-boundary handling, removed the stale `robots-parser` lock entry, and
added focused hermetic tests.

## Immediate next step

Maintain the small three-mode architecture; use `pi-chrome-use` for interactive
browser work and a remote research worker for search.
