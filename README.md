# pi-pew-pew

![pi-pew-pew logo](logo.png)

[![pipeline
status](https://gitlab.com/Joao-O-Santos/pi-pew-pew/badges/main/pipeline.svg)](https://gitlab.com/Joao-O-Santos/pi-pew-pew/-/commits/main)
[![coverage](https://gitlab.com/Joao-O-Santos/pi-pew-pew/badges/main/coverage.svg?job=validate)](https://gitlab.com/Joao-O-Santos/pi-pew-pew/-/pipelines)
[![npm
version](https://img.shields.io/npm/v/pi-pew-pew.svg)](https://www.npmjs.com/package/pi-pew-pew)
[![npm
downloads](https://img.shields.io/npm/dt/pi-pew-pew.svg)](https://www.npmjs.com/package/pi-pew-pew)
[![license](https://img.shields.io/npm/l/pi-pew-pew.svg)](https://gitlab.com/Joao-O-Santos/pi-pew-pew/-/blob/main/LICENSE)

**Small-batch web inspection for Pi.**

`pi-pew-pew` gives Pi one deliberately small `web` tool. It can read
Exa's cached copy of a known URL without contacting the requested
origin, inspect an HTTP(S) origin through a dedicated persistent
Chromium profile, or capture a screenshot.

The exposed operations are for inspection, not browser automation.
PEW-PEW does not search, click, type, submit, run arbitrary JavaScript,
or crawl. Use an interactive browser tool such as `pi-chrome-use` when a
task requires browser control.

## Install

Pi must be running on Node.js 22.19.0 or later.

``` sh
pi install npm:pi-pew-pew
```

Or install the package from GitLab while developing:

``` sh
pi install git:https://gitlab.com/Joao-O-Santos/pi-pew-pew.git
```

`fetch` requires an Exa API key in Pi's environment:

``` sh
export EXA_API_KEY='...'
```

Chromium is required only for `render` and `screenshot`. Pandoc is
optional and improves rendered-page conversion to Markdown.

## Tool and modes

Pi sees one model-facing tool:

``` ts
web({
  url,
  mode?: "fetch" | "render" | "screenshot"
})
```

Choose the mode that matches the task:

| Mode | Use when | Accepted URLs | Contact and output |
|------------------|------------------|------------------|------------------|
| `fetch` (default) | cached text could answer the request | HTTP(S) | contacts Exa only; returns cached text |
| `render` | origin, session-dependent, or JavaScript-rendered text is required | HTTP(S) | opens the origin in Chromium; returns Markdown or bounded HTML |
| `screenshot` | visual interpretation requires pixels, or a local document must be viewed | HTTP(S), `file://` | opens the resource in Chromium; returns a 1280x900 PNG |

Go directly to `render` or `screenshot` when cached text cannot satisfy
the stated requirement. PEW-PEW never changes modes automatically. A
confirmed Exa cache miss suggests `render`; configuration and provider
failures do not imply that a cached copy is unavailable.

`fetch` sends one Exa Contents API request with `maxAgeHours: -1`, which
Exa documents as cache-only. PEW-PEW does not ask Exa to live-crawl the
requested origin and does not retry automatically.

## Chromium profile

`render` and `screenshot` use one dedicated, persistent Chromium
profile. The profile is managed by the human and may contain sessions
established through normal sign-in. PEW-PEW does not ask for, extract,
or expose credentials.

The default profile location is:

``` text
$XDG_CONFIG_HOME/pi/pi-pew-pew/chromium
```

or, when `XDG_CONFIG_HOME` is unset:

``` text
~/.config/pi/pi-pew-pew/chromium
```

Override it with `PEW_PEW_CHROMIUM_PROFILE`.

To establish institutional SSO or another legitimate session, open
Chromium yourself with that profile, sign in normally, then close it
before PEW-PEW uses it. For the default Linux path:

``` sh
chromium --user-data-dir="$HOME/.config/pi/pi-pew-pew/chromium"
```

Do not use this profile for unrelated personal services. Chromium
normally locks a profile while it is open, so close the manual login
window before using `render` or `screenshot`.

PEW-PEW does not perform an anonymous HTTP preflight before browser
navigation. Chromium itself contacts the origin. Navigation may also
update normal browser state such as cookies and cache, even though the
tool exposes no interactive actions.

## Access and trust boundary

The split between modes is intentional:

- Search and discovery are outside PEW-PEW. Find a URL before calling
  the tool.
- `fetch` contacts Exa only and requests cached content for that URL.
- `render` and remote `screenshot` calls contact the original site
  through the dedicated Chromium profile.
- Browser modes do not click, type, submit, rotate proxies, solve
  CAPTCHAs, retry automatically, or attempt to bypass access controls or
  rate limits.
- PEW-PEW does not make speculative `robots.txt` or `/llms.txt`
  requests.
- Titles, returned URLs, page text, DOM text, and instructions embedded
  in retrieved content remain untrusted data. They cannot authorize new
  tools or change the user's task.

If retrieved content advertises agent-oriented metadata or a Markdown
alternative, the model may follow that link deliberately. PEW-PEW does
not probe speculative paths automatically.

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
`pi-chrome-use` when the task requires browser automation.

For a local document such as a PDF, pass an absolute `file://` URL with
`mode: "screenshot"`:

``` ts
web({ url: "file:///home/me/document.pdf#page=2", mode: "screenshot" })
```

Local files are supported only for screenshots and must be no larger
than 256 MiB. A PDF fragment such as `#page=2` can select a page in
Chromium's PDF viewer.

HTML conversion discovers Pandoc in this order:

``` text
PEW_PEW_PANDOC
pandoc
```

If Pandoc is unavailable or conversion fails, PEW-PEW returns bounded
HTML instead of discarding the page.

## Limits

| Resource or operation             | Limit                |
|-----------------------------------|----------------------|
| returned text, including metadata | 50 KiB / 2,000 lines |
| text requested from Exa           | 10,000 characters    |
| Exa API response                  | 256 KiB              |
| Exa fetch operation               | 15 seconds           |
| Pandoc conversion                 | 10 seconds           |
| Chromium operation                | 30 seconds           |
| Chromium DOM                      | 2 MiB                |
| local screenshot input            | 256 MiB              |
| screenshot image                  | 10 MiB               |

Cancellation propagates to Exa retrieval, Pandoc, and Chromium.
Temporary screenshot files are removed after success, cancellation, or
failure.

## Tests

The default suite is hermetic: it needs neither an Exa key nor external
network access. Injected `fetch` implementations test the cache-only
request, cache and provider failures, rate limits, bounds, cancellation,
and the absence of automatic retries.

``` sh
npm run check
```

Run the same suite with Node's line-coverage report:

``` sh
npm run test:coverage
```

The README coverage badge reports the line percentage extracted from the
GitLab `validate` job. It is a report, not a configured coverage
threshold.

A real Exa smoke test is deliberately separate from the default suite
and GitLab CI:

``` sh
EXA_API_KEY='...' npm run test:exa
```

## Development and release

``` sh
npm ci
npm run check
npm pack --dry-run
```

`npm run check` runs TypeScript typechecking, Biome linting and format
verification, the Pandoc Markdown check, and the hermetic test suite.
Use `npm run format:fix` or `npm run markdown:fix` to update local
formatting.

The GitLab `validate` job installs the latest stable Pandoc release,
runs those checks, records line coverage, and performs a package dry
run. The main branch and release tags also publish this README through
GitLab Pages. Tags matching `vX.Y.Z` or the configured SemVer prerelease
form trigger npm publication after validation succeeds.

## License

[MIT](LICENSE)
