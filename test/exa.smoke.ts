import assert from "node:assert/strict";
import test from "node:test";
import { ExaCache } from "../src/exa.js";

test(
  "real Exa cache-only lookup",
  { skip: !process.env.EXA_API_KEY },
  async () => {
    const page = await new ExaCache().get("https://example.com/", new AbortController().signal);
    assert.ok(page.text.length > 0);
  },
);
