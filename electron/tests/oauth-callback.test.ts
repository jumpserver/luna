import assert from "node:assert/strict";
import test from "node:test";
import { parseOAuthCallback } from "../src/auth/oauth-callback.ts";

test("parses JumpServer deep-link and loopback OAuth callbacks", () => {
  assert.deepEqual(parseOAuthCallback("jms://auth/callback?code=abc&state=xyz"), {
    code: "abc",
    state: "xyz"
  });
  assert.deepEqual(parseOAuthCallback("jms:///auth/callback?code=abc"), { code: "abc", state: null });
  assert.deepEqual(parseOAuthCallback("jms:auth/callback?code=abc"), { code: "abc", state: null });
  assert.deepEqual(parseOAuthCallback("jms2://auth/callback?code=abc"), { code: "abc", state: null });
  assert.deepEqual(parseOAuthCallback("http://127.0.0.1:14876/auth/callback?code=abc"), {
    code: "abc",
    state: null
  });
  assert.deepEqual(parseOAuthCallback("jms%3A%2F%2Fauth%2Fcallback%3Fcode%3Dabc"), {
    code: "abc",
    state: null
  });
});

test("ignores asset pull-up links and empty values", () => {
  assert.equal(parseOAuthCallback(""), null);
  assert.equal(parseOAuthCallback("jms://eyJ0eXBlIjoic3NoIn0="), null);
  assert.equal(parseOAuthCallback("jms://auth/callback"), null);
});
