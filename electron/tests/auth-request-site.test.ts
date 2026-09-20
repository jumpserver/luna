import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { parseUrl } from "../src/shared/url.ts";

// Exercise request paths without starting Electron, like the auth-language checks.
const source = readFileSync(new URL("../src/auth/service.ts", import.meta.url), "utf8");
const helpers = source.slice(source.indexOf("function endpoint("), source.indexOf("function base64Url("));
const methods = source.slice(source.indexOf("  async apiRequest("), source.indexOf("  async logout("));
const script = stripTypeScriptTypes(`${helpers}\nnew (class { ${methods} })()`);

function setup(env: Record<string, string> = {}, origin = "https://jumpserver.test", responseStatus = 200) {
  const requests: { url: string; init: RequestInit }[] = [];
  const session = { origin, sessionKey: "site", bearerToken: "test-token", orgId: "test-org" };
  const auth = runInNewContext(script, {
    process: { env },
    parseUrl,
    URL,
    AbortSignal,
    TextDecoder,
    electronLog: { warn() {}, info() {} }
  });
  Object.assign(auth, {
    currentSession: () => session,
    freshToken: async () => session.bearerToken,
    fetchSite: async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return new Response("{}", { status: responseStatus });
    }
  });
  return { auth, requests, session };
}

test("Koko tickets bind to the token organization without changing the selected organization", async () => {
  for (const orgId of ["asset-org", undefined]) {
    const { auth, requests, session } = setup({}, "https://jumpserver.test", 201);
    session.orgId = "00000000-0000-0000-0000-000000000000";
    await auth.createKokoConnectTicket({ baseUrl: "https://koko.test/site/", tokenId: "token-id", orgId });
    const { url, init } = requests[0];
    assert.equal(url, "https://koko.test/site/koko/api/connect-ticket/");
    assert.equal(init.headers["Authorization"], "Bearer test-token");
    assert.equal(init.headers["X-JMS-ORG"], orgId || session.orgId);
    assert.deepEqual(JSON.parse(String(init.body)), { token_id: "token-id", org_id: orgId || session.orgId });
    assert.equal(session.orgId, "00000000-0000-0000-0000-000000000000");
  }
});

for (const method of ["apiRequest", "apiStreamRequest"]) {
  const request = { method: "GET", service: "kael", path: "/kael/api/v1/bootstrap" };

  test(`${method}: development renderer does not override the selected Kael site`, async () => {
    const { auth, requests, session } = setup({
      JMS_ELECTRON_DEV: "1",
      JMS_ELECTRON_RENDERER_URL: "http://127.0.0.1:3000/luna/"
    });
    for (const origin of ["https://jumpserver.test", "https://other.test/prefix/", "http://localhost:8888"]) {
      session.origin = origin;
      await auth[method](request);
      const { url, init } = requests.at(-1)!;
      assert.equal(url, `${origin.replace(/\/+$/, "")}${request.path}`);
      assert.equal(init.headers["Authorization"], "Bearer test-token");
      assert.equal(init.headers["X-JMS-ORG"], "test-org");
    }
  });

  test(`${method}: defaults to the selected site in production and local development`, async () => {
    for (const env of [{}, { JMS_ELECTRON_DEV: "1" }]) {
      const { auth, requests } = setup(env, "http://localhost:8888");
      await auth[method](request);
      assert.equal(requests[0].url, `http://localhost:8888${request.path}`);
    }
  });

  test(`${method}: explicit Kael overrides remain supported and leave Core on the selected site`, async () => {
    for (const desktopOverride of ["", "https://kael.test/prefix/"]) {
      const { auth, requests } = setup({
        JMS_KAEL_DEV_URL: "http://localhost:8083",
        JMS_KAEL_DESKTOP_URL: desktopOverride
      });
      await auth[method](request);
      assert.equal(
        requests[0].url,
        `${(desktopOverride || "http://localhost:8083").replace(/\/+$/, "")}${request.path}`
      );
      await auth[method]({ ...request, service: "core", path: "/api/v1/users/profile/" });
      assert.equal(requests[1].url, "https://jumpserver.test/api/v1/users/profile/");
    }
  });

  test(`${method}: invalid Kael overrides fail before sending credentials`, async () => {
    for (const url of ["file:///tmp/kael", "https://user:password@kael.test", "invalid-url"]) {
      const { auth, requests } = setup({ JMS_KAEL_DESKTOP_URL: url });
      await assert.rejects(auth[method](request), /Kael endpoint|Invalid URL/);
      assert.equal(requests.length, 0);
    }
  });
}
