import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("patched Guacamole.SessionRecording", () => {
  it("ships setPlaybackRate on the installed guacamole-common-js patch", () => {
    const source = readFileSync(require.resolve("guacamole-common-js-jumpserver/dist/guacamole-common"), "utf8");

    expect(source).toContain("this.setPlaybackRate = function setPlaybackRate");
    expect(source).toContain("this.getPlaybackRate = function getPlaybackRate");
    expect(source).toContain("/ playbackRate + startRealTimestamp");
  });
});
