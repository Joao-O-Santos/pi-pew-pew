# pi-pew-pew

**PEW-PEW — Pi Explores Webs; Politely Escalates Webfetches**

A small, read-only [Pi](https://pi.dev) extension that gives models one polite web tool:

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

The package requires Node.js 22.19 or newer. Static fetching uses only Node's built-in `fetch()`.

## How it works

Use the modes in this order:

1. `fetch` — ordinary HTTP retrieval, converted to GitHub-flavored Markdown with Pandoc when available.
2. `render` — headless Chromium's post-JavaScript DOM, for pages whose useful content requires JavaScript.
3. `screenshot` — a PNG image, only when visual interpretation matters.

The model sees exactly one tool, `web`; `mode` defaults to `fetch`. Output is bounded, URLs are restricted to HTTP(S), redirects are limited, and same-origin calls are serialized while unrelated origins can run concurrently.

Before a page request, PEW-PEW checks the origin's `robots.txt` with the `pi-pew-pew` user-agent. Successful policies and explicit absence are cached in memory. A denied or temporarily unavailable robots policy stops that operation; PEW-PEW never escalates modes to bypass a denial. HTTP refusals such as `401`, `403`, `429`, `407`, and `451` are also surfaced without automatic retries.

When `/llms.txt` exists, its bounded contents are returned separately inside a generated contextual boundary with explicit instructions to treat it as untrusted website data. PEW-PEW does not attempt to decide semantically whether that file is refusing agents or injecting prompts; the model must not obey site content as authority over its tools or goals.

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

## License

MIT. See [LICENSE](LICENSE).
