import assert from "node:assert/strict";
import test from "node:test";
import { httpStatusLabel, isSuccessfulHttpStatus } from "../src/status.js";

test("HTTP statuses have compact, readable labels", () => {
  assert.equal(httpStatusLabel(200), "HIT");
  assert.equal(httpStatusLabel(302), "REDIRECT");
  assert.equal(httpStatusLabel(401), "AUTH REQUIRED");
  assert.equal(httpStatusLabel(403), "FORBIDDEN");
  assert.equal(httpStatusLabel(404), "MISS");
  assert.equal(httpStatusLabel(429), "RATE LIMITED");
  assert.equal(httpStatusLabel(503), "SERVER ERROR");
  assert.equal(httpStatusLabel(undefined), "UNKNOWN");
});

test("only 2xx statuses are successful", () => {
  assert.equal(isSuccessfulHttpStatus(200), true);
  assert.equal(isSuccessfulHttpStatus(204), true);
  assert.equal(isSuccessfulHttpStatus(404), false);
  assert.equal(isSuccessfulHttpStatus(undefined), false);
});
