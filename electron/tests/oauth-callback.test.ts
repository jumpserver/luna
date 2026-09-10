import assert from "node:assert/strict";
import test from "node:test";
import { isOAuthCallbackUrl, parseOAuthCallback } from "../src/auth/oauth-callback.ts";

test("parses JumpServer deep-link and loopback OAuth callbacks", () => {
  assert.deepEqual(parseOAuthCallback("jms2://auth/callback?code=abc&state=xyz"), {
    code: "abc",
    state: "xyz"
  });
  assert.deepEqual(parseOAuthCallback("jms2:///auth/callback?code=abc"), { code: "abc", state: null });
  assert.deepEqual(parseOAuthCallback("jms2:auth/callback?code=abc"), { code: "abc", state: null });
  assert.deepEqual(parseOAuthCallback("jms2://auth/callback?code=abc"), { code: "abc", state: null });
  assert.deepEqual(parseOAuthCallback("http://127.0.0.1:14876/auth/callback?code=abc"), {
    code: "abc",
    state: null
  });
  assert.deepEqual(parseOAuthCallback("jms2%3A%2F%2Fauth%2Fcallback%3Fcode%3Dabc"), {
    code: "abc",
    state: null
  });
});

test("ignores asset pull-up links and empty values", () => {
  assert.equal(parseOAuthCallback(""), null);
  assert.equal(parseOAuthCallback("jms://eyJ0eXBlIjoic3NoIn0="), null);
  assert.equal(parseOAuthCallback("jms://auth/callback"), null);
  assert.equal(parseOAuthCallback("jms://auth/callback?code=legacy"), null);
  assert.equal(parseOAuthCallback("https://example.com/?next=jms2://auth/callback?code=abc"), null);
  assert.equal(parseOAuthCallback("jms2://auth/callback-other?code=abc"), null);
  assert.equal(parseOAuthCallback("jms2://auth/callback/other?code=abc"), null);
});

test("recognizes OAuth failures as callbacks instead of asset launch URLs", () => {
  assert.equal(isOAuthCallbackUrl("jms2://auth/callback?error=access_denied&state=xyz"), true);
  assert.deepEqual(parseOAuthCallback("jms2://auth/callback?error=access_denied&state=xyz"), {
    error: "access_denied",
    state: "xyz"
  });
  assert.equal(isOAuthCallbackUrl("jms2://auth/callback"), true);
  assert.equal(isOAuthCallbackUrl("jms2://auth/callback-other?code=abc"), false);
});

test("parses HTML-escaped confirmation redirects without decoding entities inside parameter values", () => {
  for (const callback of ["jms2://auth/callback", "http://127.0.0.1:14876/auth/callback"]) {
    const url = `${callback}?code=a%2Bb%26amp%3Bc&amp;state=xyz`;
    const expected = { code: "a+b&amp;c", state: "xyz" };
    assert.deepEqual(parseOAuthCallback(url), expected);
    assert.deepEqual(parseOAuthCallback(`"${encodeURIComponent(url)}"`), expected);
    assert.deepEqual(parseOAuthCallback(`${callback}?error=access_denied&amp;state=xyz`), {
      error: "access_denied",
      state: "xyz"
    });
    assert.deepEqual(parseOAuthCallback(`${callback}?code=abc%26amp%3Bstate%3Dxyz`), {
      code: "abc&amp;state=xyz",
      state: null
    });
  }
});

test("rejects ambiguous callback parameters including mixed escaped and unescaped separators", () => {
  for (const query of [
    "code=abc&state=first&state=second",
    "code=abc&state=first&amp;state=second",
    "code=abc&amp;state=first&state=second",
    "code=abc&amp;code=other&state=xyz",
    "error=access_denied&amp;error=other&state=xyz"
  ]) {
    assert.equal(parseOAuthCallback(`jms2://auth/callback?${query}`), null);
  }
});
