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

  it.each(["http://127.0.0.1:5001", "http://koko.example.test:15001", "http://proxy.example.test"])(
    "uses the resolved proxy endpoint %s unchanged",
    (endpoint) => {
      const request = useWebProxyManager().buildWebProxyRequest(asset, "https", endpoint);
      expect(request.proxyUrl).toBe(endpoint);
    }
  );

  it("passes only the asset navigation allowlist to its own session", () => {
    const { buildWebProxyRequest } = useWebProxyManager();
    expect(
      buildWebProxyRequest(asset, "https", "http://koko.example.test", "", "", ["https://sso.test"]).allowedUrls
    ).toEqual(["https://sso.test"]);
    expect(buildWebProxyRequest(asset, "https", "http://koko.example.test").allowedUrls).toEqual([]);
  });

  it("does not override the selected endpoint with legacy development variables", () => {
    vi.stubEnv("VITE_JMS_WEB_PROXY_URL", "http://127.0.0.1:5001");
    vi.stubEnv("VITE_JMS_WEB_PROXY_PORT", "15001");
    const request = useWebProxyManager().buildWebProxyRequest(asset, "https", "http://remote.example:5001");
    expect(request.proxyUrl).toBe("http://remote.example:5001");
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
