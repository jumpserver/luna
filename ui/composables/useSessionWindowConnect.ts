import type { AssetDetail, AssetItem, PermedAccount, PermOrgItem, RdpGraphics } from "~/types";
import {
  getAccountDetail,
  getAssetDetailRequest,
  getConsoleAssetDetail,
  getPersonalAssetCredential
} from "~/composables/useApiRequest";
import { desktopInvoke } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { transformAssetDetail } from "~/utils";
import { hasReusableSavedConnection, isSavedConnectionAvailable } from "~/utils/connection";
import { setWebOrgId } from "~/utils/runtime";

export interface SessionWindowConnectionInfo {
  protocol: string;
  account: string;
  manualUsername: string;
  manualPassword: string;
  personalCredentialId?: string;
  dynamicPassword: string;
  rememberSecret: boolean;
  rememberSelection?: boolean;
  connectMethod: string;
  connectOptions?: RdpGraphics;
  accountId?: string;
  availableProtocols?: string[];
  accountMode: "hosted" | "dynamic" | "manual" | "anonymous";
}

interface LegacyWindowAssetPayload {
  asset: AssetItem;
  connectionInfo: SessionWindowConnectionInfo;
}

export const decodeLegacyWindowPayload = (payload: string) => {
  try {
    return JSON.parse(decodeURIComponent(atob(payload))) as LegacyWindowAssetPayload;
  } catch {
    throw new Error("Invalid session window payload");
  }
};

const queryValue = (value: unknown) => (Array.isArray(value) ? String(value[0] || "") : String(value || "")).trim();

export function buildAdminConnectSessionPath(query: {
  asset?: unknown;
  account?: unknown;
  protocol?: unknown;
  org_id?: unknown;
  org?: unknown;
}) {
  const assetId = queryValue(query.asset);
  const accountId = queryValue(query.account);
  const protocol = queryValue(query.protocol);
  if (!assetId || !accountId || !protocol) return "";

  const params = new URLSearchParams({
    protocol,
    account: accountId,
    accountId,
    accountMode: "hosted",
    admin: "1"
  });
  const orgId = queryValue(query.org_id) || queryValue(query.org);
  if (orgId) params.set("org", orgId);
  return `/session/${encodeURIComponent(assetId)}?${params.toString()}`;
}

export function isAdminSessionQuery(query: { admin?: unknown }) {
  return queryValue(query.admin) === "1";
}

export function shouldShowSessionTabStrip(path: string, query: { admin?: unknown }) {
  return path.startsWith("/session/") && !isAdminSessionQuery(query);
}

export function toAdminAssetItem(
  assetId: string,
  asset: AssetDetail & { protocols?: { name?: string; port?: number; public?: boolean }[] },
  account: {
    id?: string;
    name?: string;
    username?: string;
    alias?: string;
    date_expired?: string;
    has_secret?: boolean;
    has_username?: boolean;
    secret_type?: string | { value?: string };
    actions?: PermedAccount["actions"];
  },
  orgId: string
): AssetItem {
  const secretType =
    typeof account.secret_type === "string" ? account.secret_type : account.secret_type?.value || "password";
  const item = transformAssetDetail(assetId, {
    ...asset,
    permed_protocols: (asset.permed_protocols || asset.protocols || []).filter(
      (protocol) => protocol?.name && protocol.name !== "winrm"
    ) as AssetDetail["permed_protocols"],
    permed_accounts: [
      {
        id: account.id || "",
        name: account.name || account.username || account.id || "",
        username: account.username || "",
        alias: account.alias || account.username || account.name || "",
        date_expired: account.date_expired || "",
        has_secret: account.has_secret ?? true,
        has_username: account.has_username ?? Boolean(account.username),
        secret_type: secretType,
        actions: account.actions || []
      }
    ]
  });
  item.org_id = orgId || asset.org_id;
  return item;
}

export function buildSessionPath(asset: AssetItem, connectionInfo?: SessionWindowConnectionInfo) {
  const query = new URLSearchParams();
  if (asset.org_id) query.set("org", asset.org_id);
  if (!connectionInfo) {
    const suffix = query.size ? `?${query.toString()}` : "";
    return `/session/${encodeURIComponent(asset.id)}${suffix}`;
  }

  query.set("protocol", connectionInfo.protocol);
  if (connectionInfo.account) query.set("account", connectionInfo.account);
  query.set("accountMode", connectionInfo.accountMode);
  if (connectionInfo.accountId) query.set("accountId", connectionInfo.accountId);
  if (connectionInfo.connectMethod) query.set("method", connectionInfo.connectMethod);
  if (connectionInfo.accountMode === "manual" && connectionInfo.personalCredentialId) {
    query.set("personalCredentialId", connectionInfo.personalCredentialId);
  }

  return `/session/${encodeURIComponent(asset.id)}?${query.toString()}`;
}

async function fetchSessionAsset(assetId: string, orgId: string): Promise<AssetItem> {
  return transformAssetDetail(assetId, await getAssetDetailRequest(assetId, orgId));
}

async function fetchAdminSessionAsset(assetId: string, accountId: string, orgId: string): Promise<AssetItem> {
  const [asset, account] = await Promise.all([
    getConsoleAssetDetail(assetId, orgId),
    getAccountDetail(accountId, orgId)
  ]);
  return toAdminAssetItem(assetId, asset, account, orgId);
}

export async function syncSessionWindowOrganization(
  orgId: string,
  options: {
    organizations: PermOrgItem[];
    currentOrgId: string;
    setCurrentOrg: (org: PermOrgItem) => void;
    syncDesktopOrg?: (orgId: string) => Promise<unknown>;
  }
) {
  if (!orgId) return;
  const matched = options.organizations.find((org) => org.id === orgId);
  if (matched && matched.id !== options.currentOrgId) options.setCurrentOrg(matched);
  await options.syncDesktopOrg?.(orgId);
}

const sessionAccountModes = new Set<SessionWindowConnectionInfo["accountMode"]>([
  "hosted",
  "dynamic",
  "manual",
  "anonymous"
]);

export function useSessionWindowConnect() {
  const route = useRoute();
  const { t } = useI18n();
  const { activeTab, openSession, openSetupSession } = useWorkspaceTabs();
  const { confirmConnection } = useAssetConnection();
  const userInfoStore = useUserInfoStore();
  const loading = ref(false);
  const error = ref("");
  const assetName = useState("session-window-title", () => "");

  const getRouteConnection = () => {
    const accountMode = String(route.query.accountMode || "hosted");
    if (!sessionAccountModes.has(accountMode as SessionWindowConnectionInfo["accountMode"])) return null;

    const protocol = String(route.query.protocol || "");
    const account = String(route.query.account || "");
    if (!protocol || !account) return null;

    return {
      protocol,
      account,
      accountId: String(route.query.accountId || "") || undefined,
      accountMode: accountMode as SessionWindowConnectionInfo["accountMode"],
      connectMethod: String(route.query.method || "")
    };
  };

  const ensureConnected = async () => {
    const assetId = String(route.params.assetId || "");
    if (!assetId || loading.value) return;
    if (activeTab.value?.assetId === assetId) return;

    const saved = userInfoStore.getConnectionInfoForAsset(assetId);
    const preference = userInfoStore.getConnectionPreferenceForAsset(assetId);
    const routeConnection = getRouteConnection();
    loading.value = true;
    error.value = "";

    try {
      const admin = String(route.query.admin || "") === "1";
      const orgId = String(route.query.org || userInfoStore.currentUser?.org?.id || "");
      if (orgId && !isDesktopRuntime()) setWebOrgId(orgId);
      await syncSessionWindowOrganization(orgId, {
        organizations: userInfoStore.currentOrganizations,
        currentOrgId: userInfoStore.currentUser?.org?.id || "",
        setCurrentOrg: userInfoStore.setCurrentOrg,
        syncDesktopOrg: isDesktopRuntime() ? (id) => desktopInvoke("set_api_org", { orgId: id }) : undefined
      });
      const asset = admin
        ? await fetchAdminSessionAsset(assetId, String(route.query.accountId || route.query.account || ""), orgId)
        : await fetchSessionAsset(assetId, orgId);
      asset.org_id = orgId || undefined;
      asset.savedConnection = saved || undefined;
      assetName.value = asset.name || "JumpServer";

      // An explicit credential must never fall back to a remembered account.
      if (route.query.personalCredentialId !== undefined) {
        const credentialId = queryValue(route.query.personalCredentialId);
        if (admin || !credentialId) throw new Error(t("ConnectError.PersonalCredentialNotFound"));

        const credential = await getPersonalAssetCredential(credentialId, orgId);
        if (credential.asset.id !== assetId || !credential.is_active || !credential.has_secret) {
          throw new Error(t("ConnectError.PersonalCredentialNotFound"));
        }
        const protocol = typeof credential.protocol === "string" ? credential.protocol : credential.protocol.value;
        if (
          !asset.permedProtocols?.some(
            (item) => item.name === protocol && (isDesktopRuntime() || item.public !== false)
          )
        ) {
          throw new Error(t("ConnectError.ProtocolUnavailable"));
        }
        if (!asset.permedAccounts?.some((account) => account.alias === "@INPUT")) {
          throw new Error(t("ConnectError.ManualAccountDenied"));
        }
        const preferred =
          preference?.protocol === protocol ? preference : saved?.protocol === protocol ? saved : undefined;
        const connectMethod = queryValue(route.query.method) || preferred?.connectMethod || "";
        const pane = openSession(asset, { protocol, account: credential.username, connectMethod });
        await confirmConnection(asset, {
          protocol,
          account: "@INPUT",
          accountMode: "manual",
          manualUsername: credential.username,
          manualPassword: "",
          personalCredentialId: credential.id,
          personalCredentialVersion: credential.version,
          personalCredentialSecretType:
            typeof credential.secret_type === "string" ? credential.secret_type : credential.secret_type.value,
          savePersonalCredential: false,
          dynamicPassword: "",
          rememberSecret: false,
          preserveStoredSelection: true,
          connectMethod,
          connectOptions: preferred?.connectOptions || {},
          tabId: pane.id
        });
        return;
      }

      const reusableSavedConnection = !admin && hasReusableSavedConnection(asset);
      const connection = { ...(saved || {}), ...(preference || {}), ...(routeConnection || {}) };
      const queryNeedsNoSecret = routeConnection && ["hosted", "anonymous"].includes(routeConnection.accountMode);
      const canAutoConnect = reusableSavedConnection || queryNeedsNoSecret || admin;

      if (canAutoConnect && (!reusableSavedConnection || isSavedConnectionAvailable(asset))) {
        const pane = openSession(asset, {
          protocol: connection.protocol || "",
          account: connection.username || connection.account || "",
          connectMethod: connection.connectMethod
        });
        await confirmConnection(asset, {
          protocol: connection.protocol || "",
          account: connection.username || connection.account || "",
          accountId: connection.accountId,
          accountMode: (connection.accountMode as SessionWindowConnectionInfo["accountMode"]) || "hosted",
          manualUsername: connection.manualUsername || "",
          manualPassword: "",
          personalCredentialId: reusableSavedConnection ? saved?.personalCredentialId : undefined,
          personalCredentialVersion: reusableSavedConnection ? saved?.personalCredentialVersion : undefined,
          personalCredentialSecretType: reusableSavedConnection ? saved?.personalCredentialSecretType : undefined,
          savePersonalCredential: false,
          dynamicPassword: reusableSavedConnection ? saved?.dynamicPassword || "" : "",
          rememberSecret: reusableSavedConnection && Boolean(saved?.rememberSecret),
          rememberSelection: !admin,
          preserveStoredSelection: admin,
          connectMethod: connection.connectMethod || "",
          connectOptions: connection.connectOptions || {},
          availableProtocols: connection.availableProtocols || [],
          tabId: pane.id,
          admin
        });
        return;
      }

      openSetupSession(asset, { protocol: routeConnection?.protocol || preference?.protocol || saved?.protocol || "" });
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading.value = false;
    }
  };

  return {
    ensureConnected,
    loading,
    error,
    assetName
  };
}
