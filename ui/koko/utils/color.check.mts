// 自检：node ui/koko/utils/color.check.mts
import assert from "node:assert/strict";
import { isDarkColor, parseColorToRgb } from "./color.ts";

assert.deepEqual(parseColorToRgb("#1e1e2e"), [30, 30, 46]);
assert.deepEqual(parseColorToRgb("#fff"), [255, 255, 255]);
assert.deepEqual(parseColorToRgb("rgb(239, 241, 245)"), [239, 241, 245]);
assert.deepEqual(parseColorToRgb("rgba(30, 30, 46, 0.5)"), [30, 30, 46]);
// color-mix() 计算值的序列化形式
assert.deepEqual(parseColorToRgb("color(srgb 0.936 0.944 0.959)"), [239, 241, 245]);
assert.deepEqual(parseColorToRgb("color(srgb 0.1 0.1 0.15 / 0.5)"), [26, 26, 38]);
assert.deepEqual(parseColorToRgb("color(srgb 100% 0% 50%)"), [255, 0, 128]);
assert.equal(parseColorToRgb("color-mix(in srgb, red, blue)"), null);
assert.equal(parseColorToRgb(""), null);

assert.equal(isDarkColor("color(srgb 0.936 0.944 0.959)"), false, "latte main-bg resolves light");

assert.equal(isDarkColor("#1e1e2e"), true, "mocha bg is dark");
assert.equal(isDarkColor("#eff1f5"), false, "latte bg is light");
assert.equal(isDarkColor("rgb(255, 255, 255)"), false);
assert.equal(isDarkColor("garbage"), true, "unparsable falls back to dark");

console.log("color.check: ok");
