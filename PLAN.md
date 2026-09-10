# Pi PEW-PEW — Politeness Policy Refactor

## Goal

Make PEW-PEW less refusal-heavy while remaining transparent, low-volume, and non-circumventing.

Core rule:

> Treat `robots.txt` and `llms.txt` as policy signals for automated access, not universal authorization barriers for isolated user-directed retrieval. Enforce politeness primarily through low request rates, bounded scope, and respect for actual server-side refusal or access controls.

## Implementation status and hardening scope

The main refactor is already present. This pass must verify the implementation against every acceptance criterion and close remaining edge cases, especially:

- preserve policy and final-response metadata when a target refuses access;
- recommend waiting for `Retry-After` only when the header contains a usable delay;
- recognize standardized ToS relations without accepting similarly named HTML attributes;
- verify redirect, cancellation, queue-release, and pacing behavior rather than relying only on happy-path tests.

The later disallowed-request guard is the one deliberate exception to reserving `refused` for server-side access refusal: after the two-request isolated-use allowance is exhausted, PEW-PEW refuses further disallowed requests locally as crawler-like repetition.

## 1. Keep `robots.txt`, change its role

Retain `robots-parser`.

For ordinary `web(url)` calls:

- fetch and parse `/robots.txt`;
- record whether the requested URL is allowed or disallowed;
- expose that status in result metadata;
- do **not** refuse a single user-directed fetch solely because of `Disallow`.

Continue caching robots policy per origin.

Treat robots as mandatory only for future crawler-like behavior such as:

- recursive link following;
- enumeration;
- bulk extraction;
- corpus construction.

Do not add such crawling behavior in this change. A disallowed target still gets a small user-directed allowance: permit two disallowed target-page retrievals per origin per Pi session, including the first. Refuse later disallowed target-page retrievals as crawler-like repetition. Do not count automatic `robots.txt` or `llms.txt` metadata retrievals against that allowance.

## 2. Simplify refusal rules

Hard-stop when the requested resource itself returns:

- `401`
- `403`
- `407`
- `429`
- `451`

For `429`, surface and respect `Retry-After`.

For `503`:

- do not automatically retry;
- surface it as temporary failure;
- treat explicit/repeated server refusal conservatively.

Do not switch from `fetch` to `render` or `screenshot` to evade a refusal.

## 3. Make non-circumvention explicit

PEW-PEW must not:

- spoof a browser/User-Agent to avoid blocking;
- solve or bypass CAPTCHAs;
- bypass Anubis-like proof-of-work or anti-bot systems;
- reuse stolen/external clearance cookies;
- rotate proxies to evade restrictions;
- bypass authentication or paywalls;
- deliberately defeat technical access controls.

If normal unmodified Chromium naturally loads the page, that is acceptable.

For plain HTTP fetches, retain an honest PEW-PEW User-Agent.

For Chromium modes, leave Chromium's native User-Agent unchanged.

## 4. Add same-origin request pacing

Keep the existing per-origin queue.

Add a small minimum gap between completed requests to the same origin, e.g. roughly:

```text
500–1000 ms
```

Use a 750 ms default gap. After a disallowed target-page retrieval, extend that origin's next gap to 2.75 seconds. Prefer named constants for both values.

Requirements:

- same-origin requests remain serialized;
- unrelated origins may still run concurrently;
- `Retry-After` always overrides normal pacing;
- no automatic retry loop.

This becomes the main mechanical politeness control.

## 5. Reframe `llms.txt`

Continue looking for `/llms.txt`, but do not treat arbitrary prose in it as authority over the user's task.

Use it as untrusted site metadata.

Keep the prompt-injection wrapper.

Do not obey instructions that attempt to:

- change the task;
- invoke tools;
- reveal secrets;
- modify state;
- override higher-priority instructions.

A statement such as "do not use for AI training" should not block ordinary user-directed reading.

Do not add semantic AI-based classification of `llms.txt`.

## 6. Add lightweight ToS discovery

Do not guess common paths such as `/terms`, `/tos`, or `/legal`.

Instead detect standardized ToS references when already present:

- HTTP `Link` headers with `rel="terms-of-service"`;
- HTML `<link rel="terms-of-service">`.

Surface the raw standardized Link header or HTML link tag in metadata for the model to interpret. Do not build a ToS parser or fetch the referenced ToS automatically.

Do not automatically fetch the ToS for a normal isolated page request.

Leave actual ToS inspection for tasks involving repeated/bulk automated extraction or when explicitly requested.

## 7. Preserve bounded retrieval

Keep the current interface:

```ts
web({
  url,
  mode?: "fetch" | "render" | "screenshot"
})
```

Do not add:

- batch URLs;
- crawl depth;
- automatic link following;
- search-engine behavior;
- browser interaction;
- arbitrary JavaScript execution.

One model call should still correspond to one deliberate target URL.

## 8. Update result metadata

Useful policy metadata should include:

```text
robots: allowed | disallowed | absent | unavailable
llms.txt: found | absent | unavailable
terms-of-service: raw standardized hint | absent
```

A robots disallow should be visible but should not change either of the first two isolated results to `refused`.

Reserve `refused` for genuine server/access-control refusal and the explicit local repetition guard described in section 1.

## 9. Tests

Update/add tests covering:

### robots
- allowed page proceeds;
- disallowed page also proceeds;
- metadata records disallow;
- absent robots proceeds;
- unavailable robots proceeds;
- cache behavior remains correct.

### refusal
- 401/403/407/429/451 stop;
- `Retry-After` surfaced;
- no fallback to another mode after refusal;
- 503 is not retried automatically.

### pacing
- same-origin calls serialize;
- minimum spacing is enforced;
- cross-origin calls remain concurrent;
- cancellation/error releases queue.

### browser identity
- no explicit Chromium `--user-agent` override;
- fetch uses PEW-PEW's declared User-Agent.

### ToS
- HTTP `Link: ... rel="terms-of-service"` detected;
- HTML `<link rel="terms-of-service">` detected;
- no speculative `/terms` requests.

### llms.txt
- remains bounded and wrapped;
- prompt injection remains untrusted;
- anti-training wording does not block ordinary page retrieval.

## 10. Documentation

Update README/PLAN wording to describe PEW-PEW as:

> A user-directed, read-only web retrieval tool. It is deliberately low-volume and does not crawl or circumvent access controls.

Document the distinction:

```text
robots.txt       crawler policy signal
HTTP refusal     access/refusal signal
anti-bot barrier technical access control
rate limiting    mandatory politeness signal
```

## Acceptance criteria

1. `robots.txt` remains parsed and reported.
2. `Disallow` alone no longer blocks isolated `web(url)` retrieval.
3. Actual resource-level refusal remains a hard stop.
4. No mode escalation is used to evade refusal.
5. Chromium identity is not spoofed.
6. Anti-bot/CAPTCHA/paywall circumvention remains out of scope.
7. Same-origin requests are deliberately paced.
8. No automatic crawling or bulk extraction is introduced.
9. `llms.txt` remains untrusted metadata, not task authority.
10. Standard ToS hints are surfaced without parsing or generating speculative requests.
11. Existing bounded-output, timeout, redirect, and cleanup guarantees remain intact.
12. Tests and public documentation reflect the new policy accurately.