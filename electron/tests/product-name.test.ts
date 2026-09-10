import assert from "node:assert/strict";
import test from "node:test";
import { productNameAllowsDevTools } from "../src/shared/product-name.ts";

test("product names or versions containing beta enable packaged DevTools", () => {
  assert.equal(productNameAllowsDevTools("JumpServer"), false);
  assert.equal(productNameAllowsDevTools("JumpServer", "5.0.0"), false);
  assert.equal(productNameAllowsDevTools("JumpServer", "v5.0.0-beta8"), true);
  assert.equal(productNameAllowsDevTools("JumpServer", "5.0.0-beta8"), true);
  assert.equal(productNameAllowsDevTools("JumpServer Beta", "5.0.0"), true);
  assert.equal(productNameAllowsDevTools("JumpServer-beta"), true);
});
