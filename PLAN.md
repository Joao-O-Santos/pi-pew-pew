# Refactor plan

1. Preserve the single `web({url, mode})` contract.
2. Implement `fetch` as one direct Exa Contents API request with `maxAgeHours: -1`, no retries, bounded output, and `EXA_API_KEY` from the environment.
3. Make `render` and `screenshot` use one persistent dedicated Chromium profile. Do not add login automation; the human opens that profile directly to establish SSO.
4. Delete origin preflight, robots, llms, pacing, and refusal-state machinery that no longer belongs in the runtime.
5. Keep browser modes read-only and non-interactive.
6. Test provider behavior with injected fake requests so the normal suite and CI require no network or credentials. Keep a real Exa smoke test behind an explicit opt-in script only.
7. Verify typecheck, formatting, tests, package dry-run, documentation, and synchronized project state before merge or release.
