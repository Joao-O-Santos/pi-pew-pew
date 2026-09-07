# pi-pew-pew

**pew-pew — Pi Explores Webs; Politely Escalates Webfetches**

A user-directed, read-only [Pi](https://pi.dev) web-retrieval extension. It is deliberately low-volume and does not crawl or circumvent access controls.

```text
web({ url, mode?: "fetch" | "render" | "screenshot" })
```

It deliberately does not provide clicking, typing, form submission, arbitrary JavaScript, shell access, crawling, search, login automation, or anti-bot bypass.

## Install

```bash
pi install npm:pi-pew-pew
```

For a project-local installation:

```bash
pi install -l npm:pi-pew-pew
```

### Install from Git

Use the Git repository before an npm release, or whenever you want Pi to follow the repository's default branch (`main`):

```bash
pi install git:git@gitlab.com:Joao-O-Santos/pi-pew-pew
pi update git:git@gitlab.com:Joao-O-Santos/pi-pew-pew
```

The first command installs it globally under Pi's configured package directory. The second updates it to the current `main` tip. For an isolated project test, add `-l` to `pi install`.

To test one immutable release candidate instead, pin a tag or commit:

```bash
pi install git:git@gitlab.com:Joao-O-Santos/pi-pew-pew@<tag-or-commit>
```

Pinned Git packages do not advance during `pi update --extensions`; reinstall with the next tag or commit to move them forward.

The package requires Node.js 22.19 or newer. Static fetching uses only Node's built-in `fetch()`.

## How it works

Use the modes in this order:

1. `fetch` — ordinary HTTP retrieval, converted to GitHub-flavored Markdown with Pandoc when available.
2. `render` — headless Chromium's post-JavaScript DOM, for pages whose useful content requires JavaScript.
3. `screenshot` — a PNG image, only when visual interpretation matters.

The model sees exactly one tool, `web`; `mode` defaults to `fetch`. Output is bounded, URLs are restricted to HTTP(S), redirects are limited, and same-origin calls are serialized and paced while unrelated origins can run concurrently.

Before a page request, PEW-PEW checks and reports the origin's `robots.txt` with the honest `pi-pew-pew` user-agent. `robots.txt` is a crawler-policy signal, not a universal barrier to isolated user-directed retrieval: a disallowed target can be read twice per origin in a Pi session, then later disallowed target requests stop as crawler-like repetition. Allowed targets are not charged to that small budget. Successful policies and explicit absence are cached in memory.

Actual resource-level refusals (`401`, `403`, `407`, `429`, and `451`) stop the operation without automatic retries or mode escalation. `429` surfaces and honors `Retry-After`; `503` is surfaced as a temporary failure without retry. PEW-PEW does not spoof user agents, solve CAPTCHAs, bypass anti-bot systems, reuse clearance cookies, rotate proxies, bypass authentication or paywalls, or deliberately defeat access controls. Chromium retains its native user agent.

When `/llms.txt` exists, its bounded contents are returned separately inside a generated contextual boundary as untrusted website metadata. It cannot override the user's task or higher-priority instructions; statements about AI training or bots do not by themselves prohibit an isolated read. When a response already advertises a standardized `terms-of-service` link through an HTTP `Link` header or HTML `<link>` tag, PEW-PEW surfaces the raw hint for model interpretation. It neither parses nor fetches the ToS automatically.

## Optional programs

`render` and `screenshot` discover Chromium in this order:

```text
PEW_PEW_CHROMIUM
chromium
chromium-browser
google-chrome
```

Set `PEW_PEW_CHROMIUM` to an explicit executable path when needed. If Chromium is unavailable, use an interactive browser extension such as `pi-chrome-use` for tasks requiring browser automation.

Pandoc is optional. If it is unavailable or conversion fails, PEW-PEW returns bounded HTML instead of losing the page.

## Limits

The v1 defaults are intentionally conservative:

- HTTP response: 2 MiB
- model-facing text: 50 KiB or 2,000 lines
- redirects: 5
- same-origin gap: 750 ms (2.75 s after a disallowed target)
- disallowed target-page allowance: 2 per origin per Pi session
- `robots.txt`: 512 KiB
- `llms.txt`: 64 KiB
- fetch operation: 15 seconds
- Chromium operation: 30 seconds
- Chromium DOM: 2 MiB
- screenshot: 10 MiB

Cancellation propagates to body reads, Pandoc, and Chromium. Temporary screenshots are removed even when cancelled or failed.

## Development

```bash
npm install
npm run typecheck
npm test
```

The test suite uses deterministic local HTTP servers and does not require network access. Chromium-specific integration tests run only when a Chromium executable is available.

GitLab CI runs `npm ci`, typechecking, the test suite, and `npm pack --dry-run` on every configured pipeline.

## License

MIT. See [LICENSE](LICENSE).
