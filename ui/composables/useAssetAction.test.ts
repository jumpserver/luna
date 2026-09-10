import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useAssetAction } from "./useAssetAction";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  assign: vi.fn(),
  getLocalClientUrl: vi.fn(),
  createToken: vi.fn(),
  errorToast: vi.fn(),
  appConfig: { value: undefined as unknown },
  store: {
    currentSite: "https://jumpserver.example",
    currentAccountId: "web-account",
    currentUser: { org: { id: "org" } },
    setConnectionPreferenceForAsset: vi.fn()
  }
}));

vi.mock("~/shared/desktop/bridge", () => ({ desktopInvoke: mocks.invoke, desktopListen: vi.fn() }));
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => mocks.store }));
vi.mock("~/composables/useApiRequest", () => ({
  getAssetDetailRequest: vi.fn(),
  invalidatePersonalAssetCredentialCache: vi.fn()
}));
vi.mock("~/composables/useSettingManager", () => ({
  useSettingManager: () =>
    Object.fromEntries(
      [
        "appConfig",
        "charset",
        "rdpResolution",
        "backspaceAsCtrlH",
        "keyboardLayout",
        "rdpClientOption",
        "rdpColorQuality",
        "rdpSmartSize"
      ].map((key) => [key, key === "appConfig" ? mocks.appConfig : { value: undefined }])
    )
}));
vi.mock("vue", async (original) => ({
  ...(await original<typeof import("vue")>()),
  onMounted: vi.fn(),
  onBeforeUnmount: vi.fn()
}));

describe("opening assets in local applications", () => {
  const method = { value: "ssh_client", type: "native", component: "koko", disabled: false };
  const payload = {
    protocol: "ssh",
    name: "生产主机",
    endpoint: { host: "127.0.0.1", port: 2222 },
    token: { id: "id", value: "secret" }
  };
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))));

  beforeEach(() => {
    mocks.appConfig.value = undefined;
    vi.stubGlobal("isDesktopRuntime", () => false);
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    vi.stubGlobal("useToast", () => ({}));
    vi.stubGlobal("useErrorToast", () => ({ addErrorToast: mocks.errorToast }));
    vi.stubGlobal("useWorkspaceTabs", () => ({}));
    vi.stubGlobal("useConnectMethods", () => ({
      fetchConnectMethods: async () => ({ ssh: [method] }),
      getMethodsForProtocol: async () => [method]
    }));
    vi.stubGlobal("storeToRefs", () => ({
      currentSite: ref(mocks.store.currentSite),
      currentConnectionInfoMap: ref({}),
      currentRdpClientOption: ref({}),
      orgId: ref("org")
    }));
    vi.stubGlobal("window", { location: { assign: mocks.assign } });
    vi.stubGlobal("getLocalClientUrl", mocks.getLocalClientUrl);
    vi.stubGlobal("createConnectionTokenWithAcl", mocks.createToken);
    mocks.createToken.mockResolvedValue({ id: "id" });
    mocks.invoke.mockResolvedValue(undefined);
    mocks.getLocalClientUrl.mockResolvedValue({ url: `jms://${encoded}` });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  async function connect(connectMethod = "ssh_client") {
    const ready = vi.fn();
    const failed = vi.fn();
    await useAssetAction().handleAssetConnection("root", "asset", "ssh", [], undefined, {
      accountId: "account",
      connectMethod,
      onSessionReady: ready,
      onSessionError: failed
    });
    await vi.waitFor(() => expect(ready.mock.calls.length + failed.mock.calls.length).toBe(1));
    return { ready, failed };
  }

  it.each(["jms", "jms2"])(
    "web launches the current client from a %s server URL without modifying the payload",
    async (scheme) => {
      mocks.getLocalClientUrl.mockResolvedValue({ url: `${scheme}://${encoded}` });
      const { failed } = await connect();
      expect(failed).not.toHaveBeenCalled();
      expect(mocks.assign).toHaveBeenCalledExactlyOnceWith(`jms2://${encoded}`);
      expect(mocks.invoke).not.toHaveBeenCalled();
    }
  );

  it("desktop launches through IPC using the same current-client scheme", async () => {
    vi.stubGlobal("isDesktopRuntime", () => true);
    const { failed } = await connect();
    expect(failed).not.toHaveBeenCalled();
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("pull_up", { url: `jms2://${encoded}` });
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it("honors an explicitly selected local application when the built-in terminal is also available", async () => {
    vi.stubGlobal("isDesktopRuntime", () => true);
    const methods = [{ ...method, value: "web_cli_native", type: "web" }, method];
    vi.stubGlobal("useConnectMethods", () => ({
      fetchConnectMethods: async () => ({ ssh: methods }),
      getMethodsForProtocol: async () => methods
    }));
    mocks.appConfig.value = {
      terminal: [{ name: "terminal", protocol: ["ssh"], is_set: true, path_exists: true, match_first: ["ssh"] }]
    };
    const { failed } = await connect("native_app:ssh_client:terminal");
    expect(failed).not.toHaveBeenCalled();
    expect(mocks.createToken).toHaveBeenCalledWith(
      expect.objectContaining({ connect_method: "ssh_client" }),
      expect.anything()
    );
    expect(mocks.invoke).toHaveBeenCalledOnce();
    const [command, args] = mocks.invoke.mock.calls[0]!;
    expect(command).toBe("pull_up");
    expect(
      JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(args.url.slice(7)), (c) => c.charCodeAt(0))))
    ).toEqual({
      ...payload,
      client: "terminal"
    });
  });

  it("reports invalid server URLs without navigating or launching a local application", async () => {
    mocks.getLocalClientUrl.mockResolvedValue({ url: "https://unexpected.example" });
    const { failed } = await connect();
    expect(failed).toHaveBeenCalledOnce();
    expect(mocks.errorToast).toHaveBeenCalledOnce();
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it.each([
    [true, "http:", "https://jumpserver.example", "https"],
    [true, "jms-app:", "https://jumpserver.example", "https"],
    [true, "http:", "http://jumpserver.example", "http"],
    [false, "http:", "https://jumpserver.example", "http"],
    [false, "https:", "http://jumpserver.example", "https"]
  ])(
    "selects the connector protocol for desktop=%s, page=%s, site=%s",
    async (desktop, pageProtocol, site, expected) => {
      vi.stubGlobal("isDesktopRuntime", () => desktop);
      vi.stubGlobal("isElectronRuntime", () => desktop);
      vi.stubGlobal("window", {
        location: { protocol: pageProtocol, origin: `${pageProtocol}//127.0.0.1:3000` }
      });
      vi.stubGlobal("storeToRefs", () => ({
        currentSite: ref(site),
        currentConnectionInfoMap: ref({}),
        currentRdpClientOption: ref({}),
        orgId: ref("org")
      }));
      const methods = [{ ...method, value: "web_cli_native", type: "web" }];
      vi.stubGlobal("useConnectMethods", () => ({
        fetchConnectMethods: async () => ({ ssh: methods }),
        getMethodsForProtocol: async () => methods
      }));
      const getSmartEndpoint = vi
        .fn()
        .mockResolvedValue({ host: "jumpserver.example", http_port: 80, https_port: 443 });
      vi.stubGlobal("getSmartEndpoint", getSmartEndpoint);
      mocks.invoke.mockImplementation(async (_command, args) => args.endpointUrl);
      const { ready, failed } = await connect("web_cli_native");
      expect(failed).not.toHaveBeenCalled();
      expect(getSmartEndpoint).toHaveBeenCalledWith(expect.objectContaining({ protocol: expected }), undefined);
      expect(ready.mock.calls[0]?.[0].endpointUrl).toMatch(new RegExp(`^${expected}://`));
    }
  );
});
