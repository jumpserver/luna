import assert from "node:assert/strict";
import test from "node:test";
import { parseUrl, toFetchUrl } from "../src/shared/url.ts";

test("parses site URLs and normalizes fetch inputs including HTTPS IPs", () => {
  const site = parseUrl("https://47.242.2.24:443/luna");
  assert.equal(site.hostname, "47.242.2.24");
  assert.equal(toFetchUrl(site), "https://47.242.2.24/luna");
  assert.equal(toFetchUrl("https://example.com/luna"), "https://example.com/luna");
  assert.equal(toFetchUrl(new Request("https://example.com/api/")), "https://example.com/api/");
  assert.equal(parseUrl("/api/", site).href, "https://47.242.2.24/api/");
  assert.throws(() => parseUrl(""), /Invalid URL/);
});
