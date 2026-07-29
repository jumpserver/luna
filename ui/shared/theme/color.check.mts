// 自检：node ui/shared/theme/color.check.mts
import assert from "node:assert/strict";
import { contrastingTextColor, isDarkColor, normalizeResolvedCssColor, parseColorToRgb } from "./color.ts";
import { DARK_THEME_PRESETS, LIGHT_THEME_PRESETS } from "./presets.ts";

function contrastRatio(background: string, foreground: string) {
  const relativeLuminance = (color: string) => {
    const rgb = parseColorToRgb(color);
    assert.ok(rgb, `Expected a valid color: ${color}`);
    const [r, g, b] = rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const first = relativeLuminance(background);
  const second = relativeLuminance(foreground);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

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

assert.equal(normalizeResolvedCssColor("rgb(239, 241, 245)"), "rgb(239, 241, 245)");
assert.equal(normalizeResolvedCssColor("rgba(30, 30, 46, 0.5)"), "rgba(30, 30, 46, 0.5)");
assert.equal(normalizeResolvedCssColor("color(srgb 0 0 0 / 0.08)"), "rgba(0, 0, 0, 0.08)");
assert.equal(normalizeResolvedCssColor("color(srgb 1 1 1 / 8%)"), "rgba(255, 255, 255, 0.08)");

assert.equal(isDarkColor("color(srgb 0.936 0.944 0.959)"), false, "latte main-bg resolves light");

assert.equal(isDarkColor("#1e1e2e"), true, "mocha bg is dark");
assert.equal(isDarkColor("#eff1f5"), false, "latte bg is light");
assert.equal(isDarkColor("rgb(255, 255, 255)"), false);
assert.equal(isDarkColor("garbage"), true, "unparsable falls back to dark");

assert.equal(contrastingTextColor("#ffffff"), "#111111", "Mono Dark white accent uses a visible checkmark");
assert.equal(contrastingTextColor("#111111"), "#ffffff");
assert.equal(contrastingTextColor("#1ab394"), "#111111");

for (const preset of [...LIGHT_THEME_PRESETS, ...DARK_THEME_PRESETS]) {
  const foreground = contrastingTextColor(preset.accent);
  assert.ok(contrastRatio(preset.accent, foreground) >= 4.5, `${preset.id} checkbox foreground has sufficient contrast`);
}

console.log("color.check: ok");
