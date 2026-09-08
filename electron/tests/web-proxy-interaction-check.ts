import assert from "node:assert/strict";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { BrowserWindow, WebContentsView } from "electron";
import {
  buildAutofillProbeScript,
  buildAutofillScript,
  buildLoginSuccessProbeScript
} from "../../packages/web-proxy/src/credentials.ts";
import {
  WebProxyInteraction,
  INTERACTION_WORLD,
  buildInteractionGuardScript
} from "../../packages/web-proxy/src/interaction.ts";

const page = `<!doctype html><html><body style="margin:0">
<form id="login"><input id="username"><input id="password" type="password"><button id="login-btn" disabled>Login</button></form>
<section id="mfa" style="display:none;position:absolute;left:60px;top:100px;width:420px;height:240px;background:white">
<button id="send">Send code</button><input id="otp" aria-label="Code"><button id="verify">Verify</button>
<div id="slider" style="position:absolute;left:20px;top:100px;width:300px;height:40px;background:gray;touch-action:none;cursor:grab">Drag</div>
<span id="result"></span></section><div id="success" style="display:none">Dashboard</div>
<script>
let sent = 0, dragged = false, start = null;
const submissions = [], usernameField = document.querySelector('#username'), passwordField = document.querySelector('#password');
const challengeMode = new URL(location.href).searchParams.get('challenge') || 'initial';
document.querySelector('#login-btn').disabled = challengeMode === 'initial';
passwordField.oninput = () => { if(passwordField.value && challengeMode === 'initial') document.querySelector('#mfa').style.display = 'block'; };
document.querySelector('#otp').oninput = () => {document.querySelector('#login-btn').disabled = !document.querySelector('#otp').value;};
document.querySelector('#login').onsubmit = e => {
  e.preventDefault();
  submissions.push({username: usernameField.value, password: passwordField.value, otp: document.querySelector('#otp').value});
  if(challengeMode === 'none' || document.querySelector('#otp').value === '123456') {document.querySelector('#mfa').remove();document.querySelector('#login').style.display='none';document.querySelector('#success').style.display='block';}
  else {document.querySelector('#result').textContent = 'Wrong code';setTimeout(() => {document.querySelector('#mfa').style.display='block';}, 150);}
};
document.querySelector('#send').onclick = () => { sent++; document.querySelector('#send').textContent = 'Sent'; };
document.querySelector('#verify').onclick = () => {document.querySelector('#result').textContent = document.querySelector('#otp').value === '123456' ? 'Code ready' : 'Wrong code';};
const slider = document.querySelector('#slider');
slider.onpointerdown = e => { start = e.clientX; slider.style.cursor='grabbing'; slider.setPointerCapture(e.pointerId); };
slider.onpointermove = e => { if(start !== null && e.clientX-start > 100) { dragged = true; slider.textContent = 'Done'; } };
slider.onpointerup = () => { start = null; slider.style.cursor='grab'; };
</script></body></html>`;

export async function run() {
  for (const success of ["id=success", ""]) {
    for (const challenge of ["initial", "after-failed", "none"]) await runCase(success, challenge);
  }
}

async function runCase(successSelector: string, challenge: string) {
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(page);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const host = new BrowserWindow({
    width: 1000,
    height: 800,
    show: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  const view = new WebContentsView({
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  host.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 800, height: 600 });
  view.setVisible(false);
  await host.loadURL("data:text/html,<html><body>Web Proxy verification test</body></html>");
  host.show();
  host.focus();
  let active = true;
  let frame: any;
  let interaction: WebProxyInteraction | undefined;
  const selectors = {
    username: "id=username",
    password: "id=password",
    submit: "id=login-btn",
    success: successSelector,
    interactive: "id=mfa"
  };
  const evaluate = (code: string) => view.webContents.executeJavaScript(code, true);
  const waitFor = async (predicate: () => boolean | Promise<boolean>, message: string) => {
    for (let i = 0; i < 100; i++) {
      if (await predicate()) return;
      await delay(50);
    }
    throw new Error(message);
  };
  const point = async (selector: string, rx = 0.5, ry = 0.5) =>
    evaluate(
      `(() => {const a=document.querySelector('#mfa').getBoundingClientRect(), b=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:(b.left+ b.width*${rx}-a.left)/a.width,y:(b.top+b.height*${ry}-a.top)/a.height};})()`
    );
  const input = (value: object) => interaction!.input({ ...value, revision: frame?.revision });
  const hover = async (selector: string, cursor: string) => {
    assert.equal(await input({ type: "mouseMove", ...(await point(selector)) }), true);
    await waitFor(() => frame?.cursor === cursor, `cursor did not follow ${selector}: ${cursor}`);
  };
  const click = async (selector: string) => {
    const coords = await point(selector);
    assert.equal(await input({ type: "mouseDown", ...coords }), true);
    assert.equal(await input({ type: "mouseUp", ...coords }), true);
    await delay(80);
  };
  try {
    view.setVisible(true);
    await view.webContents.loadURL(`${origin}?challenge=${challenge}`);
    await delay(200);
    await view.webContents.capturePage();
    view.setVisible(false);
    assert.equal(
      await evaluate(buildAutofillProbeScript(selectors)),
      true,
      "a submit button disabled until verification must not prevent autofill"
    );
    assert.equal(
      await evaluate(buildLoginSuccessProbeScript(selectors.success, true)),
      false,
      "hidden success marker is not success"
    );
    await view.webContents.executeJavaScriptInIsolatedWorld(INTERACTION_WORLD, [
      { code: buildInteractionGuardScript(selectors, origin, false) }
    ]);
    await evaluate(buildAutofillScript(selectors, { username: "managed-user", password: "managed-secret" }));
    assert.equal(await evaluate("submissions.length"), 0, "autofill must not click submit before verification");
    assert.equal(await evaluate("passwordField.value"), "managed-secret");
    interaction = new WebProxyInteraction(
      view.webContents,
      selectors,
      origin,
      () => active,
      (value) => {
        frame = value;
      },
      () => {}
    );
    const phase = await interaction.advanceLogin();
    assert.equal(phase, challenge === "initial" ? "interactive" : "submitted");
    assert.equal(await evaluate("submissions.length"), challenge === "initial" ? 0 : 1);
    if (challenge === "none") {
      assert.equal(frame, undefined, "a normal login must not enter verification mode");
      await waitFor(async () => (await interaction!.advanceLogin()) === "complete", "normal login did not settle");
      assert.equal(await evaluate("submissions.length"), 1, "automatic login must not submit twice");
      assert.deepEqual(await evaluate("submissions[0]"), {
        username: "managed-user",
        password: "managed-secret",
        otp: ""
      });
      assert.equal(await interaction.complete(true), true);
      assert.equal(await evaluate("passwordField.value"), "");
      return;
    }
    await waitFor(() => Boolean(frame), "verification area did not render");
    assert.equal(await interaction.advanceLogin(), "interactive");
    assert.equal(
      await evaluate("submissions.length"),
      challenge === "initial" ? 0 : 1,
      "visible verification must not be automatically submitted"
    );
    assert.equal(
      await interaction.complete(true),
      false,
      "a late verification region must prevent automatic completion"
    );
    assert.equal(frame.width, 420);
    assert.equal(frame.height, 240);
    assert.equal(view.getVisible(), false, "full page stays hidden");
    await hover("#otp", "text");
    await hover("#send", "pointer");
    await evaluate("document.querySelector('#send').disabled=true");
    await hover("#send", "not-allowed");
    await evaluate("document.querySelector('#send').disabled=false");
    await evaluate("document.querySelector('#otp').style.cursor='none'");
    await hover("#otp", "text");
    await click("#send");
    assert.equal(await evaluate("sent"), 1);
    const sendPoint = await point("#send");
    await input({ type: "mouseDown", ...sendPoint });
    await input({ type: "cancel" });
    await delay(80);
    assert.equal(await evaluate("sent"), 1, "canceling a press must not click Send");
    await click("#otp");
    assert.equal(await input({ type: "text", text: "bad" }), true);
    await click("#verify");
    assert.equal(await evaluate("document.querySelector('#result').textContent"), "Wrong code");
    assert.equal(await evaluate(buildLoginSuccessProbeScript(selectors.success, true)), false);
    if (successSelector) {
      const attempts = await evaluate("submissions.length");
      assert.equal(await interaction.submit(), true);
      assert.equal(await evaluate("submissions.length"), attempts + 1);
      assert.equal(
        await evaluate("passwordField.value"),
        "managed-secret",
        "failed verification retains credentials for retry"
      );
    }
    await click("#otp");
    for (let i = 0; i < 3; i++) await input({ type: "key", key: "Backspace" });
    assert.equal(await input({ type: "text", text: "123456" }), true);
    assert.equal(await evaluate("document.querySelector('#otp').value"), "123456");
    // Browser focus, keyboard, clipboard shortcuts and IPC must not reach credentials.
    await evaluate("document.querySelector('#password').focus()");
    assert.equal(await input({ type: "text", text: "overwrite" }), false);
    assert.equal(await input({ type: "key", key: "F12" }), false);
    assert.equal(await input({ type: "mouseDown", x: -1, y: 0 }), false);
    assert.equal(await interaction.input({ type: "text", text: "stale", revision: -1 }), false);
    assert.equal(await evaluate("document.querySelector('#password').value"), "managed-secret");
    // Main-world scripts cannot access the guard or disable it.
    assert.equal(await evaluate("globalThis.__jmsVerification"), undefined);
    for (let i = 0; i < 8; i++) await input({ type: "key", key: "Tab" });
    assert.equal(await evaluate("['username','password'].includes(document.activeElement.id)"), false);
    const start = await point("#slider", 0.1);
    const end = await point("#slider", 0.85);
    assert.equal(await input({ type: "mouseDown", ...start }), true);
    await waitFor(() => frame?.cursor === "grabbing", "dragging must show the target cursor");
    for (let i = 1; i <= 10; i++)
      assert.equal(await input({ type: "mouseMove", x: start.x + ((end.x - start.x) * i) / 10, y: start.y }), true);
    assert.equal(await input({ type: "mouseUp", ...end }), true);
    await waitFor(() => frame?.cursor === "grab", "release must restore the target cursor");
    await waitFor(() => evaluate("dragged"), "slider did not receive continuous input");
    active = false;
    interaction.invalidate();
    assert.equal(frame, null);
    assert.equal(await input({ type: "text", text: "background" }), false);
    active = true;
    await waitFor(() => Boolean(frame), "frame not restored on activation");
    assert.equal(
      await evaluate("document.querySelector('#otp').value"),
      "123456",
      "collapsing the view retains verification input"
    );
    await evaluate("document.querySelector('#mfa').appendChild(document.querySelector('#password'))");
    await waitFor(() => frame === null, "credential overlap must withdraw the verification area");
    await evaluate(
      "document.querySelector('#password').id='renamed-secret'; document.querySelector('#renamed-secret').type='text'"
    );
    await interaction.capture();
    assert.equal(frame, null, "renaming the credential field must not release its protection");
    await evaluate(
      "document.querySelector('#renamed-secret').id='password';document.querySelector('#password').type='password';document.querySelector('#login').appendChild(document.querySelector('#password'))"
    );
    await waitFor(() => Boolean(frame), "frame not restored after removing protected field");
    await evaluate("document.querySelector('#mfa').appendChild(document.createElement('iframe'))");
    await waitFor(() => frame === null, "unguarded frames must not be exposed");
    await evaluate("document.querySelector('#mfa iframe').remove()");
    await waitFor(() => Boolean(frame), "frame not restored after removing embedded document");
    const old = frame.revision;
    await evaluate("document.querySelector('#mfa').style.left='120px'");
    assert.equal(await interaction.input({ type: "text", text: "moved", revision: old }), false);
    await waitFor(() => frame && frame.revision !== old, "layout change must invalidate old input coordinates");
    await evaluate(
      "document.querySelector('#password').id='renamed-secret';document.querySelector('#renamed-secret').type='text'"
    );
    await click("#verify");
    assert.equal(await evaluate(buildLoginSuccessProbeScript("id=success", true)), false);
    const beforeSubmit = await evaluate("submissions.length");
    assert.equal(await interaction.submit(), true);
    await waitFor(() => evaluate(buildLoginSuccessProbeScript("id=success", true)), "login did not complete");
    assert.equal(await evaluate("submissions.length"), beforeSubmit + 1);
    assert.deepEqual(
      await evaluate("submissions.at(-1)"),
      { username: "managed-user", password: "managed-secret", otp: "123456" },
      "submit receives both managed credentials and user verification"
    );
    await waitFor(() => frame === null, "the removed verification region must withdraw its frame");
    assert.equal(
      await evaluate("document.querySelector('#renamed-secret').value"),
      "managed-secret",
      "credentials are retained until login submission has completed"
    );
    await evaluate(
      "globalThis.restoreSecret=true;document.querySelector('#renamed-secret').addEventListener('input', e => {if(globalThis.restoreSecret) e.target.value='managed-secret';})"
    );
    assert.equal(await interaction.complete(), false, "refuse completion if credentials cannot be cleared");
    await evaluate("globalThis.restoreSecret=false");
    if (!successSelector) {
      assert.equal(await interaction.submit(), true);
      assert.equal(await evaluate("submissions.length"), beforeSubmit + 1, "cleanup retries must not resubmit login");
    }
    assert.equal(await interaction.complete(), true);
    assert.equal(await interaction.input({ type: "text", text: "late", revision: 1 }), false);
    assert.equal(
      await evaluate("document.querySelector('#renamed-secret').value"),
      "",
      "original credentials cleared before exposing the page"
    );
    await interaction.dispose();
    assert.equal(
      await view.webContents.executeJavaScriptInIsolatedWorld(INTERACTION_WORLD, [
        { code: "globalThis.__jmsVerification" }
      ]),
      undefined
    );
  } finally {
    await interaction?.dispose();
    host.destroy();
    server.close();
  }
}
