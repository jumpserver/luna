import assert from "node:assert/strict";
import test from "node:test";
import { computeTargetDimensions } from "../src/replay/codec.ts";

test("preserves display dimensions and scales only recordings above the selected resolution", () => {
  assert.deepEqual(computeTargetDimensions(1920, 1080), { width: 1920, height: 1080 });
  assert.deepEqual(computeTargetDimensions(1920, 1080, "p720"), { width: 1280, height: 720 });
  assert.deepEqual(computeTargetDimensions(1920, 1080, "p360"), { width: 640, height: 360 });
  assert.deepEqual(computeTargetDimensions(320, 240, "p720"), { width: 320, height: 240 });
  assert.deepEqual(computeTargetDimensions(641, 481), { width: 642, height: 482 });
});
