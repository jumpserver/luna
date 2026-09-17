import type { AssetItem } from "~/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("updates an existing K8s credential when the same username is saved again", () => {
    const state = useConnectionFormState();
    state.draft.value = {
      protocol: "k8s",
      account: "@INPUT",
      manualUsername: "kubernetes-admin",
      manualPassword: "new-token",
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
});
