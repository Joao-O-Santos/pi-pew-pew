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

### Install from Git

Use the Git repository before an npm release, or whenever you want Pi to follow the repository's default branch (`main`):

```bash
pi install git:git@gitlab.com:Joao-O-Santos/pi-pew-pew
pi update --extensions
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

GitLab CI runs `npm ci`, typechecking, the test suite, and `npm pack --dry-run` on every configured pipeline. It never publishes a package.

## Releasing to npm

Publishing is deliberately manual:

1. Make the GitLab project public if you want source links to work for npm users, then merge the intended release to `main` and tag it.
2. Set the matching semantic version in `package.json`, run `npm run typecheck`, `npm test`, and `npm pack --dry-run`.
3. Authenticate to the public npm registry with `npm login`, then confirm the account with `npm whoami`.
4. Publish from the tagged, clean checkout with `npm publish`.
5. Verify the published tarball with `npm view pi-pew-pew version` and install it in a clean Pi configuration using `pi install npm:pi-pew-pew`.

This repository sets `publishConfig.access` to `public`, but it has no publishing token, registry credential, or automated release job. Never put an npm token in the repository or GitLab CI variables unless you intentionally add a separately reviewed release pipeline.

## License

MIT. See [LICENSE](LICENSE).
