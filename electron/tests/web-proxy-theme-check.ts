import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { BrowserWindow, nativeTheme } from "electron";
import { createWebProxyManager } from "../../packages/web-proxy/src/manager.ts";

// Run: pnpm --dir electron exec electron tests/fixtures/web-proxy-interaction-app theme
export async function runThemeChecks() {
  const originalThemeSource = nativeTheme.themeSource;
  nativeTheme.themeSource = "light";
  const server = createServer((req, res) => {
    if (req.url === "/blocked-redirect") {
      res.writeHead(302, { location: "http://127.0.0.1:1/" });
      res.end();
      return;
    }
    res.setHeader("content-type", "text/html");
    res.end(`<!doctype html><html><head>
      <meta name="color-scheme" content="light dark">
      <style>:root { --test-theme: light; }
      @media (prefers-color-scheme: dark) { :root { --test-theme: dark; } }</style>
      <script>
        const media = matchMedia('(prefers-color-scheme: dark)');
        window.initialDark = media.matches;
        window.themeChanges = [];
        media.addEventListener('change', event => themeChanges.push(event.matches));
      </script></head><body>Theme test</body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const targetUrl = `http://127.0.0.1:${address.port}/`;
  const host = new BrowserWindow({ show: true, webPreferences: { sandbox: true, contextIsolation: true } });
  const event = { sender: host.webContents };
  const blockedNavigations: string[] = [];
  const manager = createWebProxyManager({
    labelForWindow: () => "theme-test",
    emit: (_name, payload) => {
      if (payload.navigationError) blockedNavigations.push(payload.navigationError);
    },
    direct: true,
    createSession: async () => ({ autofillAvailable: false })
  });
  const invoke = (command: string, args: Record<string, unknown>) => manager.invoke(command, event, host, args);
  const stateScript = `({
    initialDark, dark: matchMedia('(prefers-color-scheme: dark)').matches,
    css: getComputedStyle(document.documentElement).getPropertyValue('--test-theme').trim()
  })`;
  try {
    await host.loadURL("data:text/html,<html>Host stays light</html>");
    for (const [label, colorScheme, safeMode] of [
      ["web-proxy-dark", "dark", true],
      ["web-proxy-light", "light", false],
      ["web-proxy-default", undefined, true]
    ] as const) {
      await invoke("create_web_proxy_view", {
        label,
        colorScheme,
        safeMode,
        targetUrl,
        allowedUrls: label === "web-proxy-light" ? [targetUrl.replace("127.0.0.1", "localhost")] : []
      });
      const managed = manager.views.get(label)!;
      await once(managed.webContents, "did-finish-load", { signal: AbortSignal.timeout(10_000) });
      assert.deepEqual(await managed.webContents.executeJavaScript(stateScript), {
        initialDark: colorScheme === "dark",
        dark: colorScheme === "dark",
        css: colorScheme || "light"
      });
    }
    const dark = manager.views.get("web-proxy-dark")!.webContents;
    const light = manager.views.get("web-proxy-light")!.webContents;
    for (const script of [
      "location.href = 'http://127.0.0.1:1/'",
      "window.open('http://127.0.0.1:1/')",
      `location.href = ${JSON.stringify(`${targetUrl}blocked-redirect`)}`
    ]) {
      const before = blockedNavigations.length;
      await light.executeJavaScript(`void (${script})`);
      for (let i = 0; i < 100 && blockedNavigations.length === before; i++) await delay(20);
      assert.equal(blockedNavigations.length, before + 1, `navigation was not blocked: ${script}`);
      assert.notEqual(light.getURL(), "http://127.0.0.1:1/");
    }
    const allowedNavigation = once(light, "did-finish-load", { signal: AbortSignal.timeout(10_000) });
    await light.executeJavaScript(
      `void (location.href = ${JSON.stringify(targetUrl.replace("127.0.0.1", "localhost"))})`
    );
    await allowedNavigation;
    assert.equal(light.getURL(), targetUrl.replace("127.0.0.1", "localhost"));
    console.log(
      "Web Proxy navigation: configured asset policy blocks links, redirects and popups and permits listed sites"
    );
    await invoke("set_web_proxy_view_bounds", { label: "web-proxy-dark", x: 0, y: 0, width: 800, height: 600 });
    await invoke("set_web_proxy_view_active", { label: "web-proxy-dark", active: true });
    await dark.executeJavaScript("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    for (const colorScheme of ["light", "dark", "light"] as const) {
      await dark.executeJavaScript(`void (window.nextThemeChange = new Promise(resolve => {
        const media = matchMedia('(prefers-color-scheme: dark)');
        const timer = setTimeout(() => resolve('timeout'), 5000);
        media.addEventListener('change', event => {
          clearTimeout(timer); resolve(event.matches);
        }, { once: true });
      }))`);
      await invoke("set_web_proxy_view_color_scheme", { label: "web-proxy-dark", colorScheme });
      assert.equal(await dark.executeJavaScript("nextThemeChange"), colorScheme === "dark");
      assert.deepEqual(await dark.executeJavaScript(stateScript), {
        initialDark: true,
        dark: colorScheme === "dark",
        css: colorScheme
      });
    }
    assert.deepEqual(await dark.executeJavaScript("themeChanges"), [false, true, false]);
    await invoke("set_web_proxy_view_color_scheme", { label: "web-proxy-dark", colorScheme: "dark" });
    // A full origin change and a reload must retain the preference from creation.
    await dark.loadURL(targetUrl.replace("127.0.0.1", "localhost"));
    const reloaded = once(dark, "did-finish-load");
    dark.reload();
    await reloaded;
    assert.deepEqual(await dark.executeJavaScript(stateScript), { initialDark: true, dark: true, css: "dark" });
    assert.equal(await light.executeJavaScript("matchMedia('(prefers-color-scheme: dark)').matches"), false);
    assert.equal(await host.webContents.executeJavaScript("matchMedia('(prefers-color-scheme: dark)').matches"), false);
    assert.equal(nativeTheme.themeSource, "light", "website theme must not override OS theme detection");
    await assert.rejects(
      invoke("set_web_proxy_view_color_scheme", { label: "web-proxy-dark", colorScheme: "invalid" }),
      /invalid Web Proxy color scheme/
    );
    await assert.rejects(
      manager.invoke("set_web_proxy_view_color_scheme", { sender: { id: -1 } }, host, {
        label: "web-proxy-dark",
        colorScheme: "light"
      }),
      /Web Proxy view not found/
    );
    await invoke("set_web_proxy_view_color_scheme", { label: "web-proxy-dark" });
    assert.equal(await dark.executeJavaScript("matchMedia('(prefers-color-scheme: dark)').matches"), false);
    console.log("Web Proxy theme: initial CSS/JS, live changes, navigation and view isolation passed");
  } finally {
    for (const label of manager.views.keys()) await invoke("close_web_proxy_view", { label });
    host.destroy();
    nativeTheme.themeSource = originalThemeSource;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
