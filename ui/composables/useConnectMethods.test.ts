import { describe, expect, it, vi } from "vitest";
import type { ConnectMethod } from "~/composables/useConnectMethods";
import {
  isExternalClientConnectMethod,
  WEB_PROXY_NATIVE_VALUE,
  withWebProxyBuiltin
} from "~/composables/useConnectMethods";

vi.mock("~/store/modules/userInfo", () => ({
  useUserInfoStore: vi.fn()
}));

const method = (value: string, label: string): ConnectMethod => ({
  value,
  label,
  type: "applet",
  icon: "",
  disabled: false,
  listen: "",
  component: "tinker"
});

describe("desktop website connect methods", () => {
  const websiteMethods = [
    method("chrome", "Chrome Browser"),
    method("edge", "Microsoft Edge"),
    method("360se_app", "360se_app")
  ];

  it("adds the built-in proxy and keeps remote applications in the Tauri client", () => {
    const methods = withWebProxyBuiltin("HTTP", websiteMethods, true);

    expect(methods.map((item) => item.value)).toEqual([WEB_PROXY_NATIVE_VALUE, "chrome", "edge", "360se_app"]);
    expect(methods[0]).toMatchObject({
      label: "内置 Web Proxy",
      type: "web",
      component: "web-proxy",
      origin_value: "chrome"
    });
  });

  it("does not add the desktop-only proxy to the web build", () => {
    expect(withWebProxyBuiltin("http", websiteMethods, false)).toEqual(websiteMethods);
  });

  it("does not duplicate an existing built-in proxy", () => {
    const existing = withWebProxyBuiltin("https", websiteMethods, true);
    expect(withWebProxyBuiltin("https", existing, true)).toEqual(existing);
  });

  it("opens the built-in proxy inside the workspace instead of an external window", () => {
    const methods = withWebProxyBuiltin("http", websiteMethods, true);
    expect(isExternalClientConnectMethod(WEB_PROXY_NATIVE_VALUE, methods)).toBe(false);
  });
});
