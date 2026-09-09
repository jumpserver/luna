import assert from "node:assert/strict";
import test from "node:test";
import { isTrustedCertificateHost, siteHostname } from "../src/shared/url.ts";

test("trusts user-entered site hosts including HTTPS IPs", () => {
  const trusted = new Set<string>();
  trusted.add(siteHostname("https://47.242.2.24"));
  assert.equal(siteHostname("https://47.242.2.24:443/luna"), "47.242.2.24");
  assert.equal(isTrustedCertificateHost(trusted, "47.242.2.24"), true);
  assert.equal(isTrustedCertificateHost(trusted, "example.com"), false);
  assert.equal(isTrustedCertificateHost(trusted, ""), false);
});
