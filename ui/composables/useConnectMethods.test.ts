import type { ConnectMethod } from "~/composables/useConnectMethods";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import {
  canDownloadRdpFile,
  isExternalClientConnectMethod,
  normalizeWebConnectMethods,
  pickConnectMethod,
  useConnectMethods,
  WEB_CLI_NATIVE_VALUE,
  WEB_PROXY_NATIVE_VALUE,
  withKokoWebFallback
} from "~/composables/useConnectMethods";

vi.mock("~/store/modules/userInfo", () => ({
  useUserInfoStore: vi.fn()
}));

describe("connection method request reuse", () => {
  const scope = { currentSite: ref("https://site-a.example"), currentAccountId: ref("user-a"), orgId: ref("org-a") };
  const request = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    scope.currentSite.value = "https://site-a.example";
    scope.currentAccountId.value = "user-a";
    scope.orgId.value = "org-a";
    vi.stubGlobal("storeToRefs", () => scope);
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    vi.stubGlobal("isDesktopRuntime", () => false);
    vi.stubGlobal("getConnectMethods", request);
    request.mockReset().mockResolvedValue({ ssh: [], originals: [] });
    useConnectMethods().clearCache();
  });

  afterEach(() => {
    useConnectMethods().clearCache();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([false, true])("shares form and connection reads across instances (desktop=%s)", async (desktop) => {
    vi.stubGlobal("isDesktopRuntime", () => desktop);
    const form = useConnectMethods();
    const connection = useConnectMethods();
    await Promise.all([form.getMethodsForProtocol("ssh"), connection.getMethodsForProtocol("ssh")]);
    await form.getMethodDisplayName("ssh", "web_cli");
    await connection.getMethodsForProtocol("ssh");
    await connection.fetchConnectMethods();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("refreshes expired results and retries failed requests", async () => {
    const methods = useConnectMethods();
    await methods.fetchConnectMethods();
    vi.advanceTimersByTime(30_001);
    request.mockRejectedValueOnce(new Error("offline"));
    await expect(methods.fetchConnectMethods()).rejects.toThrow("offline");
    await methods.fetchConnectMethods();
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("isolates sites, accounts, organizations and runtimes", async () => {
    const methods = useConnectMethods();
    await methods.fetchConnectMethods();
    scope.currentSite.value = "https://site-b.example";
    await methods.fetchConnectMethods();
    scope.currentAccountId.value = "user-b";
    await methods.fetchConnectMethods();
    scope.orgId.value = "org-b";
    await methods.fetchConnectMethods();
    vi.stubGlobal("isDesktopRuntime", () => true);
    await methods.fetchConnectMethods();
    expect(request).toHaveBeenCalledTimes(5);
  });

  it("does not let an old failure evict a request started after clearing", async () => {
    const methods = useConnectMethods();
    let rejectOld!: (error: Error) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectOld = reject;
        })
    );
    const oldRequest = methods.fetchConnectMethods();
    methods.clearCache();
    await methods.fetchConnectMethods();
    const rejected = expect(oldRequest).rejects.toThrow("old request");
    rejectOld(new Error("old request"));
    await rejected;
    await methods.fetchConnectMethods();
    expect(request).toHaveBeenCalledTimes(2);
  });
});

const appletMethod = (value: string, label: string): ConnectMethod => ({
  value,
  label,
  type: "applet",
  icon: "",
  disabled: false,
  listen: "",
  component: "tinker"
});

describe("RemoteApp connection modes", () => {
  const applet = appletMethod("weblite", "WebLite");

  it.each([undefined, "web", "client"])("only downloads and launches a client in client mode (%s)", (mode) => {
    const options = { appletConnectMethod: mode };
    expect(canDownloadRdpFile(applet, options)).toBe(mode === "client");
    expect(isExternalClientConnectMethod(applet.value, [applet], options)).toBe(mode === "client");
  });

  it("excludes disabled applets, built-in web and virtual applications from RDP downloads", () => {
    for (const method of [
      { ...applet, disabled: true },
      { ...applet, type: "web", component: "lion" },
      { ...applet, type: "virtual_app", component: "panda" }
    ])
      expect(canDownloadRdpFile(method, { appletConnectMethod: "client" })).toBe(false);
  });
});

describe("desktop website connect methods", () => {
  beforeEach(() => vi.stubGlobal("isDesktopRuntime", () => true));
  afterEach(() => vi.unstubAllGlobals());
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

  it("keeps koko web cli for clickhouse after stripping iframe methods", () => {
    const webCli: ConnectMethod = {
      value: "web_cli",
      label: "Web CLI",
      type: "web",
      icon: "",
      disabled: false,
      listen: "",
      component: "koko",
      endpoint_protocol: "http"
    };
    const methods = normalizeWebConnectMethods({ clickhouse: [webCli], originals: [] }, true).clickhouse!;

    expect(methods.map((item) => item.value)).toEqual([WEB_CLI_NATIVE_VALUE]);
    expect(withKokoWebFallback("clickhouse", []).map((item) => item.value)).toEqual([]);
    expect(withKokoWebFallback("clickhouse", methods).map((item) => item.value)).toEqual([WEB_CLI_NATIVE_VALUE]);
  });

  it("does not invent koko web cli when Core omits it", () => {
    expect(withKokoWebFallback("ssh", []).map((item) => item.value)).toEqual([]);
    expect(withKokoWebFallback("ssh", [weblite]).map((item) => item.value)).toEqual(["weblite"]);
  });

  it("does not resurrect a disabled web cli", () => {
    const webCli: ConnectMethod = {
      value: "web_cli",
      label: "Web CLI",
      type: "web",
      icon: "",
      disabled: true,
      listen: "",
      component: "koko",
      endpoint_protocol: "http"
    };
    const methods = normalizeWebConnectMethods({ ssh: [webCli], originals: [] }, true).ssh!;

    expect(methods[0]).toMatchObject({
      value: WEB_CLI_NATIVE_VALUE,
      disabled: true,
      origin_value: "web_cli"
    });
    expect(withKokoWebFallback("ssh", methods).filter((item) => !item.disabled)).toEqual([]);
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

  it("hides builtin from the enabled list when Core omits or disables web_cli", () => {
    const nativeMethod = { ...appletMethod("ssh_client", "SSH client"), type: "native" };
    const disabledWebCli: ConnectMethod = {
      value: "web_cli",
      label: "Web CLI",
      type: "web",
      icon: "",
      disabled: true,
      listen: "",
      component: "koko",
      endpoint_protocol: "http"
    };
    const enabledValues = (raw: ConnectMethod[]) =>
      withKokoWebFallback("ssh", normalizeWebConnectMethods({ ssh: raw, originals: [] }, true).ssh!)
        .filter((method) => !method.disabled)
        .map((method) => method.value);

    expect(enabledValues([disabledWebCli, nativeMethod])).toContain("ssh_client");
    expect(enabledValues([disabledWebCli, nativeMethod])).not.toContain(WEB_CLI_NATIVE_VALUE);
    expect(enabledValues([nativeMethod])).toContain("ssh_client");
    expect(enabledValues([nativeMethod])).not.toContain(WEB_CLI_NATIVE_VALUE);
  });

  it("prefers the workspace terminal over a saved local application", () => {
    const nativeMethod = { ...appletMethod("ssh_client", "SSH client"), type: "native" };
    const builtin: ConnectMethod = {
      value: WEB_CLI_NATIVE_VALUE,
      label: "Built-in",
      type: "web",
      icon: "",
      disabled: false,
      listen: "",
      component: "koko"
    };

    expect(pickConnectMethod("ssh", [builtin, nativeMethod], "", "native_app:ssh_client:putty", undefined, true)).toBe(
      WEB_CLI_NATIVE_VALUE
    );
  });

  it.each([
    ["ssh", WEB_CLI_NATIVE_VALUE, "ssh_client", "terminal"],
    ["rdp", "web_rdp_native", "mstsc", "mstsc"]
  ])(
    "preserves an explicit %s application choice alongside a built-in option",
    (protocol, builtinValue, nativeValue, client) => {
      const builtin = { ...appletMethod(builtinValue, "Built-in"), type: "web" };
      const native = { ...appletMethod(nativeValue, "Application"), type: "native" };
      const selected = `native_app:${nativeValue}:${client}`;
      const appConfig = {
        terminal: [
          {
            name: client,
            display_name: client,
            protocol: [protocol],
            comment: { zh: "", en: "" },
            download_url: "",
            type: "",
            path: "",
            arg_format: "",
            match_first: [protocol],
            is_internal: false,
            is_default: true,
            is_set: true,
            path_exists: true
          }
        ],
        remotedesktop: [],
        filetransfer: [],
        databases: []
      };
      expect(pickConnectMethod(protocol, [builtin, native], selected, "", appConfig, true)).toBe(selected);
      expect(pickConnectMethod(protocol, [builtin, native], "", selected, appConfig, true)).toBe(builtinValue);
      appConfig.terminal[0]!.path_exists = false;
      expect(pickConnectMethod(protocol, [builtin, native], selected, "", appConfig, true)).toBe(builtinValue);
    }
  );
});
