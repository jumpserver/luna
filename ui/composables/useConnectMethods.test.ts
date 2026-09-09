import type { ConnectMethod } from "~/composables/useConnectMethods";
import { describe, expect, it, vi } from "vitest";
import {
  isExternalClientConnectMethod,
  normalizeWebConnectMethods,
  pickConnectMethod,
  WEB_PROXY_NATIVE_VALUE,
  withKokoWebFallback
} from "~/composables/useConnectMethods";

vi.mock("~/store/modules/userInfo", () => ({
  useUserInfoStore: vi.fn()
}));

const appletMethod = (value: string, label: string): ConnectMethod => ({
  value,
  label,
  type: "applet",
  icon: "",
  disabled: false,
  listen: "",
  component: "tinker"
});

describe("desktop website connect methods", () => {
  const webProxyMethod: ConnectMethod = {
    value: "web_proxy",
    label: "Built-in Browser",
    type: "web",
    icon: "",
    disabled: false,
    listen: "",
    component: "koko",
    endpoint_protocol: "http"
  };
  const weblite = appletMethod("weblite", "JumpServer WebLite");

  it("maps the Core web proxy method and keeps remote applications in the desktop client", () => {
    const methods = normalizeWebConnectMethods({ http: [webProxyMethod, weblite], originals: [] }, true).http!;

    expect(methods.map((item) => item.value)).toEqual([WEB_PROXY_NATIVE_VALUE, "weblite"]);
    expect(methods[0]).toMatchObject({
      label: "ConnectMethod.BuiltinWebProxy",
      type: "web",
      component: "koko",
      origin_value: "web_proxy"
    });
  });

  it("hides the desktop-only proxy from the web build", () => {
    const methods = normalizeWebConnectMethods({ http: [webProxyMethod, weblite], originals: [] }, false).http!;
    expect(methods).toEqual([weblite]);
  });

  it("does not borrow an applet method when Core omits the web proxy", () => {
    const methods = normalizeWebConnectMethods({ http: [weblite], originals: [] }, true).http!;
    expect(methods).toEqual([weblite]);
    expect(withKokoWebFallback("http", methods)).toEqual([weblite]);
  });

  it("opens the built-in proxy inside the workspace instead of an external window", () => {
    const methods = normalizeWebConnectMethods({ http: [webProxyMethod], originals: [] }, true).http!;
    expect(isExternalClientConnectMethod(WEB_PROXY_NATIVE_VALUE, methods)).toBe(false);
  });

  it("prefers the configured match-first local application over the first method", () => {
    const nativeMethod = { ...appletMethod("ssh_client", "SSH client"), type: "native" };
    const appConfig = {
      terminal: [
        {
          name: "putty",
          display_name: "PuTTY",
          protocol: ["ssh"],
          comment: { zh: "", en: "" },
          download_url: "",
          type: "",
          path: "",
          arg_format: "",
          match_first: ["ssh"],
          is_internal: false,
          is_default: false,
          is_set: true
        }
      ],
      remotedesktop: [],
      filetransfer: [],
      databases: []
    };

    expect(pickConnectMethod("ssh", [appletMethod("koko", "Built-in"), nativeMethod], "", "", appConfig, true)).toBe(
      "native_app:ssh_client:putty"
    );
  });
});
