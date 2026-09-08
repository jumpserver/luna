import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createCipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { BrowserWindow, WebContentsView } from "electron";
import { createCredentialSession, validateWebScript } from "../src/web-proxy/credentials.ts";
import { WebProxyScript, installWebProxyNavigationGuard } from "../src/web-proxy/script.ts";
import { INTERACTION_WORLD } from "../src/web-proxy/interaction.ts";

async function listen(server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function waitFor(read, message) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await read()) return;
    await delay(30);
  }
  throw new Error(message);
}

async function loginCase(crossOrigin: boolean) {
  let appOrigin = "";
  let authOrigin = "";
  let releases = 0;
  let usernames = 0;
  let passwords = 0;
  let verification = 0;
  let linkedHits = 0;
  let ssoHops = 0;
  let clientKey;
  const keyPair = generateKeyPairSync("x25519");
  let config;
  const handler = async (request, response) => {
    const url = new URL(request.url, appOrigin);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    response.setHeader("content-type", "text/html");
    if (url.pathname === "/_jumpserver/web-sessions/") {
      clientKey = createPublicKey({
        key: Buffer.from(JSON.parse(body).client_public_key, "base64"),
        type: "spki",
        format: "der"
      });
      response.end(
        JSON.stringify({
          ...config,
          session_id: "script-session",
          id: "credentials",
          access_token: "once",
          target_url: `${appOrigin}/entry`,
          origin: appOrigin,
          autofill_available: true,
          server_public_key: keyPair.publicKey.export({ type: "spki", format: "der" }).toString("base64")
        })
      );
    } else if (url.pathname.endsWith("/credentials")) {
      releases++;
      assert.equal(JSON.parse(body).origin, authOrigin);
      assert.equal(request.headers.authorization, "Bearer once");
      const sharedSecret = diffieHellman({ privateKey: keyPair.privateKey, publicKey: clientKey });
      const key = Buffer.from(
        hkdfSync("sha256", sharedSecret, Buffer.alloc(0), Buffer.from("jumpserver-web-autofill-v1"), 32)
      );
      const nonce = Buffer.alloc(12, 4);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(Buffer.from(`credentials\n${appOrigin}`));
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify({ username: "managed-user", password: "managed-secret" })),
        cipher.final(),
        cipher.getAuthTag()
      ]);
      response.end(JSON.stringify({ nonce: nonce.toString("base64"), ciphertext: ciphertext.toString("base64") }));
    } else if (url.pathname === "/entry") {
      response.writeHead(302, {
        location: crossOrigin ? `${appOrigin.replace("127.0.0.1", "localhost")}/sso-hop` : `${authOrigin}/username`
      });
      response.end();
    } else if (url.pathname === "/sso-hop") {
      ssoHops++;
      response.writeHead(302, { location: `${authOrigin}/username` });
      response.end();
    } else if (url.pathname === "/username") {
      response.end(
        `<form action="${authOrigin}/password" method="post"><input id="username" name="username"><button id="next">Next</button></form>`
      );
    } else if (url.pathname === "/password") {
      usernames++;
      assert.equal(new URLSearchParams(body).get("username"), "managed-user");
      response.end(
        `<form action="${authOrigin}/mfa" method="post"><input id="password" name="password" type="password"><button id="login">Login</button></form>`
      );
    } else if (url.pathname === "/mfa") {
      passwords++;
      assert.equal(new URLSearchParams(body).get("password"), "managed-secret");
      response.end(
        `<form action="${appOrigin}/dashboard" method="post"><div id="mfa" style="width:240px;height:100px"><label>Verification<input id="otp" name="otp"></label></div><button id="verify">Verify</button></form>`
      );
    } else if (url.pathname === "/dashboard") {
      verification++;
      assert.equal(new URLSearchParams(body).get("otp"), "123456");
      response.end('<div id="dashboard">Authenticated</div>');
    } else if (url.pathname === "/linked") {
      linkedHits++;
      response.end("linked");
    } else response.end('<div id="spa"></div>');
  };
  const appServer = createServer((req, res) => {
    void handler(req, res).catch((error) => {
      res.writeHead(500);
      res.end(String(error));
    });
  });
  appOrigin = await listen(appServer);
  const authServer = createServer((req, res) => {
    void handler(req, res).catch((error) => {
      res.writeHead(500);
      res.end(String(error));
    });
  });
  authOrigin = crossOrigin ? await listen(authServer) : appOrigin;
  config = {
    autofill: "script",
    script: [
      { step: 1, command: "type", target: "id=username", value: "{USERNAME}", origin: authOrigin },
      { step: 2, command: "click", target: "id=next", origin: authOrigin },
      { step: 3, command: "type", target: "id=password", value: "{SECRET}", origin: authOrigin },
      { step: 4, command: "click", target: "id=login", origin: authOrigin },
      { step: 5, command: "interactive", target: "id=mfa", origin: authOrigin },
      { step: 6, command: "click", target: "id=verify", origin: authOrigin },
      { step: 7, command: "success", target: "id=dashboard" }
    ]
  };
  const host = new BrowserWindow({ show: false, width: 800, height: 600 });
  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  host.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 800, height: 600 });
  view.setVisible(false);
  let interaction;
  let frame;
  let ready = false;
  let active = true;
  let rejected = "";
  let runner;
  try {
    const session = await createCredentialSession(appOrigin, `${appOrigin}/entry`, "token", "value");
    assert.equal(session.mode, "script");
    assert.deepEqual(session.credentialOrigins, [authOrigin]);
    assert.equal(session.selectors.password, "");
    installWebProxyNavigationGuard(view.webContents, (message) => {
      rejected = message;
      runner?.cancel(new Error(message));
    });
    const loaded = view.webContents.loadURL(`${appOrigin}/entry`);
    runner = new WebProxyScript(view.webContents, session, {
      active: () => active,
      state: () => {},
      interaction: (value, visible) => {
        interaction = value;
        ready = visible;
      },
      frame: (value) => {
        frame = value;
      }
    });
    const result = runner.run();
    void result.catch(() => {});
    await loaded;
    await waitFor(() => ready && frame, "MFA did not become ready");
    assert.equal(usernames, 1);
    assert.equal(passwords, 1);
    assert.equal(releases, 1);
    assert.equal(verification, 0);
    active = false;
    assert.equal(await runner.completeVerification(), false);
    active = true;
    assert.equal(await interaction.input({ type: "key", key: "Tab", revision: frame.revision }), false);
    await waitFor(
      () => view.webContents.executeJavaScript("document.activeElement.id === 'otp'"),
      "OTP did not get focus"
    );
    assert.equal(await interaction.input({ type: "text", text: "123456", revision: frame.revision }), true);
    const oldInteraction = interaction;
    assert.equal(await runner.completeVerification(), true);
    assert.equal(await result, "success");
    assert.equal(verification, 1);
    assert.equal(ssoHops, crossOrigin ? 1 : 0);
    assert.equal(releases, 1);
    assert.equal(view.webContents.getURL(), `${appOrigin}/dashboard`);
    assert.equal(rejected, "");
    const existing = new WebProxyScript(view.webContents, session, {
      active: () => true,
      state: () => {},
      interaction: () => {},
      frame: () => {}
    });
    assert.equal(await existing.run(), "success");
    assert.equal(releases, 1, "existing authenticated page must not reclaim credentials");
    assert.equal(await oldInteraction.input({ type: "text", text: "stale", revision: frame?.revision || 1 }), false);

    // The same runner also waits for SPA replacement, and keeps credentials
    // protected when the website renames the original input in the same DOM.
    await view.webContents.executeJavaScript(
      `document.body.innerHTML='<input id="password" type="password"><button id="go">Go</button>'; document.querySelector('#go').onclick=()=>{ const input=document.querySelector('#password');input.id='renamed';input.type='text';setTimeout(()=>document.body.insertAdjacentHTML('beforeend','<div id="done">Done</div>'),80); }; void 0;`
    );
    await view.webContents.executeJavaScriptInIsolatedWorld(INTERACTION_WORLD, [
      {
        code: "globalThis.__jmsScriptDocument = undefined; Object.defineProperty(crypto, 'randomUUID', { value: undefined }); void 0;"
      }
    ]);
    const steps = validateWebScript(
      [
        { step: 1, command: "type", target: "id=password", value: "plain-value" },
        { step: 2, command: "click", target: "id=go" },
        { step: 3, command: "success", target: "id=done" }
      ],
      appOrigin
    );
    const spa = new WebProxyScript(
      view.webContents,
      { steps, accessToken: "" },
      { active: () => true, state: () => {}, interaction: () => {}, frame: () => {} }
    );
    assert.equal(await spa.run(), "success");
    assert.equal(await view.webContents.executeJavaScript("document.querySelector('#renamed').value"), "");

    const linkedOrigin = appOrigin.replace("127.0.0.1", "localhost");
    await view.webContents.executeJavaScript(
      `document.body.insertAdjacentHTML('beforeend', '<a id="linked" href="${linkedOrigin}/linked">Link</a>'); document.getElementById('linked').click(); void 0;`
    );
    await waitFor(() => linkedHits === 1 && !view.webContents.isLoading(), "cross-origin page link did not load");
    assert.equal(rejected, "");
    assert.equal(view.webContents.getURL(), `${linkedOrigin}/linked`);
    await view.webContents.loadURL(`${appOrigin}/spa`);

    const timeoutSteps = validateWebScript(
      [{ step: 1, command: "success", target: "id=missing", timeout: 1 }],
      appOrigin
    );
    const timeout = new WebProxyScript(
      view.webContents,
      { steps: timeoutSteps, accessToken: "" },
      { active: () => true, state: () => {}, interaction: () => {}, frame: () => {} }
    );
    await assert.rejects(timeout.run(), /超时/);
    const cancelled = new WebProxyScript(
      view.webContents,
      { steps: timeoutSteps, accessToken: "" },
      { active: () => true, state: () => {}, interaction: () => {}, frame: () => {} }
    );
    const cancelledResult = cancelled.run();
    cancelled.cancel();
    await assert.rejects(cancelledResult);
    assert.equal(
      await view.webContents.executeJavaScriptInIsolatedWorld(INTERACTION_WORLD, [
        { code: "globalThis.__jmsVerification" }
      ]),
      undefined
    );
  } finally {
    runner?.cancel();
    view.webContents.close();
    host.destroy();
    appServer.close();
    authServer.close();
  }
}

export async function runScriptChecks() {
  await loginCase(false);
  await loginCase(true);
}
