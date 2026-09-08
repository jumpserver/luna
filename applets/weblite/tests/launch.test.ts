import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { parseLaunch, readLaunch } from "../src/launch.ts";
import { releaseCredentials } from "@jumpserver/web-proxy/credentials";

const launch = {
  target_url: "https://app.example.com/login",
  safe_mode: true,
  login: {
    config: {
      autofill: "basic",
      username_selector: "id=username",
      password_selector: "id=password",
      submit_selector: "id=login",
      success_selector: "id=dashboard",
      interactive_selector: "id=mfa"
    },
    username: "tester",
    password: "one-use-secret",
    secret_type: "password"
  }
};
test("direct launch needs no Koko endpoint or token and releases credentials once on the permitted origin", async () => {
  const result = await readLaunch(Readable.from([JSON.stringify(launch)]));
  assert.equal(result.recordingEnabled, false);
  assert.equal(result.proxyUrl, "");
  assert.equal(result.tokenValue, "");
  assert.ok(!JSON.stringify(result).includes("one-use-secret"));
  assert.equal((result.localSession as any).selectors.interactive, "id=mfa");
  assert.equal((result.localSession as any).selectors.success, "id=dashboard");
  await assert.rejects(releaseCredentials(result.localSession, "https://wrong.example.com"), /不匹配/);
  assert.deepEqual(await releaseCredentials(result.localSession, launch.target_url), {
    username: "tester",
    password: "one-use-secret"
  });
  await assert.rejects(releaseCredentials(result.localSession, launch.target_url), /已经领取/);
});
test("script credentials are bound to explicit SSO origins and disposal prevents late release", async () => {
  const result = parseLaunch({
    ...launch,
    login: {
      ...launch.login,
      config: {
        autofill: "script",
        script: [
          { step: 1, command: "type", target: "id=password", value: "{SECRET}", origin: "https://sso.example.com" },
          { step: 2, command: "interactive", target: "id=mfa", origin: "https://sso.example.com" },
          { step: 3, command: "success", target: "id=dashboard" }
        ]
      }
    }
  });
  await assert.rejects(releaseCredentials(result.localSession, launch.target_url), /不匹配/);
  (result.localSession as any).dispose();
  await assert.rejects(releaseCredentials(result.localSession, "https://sso.example.com"), /会话已结束/);
});
test("Koko recording mode only carries a token into the main process", () => {
  const result = parseLaunch({
    ...launch,
    recording_enabled: true,
    proxy_url: "http://localhost:5001",
    token_id: "id",
    token_value: "one-time"
  });
  assert.equal(result.localSession, null);
  assert.equal(result.tokenValue, "one-time");
  assert.ok(!JSON.stringify(result).includes("one-use-secret"));
});
test("rejects invalid configuration and oversized pipes", async () => {
  for (const patch of [
    { target_url: "file:///etc/passwd" },
    { target_url: "https://user:secret@example.com" },
    { safe_mode: "false" },
    { recording_enabled: "false" },
    { recording_enabled: true },
    { login: { config: { autofill: "basic" }, password: "secret" } },
    { login: { config: { autofill: "script", script: [{ step: 1, command: "select_frame", target: "id=login" }] } } }
  ])
    assert.throws(() => parseLaunch({ ...launch, ...patch }));
  await assert.rejects(readLaunch(Readable.from([" ".repeat(1_048_577)])), /过长/);
});
