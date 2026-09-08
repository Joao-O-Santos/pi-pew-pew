import assert from "node:assert/strict";
import test from "node:test";
import type { FetchImplementation } from "../src/http.js";
import { PolicyManager } from "../src/policy.js";

const signal = () => new AbortController().signal;

function fakeFetch(
  handler: (url: string, call: number, requestSignal: AbortSignal) => Response | Promise<Response>,
): FetchImplementation {
  let calls = 0;
  return (async (input, init) =>
    handler(String(input), ++calls, init?.signal as AbortSignal)) as FetchImplementation;
}

function okRobots(): Response {
  return new Response("User-agent: *\nAllow: /", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

test("policy results cache successful robots checks", async () => {
  let calls = 0;
  const fetch: FetchImplementation = async () => {
    calls += 1;
    return okRobots();
  };
  const manager = new PolicyManager(fetch);
  const first = await manager.robotsFor(new URL("https://example.test/one"), signal());
  const second = await manager.robotsFor(new URL("https://example.test/two"), signal());
  assert.deepEqual(first, { state: "allowed", status: 200 });
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
});

test("concurrent policy checks share one in-flight request", async () => {
  let calls = 0;
  let release!: (response: Response) => void;
  const fetch: FetchImplementation = async () => {
    calls += 1;
    return new Promise<Response>((resolve) => {
      release = resolve;
    });
  };
  const manager = new PolicyManager(fetch);
  const first = manager.robotsFor(new URL("https://example.test/one"), signal());
  const second = manager.robotsFor(new URL("https://example.test/two"), signal());
  assert.equal(calls, 1);
  release(okRobots());
  assert.deepEqual(await Promise.all([first, second]), [
    { state: "allowed", status: 200 },
    { state: "allowed", status: 200 },
  ]);
});

test("transient policy responses are retried after eviction", async () => {
  let calls = 0;
  const fetch: FetchImplementation = async () => {
    calls += 1;
    return calls === 1 ? new Response("busy", { status: 503 }) : okRobots();
  };
  const manager = new PolicyManager(fetch);
  assert.equal(
    (await manager.robotsFor(new URL("https://example.test/"), signal())).state,
    "unavailable",
  );
  assert.equal(
    (await manager.robotsFor(new URL("https://example.test/"), signal())).state,
    "allowed",
  );
  assert.equal(calls, 2);
});

test("aborted policy requests evict rejected promises", async () => {
  let calls = 0;
  const fetch: FetchImplementation = async (_input, init) => {
    calls += 1;
    if (calls === 1) {
      assert.ok(init?.signal?.aborted);
      throw new Error("aborted");
    }
    return okRobots();
  };
  const manager = new PolicyManager(fetch);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    manager.robotsFor(new URL("https://example.test/"), controller.signal),
    /aborted/,
  );
  assert.equal(
    (await manager.robotsFor(new URL("https://example.test/"), signal())).state,
    "allowed",
  );
  assert.equal(calls, 2);
});

test("ordinary fetch failures do not remain cached", async () => {
  let calls = 0;
  const fetch: FetchImplementation = async () => {
    calls += 1;
    if (calls === 1) throw new Error("temporary network failure");
    return okRobots();
  };
  const manager = new PolicyManager(fetch);
  assert.equal(
    (await manager.robotsFor(new URL("https://example.test/"), signal())).state,
    "unavailable",
  );
  assert.equal(
    (await manager.robotsFor(new URL("https://example.test/"), signal())).state,
    "allowed",
  );
  assert.equal(calls, 2);
});

// Keep the helper exercised for the llms cache as well as the robots cache.
test("successful llms results are cached and cloned", async () => {
  const fetch = fakeFetch((url) =>
    url.endsWith("/robots.txt") ? okRobots() : new Response("notes", { status: 200 }),
  );
  const manager = new PolicyManager(fetch);
  const first = await manager.llmsFor("https://example.test", signal());
  const second = await manager.llmsFor("https://example.test", signal());
  assert.deepEqual(first, { state: "found", status: 200, text: "notes" });
  first.reason = "mutated caller copy";
  assert.deepEqual(second, { state: "found", status: 200, text: "notes" });
});
