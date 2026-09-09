import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetItem } from "~/types";

import { useWebProxyManager } from "~/composables/useWebProxyManager";

const asset = {
  id: "asset-1",
  name: "Website",
  address: "website.example.test"
} as AssetItem;

describe("web proxy endpoint", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the Koko Web Proxy port from the endpoint", () => {
    const request = useWebProxyManager().buildWebProxyRequest(
      asset,
      "https",
      "http://koko.example.test:5001",
      "",
      "",
      [],
      15001
    );

    expect(request.proxyUrl).toBe("http://koko.example.test:15001");
    expect(request.allowedUrls).toEqual([]);
  });

  it("falls back to port 5001 for older endpoints", () => {
    const request = useWebProxyManager().buildWebProxyRequest(asset, "https", "http://koko.example.test");

    expect(request.proxyUrl).toBe("http://koko.example.test:5001");
  });

  it("passes only the asset navigation allowlist to its own session", () => {
    const { buildWebProxyRequest } = useWebProxyManager();
    expect(
      buildWebProxyRequest(asset, "https", "http://koko.example.test", "", "", ["https://sso.test"]).allowedUrls
    ).toEqual(["https://sso.test"]);
    expect(buildWebProxyRequest(asset, "https", "http://koko.example.test").allowedUrls).toEqual([]);
  });

  it("supports an external Nginx proxy endpoint", () => {
    vi.stubEnv("VITE_JMS_WEB_PROXY_URL", "http://web-proxy.example.test:15001");

    const request = useWebProxyManager().buildWebProxyRequest(asset, "https", "https://koko.example.test");

    expect(request.proxyUrl).toBe("http://web-proxy.example.test:15001");
  });

  it("passes the configured login-success selector to the desktop session", () => {
    const request = useWebProxyManager().buildWebProxyRequest(
      asset,
      "https",
      "http://koko.example.test:5050",
      "css=.dashboard"
    );

    expect(request.successSelector).toBe("css=.dashboard");
  });

  it("uses safe mode from the selected protocol, with missing settings disabled", () => {
    const configuredAsset = {
      ...asset,
      permedProtocols: [
        { name: "http", port: 80, public: true, setting: { safe_mode: true } },
        { name: "https", port: 443, public: true, setting: { safe_mode: false } }
      ]
    };
    const { buildWebProxyRequest } = useWebProxyManager();
    expect(buildWebProxyRequest(configuredAsset, "http", "http://koko.example.test").safeMode).toBe(true);
    expect(buildWebProxyRequest(configuredAsset, "https", "http://koko.example.test").safeMode).toBe(false);
    expect(buildWebProxyRequest(asset, "http", "http://koko.example.test").safeMode).toBe(false);
  });
});

it("passes the optional verification-area selector without changing unconfigured sessions", () => {
  const { buildWebProxyRequest } = useWebProxyManager();
  expect(buildWebProxyRequest(asset, "https", "http://koko.example.test").interactiveSelector).toBe("");
  expect(
    buildWebProxyRequest(asset, "https", "http://koko.example.test", "id=success", "css=#mfa-dialog")
      .interactiveSelector
  ).toBe("css=#mfa-dialog");
});
