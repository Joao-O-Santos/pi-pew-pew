import assert from "node:assert/strict";
import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  type ChromiumResult,
  chromiumArguments,
  chromiumProfilePath,
  SCREENSHOT_VIEWPORT,
} from "../src/chromium.js";
import { LIMITS } from "../src/constants.js";
import { absolutizeHtmlLinks, htmlToMarkdown, pandocCandidates } from "../src/convert.js";
import { ExaCache, EXA_CONTENTS_URL } from "../src/exa.js";
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
      JSON.stringify({ results: [{ url: "https://example.test/article", title: "Article", text: "body" }] }),
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
  assert.equal(new Headers(call.init?.headers).get("x-api-key"), "test-key");
  const body = JSON.parse(String(call.init?.body));
  assert.deepEqual(body.urls, ["https://example.test/article"]);
  assert.equal(body.maxAgeHours, -1);
  assert.equal(body.text.maxCharacters, LIMITS.outputBytes);
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

test("Exa cache miss suggests render without contacting the origin", async () => {
  let calls = 0;
  const fetch = async (): Promise<Response> => {
    calls += 1;
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  };
  const result = await new WebService(
    new ExaCache(fetch as typeof globalThis.fetch, "test-key"),
    fakeChromium(),
  ).execute("https://example.test/miss", "fetch");
  assert.equal(calls, 1);
  assert.equal(result.details.outcome, "failed");
  assert.equal(result.details.suggestedMode, "render");
  assert.match(text(result), /cache miss/i);
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

test("cached fetch output remains bounded", async () => {
  const result = await new WebService(
    cachedPage("x".repeat(LIMITS.outputBytes * 2)),
    fakeChromium(),
  ).execute("https://example.test/page", "fetch");
  assert.equal(result.details.outcome, "ok");
  assert.equal(result.details.source, "exa");
  assert.equal(result.details.truncated, true);
  assert.ok(Buffer.byteLength(text(result)) < LIMITS.outputBytes + 2_000);
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
  const result = await new WebService(cache, chromium).execute("https://example.test/app", "render");
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
