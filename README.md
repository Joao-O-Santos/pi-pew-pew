# pi-pew-pew

![pi-pew-pew logo](logo.png)

[![pipeline
status](https://gitlab.com/Joao-O-Santos/pi-pew-pew/badges/main/pipeline.svg)](https://gitlab.com/Joao-O-Santos/pi-pew-pew/-/commits/main)
[![npm
version](https://img.shields.io/npm/v/pi-pew-pew.svg)](https://www.npmjs.com/package/pi-pew-pew)
[![npm
downloads](https://img.shields.io/npm/dt/pi-pew-pew.svg)](https://www.npmjs.com/package/pi-pew-pew)
[![license](https://img.shields.io/npm/l/pi-pew-pew.svg)](https://gitlab.com/Joao-O-Santos/pi-pew-pew/-/blob/main/LICENSE)

**Small-batch read-only web access for Pi.**

`pi-pew-pew` gives Pi one deliberately small `web` tool. Cached reading
goes through Exa without contacting the requested origin; JavaScript,
authenticated pages, and screenshots use one dedicated persistent
Chromium profile on the local machine.

It is intentionally not a browser automation framework. It does not
expose click, type, submit, arbitrary JavaScript, shell access,
crawling, or browser-control primitives. Use `pi-chrome-use` when a task
actually requires interaction.

## Install

``` sh
pi install npm:pi-pew-pew
```

Or install the package from GitLab while developing:

``` sh
pi install git:https://gitlab.com/Joao-O-Santos/pi-pew-pew.git
```

Set an Exa API key for cached retrieval:

``` sh
export EXA_API_KEY='...'
```

`fetch` uses Exa's Contents API with `maxAgeHours: -1`, which Exa
documents as cache-only: PEW-PEW will not ask Exa to live-crawl the
requested origin. It makes one API request and does not retry
automatically.

## Tool

Pi sees exactly one model-facing tool:

``` ts
web({
  url,
  mode?: "fetch" | "render" | "screenshot"
})
```

Use the modes in this order:

1.  `fetch` --- retrieve Exa's cached text for a known HTTP(S) URL. This
    does not contact the requested origin.
2.  `render` --- open the original HTTP(S) URL in headless Chromium
    using PEW-PEW's persistent profile, then return the post-JavaScript
    DOM as Markdown when Pandoc is available.
3.  `screenshot` --- use the same Chromium profile to capture a 1280x900
    viewport PNG. Local `file://` URLs are also supported for
    screenshots.

The default mode is `fetch`. A cache miss is reported without silently
escalating to Chromium.

## Chromium profile

`render` and `screenshot` reuse one durable browser profile even when
the Pi worker itself is ephemeral. The default location is:

``` text
$XDG_CONFIG_HOME/pi/pi-pew-pew/chromium
```

or, when `XDG_CONFIG_HOME` is unset:

``` text
~/.config/pi/pi-pew-pew/chromium
```

Override it with `PEW_PEW_CHROMIUM_PROFILE`.

To establish institutional SSO or other legitimate browser sessions,
open Chromium yourself with that profile, sign in normally, then close
it before PEW-PEW uses it. For the default Linux path:

``` sh
chromium --user-data-dir="$HOME/.config/pi/pi-pew-pew/chromium"
```

PEW-PEW never receives your password or MFA secret. Do not use the
profile for unrelated personal services. Chromium normally locks a
profile while it is open; close the manual login window before an agent
uses `render` or `screenshot`.

PEW-PEW does not perform an anonymous HTTP preflight before browser
navigation. That avoids an unnecessary request and allows legitimate
authenticated access to pages that reject anonymous requests. It also
means Chromium itself is the origin request for browser modes.

## Access boundary

The split is intentional:

- Search and discovery are outside PEW-PEW; use a remote research worker
  (for example, Parallel via MCPorter) to find a URL first.
- `fetch` contacts Exa only and uses cached content for that known URL.
- `render` and `screenshot` contact the original site through your
  dedicated Chromium profile.
- Browser modes do not click, type, submit, rotate proxies, solve
  CAPTCHAs, retry automatically, or attempt to bypass access controls or
  rate limits.
- PEW-PEW no longer performs automatic `robots.txt` or `/llms.txt`
  requests. Those extra origin requests are unnecessary for cache-only
  retrieval and would duplicate browser traffic for authenticated reads.
- Website content remains untrusted data and cannot override the user's
  task or higher-priority instructions.

If a site advertises agent-oriented metadata or Markdown alternatives in
content already retrieved, the model may use those links deliberately;
PEW-PEW does not probe speculative paths automatically.

## Optional programs

`render` and `screenshot` discover Chromium in this order:

``` text
PEW_PEW_CHROMIUM
chromium
chromium-browser
google-chrome
```

Set `PEW_PEW_CHROMIUM` to an explicit executable path when needed. If
Chromium is unavailable, use an interactive browser extension such as
`pi-chrome-use` for tasks requiring browser automation.

For local documents such as PDFs, pass an absolute `file://` URL with
`mode: "screenshot"`:

``` ts
web({ url: "file:///home/me/document.pdf#page=2", mode: "screenshot" })
```

Local files are only supported for screenshots and must be no larger
than 256 MiB. A PDF fragment such as `#page=2` can select a page in
Chromium's PDF viewer.

HTML conversion discovers Pandoc in this order:

``` text
PEW_PEW_PANDOC
pandoc
```

Pandoc is optional. If it is unavailable or conversion fails, PEW-PEW
returns bounded HTML instead of losing the page.

## Limits

| Resource or operation  | Limit                |
|------------------------|----------------------|
| returned text          | 50 KiB / 2,000 lines |
| Exa API response       | 256 KiB              |
| Exa fetch operation    | 15 seconds           |
| Pandoc conversion      | 10 seconds           |
| Chromium operation     | 30 seconds           |
| Chromium DOM           | 2 MiB                |
| local screenshot input | 256 MiB              |
| screenshot             | 10 MiB               |

Cancellation propagates to Exa retrieval, Pandoc, and Chromium.
Temporary screenshot files are removed even when cancelled or failed.

## Tests

The normal suite is hermetic and does not require an API key or network
access. Exa requests are tested through injected fake `fetch`
implementations, including the cache-only request body, cache misses,
rate limits, cancellation boundaries, and absence of retries.

``` sh
npm run check
```

A real Exa smoke test is intentionally opt-in and is not run by
`npm test`, `npm run check`, or GitLab CI:

``` sh
EXA_API_KEY='...' npm run test:exa
```

## Development

``` sh
npm ci
npm run check
npm pack --dry-run
```

`npm run check` runs TypeScript typechecking, Biome linting and format
verification, the Pandoc Markdown check, and the hermetic test suite.
Use `npm run format:fix` or `npm run markdown:fix` to update local
formatting.

GitLab CI installs the current stable Pandoc release, then runs the same
`npm run check` and package dry run on every configured pipeline.
