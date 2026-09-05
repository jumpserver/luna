import type { ConnectionFormInfo } from "~/composables/useAssetConnection";
import type {
  AssetItem,
  ConnectionInfo,
  ConnectionPreferenceInfo,
  PermedAccount,
  PermedProtocol,
  PersonalAssetCredential
} from "~/types";

import { useUserInfoStore } from "~/store/modules/userInfo";
import { sortPermedProtocols, sortProtocolNames } from "~/utils";

export interface ConnectionFormDraft {
  protocol: string;
  account: string;
  manualUsername: string;
  manualPassword: string;
  personalCredentialId: string;
  personalCredentialVersion?: number;
  personalCredentialSecretType: string;
  savePersonalCredential: boolean;
  dynamicPassword: string;
  rememberSecret: boolean;
  rememberSelection: boolean;
  connectMethod: string;
  connectOptions: Record<string, any>;
}

export function useConnectionFormState() {
  const { t } = useI18n();
  const userInfoStore = useUserInfoStore();
  const draft = ref<ConnectionFormDraft>({
    protocol: "",
    account: "",
    manualUsername: "",
    manualPassword: "",
    personalCredentialId: "",
    personalCredentialVersion: undefined,
    personalCredentialSecretType: "password",
    savePersonalCredential: false,
    dynamicPassword: "",
    rememberSecret: false,
    rememberSelection: false,
    connectMethod: "",
    connectOptions: {}
  });
  const personalCredentials = ref<PersonalAssetCredential[]>([]);
  const personalCredentialsLoading = ref(false);
  const personalCredentialsLoaded = ref(false);
  const personalCredentialsLoadFailed = ref(false);
  const activeAsset = shallowRef<AssetItem | null>(null);
  let personalCredentialLoadSequence = 0;
  let personalCredentialScope = "";

  const preferredConnectMethod = computed(
    () => userInfoStore.getConnectionPreferenceForProtocol(draft.value.protocol)?.connectMethod || ""
  );

  const getVisibleProtocols = (protocols: PermedProtocol[]) =>
    isDesktopRuntime() ? protocols : protocols.filter((protocol) => protocol?.public !== false);
  const getManualInputLabel = () => t("Account.ManualInput");
  const getAnonymousLabel = () => t("Account.Anonymous");
  const isManualInputAccount = (account: string) =>
    account === "@INPUT" || account === getManualInputLabel() || account === "手动输入" || account === "Manual input";
  const getPersonalCredentialScope = (asset: AssetItem, protocol: string) =>
    [asset.org_id || userInfoStore.currentUser?.org?.id || "", asset.id, protocol.trim().toLowerCase()].join(":");
  const resetPersonalCredentialSelection = () => {
    draft.value.personalCredentialId = "";
    draft.value.personalCredentialVersion = undefined;
    draft.value.personalCredentialSecretType = "password";
    draft.value.savePersonalCredential = false;
  };
  const getDynamicAccountLabel = (account?: PermedAccount) => {
    if (!account) return "";
    const base = t("Account.DynamicUser");
    return account.username ? `${base}(${account.username})` : base;
  };
  const resolvePreferredProtocol = (
    source: ConnectionPreferenceInfo | ConnectionInfo | undefined,
    protocols: PermedProtocol[],
    explicit = ""
  ) => {
    const available = sortPermedProtocols(protocols).map((item) => item.name);
    const match = (candidate: string) =>
      available.find((protocol) => protocol.toLowerCase() === candidate.trim().toLowerCase());
    return match(explicit) || match(source?.protocol || "") || available[0] || "";
  };

  const resolvePreferredAccount = (
    source: ConnectionPreferenceInfo | ConnectionInfo | undefined,
    accounts: PermedAccount[]
  ) => {
    const mode = source?.accountMode || "hosted";
    const username = (source?.username || "").trim();
    if (mode === "manual" && accounts.some((account) => account.alias === "@INPUT")) return getManualInputLabel();
    if (mode === "dynamic") {
      const dynamic = accounts.find((account) => account.alias === "@USER");
      if (dynamic) return getDynamicAccountLabel(dynamic);
    }
    if (mode === "anonymous" && accounts.some((account) => account.alias === "@ANON")) return "@ANON";
    if (mode === "hosted" && username) {
      const hosted = accounts.find(
        (account) =>
          (source?.accountId && account.id === source.accountId) ||
          account.name === username ||
          account.username === username ||
          account.alias === username
      );
      if (hosted) return hosted.name;
    }

    const hosted = accounts.find((account) => !account.alias?.startsWith("@"));
    if (hosted) return hosted.name;
    const dynamic = accounts.find((account) => account.alias === "@USER");
    if (dynamic) return getDynamicAccountLabel(dynamic);
    if (accounts.some((account) => account.alias === "@INPUT")) return getManualInputLabel();
    if (accounts.some((account) => account.alias === "@ANON")) return "@ANON";
    return "";
  };

  const loadPersonalCredentials = async (asset: AssetItem, protocol: string) => {
    const sequence = ++personalCredentialLoadSequence;
    const nextScope = getPersonalCredentialScope(asset, protocol);
    if (personalCredentialScope !== nextScope) {
      personalCredentials.value = [];
      personalCredentialsLoaded.value = false;
      personalCredentialsLoadFailed.value = false;
      resetPersonalCredentialSelection();
    }
    personalCredentialScope = nextScope;
    const supportsManualInput = (asset.permedAccounts || []).some((account) => account.alias === "@INPUT");
    if (!supportsManualInput || !protocol) {
      personalCredentials.value = [];
      personalCredentialsLoading.value = false;
      personalCredentialsLoaded.value = true;
      personalCredentialsLoadFailed.value = false;
      resetPersonalCredentialSelection();
      return;
    }

    const needsPersonalCredentials = isManualInputAccount(draft.value.account) || !!draft.value.personalCredentialId;
    if (!needsPersonalCredentials) {
      personalCredentialsLoading.value = false;
      personalCredentialsLoadFailed.value = false;
      return;
    }

    personalCredentialsLoading.value = true;
    personalCredentialsLoaded.value = false;
    personalCredentialsLoadFailed.value = false;
    try {
      const credentials = await getPersonalAssetCredentials(asset.id, protocol, asset.org_id);
      if (sequence !== personalCredentialLoadSequence) return;
      personalCredentials.value = credentials;
    } catch {
      if (sequence !== personalCredentialLoadSequence) return;
      personalCredentials.value = [];
      personalCredentialsLoadFailed.value = true;
    } finally {
      if (sequence === personalCredentialLoadSequence) {
        personalCredentialsLoading.value = false;
        personalCredentialsLoaded.value = true;
      }
    }
  };

  const initDraft = (asset: AssetItem, explicitProtocol = "") => {
    activeAsset.value = asset;
    const saved = asset.savedConnection;
    const preferred = userInfoStore.getConnectionPreferenceForAsset(asset.id) || undefined;
    const source = { ...(saved || {}), ...(preferred || {}) } as ConnectionPreferenceInfo | ConnectionInfo;
    const protocols = getVisibleProtocols(asset.permedProtocols || []);
    const accounts = asset.permedAccounts || [];
    const protocol = resolvePreferredProtocol(source, protocols, explicitProtocol);
    const savedCredentialMatchesProtocol =
      !!saved?.personalCredentialId && saved.protocol?.toLowerCase() === protocol.toLowerCase();
    const nextPersonalCredentialScope = getPersonalCredentialScope(asset, protocol);
    if (personalCredentialScope !== nextPersonalCredentialScope) {
      personalCredentialLoadSequence += 1;
      personalCredentials.value = [];
      personalCredentialsLoading.value = false;
      personalCredentialsLoaded.value = false;
      personalCredentialsLoadFailed.value = false;
    }
    personalCredentialScope = nextPersonalCredentialScope;

    draft.value = {
      protocol,
      account: resolvePreferredAccount(source, accounts),
      manualUsername: source.manualUsername || "",
      manualPassword: "",
      personalCredentialId: savedCredentialMatchesProtocol ? saved?.personalCredentialId || "" : "",
      personalCredentialVersion: savedCredentialMatchesProtocol ? saved?.personalCredentialVersion : undefined,
      personalCredentialSecretType:
        savedCredentialMatchesProtocol && saved?.personalCredentialSecretType
          ? saved.personalCredentialSecretType
          : "password",
      savePersonalCredential: false,
      dynamicPassword: saved?.dynamicPassword || "",
      rememberSecret: source.accountMode === "manual" ? false : !!saved?.rememberSecret,
      rememberSelection: !!saved,
      connectMethod: "",
      connectOptions: {}
    };
    const methodMatches = source.protocol?.toLowerCase() === draft.value.protocol.toLowerCase();
    draft.value.connectMethod = methodMatches ? source.connectMethod || "" : "";
    draft.value.connectOptions = methodMatches ? { ...(source.connectOptions || {}) } : {};
    void loadPersonalCredentials(asset, draft.value.protocol);
  };

  const buildConnectionInfo = (asset: AssetItem): ConnectionFormInfo => {
    let accountMode: ConnectionFormInfo["accountMode"] = "hosted";
    let account = draft.value.account || "";
    let accountId: string | undefined;
    if (account === "@INPUT" || account === getManualInputLabel()) accountMode = "manual";
    if (account.includes("@ANON") || account === getAnonymousLabel()) {
      accountMode = "anonymous";
      account = "@ANON";
    }
    if (account === "@USER" || account.startsWith(t("Account.DynamicUser"))) {
      accountMode = "dynamic";
      const dynamic = asset.permedAccounts?.find((item) => item.alias === "@USER");
      account = dynamic?.name || account.replace(/\(.+\)/, "");
    }
    if (accountMode === "hosted") {
      accountId = asset.permedAccounts?.find(
        (item) => item.name === account || item.username === account || item.alias === account
      )?.id;
    }
    const canUsePersonalCredential = accountMode === "manual";

    const availableProtocols = sortProtocolNames(
      getVisibleProtocols(asset.permedProtocols || [])
        .map((protocol) => protocol.name?.trim())
        .filter((protocol): protocol is string => !!protocol)
    );
    return {
      protocol: draft.value.protocol,
      account,
      accountId,
      accountMode,
      manualUsername: draft.value.manualUsername,
      manualPassword: draft.value.manualPassword,
      personalCredentialId: canUsePersonalCredential ? draft.value.personalCredentialId || undefined : undefined,
      personalCredentialVersion: canUsePersonalCredential ? draft.value.personalCredentialVersion : undefined,
      personalCredentialSecretType: draft.value.personalCredentialSecretType || "password",
      savePersonalCredential: canUsePersonalCredential && draft.value.savePersonalCredential,
      dynamicPassword: draft.value.dynamicPassword,
      rememberSecret: draft.value.rememberSecret,
      rememberSelection: draft.value.rememberSelection,
      connectMethod: draft.value.connectMethod,
      connectOptions: { ...draft.value.connectOptions },
      availableProtocols
    };
  };

  watch(
    [
      () => activeAsset.value?.id,
      () => draft.value.protocol,
      () => draft.value.account,
      () => userInfoStore.currentUser?.org?.id
    ],
    ([, protocol]) => {
      if (activeAsset.value) void loadPersonalCredentials(activeAsset.value, String(protocol || ""));
    }
  );

  const loadAssetDetails = async (asset: AssetItem) => {
    const hasDetails = asset.permedAccounts?.length && asset.permedProtocols?.length;
    if (hasDetails) return asset;
    const detail = await getAssetDetailRequest(asset.id, asset.org_id || userInfoStore.currentUser?.org?.id || "");
    return {
      ...asset,
      permedAccounts: detail.permed_accounts ?? asset.permedAccounts ?? [],
      permedProtocols: (detail.permed_protocols ?? asset.permedProtocols ?? []).filter(
        (protocol: PermedProtocol) => protocol?.name !== "winrm"
      )
    };
  };

  return {
    buildConnectionInfo,
    draft,
    initDraft,
    loadAssetDetails,
    personalCredentials,
    personalCredentialsLoaded,
    personalCredentialsLoading,
    personalCredentialsLoadFailed,
    preferredConnectMethod
  };
}
