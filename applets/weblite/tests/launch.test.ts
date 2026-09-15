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

const applet = {
  app_name: "custom-browser",
  protocol: "http",
  asset: { address: launch.target_url, spec_info: launch.login.config },
  platform: { protocols: [{ name: "http", setting: { safe_mode: true } }] },
  account: { username: "tester", secret: "one-use-secret", secret_type: { value: "password" } }
};

test("generic AppletArgs opens the asset and fills credentials without an app-name dependency", async () => {
  const result = await readLaunch(Readable.from([JSON.stringify(applet)]));
  assert.equal(result.targetUrl, launch.target_url);
  assert.equal(result.safeMode, true);
  assert.equal(result.standalone, false);
  assert.ok(!JSON.stringify(result).includes("one-use-secret"));
  assert.deepEqual(await releaseCredentials(result.localSession, launch.target_url), {
    username: "tester",
    password: "one-use-secret"
  });
});

test("WebLite owns URL normalization, ports, query strings and hash routes", () => {
  for (const [address, port, expected] of [
    ["app.example.com/login?q=1#/sign-in", 8080, "http://app.example.com:8080/login?q=1#/sign-in"],
    ["https://app.example.com/login", 443, "https://app.example.com/login"],
    ["http://app.example.com:80/login", 8080, "http://app.example.com/login"],
    ["https://app.example.com:9443/login", 8080, "https://app.example.com:9443/login"],
    ["http://[::1]/login", 8080, "http://[::1]:8080/login"]
  ] as const) {
    const result = parseLaunch({ ...applet, asset: { address, protocols: [{ name: "http", port }] } });
    assert.equal(result.targetUrl, expected);
  }
});

test("asset login overrides platform fallback; anonymous accounts still open the asset", () => {
  const platform = {
    protocols: [{ name: "http", setting: { ...launch.login.config, autofill: "none", safe_mode: true } }]
  };
  const explicit = parseLaunch({ ...applet, platform });
  assert.equal(explicit.localSession.autofillAvailable, true);
  const fallback = parseLaunch({ ...applet, asset: { address: launch.target_url }, platform });
  assert.equal(fallback.localSession.autofillAvailable, false);
  const inherited = parseLaunch({
    ...applet,
    asset: { address: launch.target_url },
    platform: { protocols: [{ name: "http", setting: launch.login.config }] }
  });
  assert.equal(inherited.localSession.autofillAvailable, true);
  const anonymous = parseLaunch({ ...applet, account: { username: "@ANON" } });
  assert.equal(anonymous.localSession.autofillAvailable, false);
  assert.equal(anonymous.targetUrl, launch.target_url);
  const allowed_urls = ["https://sso.example.com"];
  assert.deepEqual(
    parseLaunch({ ...applet, asset: { ...applet.asset, spec_info: { ...applet.asset.spec_info, allowed_urls } } })
      .allowedUrls,
    allowed_urls
  );
});

test("generic connection data is validated before opening a Web view", () => {
  for (const patch of [
    { protocol: "ssh" },
    { asset: null },
    { asset: { address: " " } },
    { asset: { address: "file:///etc/passwd" } },
    { asset: { address: "https://user:secret@example.com" } },
    { asset: { address: launch.target_url, protocols: [{ name: "http", port: 65536 }] } },
    { platform: { protocols: [{ name: "http", setting: { safe_mode: "false" } }] } },
    { account: { ...applet.account, secret: 123 } }
  ])
    assert.throws(() => parseLaunch({ ...applet, ...patch }));
});
test("applet retains an optional asset navigation allowlist and rejects malformed policies", () => {
  assert.deepEqual(parseLaunch(launch).allowedUrls, []);
  assert.deepEqual(parseLaunch({ ...launch, allowed_urls: ["https://sso.example.com"] }).allowedUrls, [
    "https://sso.example.com"
  ]);
  for (const allowed_urls of [null, "*", ["*"], ["file:///tmp"], ["https://example.com/path"]])
    assert.throws(() => parseLaunch({ ...launch, allowed_urls }), /白名单/);
});
test("empty or terminal stdin starts an unrestricted standalone browser without credentials", async () => {
  for (const input of [Readable.from([]), Object.assign(Readable.from([]), { isTTY: true })]) {
    const result = await readLaunch(input);
    assert.equal(result.targetUrl, "https://www.jumpserver.org/");
    assert.equal(result.standalone, true);
    assert.equal(result.safeMode, false);
    assert.equal(result.localSession, null);
  }
  await assert.rejects(readLaunch(Readable.from([" "])), SyntaxError);
});
test("direct launch needs no Koko endpoint or token and releases credentials once on the permitted origin", async () => {
  const result = await readLaunch(Readable.from([JSON.stringify(launch)]));
  assert.equal(result.standalone, false);
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
test("obsolete proxy and recording options cannot enable a Koko session", async () => {
  const result = parseLaunch({
    ...launch,
    recording_enabled: true,
    proxy_url: "http://localhost:5001",
    token_id: "id",
    token_value: "one-time"
  });
  assert.ok(result.localSession);
  for (const key of ["proxyUrl", "recordingEnabled", "tokenId", "tokenValue"])
    assert.ok(!(key in result), `applet launch must not include ${key}`);
  assert.deepEqual(await releaseCredentials(result.localSession, launch.target_url), {
    username: "tester",
    password: "one-use-secret"
  });
  assert.ok(!JSON.stringify(result).includes("one-use-secret"));
});
test("rejects invalid configuration and oversized pipes", async () => {
  for (const patch of [
    { target_url: "file:///etc/passwd" },
    { target_url: "https://user:secret@example.com" },
    { safe_mode: "false" },
    { recording_enabled: true, login: undefined },
    { login: { config: { autofill: "basic" }, password: "secret" } },
    { login: { config: { autofill: "script", script: [{ step: 1, command: "select_frame", target: "id=login" }] } } }
  ])
    assert.throws(() => parseLaunch({ ...launch, ...patch }));
  await assert.rejects(readLaunch(Readable.from([" ".repeat(1_048_577)])), /过长/);
});
