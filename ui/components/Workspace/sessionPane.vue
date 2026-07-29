<script setup lang="ts">
import type { WorkspacePane, WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import type { AssetItem } from "~/types";

import { resolveSessionSurface } from "~/shared/connectors/registry";
import { useUserInfoStore } from "~/store/modules/userInfo";

const props = defineProps<{ tab: WorkspaceSessionTab }>();

const { t } = useI18n();
const colorMode = useColorMode();
const toast = useToast();
const userInfoStore = useUserInfoStore();
const { currentUser } = storeToRefs(userInfoStore);
const surfaceRefs = ref<Record<string, { focus?: () => void } | null>>({});
const {
  activePaneId,
  activeTabId,
  canMergeTabs,
  closePane,
  setActivePane,
  swapPanes,
  toSurfaceTab
} = useWorkspaceTabs();
const { connectCurrentPane, connectOtherPane, mergeWorkspaceTabIntoCurrent, reconnectSession } = useWorkspaceTabMenu();
const draggedPaneId = ref("");
const dragOverPaneId = ref("");
const dragOverWorkspace = ref(false);
const connectOtherModalOpen = ref(false);
const connectOtherSearch = ref("");
const connectOtherPaneId = ref("");

const paneGridClass = computed(() => {
  switch (props.tab.layoutMode) {
    case "columns-2":
      return "grid-cols-2";
    case "rows-2":
      return "grid-rows-2";
    case "grid-2x2":
      return "grid-cols-2 grid-rows-2";
    default:
      return "";
  }
});
const setupPane = computed(() => {
  const activeSetupPane = props.tab.panes.find(
    (pane) => pane.id === activePaneId.value && pane.mode === "setup"
  );

  return activeSetupPane || props.tab.panes.find((pane) => pane.mode === "setup");
});
const showPaneHeaders = computed(() => props.tab.panes.length > 1);
const inactivePaneOverlayClass = computed(() => (colorMode.value === "dark" ? "bg-white/4" : "bg-black/3"));
const currentOrgLabel = computed(() => currentUser.value?.org?.name || "");

function setSurfaceRef(paneId: string, el: { focus?: () => void } | null) {
  surfaceRefs.value[paneId] = el;
}

function setSurfaceComponentRef(paneId: string, el: unknown) {
  setSurfaceRef(paneId, el as { focus?: () => void } | null);
}

function focusPane(paneId: string) {
  setActivePane(paneId);
  surfaceRefs.value[paneId]?.focus?.();
}

function surfaceTabFor(pane: WorkspacePane) {
  return toSurfaceTab(pane);
}

function surfaceComponentFor(pane: WorkspacePane) {
  return resolveSessionSurface(surfaceTabFor(pane));
}

function surfaceInstanceKey(pane: WorkspacePane) {
  const payload = pane.payload || {};
  const tokenId = String(payload.id || payload.token?.id || "");
  const webUrl = String(payload.webUrl || "");
  const connectMethod = String(payload.connectMethod?.value || "");

  return [pane.id, tokenId, webUrl, connectMethod].join(":");
}

function paneTitle(pane: WorkspacePane) {
  if (pane.assetName) return pane.assetName;
  if (pane.mode === "empty") return t("WorkspacePane.EmptyTitle");
  return t("WorkspacePane.SetupTitle");
}

function paneSubtitle(pane: WorkspacePane) {
  if (pane.mode === "empty") {
    return t("WorkspacePane.EmptyTitle");
  }

  if (pane.mode === "setup") {
    return pane.protocol || t("WorkspacePane.SetupHint");
  }

  if (pane.status === "connected") return t("WorkspacePane.StatusConnected");
  if (pane.status === "failed") return t("WorkspacePane.StatusFailed");
  if (pane.status === "connecting" || pane.status === "ready") return t("WorkspacePane.StatusConnecting");
  return pane.protocol || t("WorkspacePane.StatusIdle");
}

function paneStatusColor(pane: WorkspacePane) {
  if (pane.mode === "empty") return "neutral";
  if (pane.status === "connected") return "success";
  if (pane.status === "failed") return "error";
  if (pane.status === "connecting" || pane.status === "ready") return "warning";
  return "neutral";
}

function showEmptyActions(pane: WorkspacePane) {
  return pane.mode === "empty";
}

function showReconnect(pane: WorkspacePane) {
  return pane.mode === "session" && Boolean(pane.payload?.id || pane.payload?.token?.id);
}

function showPaneSwapHint(paneId: string) {
  return Boolean(draggedPaneId.value && draggedPaneId.value !== paneId && dragOverPaneId.value === paneId);
}

function isActivePane(paneId: string) {
  return activeTabId.value === props.tab.id && activePaneId.value === paneId;
}

function openConnectOtherModal(pane: WorkspacePane) {
  connectOtherPaneId.value = pane.id;
  connectOtherSearch.value = "";
  connectOtherModalOpen.value = true;
}

function handleConnectOtherAsset(asset: AssetItem) {
  const pane = props.tab.panes.find((item) => item.id === connectOtherPaneId.value);
  if (!pane) return;

  connectOtherPane(props.tab, pane, asset);
  connectOtherModalOpen.value = false;
}

function handlePaneDragStart(event: DragEvent, paneId: string) {
  draggedPaneId.value = paneId;
  event.dataTransfer?.setData("application/x-workspace-pane", paneId);
  event.dataTransfer?.setData("application/x-workspace-tab", props.tab.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function handlePaneDragEnd() {
  draggedPaneId.value = "";
  dragOverPaneId.value = "";
}

function handlePaneDrop(targetPaneId: string) {
  if (!draggedPaneId.value || draggedPaneId.value === targetPaneId) {
    dragOverPaneId.value = "";
    return;
  }

  swapPanes(props.tab.id, draggedPaneId.value, targetPaneId);
  dragOverPaneId.value = "";
}

function handleWorkspaceDragOver(event: DragEvent) {
  const paneId = event.dataTransfer?.getData("application/x-workspace-pane");
  const tabId = event.dataTransfer?.getData("application/x-workspace-tab");
  dragOverWorkspace.value = Boolean(tabId && !paneId && tabId !== props.tab.id);
}

function handleWorkspaceDragLeave() {
  dragOverWorkspace.value = false;
}

function handleWorkspaceDrop(event: DragEvent) {
  const paneId = event.dataTransfer?.getData("application/x-workspace-pane");
  const sourceTabId = event.dataTransfer?.getData("application/x-workspace-tab");
  dragOverWorkspace.value = false;
  if (paneId || !sourceTabId || sourceTabId === props.tab.id) return;

  if (!canMergeTabs(sourceTabId, props.tab.id)) {
    toast.add({
      title: t("WorkspacePane.SplitLimitTitle"),
      description: t("WorkspacePane.MergeLimitDescription"),
      color: "warning",
      icon: "i-lucide-circle-alert"
    });
    return;
  }

  void mergeWorkspaceTabIntoCurrent(sourceTabId, props.tab.id);
}

watch(
  () => activeTabId.value,
  (tabId) => {
    if (tabId !== props.tab.id) return;
    nextTick(() => focusPane(props.tab.panes[0]?.id || ""));
  }
);

watch(connectOtherModalOpen, (open) => {
  if (open) return;
  connectOtherSearch.value = "";
  connectOtherPaneId.value = "";
});
</script>

<template>
  <div class="h-full min-h-0 w-full overflow-hidden">
    <div class="relative h-full min-h-0">
      <div
        v-if="dragOverWorkspace"
        class="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-2xl border border-dashed border-primary/50 bg-primary/8 backdrop-blur-[2px]"
      >
        <div class="flex items-center gap-2 rounded-full bg-[var(--workspace-surface-sub-header)] px-4 py-2 text-sm font-medium text-[var(--app-fg)] shadow-sm">
          <UIcon name="i-lucide-panels-top-left" class="size-4" />
          <span>{{ t("WorkspacePane.MergeDropHint") }}</span>
        </div>
      </div>

      <div
        class="grid h-full min-h-0 gap-px bg-[var(--workspace-surface-sub-border)]"
        :class="[paneGridClass, dragOverWorkspace ? 'ring-2 ring-inset ring-primary/40' : '']"
        @dragover.prevent="handleWorkspaceDragOver"
        @dragleave.prevent="handleWorkspaceDragLeave"
        @drop.prevent="handleWorkspaceDrop"
      >
        <section
          v-for="pane in tab.panes"
          :key="pane.id"
          class="group relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--workspace-surface-sub-panel)] transition-[box-shadow]"
          :class="[
            isActivePane(pane.id)
              ? 'z-[1] ring-1 ring-inset ring-primary/28 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ui-color-primary-500)_10%,transparent)]'
              : 'ring-1 ring-inset ring-transparent',
            showPaneSwapHint(pane.id) ? 'ring-2 ring-inset ring-primary/50 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.18)]' : ''
          ]"
        >
          <header
            v-if="showPaneHeaders"
            draggable="true"
            class="relative z-[2] flex h-8 shrink-0 items-center justify-between gap-3 border-b border-[var(--workspace-surface-sub-border)] bg-[var(--workspace-surface-sub-header)] px-2.5 transition-colors"
            @dragstart="handlePaneDragStart($event, pane.id)"
            @dragend="handlePaneDragEnd"
            @dragenter.prevent="dragOverPaneId = pane.id"
            @dragover.prevent="dragOverPaneId = pane.id"
            @dragleave.prevent="dragOverPaneId = dragOverPaneId === pane.id ? '' : dragOverPaneId"
            @drop.prevent="handlePaneDrop(pane.id)"
          >
            <div class="flex min-w-0 items-center gap-2">
              <div class="truncate text-[13px] font-medium text-[var(--app-fg)]">
                {{ paneTitle(pane) }}
              </div>
              <UBadge
                size="xs"
                variant="subtle"
                :color="paneStatusColor(pane)"
                class="shrink-0"
              >
                {{ paneSubtitle(pane) }}
              </UBadge>
            </div>

            <div
              class="flex shrink-0 items-center gap-1.5 transition-opacity"
              :class="isActivePane(pane.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'"
            >
              <UButton
                v-if="showReconnect(pane)"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-refresh-cw"
                :aria-label="t('WorkspacePane.Reconnect')"
                @click="void reconnectSession(surfaceTabFor(pane))"
              />

              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-x"
                :aria-label="t('WorkspacePane.ClosePane')"
                @click="closePane(pane.id)"
              />
            </div>
          </header>

          <div class="relative z-[1] min-h-0 flex-1" @mousedown="focusPane(pane.id)">
            <div
              v-if="showPaneSwapHint(pane.id)"
              class="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-xl border border-dashed border-primary/50 bg-primary/6 backdrop-blur-[1px]"
            >
              <div class="rounded-full bg-[var(--workspace-surface-sub-header)] px-3 py-1 text-xs font-medium text-[var(--app-fg)] shadow-sm">
                {{ t("WorkspacePane.SwapPositionHint") }}
              </div>
            </div>
            <div
              v-if="pane.mode === 'empty'"
              class="grid h-full place-items-center p-6 text-center"
            >
              <div class="max-w-xs space-y-4">
                <div class="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[var(--workspace-surface-sub-header)] text-[var(--app-muted)]">
                  <UIcon name="i-lucide-panels-top-left" class="size-6" />
                </div>
                <div class="space-y-1">
                  <div class="text-sm font-medium text-[var(--app-fg)]">
                    {{ t("WorkspacePane.EmptyTitle") }}
                  </div>
                  <div class="text-xs text-[var(--app-muted)]">
                    {{ paneSubtitle(pane) }}
                  </div>
                </div>
                <div v-if="showEmptyActions(pane)" class="flex items-center justify-center gap-2">
                  <UButton
                    size="sm"
                    color="primary"
                    variant="soft"
                    @click="void connectCurrentPane(tab, pane)"
                  >
                    {{ t("WorkspacePane.ConnectCurrent") }}
                  </UButton>
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="soft"
                    @click="openConnectOtherModal(pane)"
                  >
                    {{ t("WorkspacePane.ConnectOther") }}
                  </UButton>
                </div>
              </div>
            </div>

            <div
              v-else-if="pane.mode === 'setup'"
              class="h-full bg-[var(--workspace-surface-background)]"
            />

            <component
              :is="surfaceComponentFor(pane)"
              v-else
              :key="surfaceInstanceKey(pane)"
              :ref="(el: unknown) => setSurfaceComponentRef(pane.id, el)"
              :tab="surfaceTabFor(pane)"
              class="h-full"
              @reconnect="void reconnectSession(surfaceTabFor(pane))"
            />
          </div>
          <div
            class="pointer-events-none absolute inset-0 z-[3] transition-colors"
            :class="isActivePane(pane.id) ? 'bg-transparent' : inactivePaneOverlayClass"
          />
        </section>
      </div>

      <WorkspaceConnectionSetupPane
        v-if="setupPane"
        :tab="surfaceTabFor(setupPane)"
        class="absolute inset-0 z-10"
      />
    </div>

    <UModal
      v-model:open="connectOtherModalOpen"
      :title="t('WorkspacePane.ConnectOther')"
      :ui="{ content: 'max-w-md' }"
    >
      <template #body>
        <div class="space-y-3">
          <div
            v-if="currentOrgLabel"
            class="flex items-center justify-between gap-2 rounded-lg bg-elevated/70 px-2.5 py-2 text-[11px] text-muted"
          >
            <span>{{ t("WorkspacePane.CurrentOrganization") }}</span>
            <span class="max-w-[220px] truncate font-medium text-default">{{ currentOrgLabel }}</span>
          </div>
          <UInput
            v-model="connectOtherSearch"
            autofocus
            icon="i-lucide-search"
            :placeholder="t('Operation.Search')"
          />
          <div class="max-h-72 overflow-y-auto rounded-lg border border-default">
            <SideBarAssetTree
              :search="connectOtherSearch"
              open
              @select="handleConnectOtherAsset"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('Common.Cancel')"
          @click="connectOtherModalOpen = false"
        />
      </template>
    </UModal>
  </div>
</template>
