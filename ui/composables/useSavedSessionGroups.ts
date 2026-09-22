import type { AssetItem, ConnectionInfo } from "~/types";
import type {
  WorkspacePane,
  WorkspacePaneLayoutMode,
  WorkspaceSessionTab,
  WorkspaceTabGroup
} from "./useWorkspaceTabs";
import { apiRequest, getAssetDetailRequest } from "~/composables/useApiRequest";
import { isConnectMethodAvailable, isExternalClientConnectMethod } from "~/composables/useConnectMethods";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { transformAssetDetail } from "~/utils";
import { hasReusableSavedConnection, isSavedConnectionAvailable } from "~/utils/connection";

export type SavedSessionPane =
  | { kind: "empty" }
  | { kind: "local-shell"; name: string }
  | { kind: "script"; id: string }
  | { kind: "asset"; asset: AssetItem; connection: ConnectionInfo };
export interface SavedSessionTab {
  id: string;
  title?: string;
  layoutMode: WorkspacePaneLayoutMode;
  threePaneSpanAxis?: "columns" | "rows";
  panes: SavedSessionPane[];
}
export interface SavedSessionGroup {
  id: string;
  title: string;
  tabs: SavedSessionTab[];
}

const revision = ref(0);
export const sessionGroupSaveError = ref("");
const openingIds = ref<string[]>([]);
const string = (value: unknown) => (typeof value === "string" ? value : "");
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

// Allowlist reconnection metadata. Tokens, passwords, tickets and editor buffers never enter storage.
export function normalizeSavedSessionPane(value: unknown): SavedSessionPane | null {
  const pane = record(value);
  if (pane.kind === "empty") return { kind: "empty" };
  if (pane.kind === "local-shell") return { kind: "local-shell", name: string(pane.name) };
  if (pane.kind === "script") return string(pane.id) ? { kind: "script", id: string(pane.id) } : null;
  const asset = record(pane.asset);
  const connection = record(pane.connection);
  if (pane.kind !== "asset" || !string(asset.id)) return null;
  const accountMode = ["hosted", "manual", "dynamic", "anonymous"].includes(string(connection.accountMode))
    ? (connection.accountMode as ConnectionInfo["accountMode"])
    : "hosted";
  return {
    kind: "asset",
    asset: {
      id: string(asset.id),
      name: string(asset.name),
      address: string(asset.address),
      org_id: string(asset.org_id) || undefined,
      platform: string(asset.platform),
      type: string(asset.type),
      category: string(asset.category),
      zone: "",
      isActive: true
    },
    connection: {
      protocol: string(connection.protocol),
      username: string(connection.username),
      accountMode,
      accountId: string(connection.accountId) || undefined,
      connectMethod: string(connection.connectMethod),
      manualUsername: string(connection.manualUsername),
      personalCredentialId: string(connection.personalCredentialId) || undefined,
      personalCredentialSecretType: string(connection.personalCredentialSecretType) || undefined
    }
  };
}

export function snapshotSessionPane(pane: WorkspacePane, remembered?: ConnectionInfo): SavedSessionPane | null {
  if (pane.protocol === "local-shell") return { kind: "local-shell", name: pane.assetName };
  if (pane.protocol === "script-editor")
    return normalizeSavedSessionPane({ kind: "script", id: pane.payload?.scriptId });
  if (pane.mode === "empty") return { kind: "empty" };
  const candidate = pane.setupAsset?.savedConnection || remembered;
  const saved = candidate?.protocol === pane.protocol && candidate.username === pane.account ? candidate : undefined;
  const account = pane.permedAccounts?.find((item) =>
    [item.id, item.name, item.username, item.alias].includes(pane.account)
  );
  const alias = account?.alias || pane.account;
  const accountMode =
    alias === "@INPUT"
      ? "manual"
      : alias === "@USER"
        ? "dynamic"
        : alias === "@ANON"
          ? "anonymous"
          : saved?.accountMode || "hosted";
  const manualUsername = pane.setupDraft?.manualUsername ?? saved?.manualUsername;
  return normalizeSavedSessionPane({
    kind: "asset",
    asset: {
      id: pane.assetId,
      name: pane.assetName,
      address: pane.address,
      org_id: pane.orgId,
      platform: pane.assetPlatform,
      type: pane.assetType,
      category: pane.assetCategory
    },
    connection: {
      protocol: pane.protocol,
      username: pane.account,
      accountMode,
      accountId: accountMode === "hosted" ? account?.id || saved?.accountId : undefined,
      connectMethod: pane.payload?.connectMethod?.value || pane.connectMethod || pane.setupDraft?.connectMethod,
      manualUsername,
      personalCredentialId:
        pane.setupDraft?.personalCredentialId ??
        (saved?.manualUsername === manualUsername ? saved?.personalCredentialId : undefined),
      personalCredentialSecretType: pane.setupDraft?.personalCredentialSecretType ?? saved?.personalCredentialSecretType
    }
  });
}

export function normalizeSavedSessionGroups(value: unknown): SavedSessionGroup[] {
  if (!Array.isArray(value)) return [];
  const groups: SavedSessionGroup[] = [];
  for (const raw of value) {
    const group = record(raw);
    if (
      !string(group.id) ||
      !string(group.title).trim() ||
      !Array.isArray(group.tabs) ||
      !group.tabs.length ||
      groups.some((item) => item.id === group.id)
    )
      continue;
    const tabs: SavedSessionTab[] = [];
    for (const rawTab of group.tabs) {
      const tab = record(rawTab);
      if (!Array.isArray(tab.panes) || !tab.panes.length || tab.panes.length > 4) break;
      const panes = tab.panes.map(normalizeSavedSessionPane);
      if (panes.some((pane) => !pane)) break;
      const count = panes.length;
      const layoutMode =
        count === 1 ? "single" : count > 2 ? "grid-2x2" : tab.layoutMode === "rows-2" ? "rows-2" : "columns-2";
      tabs.push({
        id: string(tab.id) || `${group.id}:${tabs.length}`,
        title: string(tab.title) || undefined,
        layoutMode,
        threePaneSpanAxis:
          tab.threePaneSpanAxis === "columns" || tab.threePaneSpanAxis === "rows" ? tab.threePaneSpanAxis : undefined,
        panes: panes as SavedSessionPane[]
      });
    }
    if (tabs.length === group.tabs.length)
      groups.push({ id: string(group.id), title: string(group.title).trim(), tabs });
  }
  return groups;
}

export function getSessionGroupStorageKey() {
  if (typeof window === "undefined") return "";
  const user = useUserInfoStore();
  const id = user.currentUser?.userId;
  return user.loggedIn && user.currentSite && id
    ? `workspace-session-groups:${encodeURIComponent(user.currentSite)}:${encodeURIComponent(id)}`
    : "";
}

function readGroups(key: string) {
  if (!key) return [];
  try {
    return normalizeSavedSessionGroups(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    return [];
  }
}

function writeGroups(key: string, groups: SavedSessionGroup[]) {
  if (!key || key !== getSessionGroupStorageKey()) return;
  try {
    localStorage.setItem(key, JSON.stringify(groups));
    sessionGroupSaveError.value = "";
    revision.value++;
  } catch {
    sessionGroupSaveError.value = "SavedGroups.SaveFailed";
  }
}

export function persistSessionGroup(group: WorkspaceTabGroup, tabs: WorkspaceSessionTab[]) {
  if (!group.saved || !group.storageKey || group.storageKey !== getSessionGroupStorageKey()) return;
  if (group.restoring) {
    group.savePending = true;
    return;
  }
  const members = tabs.filter((tab) => tab.group?.id === group.id);
  const groups = readGroups(group.storageKey);
  if (!members.length) {
    writeGroups(
      group.storageKey,
      groups.filter((item) => item.id !== group.id)
    );
    return;
  }
  const snapshot = normalizeSavedSessionGroups([
    {
      id: group.id,
      title: group.title,
      tabs: members.map((tab) => ({
        id: tab.savedTabId || tab.id,
        title: tab.title,
        layoutMode: tab.layoutMode,
        threePaneSpanAxis: tab.threePaneSpanAxis,
        panes: tab.panes.map((pane) =>
          snapshotSessionPane(pane, useUserInfoStore().getConnectionInfoForAsset?.(pane.assetId) || undefined)
        )
      }))
    }
  ])[0];
  if (!snapshot) {
    sessionGroupSaveError.value = "SavedGroups.UnsavedScript";
    return;
  }
  const index = groups.findIndex((item) => item.id === group.id);
  if (index < 0) groups.push(snapshot);
  else groups[index] = snapshot;
  writeGroups(group.storageKey, groups);
}

export function useSavedSessionGroups() {
  const { t } = useI18n();
  const workspace = useWorkspaceTabs();
  const { launchWithInfo } = useConnectionLauncher();
  const { getMethodsForProtocol } = useConnectMethods();
  const savedGroups = computed(() => {
    void revision.value;
    return readGroups(getSessionGroupStorageKey());
  });
  useEventListener("storage", () => revision.value++);
  const isGroupOpening = (id: string) => openingIds.value.includes(`${getSessionGroupStorageKey()}:${id}`);
  const removeSavedGroup = (id: string) => {
    const key = getSessionGroupStorageKey();
    writeGroups(
      key,
      readGroups(key).filter((group) => group.id !== id)
    );
    const group = workspace.tabGroups.value.find((group) => group.id === id);
    if (group) group.saved = false;
  };

  const openSavedGroup = async (id: string) => {
    const scope = getSessionGroupStorageKey();
    const key = `${scope}:${id}`;
    if (!scope || openingIds.value.includes(key)) return [];
    const saved = readGroups(scope).find((group) => group.id === id);
    if (!saved) return [];
    const existing = workspace.tabs.value.find((tab) => tab.group?.id === id && tab.group.storageKey === scope);
    if (
      existing &&
      saved.tabs.every((item) =>
        workspace.tabs.value.some((tab) => tab.group?.id === id && (tab.savedTabId || tab.id) === item.id)
      )
    ) {
      workspace.setActiveSession(existing.id);
      return [];
    }
    openingIds.value.push(key);
    const group =
      existing?.group ||
      reactive<WorkspaceTabGroup>({
        id,
        title: saved.title,
        collapsed: false,
        saved: true,
        storageKey: scope,
        restoring: true
      });
    group.restoring = true;
    const opened = workspace.restoreSessionGroup(saved, group);
    const failures: string[] = [];
    try {
      await Promise.all(
        opened.flatMap((tab) =>
          tab.panes.map(async (pane, paneIndex) => {
            const source = saved.tabs.find((item) => item.id === tab.savedTabId)!.panes[paneIndex]!;
            const attempt = workspace.getSessionConnectionAttempt(pane.id);
            const assertCurrent = () => {
              if (
                getSessionGroupStorageKey() !== scope ||
                !workspace.tabs.value.includes(tab) ||
                !tab.panes.some((item) => item.id === pane.id) ||
                workspace.getSessionConnectionAttempt(pane.id) !== attempt
              )
                throw new Error("Session group changed");
            };
            try {
              if (source.kind === "empty") return;
              if (source.kind === "local-shell") {
                if (!isDesktopRuntime()) throw new Error(t("SavedGroups.DesktopOnly"));
                return;
              }
              if (source.kind === "script") {
                const script = await apiRequest<Record<string, unknown>>({
                  method: "GET",
                  path: `/api/v1/ops/adhocs/${encodeURIComponent(source.id)}/`
                });
                assertCurrent();
                pane.payload = {
                  scriptId: source.id,
                  name: string(script.name),
                  args: string(script.args),
                  comment: string(script.comment),
                  module: string(script.module) || string(record(script.module).value) || "shell",
                  scope:
                    (string(script.scope) || string(record(script.scope).value)) === "public" ? "public" : "private",
                  variable: Array.isArray(script.variable) ? script.variable : []
                };
                pane.mode = "session";
                pane.status = "ready";
                return;
              }
              const detail = await getAssetDetailRequest(source.asset.id, source.asset.org_id);
              assertCurrent();
              const asset = {
                ...transformAssetDetail(source.asset.id, detail),
                org_id: detail.org_id || source.asset.org_id,
                savedConnection: source.connection
              };
              if (!hasReusableSavedConnection(asset) || !isSavedConnectionAvailable(asset)) {
                workspace.openSetupSession(asset, { paneId: pane.id, protocol: source.connection.protocol });
                return;
              }
              const connection = source.connection;
              const methods = await getMethodsForProtocol(connection.protocol);
              assertCurrent();
              if (
                !isConnectMethodAvailable(connection.connectMethod || "", methods, connection.protocol) ||
                isExternalClientConnectMethod(connection.connectMethod || "", methods)
              ) {
                workspace.openSetupSession(asset, { paneId: pane.id, protocol: connection.protocol });
                return;
              }
              const success = await launchWithInfo(
                asset,
                {
                  protocol: connection.protocol,
                  account: connection.username,
                  accountId: connection.accountId,
                  accountMode: connection.accountMode || "hosted",
                  connectMethod: connection.connectMethod || "",
                  manualUsername: connection.manualUsername || "",
                  manualPassword: "",
                  dynamicPassword: "",
                  personalCredentialId: connection.personalCredentialId,
                  personalCredentialSecretType: connection.personalCredentialSecretType,
                  rememberSecret: false,
                  rememberSelection: false,
                  preserveStoredSelection: true
                },
                { paneId: pane.id, aclBatchId: key, assertCurrent }
              );
              if (!success) throw new Error(t("SavedGroups.ConnectionFailed"));
            } catch (error) {
              try {
                assertCurrent();
              } catch {
                return;
              }
              const reason = error instanceof Error ? error.message : String(error);
              failures.push(`${pane.assetName || tab.title}: ${reason}`);
              workspace.markSessionFailed(
                { tabId: pane.id, assetId: pane.assetId, protocol: pane.protocol, account: pane.account },
                reason
              );
            }
          })
        )
      );
    } finally {
      group.restoring = false;
      if (group.savePending) {
        group.savePending = false;
        persistSessionGroup(group, workspace.tabs.value);
      }
      openingIds.value = openingIds.value.filter((item) => item !== key);
    }
    return failures;
  };
  return {
    savedGroups,
    saveError: sessionGroupSaveError,
    openingIds,
    isGroupOpening,
    openSavedGroup,
    removeSavedGroup
  };
}
