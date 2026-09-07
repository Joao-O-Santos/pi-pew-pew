import assert from "node:assert/strict";
import test from "node:test";
import { httpStatusLabel, isSuccessfulHttpStatus } from "../src/status.js";

test("HTTP statuses have compact, readable labels", () => {
  assert.equal(httpStatusLabel(200), "HIT");
  assert.equal(httpStatusLabel(302), "REDIR");
  assert.equal(httpStatusLabel(401), "AUTH");
  assert.equal(httpStatusLabel(403), "DENIED");
  assert.equal(httpStatusLabel(404), "MISS");
  assert.equal(httpStatusLabel(429), "SLOW");
  assert.equal(httpStatusLabel(503), "5XX");
  assert.equal(httpStatusLabel(undefined), "?");
});

test("only 2xx statuses are successful", () => {
  assert.equal(isSuccessfulHttpStatus(200), true);
  assert.equal(isSuccessfulHttpStatus(204), true);
  assert.equal(isSuccessfulHttpStatus(404), false);
  assert.equal(isSuccessfulHttpStatus(undefined), false);
});
