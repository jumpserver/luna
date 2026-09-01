import type { ConnectionFormInfo } from "~/composables/useAssetConnection";
import type { AssetItem, ConnectionInfo, ConnectionPreferenceInfo, PermedAccount, PermedProtocol } from "~/types";

import { useUserInfoStore } from "~/store/modules/userInfo";
import { sortPermedProtocols, sortProtocolNames } from "~/utils";

export interface ConnectionFormDraft {
  protocol: string;
  account: string;
  manualUsername: string;
  manualPassword: string;
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
    dynamicPassword: "",
    rememberSecret: false,
    rememberSelection: false,
    connectMethod: "",
    connectOptions: {}
  });

  const preferredConnectMethod = computed(
    () => userInfoStore.getConnectionPreferenceForProtocol(draft.value.protocol)?.connectMethod || ""
  );

  const getVisibleProtocols = (protocols: PermedProtocol[]) =>
    isDesktopRuntime() ? protocols : protocols.filter((protocol) => protocol?.public !== false);
  const getManualInputLabel = () => t("Account.ManualInput");
  const getAnonymousLabel = () => t("Account.Anonymous");
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

  const initDraft = (asset: AssetItem, explicitProtocol = "") => {
    const saved = asset.savedConnection;
    const preferred = userInfoStore.getConnectionPreferenceForAsset(asset.id) || undefined;
    const source = { ...(saved || {}), ...(preferred || {}) } as ConnectionPreferenceInfo | ConnectionInfo;
    const protocols = getVisibleProtocols(asset.permedProtocols || []);
    const accounts = asset.permedAccounts || [];

    draft.value = {
      protocol: resolvePreferredProtocol(source, protocols, explicitProtocol),
      account: resolvePreferredAccount(source, accounts),
      manualUsername: source.manualUsername || "",
      manualPassword: saved?.manualPassword || "",
      dynamicPassword: saved?.dynamicPassword || "",
      rememberSecret: !!saved?.rememberSecret,
      rememberSelection: !!saved,
      connectMethod: "",
      connectOptions: {}
    };
    const methodMatches = source.protocol?.toLowerCase() === draft.value.protocol.toLowerCase();
    draft.value.connectMethod = methodMatches ? source.connectMethod || "" : "";
    draft.value.connectOptions = methodMatches ? { ...(source.connectOptions || {}) } : {};
  };

  const buildConnectionInfo = (asset: AssetItem): ConnectionFormInfo => {
    let accountMode: ConnectionFormInfo["accountMode"] = "hosted";
    let account = draft.value.account || "";
    let accountId: string | undefined;
    if (account === getManualInputLabel()) accountMode = "manual";
    if (account.includes("@ANON") || account === getAnonymousLabel()) {
      accountMode = "anonymous";
      account = "@ANON";
    }
    if (account.startsWith(t("Account.DynamicUser"))) {
      accountMode = "dynamic";
      const dynamic = asset.permedAccounts?.find((item) => item.alias === "@USER");
      account = dynamic?.name || account.replace(/\(.+\)/, "");
    }
    if (accountMode === "hosted") {
      accountId = asset.permedAccounts?.find(
        (item) => item.name === account || item.username === account || item.alias === account
      )?.id;
    }

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
      dynamicPassword: draft.value.dynamicPassword,
      rememberSecret: draft.value.rememberSecret,
      rememberSelection: draft.value.rememberSelection,
      connectMethod: draft.value.connectMethod,
      connectOptions: { ...draft.value.connectOptions },
      availableProtocols
    };
  };

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
    preferredConnectMethod
  };
}
