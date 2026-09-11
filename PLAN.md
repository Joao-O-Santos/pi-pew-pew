# Current architecture

- Preserve the sole `web({url, mode})` API.
- `fetch` asks Exa's Contents API for one known URL with `maxAgeHours: -1`;
  it is cache-only and never escalates automatically.
- `render` and `screenshot` directly use the same human-authenticated,
  persistent Chromium profile without an anonymous HTTP preflight.
- Keep browser work read-only and non-interactive.
- Keep search, crawling, `robots.txt`, and `/llms.txt` probing outside
  PEW-PEW.
- Keep normal verification hermetic; retain only an opt-in Exa smoke test.
