<script setup lang="ts">
import type { RightPanelTab } from "~/composables/useRightPanel";
import { getLionWorkspaceSession } from "@/lion/workspaces/useLionWorkspaceSessionRegistry";
import {
  nextRightPanelTab,
  rememberedRightPanelTab,
  rememberRightPanelTab,
  showSftpRightPanelTab
} from "~/composables/rightPanelTabState";
import { getAssetDetailRequest } from "~/composables/useApiRequest";

const { t } = useI18n();
const { modernIsland } = useSettingManager();
const { activePaneId, activeTab: workspaceTab } = useWorkspaceTabs();
const { activeWorkspaceMode } = useWorkspaceMode();
const { activeTab, setActiveTab, setOpen } = useRightPanel();
const activeSession = computed(() => {
  if (activeWorkspaceMode.value === "files") return null;
  const tab = workspaceTab.value;
  return tab?.panes.find((pane) => pane.id === activePaneId.value) || tab;
});
const lionSession = computed(() => getLionWorkspaceSession(activeSession.value?.id || ""));
const activeSessionId = computed(() => activeSession.value?.id || "");

const localPermedProtocols = computed(() => activeSession.value?.permedProtocols);
const protocolCacheKey = computed(() => {
  const session = activeSession.value;
  return session?.id && session.assetId ? `${session.id}:${session.assetId}` : "";
});
const protocolsByPane = shallowReactive(new Map<string, Array<{ name?: unknown }>>());
const protocolFetchByPane = new Map<string, number>();

watch(
  () => ({
    cacheKey: protocolCacheKey.value,
    assetId: activeSession.value?.assetId,
    orgId: activeSession.value?.orgId,
    protocol: activeSession.value?.protocol,
    local: localPermedProtocols.value
  }),
  async ({ cacheKey, assetId, orgId, protocol, local }) => {
    if (protocol?.toLowerCase() !== "ssh" || !cacheKey) return;
    if (local?.length) {
      protocolFetchByPane.set(cacheKey, (protocolFetchByPane.get(cacheKey) || 0) + 1);
      protocolsByPane.set(cacheKey, local);
      return;
    }
    if (!assetId || protocolsByPane.has(cacheKey)) return;
    const gen = (protocolFetchByPane.get(cacheKey) || 0) + 1;
    protocolFetchByPane.set(cacheKey, gen);
    try {
      const detail = await getAssetDetailRequest(assetId, orgId);
      if (protocolFetchByPane.get(cacheKey) !== gen) return;
      protocolsByPane.set(cacheKey, detail.permed_protocols ?? detail.permedProtocols ?? []);
    } catch {
      /* Keep the pane unresolved so a later switch-back can retry. */
    }
  },
  { immediate: true }
);

const resolvedPermedProtocols = computed(() => {
  if (activeSession.value?.protocol?.toLowerCase() !== "ssh") return undefined;
  if (localPermedProtocols.value?.length) return localPermedProtocols.value;
  return protocolCacheKey.value ? protocolsByPane.get(protocolCacheKey.value) : undefined;
});
const sftpResolved = computed(
  () => activeSession.value?.protocol?.toLowerCase() !== "ssh" || resolvedPermedProtocols.value !== undefined
);
const showSftpTab = computed(() => showSftpRightPanelTab(activeSession.value?.protocol, resolvedPermedProtocols.value));

const tabs = computed(() => {
  if (activeWorkspaceMode.value === "files") return [];

  const items: Array<{ value: RightPanelTab; label: string; icon: string; title?: string; disabled?: boolean }> = [
    { value: "session", label: t("RightPanel.Session"), icon: "i-lucide-terminal" }
  ];

  if (lionSession.value) {
    items.push({
      value: "lion-control" as const,
      label: t("RightPanel.Control"),
      icon: "i-lucide-sliders-horizontal"
    });
    const permission = lionSession.value.actionPermission.value;
    const filesDisabled = permission.enable_upload === false && permission.enable_download === false;
    if (lionSession.value.driverName.value || filesDisabled) {
      items.push({
        value: "lion-files" as const,
        label: t("RightPanel.Files"),
        icon: "i-lucide-folder-kanban",
        disabled: filesDisabled,
        title: filesDisabled ? t("RightPanel.FilesPermissionDenied") : undefined
      });
    }
  }

  if (showSftpTab.value) {
    items.push({
      value: "sftp" as const,
      label: t("RightPanel.SFTP"),
      icon: "i-lucide-folder-symlink",
      title: t("RightPanel.SFTPTooltip")
    });
  }

  return items;
});

const panelComponents = {
  session: defineAsyncComponent(() => import("~/components/RightPanel/sessionPanel.vue")),
  "lion-control": defineAsyncComponent(() => import("~/components/RightPanel/lionControlPanel.vue")),
  "lion-files": defineAsyncComponent(() => import("~/components/RightPanel/lionFilePanel.vue")),
  sftp: defineAsyncComponent(() => import("~/components/RightPanel/sftpPanel.vue"))
} as const;

const activePanelComponent = computed(() => panelComponents[activeTab.value]);

let prevPaneId = "";
watch(
  [activeSessionId, tabs, sftpResolved],
  ([paneId, items]) => {
    if (!items.length) {
      setOpen(false);
      return;
    }
    const paneChanged = prevPaneId !== paneId;
    if (paneChanged && prevPaneId) rememberRightPanelTab(prevPaneId, activeTab.value);
    const next = nextRightPanelTab({
      available: items.filter((item) => !item.disabled).map((item) => item.value),
      remembered: paneId ? rememberedRightPanelTab(paneId) : undefined,
      active: activeTab.value,
      sftpResolved: sftpResolved.value,
      paneChanged
    });
    if (next !== activeTab.value) setActiveTab(next);
    if (paneId) rememberRightPanelTab(paneId, next);
    prevPaneId = paneId;
  },
  { immediate: true }
);
watch(activeTab, (tab) => {
  if (activeSessionId.value) rememberRightPanelTab(activeSessionId.value, tab);
});
</script>

<template>
  <aside
    data-ai-context="workspace"
    class="flex h-full min-h-0 w-full flex-col"
    :style="{
      borderLeft: modernIsland ? '0' : '1px solid var(--app-border)',
      backgroundColor: modernIsland ? 'transparent' : 'var(--app-panel-bg)',
      color: 'var(--app-fg)'
    }"
  >
    <div class="shrink-0 px-3" :style="{ borderBottom: '1px solid var(--app-border)' }">
      <div class="right-panel-tab-strip">
        <UTooltip v-for="tab in tabs" :key="tab.value" :text="tab.title || tab.label">
          <button
            type="button"
            class="right-panel-tab-button"
            :class="{ 'right-panel-tab-button-active': activeTab === tab.value && !tab.disabled }"
            :aria-disabled="tab.disabled || undefined"
            @click="!tab.disabled && setActiveTab(tab.value)"
          >
            <UIcon :name="tab.icon" class="right-panel-tab-icon" />
            <span class="truncate">{{ tab.label }}</span>
          </button>
        </UTooltip>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-hidden">
      <KeepAlive>
        <component :is="activePanelComponent" />
      </KeepAlive>
    </div>
  </aside>
</template>

<style scoped>
.right-panel-tab-strip {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  scrollbar-width: none;
}

.right-panel-tab-strip::-webkit-scrollbar {
  display: none;
}

.right-panel-tab-button {
  position: relative;
  display: inline-flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-start;
  gap: 0.375rem;
  padding: 0.625rem 0.5rem;
  font-size: 0.75rem;
  line-height: 1;
  font-weight: 600;
  color: color-mix(in srgb, var(--app-fg) 52%, transparent);
  transition:
    background-color 140ms ease,
    color 140ms ease,
    border-color 140ms ease;
}

.right-panel-tab-button:not([aria-disabled="true"]):hover {
  color: color-mix(in srgb, var(--app-fg) 76%, transparent);
}

.right-panel-tab-button[aria-disabled="true"] {
  cursor: not-allowed;
  color: color-mix(in srgb, var(--app-fg) 30%, transparent);
}

.right-panel-tab-button:focus-visible {
  outline: none;
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}

.right-panel-tab-button-active {
  color: var(--app-fg);
}

.right-panel-tab-button-active::after {
  content: "";
  position: absolute;
  inset-inline: 0;
  bottom: -1px;
  height: 2px;
  background: var(--ui-color-primary-500);
}

.right-panel-tab-icon {
  flex-shrink: 0;
  width: 0.875rem;
  height: 0.875rem;
  opacity: 0.88;
}
</style>
