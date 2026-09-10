import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useAssetAction } from "./useAssetAction";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  assign: vi.fn(),
  getLocalClientUrl: vi.fn(),
  getRdpFile: vi.fn(),
  getLunaPreferences: vi.fn(),
  getPublicSettings: vi.fn(),
  saveDialog: vi.fn(),
  writeFile: vi.fn(),
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

vi.mock("~/shared/desktop/bridge", () => ({
  desktopInvoke: mocks.invoke,
  desktopListen: vi.fn(),
  desktopDialog: { save: mocks.saveDialog },
  desktopFs: { writeFile: mocks.writeFile }
}));
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => mocks.store }));
vi.mock("~/composables/useApiRequest", () => ({
  getAssetDetailRequest: vi.fn(),
  getConnectionRdpFile: mocks.getRdpFile,
  getLunaPreferences: mocks.getLunaPreferences,
  getPublicSettings: mocks.getPublicSettings,
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
    mocks.getLunaPreferences.mockResolvedValue({ graphics: { applet_connection_method: "client" } });
    mocks.getPublicSettings.mockResolvedValue({ XPACK_LICENSE_IS_VALID: true, TERMINAL_RAZOR_ENABLED: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
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

  describe("RDP file downloads", () => {
    const content = "full address:s:rdp.example\r\nusername:s:用户\r\n";
    const rdpMethod = { ...method, value: "mstsc", component: "razor" };
    const link = { href: "", download: "", click: vi.fn() };

    beforeEach(() => {
      vi.stubGlobal("useConnectMethods", () => ({
        fetchConnectMethods: async () => ({ rdp: [rdpMethod] }),
        getMethodsForProtocol: async () => [rdpMethod]
      }));
      vi.stubGlobal("document", { createElement: () => link });
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:rdp-file");
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
      mocks.getRdpFile.mockResolvedValue(content);
      mocks.saveDialog.mockResolvedValue("/tmp/windows.rdp");
      mocks.writeFile.mockResolvedValue(undefined);
    });

    async function download(connectMethod = "mstsc", protocol = "rdp", appletConnectMethod?: string) {
      const ready = vi.fn();
      const failed = vi.fn();
      await useAssetAction().handleAssetConnection("Administrator", "asset", protocol, [], undefined, {
        accountId: "account",
        connectMethod,
        downloadRdp: true,
        orgId: "asset-org",
        connectOptions: {
          appletConnectMethod,
          rdp_resolution: "1600x900",
          rdp_client_option: ["full_screen", "drives_redirect"],
          remote_microphone: true
        },
        onSessionReady: ready,
        onSessionError: failed
      });
      await vi.waitFor(() => expect(ready.mock.calls.length + failed.mock.calls.length).toBe(1));
      return { ready, failed };
    }

    it.each([false, true])(
      "downloads the authorized RDP file without launching a client (desktop=%s)",
      async (desktop) => {
        vi.stubGlobal("isDesktopRuntime", () => desktop);
        const { failed } = await download();
        expect(failed).not.toHaveBeenCalled();
        expect(mocks.createToken).toHaveBeenCalledWith(
          expect.objectContaining({ asset: "asset", account: "account", protocol: "rdp", connect_method: "mstsc" }),
          expect.objectContaining({ orgId: "asset-org" })
        );
        expect(mocks.getRdpFile).toHaveBeenCalledWith(
          "id",
          expect.objectContaining({
            width: "1600",
            height: "900",
            full_screen: "1",
            drives_redirect: "1",
            remote_microphone: "1"
          }),
          "asset-org"
        );
        if (desktop) {
          expect(mocks.writeFile).toHaveBeenCalledWith("/tmp/windows.rdp", new TextEncoder().encode(content));
          expect(link.click).not.toHaveBeenCalled();
        } else {
          expect(link.download).toBe("asset.rdp");
          expect(link.click).toHaveBeenCalledOnce();
          expect(await (vi.mocked(URL.createObjectURL).mock.calls[0]![0] as Blob).text()).toBe(content);
          expect(mocks.saveDialog).not.toHaveBeenCalled();
        }
        expect(mocks.getLocalClientUrl).not.toHaveBeenCalled();
        expect(mocks.invoke).not.toHaveBeenCalled();
        expect(mocks.assign).not.toHaveBeenCalled();
        expect(mocks.store.setConnectionPreferenceForAsset).not.toHaveBeenCalled();
      }
    );

    it("does not download when connection approval is cancelled", async () => {
      mocks.createToken.mockResolvedValue(null);
      const { failed } = await download();
      expect(failed).toHaveBeenCalledOnce();
      expect(mocks.getRdpFile).not.toHaveBeenCalled();
      expect(link.click).not.toHaveBeenCalled();
    });

    it("reports a download failure without opening a client", async () => {
      mocks.getRdpFile.mockRejectedValue(new Error("RDP file unavailable"));
      const { failed } = await download();
      expect(failed).toHaveBeenCalledWith(expect.objectContaining({ message: "RDP file unavailable" }));
      expect(mocks.errorToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "ConnectError.DownloadRdpFailed" })
      );
      expect(link.click).not.toHaveBeenCalled();
      expect(mocks.getLocalClientUrl).not.toHaveBeenCalled();
    });

    it("does not write a file when the desktop save dialog is cancelled", async () => {
      vi.stubGlobal("isDesktopRuntime", () => true);
      mocks.saveDialog.mockResolvedValue(null);
      const { failed } = await download();
      expect(failed).not.toHaveBeenCalled();
      expect(mocks.writeFile).not.toHaveBeenCalled();
    });

    it.each([false, true])(
      "downloads RemoteApp RDP using the global client preference (desktop=%s)",
      async (desktop) => {
        vi.stubGlobal("isDesktopRuntime", () => desktop);
        const applet = { ...rdpMethod, value: "weblite", type: "applet", component: "tinker" };
        vi.stubGlobal("useConnectMethods", () => ({
          fetchConnectMethods: async () => ({ http: [applet] }),
          getMethodsForProtocol: async () => [applet]
        }));
        const { failed } = await download("weblite", "http");
        expect(failed).not.toHaveBeenCalled();
        expect(mocks.createToken).toHaveBeenCalledWith(
          expect.objectContaining({
            connect_method: "weblite",
            protocol: "http",
            connect_options: expect.objectContaining({ appletConnectMethod: "client" })
          }),
          expect.anything()
        );
        expect(mocks.getRdpFile).toHaveBeenCalledOnce();
        expect(mocks.getLocalClientUrl).not.toHaveBeenCalled();
        expect(mocks.invoke).not.toHaveBeenCalled();
        expect(desktop ? mocks.writeFile : link.click).toHaveBeenCalledOnce();
      }
    );

    it.each(["web", "razor-disabled", "unlicensed"])("rejects RemoteApp downloads for %s", async (condition) => {
      const applet = { ...rdpMethod, value: "weblite", type: "applet", component: "tinker" };
      vi.stubGlobal("useConnectMethods", () => ({
        fetchConnectMethods: async () => ({ http: [applet] }),
        getMethodsForProtocol: async () => [applet]
      }));
      mocks.getPublicSettings.mockResolvedValue({
        XPACK_LICENSE_IS_VALID: condition !== "unlicensed",
        TERMINAL_RAZOR_ENABLED: condition !== "razor-disabled"
      });
      const { failed } = await download("weblite", "http", condition === "web" ? "web" : "client");
      expect(failed).toHaveBeenCalledOnce();
      expect(mocks.createToken).not.toHaveBeenCalled();
      expect(mocks.getRdpFile).not.toHaveBeenCalled();
    });
  });

  it.each([
    [false, "web"],
    [true, "web"],
    [false, "client"],
    [true, "client"]
  ] as const)("opens RemoteApp in its selected mode (desktop=%s, mode=%s)", async (desktop, mode) => {
    vi.stubGlobal("isDesktopRuntime", () => desktop);
    const applet = { ...method, value: "weblite", type: "applet", component: "tinker" };
    vi.stubGlobal("useConnectMethods", () => ({
      fetchConnectMethods: async () => ({ http: [applet] }),
      getMethodsForProtocol: async () => [applet]
    }));
    vi.stubGlobal("window", {
      location: { protocol: "https:", origin: "https://jumpserver.example", assign: mocks.assign }
    });
    const endpoint = vi.fn().mockResolvedValue({ host: "jumpserver.example", https_port: 443 });
    vi.stubGlobal("getSmartEndpoint", endpoint);
    vi.stubGlobal("withWebSitePrefix", (path: string) => path);
    vi.stubGlobal("joinEndpointUrl", (base: string, path: string) => `${base}${path}`);
    const ready = vi.fn();
    const failed = vi.fn();
    await useAssetAction().handleAssetConnection("root", "asset", "http", [], undefined, {
      accountId: "account",
      connectMethod: "weblite",
      connectOptions: { appletConnectMethod: mode },
      onSessionReady: ready,
      onSessionError: failed
    });
    await vi.waitFor(() => expect(ready.mock.calls.length + failed.mock.calls.length).toBe(1));
    expect(failed).not.toHaveBeenCalled();
    expect(mocks.getLunaPreferences).not.toHaveBeenCalled();
    if (mode === "client") {
      expect(desktop ? mocks.invoke : mocks.assign).toHaveBeenCalledOnce();
      expect(endpoint).not.toHaveBeenCalled();
    } else {
      expect(ready.mock.calls[0]?.[0].webUrl).toContain("/lion/connect?token=id");
      expect(mocks.getLocalClientUrl).not.toHaveBeenCalled();
      expect(mocks.invoke).not.toHaveBeenCalled();
      expect(mocks.assign).not.toHaveBeenCalled();
    }
  });

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
