import { describe, expect, it } from "vitest";
import { resolveAdvancedOptionFlags } from "./advancedOptionFlags";

describe("resolveAdvancedOptionFlags", () => {
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
});
