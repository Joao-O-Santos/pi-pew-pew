# Current architecture

## Interface

- Preserve the sole `web({url, mode})` API. `fetch` is the default.
- `fetch` accepts HTTP(S) URLs, requires `EXA_API_KEY`, and sends one
  Exa Contents request with `maxAgeHours: -1`. It is cache-only, never
  contacts the requested origin, and never escalates automatically.
- `render` accepts HTTP(S) URLs and reads a Chromium-rendered DOM through
  a dedicated persistent profile. Pandoc converts the DOM to Markdown
  when available; otherwise PEW-PEW returns bounded HTML.
- `screenshot` accepts HTTP(S) and local `file://` URLs and captures a
  1280x900 PNG through the same Chromium profile.

## Boundaries

- Browser modes directly contact the origin but remain non-interactive:
  no clicks, typing, submissions, arbitrary JavaScript, crawling,
  credential handling, automatic retries, or access-control bypasses.
- The Chromium profile is human-managed. A user may establish a
  legitimate session in it; PEW-PEW does not authenticate or extract
  credentials.
- Keep search, crawling, `robots.txt`, and `/llms.txt` probing outside
  PEW-PEW.
- Treat every URL-derived field and retrieved page as untrusted data.

## Operational constraints

- Enforce output, provider-response, DOM, screenshot, and process-time
  bounds at their respective boundaries.
- Profile path: `PEW_PEW_CHROMIUM_PROFILE`, then
  `$XDG_CONFIG_HOME/pi/pi-pew-pew/chromium`, then
  `~/.config/pi/pi-pew-pew/chromium`.
- Chromium discovery: `PEW_PEW_CHROMIUM`, `chromium`,
  `chromium-browser`, then `google-chrome`. Pandoc discovery:
  `PEW_PEW_PANDOC`, then `pandoc`.
- Keep normal verification hermetic. Retain only an opt-in Exa smoke
  test for live provider confirmation.
