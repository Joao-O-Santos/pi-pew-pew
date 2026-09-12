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

Clarified user documentation and model-facing guidance, separated
confirmed cache misses from indeterminate Exa failures, and enabled
GitLab line-coverage reporting.

## Immediate next step

Preserve the three-mode boundary and its bounded, separately tested Exa
and Chromium paths. Use `pi-chrome-use` for interactive browser work and
a separate research tool to discover URLs.
