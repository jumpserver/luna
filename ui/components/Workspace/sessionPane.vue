<script setup lang="ts">
import type { WorkspacePane, WorkspacePaneDropPlacement, WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import type { AssetItem } from "~/types";

import { findDeclaredCapability } from "~/shared/connectors/capabilities";
import { useUserInfoStore } from "~/store/modules/userInfo";

const props = defineProps<{ tab: WorkspaceSessionTab }>();

const { t } = useI18n();
const colorMode = useColorMode();
const toast = useToast();
const userInfoStore = useUserInfoStore();
const { currentUser } = storeToRefs(userInfoStore);
const paneTargetRefs = new Map<string, HTMLElement>();
const {
  activePaneId,
  activeTabId,
  canMergeTabs,
  closePane,
  draggedTabId: draggedWorkspaceTabId,
  getTabById,
  placePane,
  setActivePane,
  toSurfaceTab
} = useWorkspaceTabs();
const { focusPaneSurface, registerPaneTarget, unregisterPaneTarget } = useWorkspacePaneSurfaceRegistry();
const { hasScopeGroup } = useAclDialog();
const { connectCurrentPane, connectOtherPane, mergeWorkspaceTabIntoCurrent, reconnectSession } = useWorkspaceTabMenu();
const draggedPaneId = ref("");
const dragOverPaneId = ref("");
const dragOverPanePlacement = ref<WorkspacePaneDropPlacement>("center");
const dragOverWorkspace = ref(false);
const connectOtherModalOpen = ref(false);
const connectOtherSearch = ref("");
const connectOtherPaneId = ref("");
const PANE_EDGE_DROP_THRESHOLD = 0.3;
const PANE_MIN_RATIO = 20;
const PANE_RESIZE_STEP = 2;
type PaneResizeAxis = "columns" | "rows";

const paneGrid = ref<HTMLElement | null>(null);
const resizingAxis = ref<PaneResizeAxis | "">("");
const paneSplitRatios = reactive<Record<string, Record<PaneResizeAxis, number>>>({});
watch(
  () => props.tab.id,
  (tabId) => {
    paneSplitRatios[tabId] ||= { columns: 50, rows: 50 };
  },
  { immediate: true }
);
const paneRatios = computed(() => paneSplitRatios[props.tab.id]!);
const hasColumnDivider = computed(() => props.tab.layoutMode === "columns-2" || props.tab.layoutMode === "grid-2x2");
const hasRowDivider = computed(() => props.tab.layoutMode === "rows-2" || props.tab.layoutMode === "grid-2x2");
const paneGridStyle = computed(() => ({
  gridTemplateColumns: hasColumnDivider.value
    ? `minmax(0, ${paneRatios.value.columns}fr) minmax(0, ${100 - paneRatios.value.columns}fr)`
    : "minmax(0, 1fr)",
  gridTemplateRows: hasRowDivider.value
    ? `minmax(0, ${paneRatios.value.rows}fr) minmax(0, ${100 - paneRatios.value.rows}fr)`
    : "minmax(0, 1fr)"
}));
const hasThreePanes = computed(() => props.tab.layoutMode === "grid-2x2" && props.tab.panes.length === 3);
const threePaneSpanAxis = computed(() => props.tab.threePaneSpanAxis || "rows");
const columnDividerStyle = computed(() => ({
  left: `${paneRatios.value.columns}%`,
  top: hasThreePanes.value && threePaneSpanAxis.value === "columns" ? `${paneRatios.value.rows}%` : "0"
}));
const rowDividerStyle = computed(() => ({
  left: hasThreePanes.value && threePaneSpanAxis.value === "rows" ? `${paneRatios.value.columns}%` : "0",
  top: `${paneRatios.value.rows}%`
}));

function paneGridItemStyle(index: number) {
  if (!hasThreePanes.value || index !== 0) return;
  return threePaneSpanAxis.value === "columns" ? { gridColumn: "1 / span 2" } : { gridRow: "1 / span 2" };
}
const setupPane = computed(() => {
  const activeSetupPane = props.tab.panes.find((pane) => pane.id === activePaneId.value && pane.mode === "setup");

  return activeSetupPane || props.tab.panes.find((pane) => pane.mode === "setup");
});
const activeAclPaneId = computed(() =>
  activePaneId.value && hasScopeGroup(activePaneId.value) ? activePaneId.value : ""
);
const showPaneHeaders = computed(() => props.tab.panes.length > 1);
const inactivePaneOverlayClass = computed(() => (colorMode.value === "dark" ? "bg-white/4" : "bg-black/3"));
const currentOrgLabel = computed(() => currentUser.value?.org?.name || "");
const isDraggingExternalTab = computed(() =>
  Boolean(draggedWorkspaceTabId.value && draggedWorkspaceTabId.value !== props.tab.id)
);
const workspaceTabDropError = computed<"" | "source-split" | "limit">(() => {
  if (!isDraggingExternalTab.value) return "";

  const sourceTab = getTabById(draggedWorkspaceTabId.value);
  if (!sourceTab || sourceTab.panes.length !== 1) return "source-split";
  return props.tab.panes.length >= 4 ? "limit" : "";
});

function setPaneSurfaceTarget(paneId: string, element: unknown) {
  const previousTarget = paneTargetRefs.get(paneId);
  const target = element as HTMLElement | null;
  if (target) {
    paneTargetRefs.set(paneId, target);
    registerPaneTarget(paneId, target);
    return;
  }

  if (!previousTarget) return;
  unregisterPaneTarget(paneId, previousTarget);
  paneTargetRefs.delete(paneId);
}

function focusPane(paneId: string) {
  setActivePane(paneId);
  focusPaneSurface(paneId);
}

function setPaneRatio(axis: PaneResizeAxis, ratio: number) {
  paneRatios.value[axis] = Math.min(100 - PANE_MIN_RATIO, Math.max(PANE_MIN_RATIO, ratio));
}

function resizePanes(event: PointerEvent) {
  const axis = resizingAxis.value;
  const grid = paneGrid.value;
  if (!axis || !grid) return;

  const bounds = grid.getBoundingClientRect();
  const ratio =
    axis === "columns"
      ? ((event.clientX - bounds.left) / bounds.width) * 100
      : ((event.clientY - bounds.top) / bounds.height) * 100;
  setPaneRatio(axis, ratio);
}

function beginPaneResize(axis: PaneResizeAxis, event: PointerEvent) {
  if (event.button !== 0) return;
  resizingAxis.value = axis;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  resizePanes(event);
  event.preventDefault();
  event.stopPropagation();
}

function endPaneResize(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement;
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  resizingAxis.value = "";
}

function resizePanesWithKeyboard(axis: PaneResizeAxis, event: KeyboardEvent) {
  const delta =
    axis === "columns"
      ? event.key === "ArrowLeft"
        ? -PANE_RESIZE_STEP
        : event.key === "ArrowRight"
          ? PANE_RESIZE_STEP
          : 0
      : event.key === "ArrowUp"
        ? -PANE_RESIZE_STEP
        : event.key === "ArrowDown"
          ? PANE_RESIZE_STEP
          : 0;
  if (!delta) return;
  setPaneRatio(axis, paneRatios.value[axis] + delta);
  event.preventDefault();
}

function surfaceTabFor(pane: WorkspacePane) {
  return toSurfaceTab(pane);
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

function isDatabaseWorkspace(pane: WorkspacePane) {
  const connectMethod = String(pane.payload?.connectMethod?.value || pane.connectMethod || "");
  return findDeclaredCapability(pane.protocol, connectMethod)?.surface === "database";
}

function showPaneDropHint(paneId: string) {
  const paneCanMoveHere = draggedPaneId.value && draggedPaneId.value !== paneId;
  return Boolean(dragOverPaneId.value === paneId && (paneCanMoveHere || isDraggingExternalTab.value));
}

function paneDropHint() {
  if (workspaceTabDropError.value === "source-split") {
    return t("WorkspacePane.MergeSourceSplitDescription");
  }
  if (workspaceTabDropError.value === "limit") {
    return t("WorkspacePane.MergeLimitDescription");
  }

  switch (dragOverPanePlacement.value) {
    case "left":
      return t("WorkspacePane.PlaceLeftHint");
    case "right":
      return t("WorkspacePane.PlaceRightHint");
    case "top":
      return t("WorkspacePane.PlaceTopHint");
    case "bottom":
      return t("WorkspacePane.PlaceBottomHint");
    default:
      return isDraggingExternalTab.value ? t("WorkspacePane.MergeDropHint") : t("WorkspacePane.SwapPositionHint");
  }
}

function paneDropOverlayClass() {
  if (workspaceTabDropError.value) return "inset-3";

  switch (dragOverPanePlacement.value) {
    case "left":
      return "inset-y-3 left-3 w-[calc(50%_-_0.875rem)]";
    case "right":
      return "inset-y-3 right-3 w-[calc(50%_-_0.875rem)]";
    case "top":
      return "inset-x-3 top-3 h-[calc(50%_-_0.875rem)]";
    case "bottom":
      return "inset-x-3 bottom-3 h-[calc(50%_-_0.875rem)]";
    default:
      return "inset-3";
  }
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

function resetDropTarget() {
  dragOverPaneId.value = "";
  dragOverPanePlacement.value = "center";
}

function resetWorkspaceTabDrag() {
  draggedWorkspaceTabId.value = "";
  dragOverWorkspace.value = false;
  resetDropTarget();
}

function handlePaneDragEnd() {
  draggedPaneId.value = "";
  resetDropTarget();
}

function resolvePaneDropPlacement(event: DragEvent): WorkspacePaneDropPlacement {
  if (draggedPaneId.value && props.tab.panes.length !== 2) return "center";

  const target = event.currentTarget as HTMLElement | null;
  if (!target) return "center";

  const rect = target.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  const edges: Array<{
    placement: WorkspacePaneDropPlacement;
    distance: number;
  }> = [
    { placement: "left", distance: x },
    { placement: "right", distance: 1 - x },
    { placement: "top", distance: y },
    { placement: "bottom", distance: 1 - y }
  ];
  const nearestEdge = edges.reduce((nearest, edge) => (edge.distance < nearest.distance ? edge : nearest));

  return nearestEdge.distance <= PANE_EDGE_DROP_THRESHOLD ? nearestEdge.placement : "center";
}

function handlePaneDragOver(event: DragEvent, targetPaneId: string) {
  const movingPane = draggedPaneId.value && draggedPaneId.value !== targetPaneId;
  if (!movingPane && !isDraggingExternalTab.value) {
    resetDropTarget();
    return;
  }

  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  if (isDraggingExternalTab.value) dragOverWorkspace.value = true;
  dragOverPaneId.value = targetPaneId;
  dragOverPanePlacement.value = resolvePaneDropPlacement(event);
}

function handlePaneDragLeave(event: DragEvent, targetPaneId: string) {
  const target = event.currentTarget as HTMLElement | null;
  const relatedTarget = event.relatedTarget as Node | null;
  if (target && relatedTarget && target.contains(relatedTarget)) return;
  if (dragOverPaneId.value !== targetPaneId) return;

  resetDropTarget();
}

function mergeWorkspaceTab(sourceTabId: string, targetPaneId: string, placement: WorkspacePaneDropPlacement) {
  const sourceTab = getTabById(sourceTabId);
  if (!sourceTab || sourceTab.panes.length !== 1) {
    toast.add({
      title: t("WorkspacePane.MergeSourceSplitTitle"),
      description: t("WorkspacePane.MergeSourceSplitDescription"),
      color: "warning",
      icon: "i-lucide-circle-alert"
    });
    return;
  }

  if (!canMergeTabs(sourceTabId, props.tab.id)) {
    toast.add({
      title: t("WorkspacePane.SplitLimitTitle"),
      description: t("WorkspacePane.MergeLimitDescription"),
      color: "warning",
      icon: "i-lucide-circle-alert"
    });
    return;
  }

  void mergeWorkspaceTabIntoCurrent(sourceTabId, props.tab.id, targetPaneId, placement);
}

function handlePaneDrop(event: DragEvent, targetPaneId: string) {
  const placement = resolvePaneDropPlacement(event);
  if (draggedPaneId.value && draggedPaneId.value !== targetPaneId) {
    placePane(props.tab.id, draggedPaneId.value, targetPaneId, placement);
    resetDropTarget();
    return;
  }

  const sourceTabId = draggedWorkspaceTabId.value;
  resetWorkspaceTabDrag();
  if (sourceTabId) mergeWorkspaceTab(sourceTabId, targetPaneId, placement);
}

function handleWorkspaceDragOver(event: DragEvent) {
  const paneId = event.dataTransfer?.getData("application/x-workspace-pane");
  const tabId = event.dataTransfer?.getData("application/x-workspace-tab");
  if (paneId || !tabId || tabId === props.tab.id) return;

  draggedWorkspaceTabId.value = tabId;
  dragOverWorkspace.value = true;
}

function handleWorkspaceDrop(event: DragEvent) {
  const paneId = event.dataTransfer?.getData("application/x-workspace-pane");
  const sourceTabId = event.dataTransfer?.getData("application/x-workspace-tab");
  const targetPaneId = props.tab.panes.some((pane) => pane.id === activePaneId.value)
    ? activePaneId.value
    : props.tab.panes[0]?.id || "";
  resetWorkspaceTabDrag();
  if (paneId || !sourceTabId || sourceTabId === props.tab.id) return;

  mergeWorkspaceTab(sourceTabId, targetPaneId, "center");
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

onMounted(() => {
  window.addEventListener("dragend", resetWorkspaceTabDrag);
});

onBeforeUnmount(() => {
  window.removeEventListener("dragend", resetWorkspaceTabDrag);
  for (const [paneId, target] of paneTargetRefs) {
    unregisterPaneTarget(paneId, target);
  }
  paneTargetRefs.clear();
});
</script>

<template>
  <div class="h-full min-h-0 w-full overflow-hidden">
    <div class="relative h-full min-h-0">
      <div
        ref="paneGrid"
        class="grid h-full min-h-0 gap-px bg-[var(--workspace-surface-sub-border)]"
        :style="paneGridStyle"
        :class="[
          isDraggingExternalTab ? 'relative z-20' : '',
          dragOverWorkspace ? 'ring-2 ring-inset ring-primary/40' : ''
        ]"
        @dragover.prevent="handleWorkspaceDragOver"
        @drop.prevent="handleWorkspaceDrop"
      >
        <section
          v-for="(pane, paneIndex) in tab.panes"
          :key="pane.id"
          class="group relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--workspace-surface-sub-panel)] transition-[box-shadow]"
          :style="paneGridItemStyle(paneIndex)"
          :class="[
            showPaneDropHint(pane.id)
              ? 'ring-2 ring-inset ring-primary/50 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.18)]'
              : ''
          ]"
        >
          <header
            v-if="showPaneHeaders"
            draggable="true"
            class="relative z-[2] flex h-9 shrink-0 items-center justify-between gap-3 border-b border-[var(--workspace-surface-sub-border)] bg-[var(--workspace-surface-sub-header)] px-2.5 transition-colors"
            @dragstart="handlePaneDragStart($event, pane.id)"
            @dragend="handlePaneDragEnd"
          >
            <div class="flex min-w-0 items-center gap-2">
              <div class="truncate text-[13px] font-medium text-[var(--app-fg)]">
                {{ paneTitle(pane) }}
              </div>
              <UBadge size="xs" variant="subtle" :color="paneStatusColor(pane)" class="shrink-0">
                {{ paneSubtitle(pane) }}
              </UBadge>
            </div>

            <div
              class="flex shrink-0 items-center gap-1 transition-opacity"
              :class="
                isActivePane(pane.id)
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
              "
            >
              <UButton
                v-if="showReconnect(pane)"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-refresh-cw"
                class="size-6 justify-center rounded-lg p-0 text-muted hover:bg-[var(--app-hover-strong)] hover:text-highlighted"
                :ui="{ leadingIcon: 'm-0 size-3.5' }"
                :aria-label="t('WorkspacePane.Reconnect')"
                @click="void reconnectSession(surfaceTabFor(pane))"
              />

              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-x"
                class="size-6 justify-center rounded-lg p-0 text-muted hover:bg-[var(--app-hover-strong)] hover:text-highlighted"
                :ui="{ leadingIcon: 'm-0 size-3.5' }"
                :aria-label="t('WorkspacePane.ClosePane')"
                @click="closePane(pane.id)"
              />
            </div>
          </header>

          <div class="relative z-[1] min-h-0 flex-1" @mousedown="focusPane(pane.id)">
            <div v-if="pane.mode === 'empty'" class="grid h-full place-items-center p-6 text-center">
              <div class="max-w-xs space-y-4">
                <div
                  class="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[var(--workspace-surface-sub-header)] text-[var(--app-muted)]"
                >
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
                  <UButton size="sm" color="primary" variant="soft" @click="void connectCurrentPane(tab, pane)">
                    {{ t("WorkspacePane.ConnectCurrent") }}
                  </UButton>
                  <UButton size="sm" color="neutral" variant="soft" @click="openConnectOtherModal(pane)">
                    {{ t("WorkspacePane.ConnectOther") }}
                  </UButton>
                </div>
              </div>
            </div>

            <div v-else-if="pane.mode === 'setup'" class="h-full bg-[var(--workspace-surface-background)]" />

            <div v-else :ref="(el: unknown) => setPaneSurfaceTarget(pane.id, el)" class="h-full">
              <div
                v-if="
                  pane.protocol !== 'local-shell' &&
                  pane.protocol !== 'script-editor' &&
                  !isDatabaseWorkspace(pane) &&
                  !pane.payload?.id &&
                  !pane.payload?.token?.id &&
                  !pane.payload?.webUrl
                "
                class="grid h-full place-items-center"
              >
                <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-[var(--app-muted)]" />
              </div>
            </div>
          </div>
          <div
            class="pointer-events-none absolute inset-0 z-[3] transition-colors"
            :class="isActivePane(pane.id) ? 'bg-transparent' : inactivePaneOverlayClass"
          />
          <div
            v-if="(draggedPaneId && draggedPaneId !== pane.id) || isDraggingExternalTab"
            class="absolute inset-0 z-[4]"
            @dragover.prevent="handlePaneDragOver($event, pane.id)"
            @dragleave="handlePaneDragLeave($event, pane.id)"
            @drop.stop.prevent="handlePaneDrop($event, pane.id)"
          >
            <div
              v-if="showPaneDropHint(pane.id)"
              class="pointer-events-none absolute flex items-center justify-center rounded-xl border border-dashed border-primary/50 bg-primary/10 backdrop-blur-[1px] transition-[inset,width,height]"
              :class="paneDropOverlayClass()"
            >
              <div
                class="rounded-full bg-[var(--workspace-surface-sub-header)] px-3 py-1 text-xs font-medium text-[var(--app-fg)] shadow-sm"
              >
                {{ paneDropHint() }}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div
        v-if="hasColumnDivider"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        :aria-label="t('WorkspacePane.ResizeColumns')"
        :aria-valuenow="Math.round(paneRatios.columns)"
        aria-valuemin="20"
        aria-valuemax="80"
        class="group absolute bottom-0 z-[5] w-2 -translate-x-1/2 cursor-col-resize touch-none outline-none"
        :style="columnDividerStyle"
        @pointerdown="beginPaneResize('columns', $event)"
        @pointermove="resizePanes"
        @pointerup="endPaneResize"
        @pointercancel="endPaneResize"
        @keydown="resizePanesWithKeyboard('columns', $event)"
      >
        <span
          class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors group-hover:bg-primary/70 group-focus-visible:bg-primary"
          :class="resizingAxis === 'columns' ? 'bg-primary' : 'bg-transparent'"
        />
      </div>

      <div
        v-if="hasRowDivider"
        role="separator"
        tabindex="0"
        aria-orientation="horizontal"
        :aria-label="t('WorkspacePane.ResizeRows')"
        :aria-valuenow="Math.round(paneRatios.rows)"
        aria-valuemin="20"
        aria-valuemax="80"
        class="group absolute right-0 z-[5] h-2 -translate-y-1/2 cursor-row-resize touch-none outline-none"
        :style="rowDividerStyle"
        @pointerdown="beginPaneResize('rows', $event)"
        @pointermove="resizePanes"
        @pointerup="endPaneResize"
        @pointercancel="endPaneResize"
        @keydown="resizePanesWithKeyboard('rows', $event)"
      >
        <span
          class="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 transition-colors group-hover:bg-primary/70 group-focus-visible:bg-primary"
          :class="resizingAxis === 'rows' ? 'bg-primary' : 'bg-transparent'"
        />
      </div>

      <WorkspaceAclPaneHost v-if="activeAclPaneId" :scope-id="activeAclPaneId" />

      <WorkspaceConnectionSetupPane v-if="setupPane" :tab="surfaceTabFor(setupPane)" class="absolute inset-0 z-10" />
    </div>

    <UModal v-model:open="connectOtherModalOpen" :title="t('WorkspacePane.ConnectOther')" :ui="{ content: 'max-w-md' }">
      <template #body>
        <div class="space-y-3">
          <div
            v-if="currentOrgLabel"
            class="flex items-center justify-between gap-2 rounded-lg bg-elevated/70 px-2.5 py-2 text-[11px] text-muted"
          >
            <span>{{ t("WorkspacePane.CurrentOrganization") }}</span>
            <span class="max-w-[220px] truncate font-medium text-default">{{ currentOrgLabel }}</span>
          </div>
          <UInput v-model="connectOtherSearch" autofocus icon="i-lucide-search" :placeholder="t('Operation.Search')" />
          <div class="max-h-72 overflow-y-auto rounded-lg border border-default">
            <SideBarAssetTree :search="connectOtherSearch" open @select="handleConnectOtherAsset" />
          </div>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" :label="t('Common.Cancel')" @click="connectOtherModalOpen = false" />
      </template>
    </UModal>
  </div>
</template>
