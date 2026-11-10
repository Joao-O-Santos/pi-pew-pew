import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import extension from "../src/index.js";

test("web schema preserves string enums and optional mode", () => {
  let schema: TSchema | undefined;
  extension({
    registerTool(definition: { parameters: TSchema }) {
      schema = definition.parameters;
    },
  } as ExtensionAPI);
  assert.ok(schema);
  const json = JSON.parse(JSON.stringify(schema));
  assert.deepEqual(json.required, ["url"]);
  assert.equal(json.properties.mode.type, "string");
  assert.deepEqual(json.properties.mode.enum, ["fetch", "render", "screenshot"]);
  assert.equal(json.properties.mode.default, "fetch");
  const input = { url: "https://example.test" };
  assert.equal(Value.Check(schema, input), true);
  for (const mode of ["fetch", "render", "screenshot"]) {
    assert.equal(Value.Check(schema, { ...input, mode }), true);
  }
  for (const mode of ["invalid", 1, null]) {
    assert.equal(Value.Check(schema, { ...input, mode }), false);
  }
});
