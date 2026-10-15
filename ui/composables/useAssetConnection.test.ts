import type { AssetItem } from "~/types";
import type { ConnectionFormInfo } from "./useAssetConnection";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useAssetConnection } from "./useAssetConnection";

const store = {
  setConnectionInfoForAsset: vi.fn(),
  setConnectionPreferenceForAsset: vi.fn(),
  setConnectionPreferenceForProtocol: vi.fn(),
  deleteConnectionInfoForAsset: vi.fn()
};
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => store }));

const account = {
  id: "account",
  alias: "account",
  name: "root",
  username: "root",
  has_secret: false,
  has_username: true,
  secret_type: "password",
  actions: [],
  date_expired: ""
};
const asset = {
  id: "asset",
  name: "host",
  address: "192.0.2.1",
  platform: "Linux",
  zone: "Default",
  isActive: true,
  category: "host",
  type: "linux",
  permedAccounts: [account],
  permedProtocols: [{ name: "ssh", port: 22, public: true }]
} as AssetItem;
const info: ConnectionFormInfo = {
  protocol: "ssh",
  account: "root",
  accountId: "account",
  accountMode: "hosted",
  manualUsername: "",
  manualPassword: "",
  dynamicPassword: "",
  rememberSecret: false,
  connectMethod: "",
  personalCredentialId: "credential",
  personalCredentialVersion: 3,
  personalCredentialSecretType: "ssh_key",
  preserveStoredSelection: true
};

describe("hosted personal credential connections", () => {
  const connect = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    vi.stubGlobal("isDesktopRuntime", () => false);
    vi.stubGlobal("useAssetAction", () => ({ handleAssetConnection: connect }));
    vi.stubGlobal("useConnectMethods", () => ({ getMethodsForProtocol: async () => [] }));
    vi.stubGlobal("useSettingManager", () => ({ appConfig: ref({}) }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([false, true])("does not restore hidden protocols from cached choices (desktop=%s)", async (desktop) => {
    vi.stubGlobal("isDesktopRuntime", () => desktop);
    await expect(
      useAssetConnection().confirmConnection(
        { ...asset, permedProtocols: [{ name: "winrm", port: 5986, public: false }] },
        { ...info, protocol: "winrm", availableProtocols: ["winrm"] }
      )
    ).rejects.toThrow("ConnectError.ProtocolUnavailable");
    expect(connect).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "selects a visible protocol instead of a hidden saved choice (desktop=%s)",
    async (desktop) => {
      vi.stubGlobal("isDesktopRuntime", () => desktop);
      await useAssetConnection().confirmConnection(
        {
          ...asset,
          permedAccounts: [{ ...account, has_secret: true }],
          permedProtocols: [
            { name: "winrm", port: 5986, public: false },
            { name: "ssh", port: 22, public: true }
          ]
        },
        { ...info, protocol: "winrm" }
      );
      expect(connect.mock.calls[0]?.[2]).toBe("ssh");
    }
  );

  it.each(["ssh", "sftp"])("preserves a saved credential after %s form normalization", async (protocol) => {
    await useAssetConnection().confirmConnection(
      {
        ...asset,
        permedProtocols: [{ name: protocol, port: 22, public: true }]
      },
      { ...info, protocol }
    );
    expect(connect).toHaveBeenCalledWith(
      "root",
      "asset",
      protocol,
      asset.permedAccounts,
      undefined,
      expect.objectContaining({
        accountMode: "hosted",
        accountId: "account",
        personalCredentialId: "credential",
        personalCredentialVersion: 3
      })
    );
  });

  it("requires a replacement secret when updating a saved credential", async () => {
    await expect(
      useAssetConnection().confirmConnection(asset, { ...info, savePersonalCredential: true })
    ).rejects.toThrow("ConnectError.SecretRequired");
    expect(connect).not.toHaveBeenCalled();
  });

  it("does not transfer a credential to a fallback account", async () => {
    await expect(
      useAssetConnection().confirmConnection(
        {
          ...asset,
          permedAccounts: [{ ...account, id: "different-account", name: "other" }]
        },
        info
      )
    ).rejects.toThrow("ConnectError.SecretRequired");
    expect(connect).not.toHaveBeenCalled();
  });

  it("removes personal credential selection when the account gains a managed secret", async () => {
    await useAssetConnection().confirmConnection(
      { ...asset, permedAccounts: [{ ...account, has_secret: true }] },
      info
    );
    expect(connect.mock.calls[0]![5].personalCredentialId).toBeUndefined();
  });

  it("remembers a hosted credential without storing its secret", () => {
    useAssetConnection().saveConnectionInfo(asset, { ...info, hostedSecret: "replacement-private-key" });
    const saved = store.setConnectionInfoForAsset.mock.calls[0]![1];
    expect(saved).toMatchObject({ accountId: "account", accountMode: "hosted", personalCredentialId: "credential" });
    expect(saved).not.toHaveProperty("hostedSecret");
    expect(saved).not.toHaveProperty("manualPassword");
  });
});
