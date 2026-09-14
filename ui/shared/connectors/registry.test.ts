import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import { describe, expect, it } from "vitest";
import { resolveSessionComponent, resolveSessionSurface } from "./registry";

const tab = (protocol: string, connectMethod: NonNullable<WorkspaceSessionTab["payload"]>["connectMethod"]) =>
  ({
    protocol,
    payload: {
      id: "token",
      endpointUrl: "https://connector.example",
      webUrl: "https://connector.example/luna/lion/connect?token=token",
      connectMethod
    }
  }) as WorkspaceSessionTab;

describe("remote application session routing", () => {
  const lion = resolveSessionSurface({ protocol: "rdp", connectMethod: "web_rdp_native" } as WorkspaceSessionTab);

  it.each([
    ["http", "applet", "tinker"],
    ["https", "applet", "lion"],
    ["sftp", "applet", "tinker"],
    ["k8s", "applet", "tinker"],
    ["postgresql", "virtual_app", "panda"],
    ["http", "applet", undefined]
  ] as const)("connects %s through Lion for %s (%s)", (protocol, type, component) => {
    const session = tab(protocol, { value: "remote-browser", type, component });
    expect(resolveSessionComponent(session)).toBe("lion");
    expect(resolveSessionSurface(session)).toBe(lion);
  });

  it("keeps built-in Web Proxy and external web pages on their own surfaces", () => {
    const proxy = tab("http", { value: "web_proxy_native", type: "web", component: "koko" });
    const external = tab("http", { value: "external", type: "web", component: "default" });
    expect(resolveSessionComponent(proxy)).toBe("koko");
    expect(resolveSessionComponent(external)).toBe("default");
    expect(resolveSessionSurface(proxy)).not.toBe(lion);
    expect(resolveSessionSurface(external)).not.toBe(lion);
    expect(resolveSessionSurface(proxy)).not.toBe(resolveSessionSurface(external));
  });
});
