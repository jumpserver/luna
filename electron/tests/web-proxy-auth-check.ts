import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { connect } from "node:net";
import os from "node:os";
import path from "node:path";
import { BrowserWindow } from "electron";
import { createWebProxyManager } from "../../packages/web-proxy/src/manager.ts";

export async function runProxyAuthChecks() {
  const temp = await mkdtemp(path.join(os.tmpdir(), "web-proxy-auth-"));
  const keyPath = path.join(temp, "key.pem");
  const certPath = path.join(temp, "cert.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "1",
      "-subj",
      "/CN=localhost"
    ],
    { stdio: "ignore" }
  );
  const cert = await readFile(certPath);
  const certificate = new X509Certificate(cert);
  const secure = createHttpsServer({ key: await readFile(keyPath), cert }, (request, response) => {
    assert.equal(request.headers["proxy-authorization"], undefined);
    response.end("<html><title>HTTPS proxy authenticated</title></html>");
  });
  await new Promise<void>((resolve) => secure.listen(0, "127.0.0.1", resolve));
  const securePort = (secure.address() as { port: number }).port;
  const targetUrl = `https://localhost:${securePort}/`;
  const expected = `Basic ${Buffer.from("core-session:ticket-value").toString("base64")}`;
  let authenticatedHttp = 0;
  let authenticatedTunnels = 0;
  let challenged = 0;
  let closed = 0;
  let failAuthentication = false;
  const sockets = new Set<any>();
  const proxy = createHttpServer(async (request, response) => {
    if (request.url === "/_jumpserver/web-sessions/" && request.method === "POST") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      assert.equal(body.token_id, "token-id");
      assert.equal(body.token_value, "token-value");
      assert.equal(request.headers["x-koko-connect-ticket"], "ticket-value");
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          session_id: "core-session",
          proxy_auth: "connect_ticket",
          target_url: targetUrl,
          origin: new URL(targetUrl).origin,
          autofill_available: false
        })
      );
      return;
    }
    if (request.headers["proxy-authorization"] !== expected || failAuthentication) {
      challenged++;
      response.writeHead(407, { "Proxy-Authenticate": 'Basic realm="JumpServer Web Proxy"' });
      response.end();
      return;
    }
    if (request.method === "DELETE" && request.url === "/_jumpserver/web-sessions/core-session") {
      closed++;
      response.writeHead(204).end();
      return;
    }
    authenticatedHttp++;
    response.end("<html><title>HTTP proxy authenticated</title></html>");
  });
  proxy.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  proxy.on("connect", (request, socket, head) => {
    if (request.headers["proxy-authorization"] !== expected || failAuthentication) {
      challenged++;
      socket.end(
        'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="JumpServer Web Proxy"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'
      );
      return;
    }
    authenticatedTunnels++;
    const upstream = connect(securePort, "127.0.0.1", () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    socket.on("close", () => upstream.destroy());
    upstream.on("error", () => socket.destroy());
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const proxyUrl = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`;
  const host = new BrowserWindow({ show: false });
  const manager = createWebProxyManager({ labelForWindow: () => "auth-check", emit() {} });
  const invoke = (command, args) => manager.invoke(command, { sender: host.webContents }, host, args);
  const label = "web-proxy-auth-check";
  try {
    await invoke("create_web_proxy_view", {
      label,
      targetUrl,
      proxyUrl,
      tokenId: "token-id",
      tokenValue: "token-value",
      ticket: "ticket-value"
    });
    const managed = manager.views.get(label)!;
    // Trust only this test server's freshly generated certificate in this test session.
    managed.webContents.session.setCertificateVerifyProc((details, callback) => {
      callback(
        details.hostname === "localhost" &&
          new X509Certificate(details.certificate.data).fingerprint256 === certificate.fingerprint256
          ? 0
          : -3
      );
    });
    await once(managed.webContents, "did-finish-load", { signal: AbortSignal.timeout(15_000) });
    assert.equal(managed.webContents.getTitle(), "HTTPS proxy authenticated");
    assert.ok(authenticatedTunnels > 0);
    assert.ok(challenged > 0);
    assert.equal(
      await managed.webContents.session.resolveProxy("http://127.0.0.1/"),
      `PROXY 127.0.0.1:${(proxy.address() as { port: number }).port}`
    );
    await managed.webContents.loadURL("http://other-asset.invalid/");
    assert.equal(managed.webContents.getTitle(), "HTTP proxy authenticated");
    assert.ok(authenticatedHttp > 0);
    failAuthentication = true;
    await managed.webContents.session.closeAllConnections();
    await assert.rejects(managed.webContents.loadURL(targetUrl));
    failAuthentication = false;
    await invoke("close_web_proxy_view", { label });
    assert.equal(closed, 1);
    console.log(
      "Web Proxy auth: real Electron HTTP/HTTPS, loopback routing, rejected credentials and session cleanup passed"
    );
  } finally {
    manager.disposeHost(host.webContents.id);
    host.destroy();
    for (const socket of sockets) socket.destroy();
    await Promise.all([
      new Promise<void>((resolve) => proxy.close(() => resolve())),
      new Promise<void>((resolve) => secure.close(() => resolve()))
    ]);
    await rm(temp, { recursive: true, force: true });
  }
}
