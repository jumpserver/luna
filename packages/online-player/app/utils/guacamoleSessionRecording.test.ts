import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("patched guacamole-common-js-jumpserver", () => {
  const source = readFileSync(require.resolve("guacamole-common-js-jumpserver/dist/guacamole-common"), "utf8");

  it("ships setPlaybackRate on SessionRecording", () => {
    expect(source).toContain("this.setPlaybackRate = function setPlaybackRate");
    expect(source).toContain("this.getPlaybackRate = function getPlaybackRate");
    expect(source).toContain("/ playbackRate + startRealTimestamp");
  });

  it("streams StaticHTTPTunnel from a URL and keeps local connect(data)", () => {
    expect(source).toContain("var streamFromUrl = function streamFromUrl");
    expect(source).toContain("var parseLocalData = function parseLocalData");
    expect(source).toContain('new DecompressionStream("gzip")');
    expect(source).toContain("if (!url) {");
  });
});
