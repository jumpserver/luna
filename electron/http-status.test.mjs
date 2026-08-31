import assert from "node:assert/strict";
import test from "node:test";
import { responseSucceeded } from "./http-status.mjs";

test("accepts every successful HTTP status including Agent message 202", () => {
  for (const status of [200, 201, 202, 204, 299]) assert.equal(responseSucceeded(status), true);
  for (const status of [199, 300, 403, 500]) assert.equal(responseSucceeded(status), false);
});
