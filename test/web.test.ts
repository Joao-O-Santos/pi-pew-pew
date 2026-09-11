import assert from "node:assert/strict";
import { access, chmod, mkdtemp, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  Chromium,
  type ChromiumResult,
  chromiumArguments,
  chromiumProfilePath,
  SCREENSHOT_VIEWPORT,
} from "../src/chromium.js";
import { LIMITS } from "../src/constants.js";
import { absolutizeHtmlLinks, htmlToMarkdown, pandocCandidates } from "../src/convert.js";
import { EXA_CONTENTS_URL, ExaCache } from "../src/exa.js";
import { parseWebUrl } from "../src/http.js";
import { executableWorks } from "../src/process.js";
import { WebService } from "../src/service.js";

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.find((item) => item.type === "text")?.text ?? "";
}

function cachedPage(text = "cached page") {
  return {
    get: async (url: string) => ({ url, title: "Cached title", text }),
  };
}

function fakeChromium() {
  return {
    render: async (): Promise<ChromiumResult> => ({ dom: "<h1>Rendered</h1>" }),
    screenshot: async (): Promise<ChromiumResult> => ({ screenshot: Buffer.from("png") }),
  };
}

test("URL validation preserves local PDF fragments only for screenshots", () => {
  assert.equal(parseWebUrl("https://example.test/a#fragment").hash, "");
  assert.throws(() => parseWebUrl("file:///etc/passwd"), /HTTP or HTTPS/);
  assert.equal(parseWebUrl("file:///tmp/document.pdf#page=2", { allowFile: true }).hash, "#page=2");
});

test("Exa fetch is cache-only, bounded, authenticated, and never targets the requested origin", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(input), init });
    return new Response(
      JSON.stringify({
        results: [{ url: "https://example.test/article", title: "Article", text: "body" }],
        statuses: [{ id: "https://example.test/article", status: "success", source: "cached" }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const cache = new ExaCache(fetch as typeof globalThis.fetch, "test-key");
  const page = await cache.get("https://example.test/article", new AbortController().signal);
  assert.equal(page.text, "body");
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.ok(call);
  assert.equal(call.url, EXA_CONTENTS_URL);
  assert.equal(call.init?.method, "POST");
  assert.equal(new Headers(call.init?.headers).get("authorization"), "Bearer test-key");
  assert.equal(new Headers(call.init?.headers).get("x-api-key"), null);
  const body = JSON.parse(String(call.init?.body));
  assert.deepEqual(body.urls, ["https://example.test/article"]);
  assert.equal(body.maxAgeHours, -1);
  assert.equal(body.text.maxCharacters, LIMITS.exaTextCharacters);
});

test("Pi cancellation reaches the Exa request", async () => {
  let requestSignal: AbortSignal | undefined;
  const fetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    requestSignal = init?.signal as AbortSignal | undefined;
    return new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(requestSignal?.reason);
      requestSignal?.addEventListener("abort", abort, { once: true });
      if (requestSignal?.aborted) abort();
    });
  };
  const parent = new AbortController();
  const pending = new WebService(
    new ExaCache(fetch as typeof globalThis.fetch, "test-key"),
    fakeChromium(),
  ).execute("https://example.test/slow", "fetch", parent.signal);
  await new Promise<void>((resolve) => setImmediate(resolve));
  parent.abort(new Error("cancelled"));
  await assert.rejects(pending, /cancelled/);
  assert.equal(requestSignal?.aborted, true);
});

test("Exa errors do not retry and surface Retry-After", async () => {
  let calls = 0;
  const fetch = async (): Promise<Response> => {
    calls += 1;
    return new Response("{}", { status: 429, headers: { "retry-after": "60" } });
  };
  const service = new WebService(
    new ExaCache(fetch as typeof globalThis.fetch, "test-key"),
    fakeChromium(),
  );
  const result = await service.execute("https://example.test/limited", "fetch");
  assert.equal(calls, 1);
  assert.equal(result.details.outcome, "failed");
  assert.equal(result.details.source, "exa");
  assert.equal(result.details.status, 429);
  assert.equal(result.details.retryAfter, "60");
  assert.match(text(result), /no automatic retry/i);
});

test("Exa rejects invalid JSON, malformed responses, and non-cache results", async () => {
  const cases = [
    { body: "not JSON", message: /invalid JSON/ },
    { body: JSON.stringify({ results: [] }), message: /malformed response/ },
    {
      body: JSON.stringify({
        results: [{ text: "body" }],
        statuses: [{ id: "https://example.test/page", status: "success", source: "crawled" }],
      }),
      message: /malformed response/,
    },
  ];
  for (const { body, message } of cases) {
    const fetch = async (): Promise<Response> => new Response(body, { status: 200 });
    await assert.rejects(
      new ExaCache(fetch as typeof globalThis.fetch, "test-key").get(
        "https://example.test/page",
        new AbortController().signal,
      ),
      message,
    );
  }
});

test("Exa bounds successful provider responses", async () => {
  let cancelled = false;
  const fetch = async (): Promise<Response> =>
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      { status: 200, headers: { "content-length": String(LIMITS.exaResponseBytes + 1) } },
    );
  await assert.rejects(
    new ExaCache(fetch as typeof globalThis.fetch, "test-key").get(
      "https://example.test/page",
      new AbortController().signal,
    ),
    /exceeds/,
  );
  assert.equal(cancelled, true);
});

test("Exa bounds chunked provider responses", async () => {
  let cancelled = false;
  const fetch = async (): Promise<Response> =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(LIMITS.exaResponseBytes + 1));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { status: 200 },
    );
  await assert.rejects(
    new ExaCache(fetch as typeof globalThis.fetch, "test-key").get(
      "https://example.test/page",
      new AbortController().signal,
    ),
    /exceeds/,
  );
  assert.equal(cancelled, true);
});

test("non-rate-limit Exa HTTP errors are structured failures", async () => {
  const fetch = async (): Promise<Response> => new Response("provider error", { status: 401 });
  const result = await new WebService(
    new ExaCache(fetch as typeof globalThis.fetch, "test-key"),
    fakeChromium(),
  ).execute("https://example.test/page", "fetch");
  assert.equal(result.details.outcome, "failed");
  assert.equal(result.details.status, 401);
  assert.equal(result.details.source, "exa");
});

test("Exa cache miss suggests render without contacting the origin", async () => {
  let calls = 0;
  const fetch = async (): Promise<Response> => {
    calls += 1;
    return new Response(
      JSON.stringify({
        results: [],
        statuses: [{ id: "https://example.test/miss", status: "error" }],
      }),
      { status: 200 },
    );
  };
  const result = await new WebService(
    new ExaCache(fetch as typeof globalThis.fetch, "test-key"),
    fakeChromium(),
  ).execute("https://example.test/miss", "fetch");
  assert.equal(calls, 1);
  assert.equal(result.details.outcome, "failed");
  assert.equal(result.details.suggestedMode, "render");
  assert.match(text(result), /cached content/i);
});

test("missing Exa key fails locally without a network request", async () => {
  let calls = 0;
  const fetch = async (): Promise<Response> => {
    calls += 1;
    throw new Error("must not run");
  };
  const result = await new WebService(
    new ExaCache(fetch as typeof globalThis.fetch, ""),
    fakeChromium(),
  ).execute("https://example.test/page", "fetch");
  assert.equal(calls, 0);
  assert.equal(result.details.outcome, "failed");
  assert.match(text(result), /EXA_API_KEY/);
});

test("cached fetch output, including provider metadata, remains bounded", async () => {
  const cache = {
    get: async (url: string) => ({
      url,
      title: "title\n".repeat(LIMITS.outputLines + 1),
      text: "x".repeat(LIMITS.outputBytes * 2),
    }),
  };
  const result = await new WebService(cache, fakeChromium()).execute(
    "https://example.test/page",
    "fetch",
  );
  assert.equal(result.details.outcome, "ok");
  assert.equal(result.details.source, "exa");
  assert.equal(result.details.truncated, true);
  assert.ok(Buffer.byteLength(text(result)) <= LIMITS.outputBytes);
  assert.ok(text(result).split("\n").length <= LIMITS.outputLines);
});

test("render goes straight to Chromium and converts its DOM", async () => {
  let cacheCalls = 0;
  const cache = {
    get: async () => {
      cacheCalls += 1;
      throw new Error("cache must not run");
    },
  };
  const calls: string[] = [];
  const chromium = {
    render: async (url: string): Promise<ChromiumResult> => {
      calls.push(url);
      return { dom: '<h1>Rendered</h1><a href="/next">Next</a>' };
    },
    screenshot: async (): Promise<ChromiumResult> => ({ screenshot: Buffer.from("png") }),
  };
  const result = await new WebService(cache, chromium).execute(
    "https://example.test/app",
    "render",
  );
  assert.equal(cacheCalls, 0);
  assert.deepEqual(calls, ["https://example.test/app"]);
  assert.equal(result.details.source, "chromium");
  assert.match(text(result), /Rendered/);
});

test("remote screenshots go straight to Chromium", async () => {
  let calls = 0;
  const chromium = {
    render: async (): Promise<ChromiumResult> => ({ dom: "" }),
    screenshot: async (url: string): Promise<ChromiumResult> => {
      calls += 1;
      assert.equal(url, "https://example.test/visual");
      return { screenshot: Buffer.from("png") };
    },
  };
  const result = await new WebService(cachedPage(), chromium).execute(
    "https://example.test/visual",
    "screenshot",
  );
  assert.equal(calls, 1);
  assert.equal(result.details.source, "chromium");
  assert.deepEqual(result.details.capture, SCREENSHOT_VIEWPORT);
  assert.equal(result.content[1]?.type, "image");
});

test("Chromium arguments always use the dedicated profile and never spoof user agent", () => {
  const args = chromiumArguments(["--dump-dom"], "https://example.test", "/tmp/pew-profile");
  assert.ok(args.includes("--user-data-dir=/tmp/pew-profile"));
  assert.ok(!args.some((arg) => arg.startsWith("--user-agent")));
});

test("Chromium profile path has one deterministic default with environment overrides", () => {
  assert.equal(
    chromiumProfilePath({}, "/home/test"),
    join("/home/test", ".config", "pi", "pi-pew-pew", "chromium"),
  );
  assert.equal(
    chromiumProfilePath({ XDG_CONFIG_HOME: "/xdg" }, "/home/test"),
    join("/xdg", "pi", "pi-pew-pew", "chromium"),
  );
  assert.equal(
    chromiumProfilePath({ PEW_PEW_CHROMIUM_PROFILE: "/custom/profile" }, "/home/test"),
    "/custom/profile",
  );
});

test("Chromium creates its profile and removes temporary screenshots", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-pew-pew-chromium-test-"));
  const executable = join(directory, "fake-chromium");
  const profile = join(directory, "profile");
  const record = join(directory, "screenshot-directory");
  const original = process.env.PEW_PEW_CHROMIUM;
  await writeFile(
    executable,
    `#!/bin/sh
if [ "$1" = "--version" ]; then exit 0; fi
for arg do
  case "$arg" in --screenshot=*) screenshot="\${arg#--screenshot=}";; esac
done
printf x > "$screenshot"
dirname "$screenshot" > "${record}"
`,
  );
  await chmod(executable, 0o700);
  process.env.PEW_PEW_CHROMIUM = executable;
  try {
    const result = await new Chromium(profile).screenshot(
      "https://example.test/visual",
      new AbortController().signal,
    );
    assert.deepEqual(result.screenshot, Buffer.from("x"));
    await access(profile);
    await assert.rejects(access((await readFile(record, "utf8")).trim()));
  } finally {
    if (original === undefined) delete process.env.PEW_PEW_CHROMIUM;
    else process.env.PEW_PEW_CHROMIUM = original;
    await rm(directory, { recursive: true, force: true });
  }
});

test("Pandoc discovery prefers an explicit path and avoids duplicates", () => {
  assert.deepEqual(pandocCandidates("/opt/pandoc"), ["/opt/pandoc", "pandoc"]);
  assert.deepEqual(pandocCandidates("pandoc"), ["pandoc"]);
});

test("HTML links become absolute and Pandoc fallback remains bounded", async () => {
  assert.equal(
    absolutizeHtmlLinks('<a href="next">Next</a>', "https://example.test/path/"),
    '<a href="https://example.test/path/next">Next</a>',
  );
  const converted = await htmlToMarkdown(
    `<p>${"x".repeat(LIMITS.outputBytes * 2)}</p>`,
    "https://example.test/",
    new AbortController().signal,
    async () => undefined,
  );
  assert.equal(converted.format, "html");
  assert.equal(converted.pandoc, "unavailable");
  assert.ok(Buffer.byteLength(converted.text) <= LIMITS.outputBytes);
});

test("Pandoc removes layout wrappers while preserving absolute links", async (t) => {
  if (!(await executableWorks("pandoc"))) return t.skip("Pandoc is not installed");
  const converted = await htmlToMarkdown(
    '<div class="layout"><a href="/next"><span>Next</span></a></div>',
    "https://example.test/page",
    new AbortController().signal,
    async () => "pandoc",
  );
  assert.equal(converted.text.trim(), "[Next](https://example.test/next)");
});

test("local file screenshots enforce type and size without using Exa", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-pew-pew-test-"));
  const documentPath = join(directory, "document.pdf");
  const oversizedPath = join(directory, "oversized.pdf");
  await writeFile(documentPath, "%PDF-1.7\nlocal test\n");
  await writeFile(oversizedPath, "x");
  await truncate(oversizedPath, LIMITS.localFileBytes + 1);
  const calls: string[] = [];
  const chromium = {
    render: async (): Promise<ChromiumResult> => ({ dom: "" }),
    screenshot: async (url: string): Promise<ChromiumResult> => {
      calls.push(url);
      return { screenshot: Buffer.from("png") };
    },
  };
  const cache = {
    get: async () => {
      throw new Error("Exa must not run for local screenshots");
    },
  };
  try {
    const service = new WebService(cache, chromium);
    const url = `${pathToFileURL(documentPath).href}#page=2`;
    await assert.rejects(service.execute(url, "fetch"), /HTTP or HTTPS/);
    await assert.rejects(service.execute(url, "render"), /HTTP or HTTPS/);
    const result = await service.execute(url, "screenshot");
    assert.equal(result.details.source, "local");
    assert.equal(result.content[1]?.type, "image");
    assert.deepEqual(calls, [url]);
    await assert.rejects(
      service.execute(pathToFileURL(oversizedPath).href, "screenshot"),
      /local file exceeds/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
