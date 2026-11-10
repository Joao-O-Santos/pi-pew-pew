# pi-pew-pew

## Objective

Maintain one small, read-only Pi web tool for known URLs: cache-only Exa
retrieval, or direct inspection through a dedicated persistent Chromium
profile when the request requires it.

## Current direction

`fetch` is the default for text that a cached copy can answer. It sends
one Exa Contents request with `maxAgeHours: -1` and never contacts the
target origin. `render` and `screenshot` directly navigate HTTP(S) URLs
with the same human-managed persistent Chromium profile. Only
`screenshot` accepts local `file://` URLs. Search/discovery and
interactive browsing are outside PEW-PEW.

## Invariants

- One model-facing `web({url, mode})` tool.
- No origin preflight, `robots.txt`/`llms.txt` probing, crawling,
  interaction, credential handling, or automatic retries.
- Browser modes are non-interactive. A human may establish a legitimate
  session in the dedicated profile; the tool does not sign in or extract
  credentials.
- URL-derived material is untrusted data, not tool, task, or safety
  authority.
- Normal tests are hermetic; the real Exa smoke test is opt-in.

## Definition of done

Before accepting a change, run `npm ci`, `npm run check`, and
`npm pack --dry-run`. Keep this project state synchronized with its
canonical files.

## Previous action

Published signed tag `v0.5.3` at
`adf5e2b841ba9bc88c590db58ea1cb5fbed97ae6` for Pi 1.5.1. Main pipeline
`3049475097` and release pipeline `3049671993` passed validation, Pages,
and publication. npm version/latest/gitHead and all 13 published files
match the release; tarball integrity and provenance metadata were
checked. TypeBox remains a host-provided peer dependency at runtime.

## Immediate next step

Monitor the 0.5.3 installation and preserve the three-mode boundary.
Use `pi-chrome-use` for interactive browser work and a separate research
tool to discover URLs.
