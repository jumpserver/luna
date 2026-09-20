import type { WorkspaceSessionTab } from "./useWorkspaceTabs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { resolveSessionComponent, resolveSessionSurface } from "~/shared/connectors/registry";
import { ApiRequestError } from "./useApiRequest";
import { useAssetAction } from "./useAssetAction";
import { useRdpResolutionPreference } from "./useRdpResolutionPreference";
import { useWebProxyManager } from "./useWebProxyManager";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  assign: vi.fn(),
  getLocalClientUrl: vi.fn(),
  getRdpFile: vi.fn(),
  getLunaPreferences: vi.fn(),
  updateLunaPreferences: vi.fn(),
  getPublicSettings: vi.fn(),
  setConnectionTokenReusable: vi.fn(),
  getAssetDetail: vi.fn(),
  saveDialog: vi.fn(),
  writeFile: vi.fn(),
  createToken: vi.fn(),
  createTicket: vi.fn(),
  errorToast: vi.fn(),
  appConfig: { value: undefined as unknown },
  rdpResolution: { value: undefined as string | undefined },
  store: {
    loggedIn: true,
    currentSite: "https://jumpserver.example",
    currentAccountId: "web-account",
    currentUser: { org: { id: "org" } },
    setConnectionPreferenceForAsset: vi.fn()
  },
  location: { protocol: "https:", origin: "https://jumpserver.example" }
}));

vi.mock("~/shared/desktop/bridge", () => ({
  desktopInvoke: mocks.invoke,
  desktopListen: vi.fn(),
  desktopDialog: { save: mocks.saveDialog },
  desktopFs: { writeFile: mocks.writeFile }
}));
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => mocks.store }));
vi.mock("~/composables/useApiRequest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/composables/useApiRequest")>()),
  getAssetDetailRequest: mocks.getAssetDetail,
  getConnectionRdpFile: mocks.getRdpFile,
  getLunaPreferences: mocks.getLunaPreferences,
  updateLunaPreferences: mocks.updateLunaPreferences,
  getPublicSettings: mocks.getPublicSettings,
  setConnectionTokenReusable: mocks.setConnectionTokenReusable,
  invalidatePersonalAssetCredentialCache: vi.fn()
}));
vi.mock("~/composables/useSettingManager", () => ({
  useSettingManager: () => ({
    setRdpResolutionPreference: (value: string) => {
      mocks.rdpResolution.value = value;
    },
    ...Object.fromEntries(
      [
        "appConfig",
        "charset",
        "rdpResolution",
        "backspaceAsCtrlH",
        "keyboardLayout",
        "rdpClientOption",
        "rdpColorQuality",
        "rdpSmartSize"
      ].map((key) => [
        key,
        key === "appConfig" ? mocks.appConfig : key === "rdpResolution" ? mocks.rdpResolution : { value: undefined }
      ])
    )
  })
}));
vi.mock("vue", async (original) => ({
  ...(await original<typeof import("vue")>()),
  onMounted: vi.fn(),
  onBeforeUnmount: vi.fn()
}));
vi.mock("~/utils/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/runtime")>();
  return {
    ...actual,
    pageLocation: () => ({
      assign: mocks.assign,
      protocol: mocks.location.protocol,
      origin: mocks.location.origin
    })
  };
});

function stubLocation(location: { protocol?: string; origin?: string } = {}) {
  mocks.location.protocol = location.protocol ?? "https:";
  mocks.location.origin = location.origin ?? "https://jumpserver.example";
}

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
    mocks.rdpResolution.value = undefined;
    vi.stubGlobal("isDesktopRuntime", () => false);
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    vi.stubGlobal("useToast", () => ({}));
    vi.stubGlobal("useErrorToast", () => ({ addErrorToast: mocks.errorToast }));
    vi.stubGlobal("useWorkspaceTabs", () => ({}));
    mocks.createTicket.mockResolvedValue({ ticket: "web-ticket" });
    vi.stubGlobal("useWorkspaceConnectors", () => ({ createKokoTicket: mocks.createTicket }));
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
    stubLocation();
    vi.stubGlobal("document", {
      createElement: () => ({ href: "", download: "", click: vi.fn() })
    });
    vi.stubGlobal("getLocalClientUrl", mocks.getLocalClientUrl);
    vi.stubGlobal("createConnectionTokenWithAcl", mocks.createToken);
    mocks.createToken.mockResolvedValue({ id: "id" });
    mocks.invoke.mockResolvedValue(undefined);
    mocks.getLocalClientUrl.mockResolvedValue({ url: `jms2://${encoded}` });
    mocks.getLunaPreferences.mockResolvedValue({ graphics: { applet_connection_method: "client" } });
    mocks.getPublicSettings.mockResolvedValue({ XPACK_LICENSE_IS_VALID: true, TERMINAL_RAZOR_ENABLED: true });
    mocks.setConnectionTokenReusable.mockResolvedValue({
      id: "id",
      date_expired: "2026-12-31T00:00:00Z",
      is_reusable: true
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function connect(
    connectMethod = "ssh_client",
    protocol = "ssh",
    connectOptions?: { resolution?: string; virtualappConnectMethod?: string; token_reusable?: boolean }
  ) {
    const ready = vi.fn();
    const failed = vi.fn();
    await useAssetAction().handleAssetConnection("root", "asset", protocol, [], undefined, {
      accountId: "account",
      connectMethod,
      connectOptions,
      onSessionReady: ready,
      onSessionError: failed
    });
    await vi.waitFor(() => expect(ready.mock.calls.length + failed.mock.calls.length).toBe(1));
    return { ready, failed };
  }

  it.each([
    [{ code: "perm_account_invalid" }, "ConnectError.AccountUnavailable"],
    [{ code: "personal_credential_version_conflict" }, "ConnectError.CredentialChanged"],
    [
      { input_username: ["A personal credential with these fields already exists"] },
      "A personal credential with these fields already exists"
    ],
    [{ input_secret: ["Required"] }, "ConnectError.SecretRequired"],
    [{ code: "unknown", detail: "Backend detail" }, "Backend detail"],
    [{}, "HTTP 400"]
  ])("maps connection token errors onto the session error callback", async (data, _description) => {
    mocks.createToken.mockRejectedValue(new ApiRequestError(400, data));

    const { failed } = await connect();

    expect(failed).toHaveBeenCalledWith(expect.any(ApiRequestError));
    expect(mocks.errorToast).not.toHaveBeenCalled();
  });

  it("saves K8s manual credentials as tokens", async () => {
    vi.stubGlobal("useConnectMethods", () => ({
      fetchConnectMethods: async () => ({ k8s: [method] }),
      getMethodsForProtocol: async () => [method]
    }));
    const ready = vi.fn();
    const failed = vi.fn();

    await useAssetAction().handleAssetConnection(
      "@INPUT",
      "asset",
      "k8s",
      [
        {
          alias: "@INPUT",
          date_expired: "",
          has_secret: false,
          has_username: false,
          id: "",
          name: "Manual input",
          secret_type: "password",
          username: "@INPUT",
          actions: []
        }
      ],
      undefined,
      {
        accountMode: "manual",
        manualUsername: "cluster-user",
        manualPassword: "service-account-token",
        personalCredentialSecretType: "password",
        savePersonalCredential: true,
        connectMethod: method.value,
        onSessionReady: ready,
        onSessionError: failed
      }
    );
    await vi.waitFor(() => expect(ready.mock.calls.length + failed.mock.calls.length).toBe(1));

    expect(failed).not.toHaveBeenCalled();
    expect(mocks.createToken).toHaveBeenCalledWith(
      expect.objectContaining({
        account: "@INPUT",
        protocol: "k8s",
        input_username: "cluster-user",
        input_secret: "service-account-token",
        input_secret_type: "token",
        save_personal_credential: true
      }),
      expect.anything()
    );
  });

  it("reuses Magnus db_client tokens before launching the local client", async () => {
    const dbMethod = { value: "db_client", type: "native", component: "magnus", disabled: false };
    vi.stubGlobal("useConnectMethods", () => ({
      fetchConnectMethods: async () => ({ mysql: [dbMethod] }),
      getMethodsForProtocol: async () => [dbMethod]
    }));

    const { failed } = await connect("db_client", "mysql", { token_reusable: true });

    expect(failed).not.toHaveBeenCalled();
    expect(mocks.setConnectionTokenReusable).toHaveBeenCalledWith("id", true);
    expect(mocks.setConnectionTokenReusable.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getLocalClientUrl.mock.invocationCallOrder[0]!
    );
    expect(mocks.getLocalClientUrl).toHaveBeenCalledWith("id", expect.any(Object));
  });

  it("does not mark Razor client tokens reusable from token_reusable", async () => {
    const rdpMethod = { ...method, value: "mstsc", component: "razor" };
    vi.stubGlobal("useConnectMethods", () => ({
      fetchConnectMethods: async () => ({ rdp: [rdpMethod] }),
      getMethodsForProtocol: async () => [rdpMethod]
    }));

    const { failed } = await connect("mstsc", "rdp", { token_reusable: false });

    expect(failed).not.toHaveBeenCalled();
    expect(mocks.setConnectionTokenReusable).not.toHaveBeenCalled();
  });

  it.each([false, true])("launches MariaDB with client-only compatibility on desktop=%s", async (desktop) => {
    vi.stubGlobal("isDesktopRuntime", () => desktop);
    const dbMethod = { value: "db_client", type: "native", component: "magnus", disabled: false };
    vi.stubGlobal("useConnectMethods", () => ({
      fetchConnectMethods: async () => ({ mariadb: [dbMethod] }),
      getMethodsForProtocol: async () => [dbMethod]
    }));
    const dbPayload = {
      ...payload,
      protocol: "mariadb",
      name: "测试数据库",
      endpoint: { host: "gateway.example.com", port: 5525 },
      asset: { info: { db_name: "app" } },
      token: { ...payload.token, protocol: "mariadb" }
    };
    const url = `jms2://${btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(dbPayload))))}`;
    mocks.getLocalClientUrl.mockResolvedValue({ url });
    mocks.createToken.mockResolvedValue(dbPayload.token);

    const { ready, failed } = await connect("db_client", "mariadb");

    expect(failed).not.toHaveBeenCalled();
    expect(mocks.createToken).toHaveBeenCalledWith(
      expect.objectContaining({ protocol: "mariadb", connect_method: "db_client" }),
      expect.anything()
    );
    expect(ready.mock.calls[0]?.[0].token.protocol).toBe("mariadb");
    const launchedUrl = desktop ? mocks.invoke.mock.calls[0]?.[1].url : mocks.assign.mock.calls[0]?.[0];
    const launchedPayload = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(atob(launchedUrl.slice(7)), (character) => character.charCodeAt(0)))
    );
    expect(launchedPayload).toEqual({
      ...dbPayload,
      // Desktop resolves the user's MariaDB application first, then normalizes the driver in the launcher.
      protocol: desktop ? "mariadb" : "mysql"
    });
  });

  it("preserves an applet's RDP launch protocol for a MariaDB asset", async () => {
    const applet = { value: "dbeaver", type: "applet", component: "razor", disabled: false };
    vi.stubGlobal("useConnectMethods", () => ({
      fetchConnectMethods: async () => ({ mariadb: [applet] }),
      getMethodsForProtocol: async () => [applet]
    }));
    const url = `jms2://${btoa(JSON.stringify({ ...payload, name: "database", protocol: "rdp" }))}`;
    mocks.getLocalClientUrl.mockResolvedValue({ url });

    const { failed } = await connect("dbeaver", "mariadb");

    expect(failed).not.toHaveBeenCalled();
    expect(mocks.assign).toHaveBeenCalledExactlyOnceWith(url);
  });

  describe("RDP file downloads", () => {
    const content = "full address:s:rdp.example\r\nusername:s:用户\r\n";
    const rdpMethod = { ...method, value: "mstsc", component: "razor" };
    const link = { href: "", download: "", click: vi.fn() };

    beforeEach(() => {
      vi.stubGlobal("useConnectMethods", () => ({
        fetchConnectMethods: async () => ({ rdp: [rdpMethod] }),
        getMethodsForProtocol: async () => [rdpMethod]
      }));
      vi.spyOn(document, "createElement").mockReturnValue(link as unknown as HTMLElement);
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:rdp-file");
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
      mocks.getRdpFile.mockResolvedValue(content);
      mocks.saveDialog.mockResolvedValue("/tmp/windows.rdp");
      mocks.writeFile.mockResolvedValue(undefined);
    });

    async function download(
      connectMethod = "mstsc",
      protocol = "rdp",
      appletConnectMethod?: string,
      resolution: string | null = "1600x900"
    ) {
      const ready = vi.fn();
      const failed = vi.fn();
      await useAssetAction().handleAssetConnection("Administrator", "asset", protocol, [], undefined, {
        accountId: "account",
        connectMethod,
        downloadRdp: true,
        orgId: "asset-org",
        connectOptions: {
          appletConnectMethod,
          ...(resolution ? { resolution } : {}),
          rdp_client_option: ["full_screen", "drives_redirect"],
          remote_microphone: true,
          reusable: true,
          rdp_connection_speed: "low_speed_broadband"
        },
        onSessionReady: ready,
        onSessionError: failed
      });
      await vi.waitFor(() => expect(ready.mock.calls.length + failed.mock.calls.length).toBe(1));
      return { ready, failed };
    }

    it.each([
      [undefined, undefined, "1600x900", "1920x1080", "1600x900"],
      ["auto", "1920x1080", "1600x900", "1366x768", "auto"],
      ["1920x1080", "1024x768", "1600x900", "1366x768", "1920x1080"],
      [undefined, "auto", "1600x900", "1366x768", "auto"],
      [undefined, "1024x768", "1600x900", "1366x768", "1024x768"],
      [undefined, undefined, "auto", "1600x900", "auto"],
      [undefined, undefined, undefined, "1366x768", "1366x768"],
      [undefined, undefined, undefined, undefined, "auto"]
    ])(
      "resolves RDP resolution from selection=%s, saved=%s, server=%s, local=%s",
      async (selected, saved, server, local, expected) => {
        mocks.rdpResolution.value = local;
        mocks.getLunaPreferences.mockResolvedValue({ graphics: { rdp_resolution: server } });
        vi.stubGlobal("storeToRefs", () => ({
          currentSite: ref(mocks.store.currentSite),
          currentConnectionInfoMap: ref({ asset: { protocol: "rdp", connectOptions: { resolution: saved } } }),
          currentRdpClientOption: ref({}),
          orgId: ref("org")
        }));
        const { failed } = await download("mstsc", "rdp", undefined, selected ?? null);
        expect(failed).not.toHaveBeenCalled();
        expect(mocks.createToken.mock.calls[0]![0].connect_options.resolution).toBe(expected);
        expect(mocks.getLunaPreferences).toHaveBeenCalledTimes(selected || saved ? 0 : 1);
        const query = mocks.getRdpFile.mock.calls[0]![1];
        if (expected === "auto") {
          expect(query).not.toHaveProperty("width");
          expect(query).not.toHaveProperty("height");
        } else {
          const [width, height] = expected!.split("x");
          expect(query).toMatchObject({ width, height });
        }
      }
    );

    it("falls back to local resolution when the preference request fails", async () => {
      mocks.rdpResolution.value = "1366x768";
      mocks.getLunaPreferences.mockRejectedValue(new Error("Preference unavailable"));
      const { failed } = await download("mstsc", "rdp", undefined, null);
      expect(failed).not.toHaveBeenCalled();
      expect(mocks.createToken.mock.calls[0]![0].connect_options.resolution).toBe("1366x768");
    });

    it.each(["1024x768", "auto"] as const)(
      "uses %s saved on the settings page for the next RDP connection",
      async (value) => {
        let graphics = { rdp_resolution: "1600x900" };
        mocks.getLunaPreferences.mockImplementation(async () => ({ graphics }));
        mocks.updateLunaPreferences.mockImplementation(async (body) => {
          graphics = body.graphics;
        });
        const scope = effectScope();
        try {
          const preference = scope.run(() => useRdpResolutionPreference())!;
          await vi.waitFor(() => expect(preference.busy.value).toBe(false));
          preference.resolution.value = value;
          await vi.waitFor(() => expect(preference.busy.value).toBe(false));
          const { failed } = await connect("mstsc", "rdp");
          expect(failed).not.toHaveBeenCalled();
          expect(mocks.createToken.mock.calls[0]![0].connect_options.resolution).toBe(value);
          expect(mocks.createToken.mock.calls[0]![0].connect_options).not.toHaveProperty("rdp_resolution");
        } finally {
          scope.stop();
        }
      }
    );

    it.each([false, true])(
      "uses server resolution when launching an RDP client directly (desktop=%s)",
      async (desktop) => {
        vi.stubGlobal("isDesktopRuntime", () => desktop);
        mocks.rdpResolution.value = "auto";
        mocks.getLunaPreferences.mockResolvedValue({ graphics: { rdp_resolution: "1600x900" } });
        const { failed } = await connect("mstsc", "rdp");
        expect(failed).not.toHaveBeenCalled();
        expect(mocks.createToken.mock.calls[0]![0].connect_options.resolution).toBe("1600x900");
        expect(mocks.getLocalClientUrl).toHaveBeenCalledWith(
          "id",
          expect.objectContaining({ width: "1600", height: "900" })
        );
      }
    );

    it.each([false, true])(
      "downloads the authorized RDP file without launching a client (desktop=%s)",
      async (desktop) => {
        vi.stubGlobal("isDesktopRuntime", () => desktop);
        const { failed } = await download();
        expect(failed).not.toHaveBeenCalled();
        expect(mocks.createToken).toHaveBeenCalledWith(
          expect.objectContaining({
            asset: "asset",
            account: "account",
            protocol: "rdp",
            connect_method: "mstsc",
            connect_options: expect.objectContaining({
              resolution: "1600x900",
              remote_microphone: true,
              reusable: true,
              rdp_connection_speed: "low_speed_broadband"
            })
          }),
          expect.objectContaining({ orgId: "asset-org" })
        );
        expect(mocks.createToken.mock.calls[0]![0].connect_options).not.toHaveProperty("rdp_resolution");
        expect(mocks.getRdpFile).toHaveBeenCalledWith(
          "id",
          expect.objectContaining({
            width: "1600",
            height: "900",
            full_screen: "1",
            drives_redirect: "1",
            remote_microphone: "1",
            reusable: "1"
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

  it.each(["web_cli_native", "web_rdp_native", "web_db_native"])(
    "uses the development gateway's default endpoint for %s",
    async (connectMethod) => {
      const protocol = connectMethod === "web_rdp_native" ? "rdp" : "ssh";
      vi.stubGlobal("isDesktopRuntime", () => true);
      vi.stubGlobal("isElectronRuntime", () => true);
      stubLocation({ protocol: "http:", origin: "http://127.0.0.1:3000" });
      vi.stubGlobal("storeToRefs", () => ({
        currentSite: ref("http://127.0.0.1:3000"),
        currentConnectionInfoMap: ref({}),
        currentRdpClientOption: ref({}),
        orgId: ref("org")
      }));
      const methods = [{ value: connectMethod, type: "web", disabled: false }];
      vi.stubGlobal("useConnectMethods", () => ({
        fetchConnectMethods: async () => ({ [protocol]: methods }),
        getMethodsForProtocol: async () => methods
      }));
      vi.stubGlobal("getSmartEndpoint", vi.fn().mockResolvedValue({ host: "127.0.0.1", http_port: 0, https_port: 0 }));
      mocks.invoke.mockImplementation(async (_command, args) => args.endpointUrl);
      mocks.getLunaPreferences.mockResolvedValue({ graphics: { rdp_resolution: "1600x900" } });

      const { ready, failed } = await connect(connectMethod, protocol);
      expect(failed).not.toHaveBeenCalled();
      if (protocol === "rdp") {
        expect(mocks.createToken.mock.calls[0]![0].connect_options.resolution).toBe("1600x900");
      }
      expect(ready.mock.calls[0]?.[0].endpointUrl).toBe("http://127.0.0.1:3000");
      expect(mocks.invoke).toHaveBeenCalledWith(
        connectMethod === "web_db_native" ? "resolve_chen_endpoint" : "resolve_koko_endpoint",
        { endpointUrl: "http://127.0.0.1:3000" }
      );
    }
  );

  it.each([
    [15001, true],
    [undefined, false],
    [15001, undefined]
  ])("uses the Web Proxy endpoint port %s with license %s", async (port, license) => {
    mocks.createToken.mockResolvedValue({ id: "id", value: "token-value", org_id: "asset-org" });
    mocks.getPublicSettings.mockResolvedValue({ XPACK_LICENSE_IS_VALID: license });
    vi.stubGlobal("isDesktopRuntime", () => true);
    vi.stubGlobal("isElectronRuntime", () => true);
    stubLocation({ protocol: "http:", origin: "http://127.0.0.1:3000" });
    vi.stubGlobal("useWebProxyManager", useWebProxyManager);
    const methods = [{ value: "web_proxy_native", type: "web", component: "koko", disabled: false }];
    vi.stubGlobal("useConnectMethods", () => ({
      fetchConnectMethods: async () => ({ https: methods }),
      getMethodsForProtocol: async () => methods
    }));
    const endpoint = vi.fn().mockResolvedValue({ host: "proxy.example", web_proxy_port: port, https_port: 443 });
    vi.stubGlobal("getSmartEndpoint", endpoint);
    mocks.getAssetDetail.mockResolvedValue({ permed_protocols: [{ name: "https", port: 443 }] });
    const ready = vi.fn();
    const failed = vi.fn();
    await useAssetAction().handleAssetConnection("root", "asset", "https", [], undefined, {
      accountId: "account",
      connectMethod: "web_proxy_native",
      asset: {
        id: "asset",
        name: "Website",
        address: "https://website.example",
        platform: "Website",
        zone: "",
        isActive: true,
        category: "web",
        type: "website"
      },
      onSessionReady: ready,
      onSessionError: failed
    });
    await vi.waitFor(() => expect(ready.mock.calls.length + failed.mock.calls.length).toBe(1));
    expect(failed).not.toHaveBeenCalled();
    expect(mocks.createTicket).toHaveBeenCalledWith({
      baseUrl: "https://proxy.example",
      tokenId: "id",
      orgId: "asset-org"
    });
    expect(ready.mock.calls[0]?.[0].webProxy.ticket).toBe("web-ticket");
    expect(ready.mock.calls[0]?.[0].webProxy.ticketEndpoint).toBe(mocks.createTicket.mock.calls[0]?.[0].baseUrl);
    expect(ready.mock.calls[0]?.[0].webProxy.recordingEnabled).toBe(license === true);
    expect(ready.mock.calls[0]?.[0].webProxy.recordingSupported).toBe(license === true);
    expect(ready.mock.calls[0]?.[0].webProxy.proxyUrl).toBe(`http://proxy.example:${port || 5001}`);
    expect(endpoint).toHaveBeenNthCalledWith(1, { protocol: "web_proxy", assetId: "asset", token: "id" }, undefined);
    expect(endpoint).toHaveBeenCalledTimes(port === undefined ? 2 : 1);
    expect(mocks.invoke).not.toHaveBeenCalled();
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
    stubLocation();
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
      expect(ready.mock.calls[0]?.[0].webUrl).toContain("/luna/lion/connect?token=id");
      const tab = { protocol: "http", payload: ready.mock.calls[0]![0] } as WorkspaceSessionTab;
      expect(resolveSessionComponent(tab)).toBe("lion");
      expect(resolveSessionSurface(tab)).toBe(
        resolveSessionSurface({ protocol: "rdp", connectMethod: "web_rdp_native" } as WorkspaceSessionTab)
      );
      expect(mocks.getLocalClientUrl).not.toHaveBeenCalled();
      expect(mocks.invoke).not.toHaveBeenCalled();
      expect(mocks.assign).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["https://jumpserver.example", ""],
    ["https://connector.example:9443", ""],
    ["https://jumpserver.example", "/site/test"]
  ])("opens virtual apps through Lion at %s%s", async (endpointUrl, prefix) => {
    const virtualApp = { value: "pgadmin", type: "virtual_app", component: "panda", disabled: false };
    vi.stubGlobal("useConnectMethods", () => ({
      fetchConnectMethods: async () => ({ postgresql: [virtualApp] }),
      getMethodsForProtocol: async () => [virtualApp]
    }));
    vi.stubGlobal("getSmartEndpoint", vi.fn().mockResolvedValue({ value: endpointUrl }));
    vi.stubGlobal("withWebSitePrefix", (path: string) => `${prefix}${path}`);

    const { ready, failed } = await connect("pgadmin", "postgresql");
    expect(failed).not.toHaveBeenCalled();
    const payload = ready.mock.calls[0]![0];
    expect(payload.webUrl).toBe(`${endpointUrl}${prefix}/luna/lion/connect?token=id`);
    expect(resolveSessionComponent({ protocol: "postgresql", payload } as WorkspaceSessionTab)).toBe("lion");
    expect(mocks.createToken).toHaveBeenCalledWith(
      expect.objectContaining({ protocol: "postgresql", connect_method: "pgadmin" }),
      expect.anything()
    );
  });

  it.each(["web", "client"] as const)("opens desktop virtual apps in the selected mode (%s)", async (mode) => {
    vi.stubGlobal("isDesktopRuntime", () => true);
    const virtualApp = { value: "pgadmin", type: "virtual_app", component: "panda", disabled: false };
    vi.stubGlobal("useConnectMethods", () => ({
      fetchConnectMethods: async () => ({ postgresql: [virtualApp] }),
      getMethodsForProtocol: async () => [virtualApp]
    }));
    const endpoint = vi.fn().mockResolvedValue({ value: "https://connector.example" });
    vi.stubGlobal("getSmartEndpoint", endpoint);
    vi.stubGlobal("withWebSitePrefix", (path: string) => path);
    const { ready, failed } = await connect("pgadmin", "postgresql", { virtualappConnectMethod: mode });

    expect(failed).not.toHaveBeenCalled();
    if (mode === "client") {
      expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("pull_up", { url: `jms2://${encoded}` });
      expect(endpoint).not.toHaveBeenCalled();
    } else {
      expect(ready.mock.calls[0]?.[0].webUrl).toBe("https://connector.example/luna/lion/connect?token=id");
      expect(mocks.invoke).not.toHaveBeenCalled();
      expect(mocks.getLocalClientUrl).not.toHaveBeenCalled();
    }
  });

  it.each(["jms2"])(
    "web launches the current client from a %s server URL without modifying the payload",
    async (scheme) => {
      mocks.getLocalClientUrl.mockResolvedValue({ url: `${scheme}://${encoded}` });
      const { failed } = await connect();
      expect(failed).not.toHaveBeenCalled();
      expect(mocks.assign).toHaveBeenCalledExactlyOnceWith(`jms2://${encoded}`);
      expect(mocks.invoke).not.toHaveBeenCalled();
    }
  );

  it("rejects legacy client URLs", async () => {
    mocks.getLocalClientUrl.mockResolvedValue({ url: `jms://${encoded}` });
    const { failed } = await connect();
    expect(failed).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: "Invalid local client URL" }));
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

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
    expect(mocks.errorToast).not.toHaveBeenCalled();
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it.each([true, false])("resolves the Lion endpoint through Koko only on desktop=%s", async (desktop) => {
    vi.stubGlobal("isDesktopRuntime", () => desktop);
    vi.stubGlobal("isElectronRuntime", () => desktop);
    stubLocation();
    const methods = [{ value: "web_rdp_native", type: "web", component: "lion", disabled: false }];
    vi.stubGlobal("useConnectMethods", () => ({
      fetchConnectMethods: async () => ({ rdp: methods }),
      getMethodsForProtocol: async () => methods
    }));
    vi.stubGlobal("getSmartEndpoint", vi.fn().mockResolvedValue({ host: "jumpserver.example", https_port: 443 }));
    mocks.invoke.mockResolvedValue("https://koko.example");

    const { ready, failed } = await connect("web_rdp_native", "rdp");
    expect(failed).not.toHaveBeenCalled();
    if (desktop) {
      expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("resolve_koko_endpoint", {
        endpointUrl: "https://jumpserver.example"
      });
      expect(ready.mock.calls[0]?.[0].endpointUrl).toBe("https://koko.example");
    } else {
      expect(mocks.invoke).not.toHaveBeenCalled();
      expect(ready.mock.calls[0]?.[0].endpointUrl).toBe("https://jumpserver.example");
    }
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
      stubLocation({ protocol: pageProtocol, origin: `${pageProtocol}//127.0.0.1:3000` });
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
