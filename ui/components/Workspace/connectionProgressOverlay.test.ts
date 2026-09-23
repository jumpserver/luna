import { describe, expect, it } from "vitest";
import overlay from "./connectionProgressOverlay.vue?raw";

describe("workspace connection progress overlay", () => {
  it("allows post-connection failures to reveal the underlying connector output", () => {
    expect(overlay).toContain("dismissible?: boolean");
    expect(overlay).toContain('v-show="!dismissed"');
    expect(overlay).toContain('v-if="failed && dismissible"');
    expect(overlay).toContain('class="absolute top-6 right-6 z-10"');
    expect(overlay).toContain('@click="dismiss"');
  });

  it("preserves normalized diagnostic line breaks", () => {
    expect(overlay).toContain("whitespace-pre-wrap");
    expect(overlay).toContain("wrap-break-word");
  });
});
