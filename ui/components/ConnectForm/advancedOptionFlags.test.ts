import { describe, expect, it } from "vitest";
import { resolveAdvancedOptionFlags } from "./advancedOptionFlags";

describe("resolveAdvancedOptionFlags", () => {
  it("shows the four v4 RDP options for Razor applications", () => {
    expect(
      resolveAdvancedOptionFlags({
        protocol: "rdp",
        component: "razor",
        hasXPack: true,
        connectionTokenReusable: true
      })
    ).toMatchObject({
      resolution: true,
      remoteMicrophone: true,
      reusable: true,
      rdpConnectionSpeed: true,
      show: true
    });
  });

  it("keeps microphone and reusable options behind their feature flags", () => {
    expect(resolveAdvancedOptionFlags({ protocol: "rdp", component: "razor" })).toMatchObject({
      remoteMicrophone: false,
      reusable: false,
      rdpConnectionSpeed: true
    });
  });

  it.each([
    ["rdp", "lion", undefined, true, false],
    ["http", "tinker", "web", false, false],
    ["http", "tinker", "client", false, true],
    ["http", "panda", "client", false, false],
    ["ssh", "koko", undefined, false, false]
  ])("scopes RDP options for %s/%s/%s", (protocol, component, appletConnectMethod, remoteMicrophone, reusable) => {
    expect(
      resolveAdvancedOptionFlags({
        protocol,
        component,
        appletConnectMethod,
        hasXPack: true,
        connectionTokenReusable: true
      })
    ).toMatchObject({ remoteMicrophone, reusable, rdpConnectionSpeed: false });
  });

  it("shows backspace for k8s koko methods", () => {
    const flags = resolveAdvancedOptionFlags({ protocol: "k8s", component: "koko" });
    expect(flags.backspace).toBe(true);
    expect(flags.show).toBe(true);
  });

  it("hides advanced options for lion web GUI", () => {
    expect(resolveAdvancedOptionFlags({ protocol: "http", component: "lion" }).show).toBe(false);
  });

  it("shows applet for tinker when XPack is on", () => {
    const flags = resolveAdvancedOptionFlags({ protocol: "http", component: "tinker", hasXPack: true });
    expect(flags.applet).toBe(true);
    expect(flags.show).toBe(true);
  });

  it("hides tinker applet without XPack", () => {
    expect(resolveAdvancedOptionFlags({ protocol: "http", component: "tinker" }).show).toBe(false);
  });

  it("shows virtualapp for panda when XPack is on", () => {
    const flags = resolveAdvancedOptionFlags({ protocol: "https", component: "panda", hasXPack: true });
    expect(flags.virtualapp).toBe(true);
    expect(flags.show).toBe(true);
  });

  it("shows backspace for koko web proxy", () => {
    const flags = resolveAdvancedOptionFlags({ protocol: "https", component: "koko" });
    expect(flags.backspace).toBe(true);
    expect(flags.show).toBe(true);
  });

  it("shows charset and backspace for ssh koko", () => {
    const flags = resolveAdvancedOptionFlags({ protocol: "ssh", component: "koko" });
    expect(flags.charset).toBe(true);
    expect(flags.backspace).toBe(true);
    expect(flags.show).toBe(true);
  });

  it("shows Magnus db_client token reuse without changing Razor/Tinker reusable", () => {
    expect(
      resolveAdvancedOptionFlags({
        protocol: "mysql",
        component: "magnus",
        connectMethod: "db_client",
        connectionTokenReusable: true
      })
    ).toMatchObject({ tokenReusable: true, reusable: false, show: true });
    expect(
      resolveAdvancedOptionFlags({
        protocol: "rdp",
        component: "razor",
        connectMethod: "mstsc",
        hasXPack: true,
        connectionTokenReusable: true
      })
    ).toMatchObject({ tokenReusable: false, reusable: true });
    expect(
      resolveAdvancedOptionFlags({
        protocol: "http",
        component: "tinker",
        connectMethod: "http",
        appletConnectMethod: "client",
        hasXPack: true,
        connectionTokenReusable: true
      })
    ).toMatchObject({ tokenReusable: false, reusable: true });
    expect(
      resolveAdvancedOptionFlags({
        protocol: "mysql",
        component: "magnus",
        connectMethod: "web_gui",
        connectionTokenReusable: true
      })
    ).toMatchObject({ tokenReusable: false });
  });
});
