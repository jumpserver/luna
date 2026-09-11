import { describe, expect, it } from "vitest";
import { resolveEndpointUrl } from "@jumpserver/connectors-core";

describe("connector endpoint resolution", () => {
  it.each(["http://localhost:3000", "https://jumpserver.example:8443"])(
    "uses the site protocol and port for the default endpoint at %s",
    (site) => {
      expect(resolveEndpointUrl({ http_port: 0, https_port: 0 }, site)).toBe(site);
      expect(resolveEndpointUrl({ host: new URL(site).hostname, http_port: 0, https_port: 0 }, site)).toBe(site);
    }
  );

  it("selects the HTTP transport port instead of native protocol ports", () => {
    const endpoint = { host: "connector.example", http_port: 5050, https_port: 9443, port: 2222 };
    expect(resolveEndpointUrl(endpoint, "http://localhost:3000")).toBe("http://connector.example:5050");
    expect(resolveEndpointUrl(endpoint, "https://jumpserver.example")).toBe("https://connector.example:9443");
  });

  it("keeps explicit local, remote and IPv6 endpoint addresses", () => {
    expect(resolveEndpointUrl({ host: "localhost", http_port: 5050 }, "http://localhost:3000")).toBe(
      "http://localhost:5050"
    );
    expect(resolveEndpointUrl({ value: "https://remote.example:9443" }, "jms-app://app")).toBe(
      "https://remote.example:9443"
    );
    expect(resolveEndpointUrl({ host: "::1", http_port: 5050 }, "http://localhost:3000")).toBe("http://[::1]:5050");
  });

  it("uses the dedicated Web Proxy port independently of the page protocol", () => {
    expect(
      resolveEndpointUrl(
        { host: "koko.example", https_port: 443, web_proxy_port: 15001 },
        "https://site.example",
        "http",
        "web_proxy_port"
      )
    ).toBe("http://koko.example:15001");
  });

  it.each(["file:///tmp", "http://user:password@host", "jms-app://app"])(
    "rejects invalid endpoint URLs: %s",
    (value) => {
      expect(() => resolveEndpointUrl({ value }, "http://localhost:3000")).toThrow();
    }
  );

  it.each([-1, 65536, "abc", "80/path"])("rejects invalid endpoint ports: %s", (http_port) => {
    expect(() => resolveEndpointUrl({ host: "host", http_port }, "http://localhost:3000")).toThrow();
  });
});
