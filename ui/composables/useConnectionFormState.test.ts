import type { AssetItem } from "~/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick } from "vue";
import { useConnectionFormState } from "./useConnectionFormState";

const store = {
  currentUser: { org: { id: "org" } },
  getConnectionPreferenceForAsset: vi.fn(),
  getConnectionPreferenceForProtocol: vi.fn()
};

vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => store }));

const asset: AssetItem = {
  id: "asset",
  name: "cluster",
  address: "https://cluster.example:6443",
  org_id: "org",
  platform: "Kubernetes",
  zone: "Default",
  isActive: true,
  category: "cloud",
  type: "k8s",
  permedProtocols: [{ name: "k8s", port: 6443, public: true }],
  permedAccounts: []
};

describe("personal credential connection form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    vi.stubGlobal("isDesktopRuntime", () => false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([false, true])("hides private protocols from selection and saved choices (desktop=%s)", (desktop) => {
    vi.stubGlobal("isDesktopRuntime", () => desktop);
    const scope = effectScope();
    const state = scope.run(() => useConnectionFormState())!;
    const target = {
      ...asset,
      permedProtocols: [
        { name: "winrm", port: 5986, public: false },
        { name: "rdp", port: 3389, public: true },
        { name: "ssh", port: 22, public: true }
      ]
    };
    try {
      state.initDraft(target, "winrm");
      expect(state.draft.value.protocol).toBe("ssh");
      expect(state.buildConnectionInfo(target).availableProtocols).toEqual(["ssh", "rdp"]);
      const privateOnly = { ...target, permedProtocols: [target.permedProtocols[0]!] };
      state.initDraft(privateOnly, "winrm");
      expect(state.draft.value.protocol).toBe("");
      expect(state.buildConnectionInfo(privateOnly).availableProtocols).toEqual([]);
    } finally {
      scope.stop();
    }
  });

  it.each(["ssh", "sftp"])("loads personal accounts while a hosted account is selected for %s", async (protocol) => {
    const credential = { id: "saved-key", username: "root", secret_type: "ssh_key", version: 3 };
    const load = vi.fn().mockResolvedValue([credential]);
    vi.stubGlobal("getPersonalAssetCredentials", load);
    const scope = effectScope();
    const state = scope.run(() => useConnectionFormState())!;
    try {
      state.initDraft({
        ...asset,
        permedProtocols: [{ name: protocol, port: 22, public: true }],
        permedAccounts: [
          { id: "root-account", alias: "root", name: "root", username: "root", has_secret: false }
        ] as AssetItem["permedAccounts"]
      });
      await vi.waitFor(() => expect(state.personalCredentialsLoaded.value).toBe(true));
      expect(state.draft.value.account).toBe("root");
      expect(load).toHaveBeenCalledWith("asset", protocol, "org");
      expect(state.personalCredentials.value).toEqual([credential]);
      const loadCount = load.mock.calls.length;
      state.draft.value.account = "@INPUT";
      await nextTick();
      expect(load).toHaveBeenCalledTimes(loadCount);

      load.mockResolvedValue([]);
      state.draft.value.personalCredentialId = "saved-key";
      state.draft.value.protocol = "rdp";
      await vi.waitFor(() => expect(load).toHaveBeenLastCalledWith("asset", "rdp", "org"));
      expect(state.personalCredentials.value).toEqual([]);
      expect(state.draft.value.personalCredentialId).toBe("");
    } finally {
      scope.stop();
    }
  });

  it("does not request personal credentials for an account with a managed secret", async () => {
    const load = vi.fn();
    vi.stubGlobal("getPersonalAssetCredentials", load);
    const scope = effectScope();
    const state = scope.run(() => useConnectionFormState())!;
    try {
      state.initDraft({
        ...asset,
        permedProtocols: [{ name: "ssh", port: 22, public: true }],
        permedAccounts: [
          { id: "root-account", alias: "root", name: "root", username: "root", has_secret: true }
        ] as AssetItem["permedAccounts"]
      });
      await nextTick();
      expect(state.personalCredentialsLoaded.value).toBe(true);
      expect(state.personalCredentials.value).toEqual([]);
      expect(load).not.toHaveBeenCalled();
    } finally {
      scope.stop();
    }
  });

  it("updates an existing K8s credential when the same username is saved again", () => {
    const state = useConnectionFormState();
    state.draft.value = {
      protocol: "k8s",
      account: "@INPUT",
      accountId: undefined,
      manualUsername: "kubernetes-admin",
      manualPassword: "new-token",
      hostedSecret: "",
      inputSecretType: "token",
      personalCredentialId: "",
      personalCredentialVersion: undefined,
      personalCredentialSecretType: "password",
      savePersonalCredential: true,
      dynamicPassword: "",
      rememberSecret: false,
      rememberSelection: false,
      connectMethod: "k8s_native",
      connectOptions: {}
    };
    state.personalCredentials.value = [
      {
        id: "credential",
        asset: { id: "asset", name: "cluster", address: "https://cluster.example:6443" },
        username: "kubernetes-admin",
        secret_type: { label: "Token", value: "token" },
        protocol: { label: "K8s", value: "k8s" },
        comment: "",
        is_active: true,
        version: 3,
        has_secret: true
      }
    ];

    expect(state.buildConnectionInfo(asset)).toMatchObject({
      personalCredentialId: "credential",
      personalCredentialVersion: 3,
      personalCredentialSecretType: "token",
      savePersonalCredential: true
    });
  });

  it.each(["ssh", "sftp"])("updates only the matching username and secret type for %s", (protocol) => {
    const state = useConnectionFormState();
    state.personalCredentials.value = [
      { id: "other-user", username: "admin", secret_type: "password", version: 1 },
      { id: "password", username: "root", secret_type: { value: "password" }, version: 2 },
      { id: "key", username: "root", secret_type: "ssh_key", version: 3 }
    ] as typeof state.personalCredentials.value;
    state.draft.value = {
      ...state.draft.value,
      protocol,
      account: "@INPUT",
      manualUsername: " root ",
      manualPassword: "replacement"
    };
    expect(state.buildConnectionInfo(asset).personalCredentialId).toBeUndefined();
    state.draft.value.savePersonalCredential = true;
    expect(state.buildConnectionInfo(asset)).toMatchObject({
      personalCredentialId: "password",
      personalCredentialVersion: 2,
      savePersonalCredential: true,
      manualPassword: "replacement"
    });
    state.draft.value.personalCredentialSecretType = "ssh_key";
    expect(state.buildConnectionInfo(asset)).toMatchObject({
      personalCredentialId: "key",
      personalCredentialVersion: 3,
      personalCredentialSecretType: "ssh_key"
    });
    state.draft.value.manualUsername = "new-user";
    const newCredential = state.buildConnectionInfo(asset);
    expect(newCredential.personalCredentialId).toBeUndefined();
    expect(newCredential.personalCredentialVersion).toBeUndefined();
    expect(newCredential.savePersonalCredential).toBe(true);
  });

  it.each(["ssh", "sftp"])("keeps an empty-secret hosted account ID and its credential for %s", (protocol) => {
    const state = useConnectionFormState();
    state.draft.value = {
      ...state.draft.value,
      protocol,
      account: "root",
      accountId: "account-2",
      hostedSecret: "private-key",
      inputSecretType: "ssh_key",
      savePersonalCredential: true
    };
    const sshAsset: AssetItem = {
      ...asset,
      permedProtocols: [{ name: protocol, port: 22, public: true }],
      permedAccounts: [
        {
          id: "account-1",
          alias: "root-1",
          name: "root",
          username: "root",
          has_secret: true,
          has_username: true,
          secret_type: "password",
          date_expired: "",
          actions: []
        },
        {
          id: "account-2",
          alias: "root-2",
          name: "root",
          username: "root",
          has_secret: false,
          has_username: true,
          secret_type: "password",
          date_expired: "",
          actions: []
        }
      ]
    };

    state.personalCredentials.value = [
      { id: "other-user", username: "admin", secret_type: "ssh_key", version: 1 },
      { id: "password", username: "root", secret_type: "password", version: 2 },
      { id: "root-key", username: "root", secret_type: "ssh_key", version: 3 }
    ] as typeof state.personalCredentials.value;
    expect(state.buildConnectionInfo(sshAsset)).toMatchObject({
      accountId: "account-2",
      hostedSecret: "private-key",
      inputSecretType: "ssh_key",
      personalCredentialId: "root-key",
      personalCredentialVersion: 3,
      savePersonalCredential: true
    });
    state.draft.value.savePersonalCredential = false;
    state.draft.value.personalCredentialId = "root-key";
    state.draft.value.personalCredentialVersion = 3;
    expect(state.buildConnectionInfo(sshAsset)).toMatchObject({
      accountId: "account-2",
      personalCredentialId: "root-key",
      savePersonalCredential: false
    });
    state.draft.value.accountId = "account-1";
    expect(state.buildConnectionInfo(sshAsset).personalCredentialId).toBeUndefined();
  });

  it.each([
    ["ssh", "@INPUT"],
    ["ssh", "@USER"],
    ["sftp", "@INPUT"],
    ["sftp", "@USER"]
  ])("preserves the SSH key type for %s/%s", (protocol, account) => {
    const state = useConnectionFormState();
    state.draft.value = {
      ...state.draft.value,
      protocol,
      account,
      manualUsername: "root",
      manualPassword: "private-key",
      dynamicPassword: "private-key",
      inputSecretType: "ssh_key",
      personalCredentialSecretType: "ssh_key",
      rememberSecret: true
    };

    expect(state.buildConnectionInfo(asset)).toMatchObject(
      account === "@INPUT"
        ? { accountMode: "manual", personalCredentialSecretType: "ssh_key", manualPassword: "private-key" }
        : { accountMode: "dynamic", inputSecretType: "ssh_key", dynamicPassword: "private-key", rememberSecret: false }
    );
    state.clearEnteredSecrets();
    expect(state.draft.value.manualPassword).toBe("");
    expect(state.draft.value.dynamicPassword).toBe("");
  });
});
