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

  it("uses the dedicated Koko Web Proxy port", () => {
    const request = useWebProxyManager().buildWebProxyRequest(asset, "https", "http://koko.example.test:5050");

    expect(request.proxyUrl).toBe("http://koko.example.test:5001");
  });

  it("supports an external Nginx proxy endpoint", () => {
    vi.stubEnv("VITE_JMS_WEB_PROXY_URL", "http://web-proxy.example.test:15001");

    const request = useWebProxyManager().buildWebProxyRequest(asset, "https", "https://koko.example.test");

    expect(request.proxyUrl).toBe("http://web-proxy.example.test:15001");
  });
});
