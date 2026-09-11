import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import { runProcess } from "../src/process.js";

test("an already-cancelled process does not start", async () => {
  const controller = new AbortController();
  controller.abort(new Error("cancelled"));
  const marker = `/tmp/pi-pew-pew-process-${process.pid}-${Date.now()}`;
  await assert.rejects(
    runProcess(process.execPath, ["-e", `require('fs').writeFileSync('${marker}', 'started')`], {
      signal: controller.signal,
      timeoutMs: 1_000,
      maxStdoutBytes: 1024,
      maxStderrBytes: 1024,
    }),
    /cancelled/,
  );
  await assert.rejects(access(marker));
});
