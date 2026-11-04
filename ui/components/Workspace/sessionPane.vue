<script setup lang="ts">
import type { WorkspacePane, WorkspacePaneDropPlacement, WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import type { AssetItem } from "~/types";

import {
  isKokoBroadcastWorkspace,
  useKokoTerminalBroadcast,
  validateKokoTerminalBroadcast
} from "#koko/composables/terminal/useTerminalBroadcast";
import { isWorkspaceTourActive } from "~/composables/useWorkspaceTour";
import { shouldShowConnectionProgress } from "~/composables/workspaceConnectionProgress";
import { findDeclaredCapability } from "~/shared/connectors/capabilities";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { legacyWorkspaceLayout, measureWorkspaceLayout } from "~/utils/workspaceLayout";

const props = defineProps<{ tab: WorkspaceSessionTab }>();

const { t } = useI18n();
const shortcuts = useAppShortcuts();
const { open: settingsOpen } = useSettingsWindow();
const colorMode = useColorMode();
const toast = useToast();
const userInfoStore = useUserInfoStore();
const { currentUser } = storeToRefs(userInfoStore);
const paneTargetRefs = new Map<string, HTMLElement>();
const {
  activePaneId,
  activeTabId,
  canMergeTabs,
  resumeConnectionSetup,
  draggedTabId: draggedWorkspaceTabId,
  getTabById,
  placePane,
  persistPaneLayout,
  setPaneLayout,
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
const paneGrid = ref<HTMLElement | null>(null);
const paneLayout = computed(
  () =>
    props.tab.paneLayout ||
    legacyWorkspaceLayout(
      props.tab.panes.map((pane) => pane.id),
      props.tab.layoutMode,
      props.tab.threePaneSpanAxis
    )
);
const measurements = computed(() => measureWorkspaceLayout(paneLayout.value));
const resizingDivider = ref<string | null>(null);
const paneGridItemStyle = (paneId: string) => {
  const rect = measurements.value.panes.get(paneId)!;
  return { left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%` };
};
function dividerStyle(divider: (typeof measurements.value.dividers)[number]) {
  const { bounds, node } = divider;
  return node.direction === "vertical"
    ? {
        left: `${bounds.left + (bounds.width * node.ratio) / 100}%`,
        top: `${bounds.top}%`,
        height: `${bounds.height}%`
      }
    : {
        top: `${bounds.top + (bounds.height * node.ratio) / 100}%`,
        left: `${bounds.left}%`,
        width: `${bounds.width}%`
      };
}
const { broadcast, failure: broadcastFailure } = useKokoTerminalBroadcast();
watchEffect(
  () => {
    if (broadcast.value?.tabId !== props.tab.id) return;
    validateKokoTerminalBroadcast();
  },
  { flush: "sync" }
);
watch(broadcastFailure, (failure) => {
  if (failure?.tabId === props.tab.id)
    toast.add({
      title: t("TerminalBroadcast.Stopped"),
      description: t("TerminalBroadcast.StoppedHint"),
      color: "warning"
    });
});
const setupPane = computed(() => {
  const activeSetupPane = props.tab.panes.find((pane) => pane.id === activePaneId.value && pane.mode === "setup");

  return activeSetupPane || props.tab.panes.find((pane) => pane.mode === "setup");
});
const activeAclPaneId = computed(() => {
  if (!activePaneId.value || !hasScopeGroup(activePaneId.value)) return "";
  const pane = props.tab.panes.find((item) => item.id === activePaneId.value);
  if (!pane || pane.connectionProgress) return "";
  return activePaneId.value;
});
const inactivePaneOverlayClass = computed(() => (colorMode.value === "dark" ? "bg-white/4" : "bg-black/3"));
const currentOrgLabel = computed(() => currentUser.value?.org?.name || "");
const isDraggingExternalTab = computed(() =>
  Boolean(
    draggedWorkspaceTabId.value &&
    draggedWorkspaceTabId.value !== props.tab.id &&
    !isKokoBroadcastWorkspace(props.tab.id)
  )
);
const workspaceTabDropError = computed<"" | "source-split">(() => {
  if (!isDraggingExternalTab.value) return "";

  const sourceTab = getTabById(draggedWorkspaceTabId.value);
  if (!sourceTab || sourceTab.panes.length !== 1) return "source-split";
  return "";
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

function resizePanes(event: PointerEvent) {
  const divider = measurements.value.dividers.find((item) => item.path === resizingDivider.value);
  const grid = paneGrid.value;
  if (!divider || !grid) return;
  const rect = grid.getBoundingClientRect();
  const vertical = divider.node.direction === "vertical";
  const start = vertical
    ? rect.left + (rect.width * divider.bounds.left) / 100
    : rect.top + (rect.height * divider.bounds.top) / 100;
  const size = vertical ? (rect.width * divider.bounds.width) / 100 : (rect.height * divider.bounds.height) / 100;
  if (!size) return;
  divider.node.ratio = Math.min(95, Math.max(5, (((vertical ? event.clientX : event.clientY) - start) / size) * 100));
}
function beginPaneResize(path: string, event: PointerEvent) {
  if (event.button !== 0) return;
  resizingDivider.value = path;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  // Materialize a legacy layout before changing its proportions.
  setPaneLayout(props.tab.id, paneLayout.value);
  resizePanes(event);
  event.preventDefault();
  event.stopPropagation();
}
function endPaneResize(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement;
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  resizingDivider.value = null;
  persistPaneLayout(props.tab.id);
}
function resizePanesWithKeyboard(path: string, event: KeyboardEvent) {
  setPaneLayout(props.tab.id, paneLayout.value);
  const divider = measurements.value.dividers.find((item) => item.path === path);
  if (!divider) return;
  const keys = divider.node.direction === "vertical" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
  if (!keys.includes(event.key)) return;
  divider.node.ratio = Math.min(95, Math.max(5, divider.node.ratio + (event.key === keys[0] ? -2 : 2)));
  persistPaneLayout(props.tab.id);
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

function paneBroadcastLabel(paneId: string) {
  const group = broadcast.value;
  if (group?.tabId !== props.tab.id) return "";
  if (group.sourceId === paneId) return t("TerminalBroadcast.Active", { count: group.targetIds.length });
  return group.targetIds.includes(paneId) ? t("TerminalBroadcast.Receiving") : "";
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

function showEmptyActions(pane: WorkspacePane) {
  return pane.mode === "empty";
}

function isDatabaseWorkspace(pane: WorkspacePane) {
  const connectMethod = String(pane.payload?.connectMethod?.value || pane.connectMethod || "");
  return findDeclaredCapability(pane.protocol, connectMethod)?.surface === "database";
}

function showPaneDropHint(paneId: string) {
  return Boolean(
    dragOverPaneId.value === paneId &&
    ((draggedPaneId.value && draggedPaneId.value !== paneId) || isDraggingExternalTab.value)
  );
}

function paneDropHint() {
  if (workspaceTabDropError.value === "source-split") {
    return t("WorkspacePane.MergeSourceSplitDescription");
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
      return t(draggedPaneId.value ? "WorkspacePane.SwapPositionHint" : "WorkspacePane.MergeDropHint");
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

function handleEmptyPaneKeydown(event: KeyboardEvent, pane: WorkspacePane) {
  if (event.key !== "Enter") return;
  if (
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    pane.mode !== "empty" ||
    !isActivePane(pane.id) ||
    shortcuts.blocked(event)
  ) {
    event.preventDefault();
    return;
  }
  if (!event.shiftKey) return;
  event.preventDefault();
  event.stopPropagation();
  openConnectOtherModal(pane);
}

watch(
  () =>
    activeTabId.value === props.tab.id
      ? props.tab.panes.find((pane) => pane.id === activePaneId.value && pane.mode === "empty")?.id
      : undefined,
  async (paneId) => {
    if (!paneId || typeof document === "undefined") return;
    await nextTick();
    if (
      !isActivePane(paneId) ||
      connectOtherModalOpen.value ||
      settingsOpen.value ||
      isWorkspaceTourActive() ||
      document.activeElement?.closest('[role="dialog"], [role="alertdialog"]')
    )
      return;
    const button = [...(paneGrid.value?.querySelectorAll<HTMLButtonElement>("[data-connect-current]") || [])].find(
      (button) => button.dataset.connectCurrent === paneId
    );
    if (button?.getClientRects().length) button.focus({ preventScroll: true });
  },
  { flush: "post", immediate: true }
);

function handleConnectOtherAsset(asset: AssetItem) {
  const pane = props.tab.panes.find((item) => item.id === connectOtherPaneId.value);
  if (!pane) return;

  connectOtherPane(props.tab, pane, asset);
  connectOtherModalOpen.value = false;
}

function resetDropTarget() {
  dragOverPaneId.value = "";
  dragOverPanePlacement.value = "center";
}

function resetWorkspaceTabDrag() {
  draggedPaneId.value = "";
  draggedWorkspaceTabId.value = "";
  dragOverWorkspace.value = false;
  resetDropTarget();
}

function handlePaneDragStart(event: DragEvent, paneId: string) {
  resetWorkspaceTabDrag();
  draggedPaneId.value = paneId;
  event.dataTransfer?.setData("application/x-workspace-pane", paneId);
  event.dataTransfer?.setData("application/x-workspace-tab", props.tab.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  focusPane(paneId);
}

function movePaneWithKeyboard(paneId: string, event: KeyboardEvent) {
  const placement = (
    { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "top", ArrowDown: "bottom" } as Record<
      string,
      WorkspacePaneDropPlacement
    >
  )[event.key];
  if (!placement) return;
  const source = measurements.value.panes.get(paneId);
  if (!source) return;
  const horizontal = placement === "left" || placement === "right";
  const backwards = placement === "left" || placement === "top";
  const axisCenter = (rect: NonNullable<typeof source>) =>
    horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
  const crossCenter = (rect: NonNullable<typeof source>) =>
    horizontal ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
  const overlaps = (rect: NonNullable<typeof source>) =>
    horizontal
      ? Math.min(rect.top + rect.height, source.top + source.height) > Math.max(rect.top, source.top)
      : Math.min(rect.left + rect.width, source.left + source.width) > Math.max(rect.left, source.left);
  const targets = [...measurements.value.panes].filter(
    ([id, rect]) =>
      id !== paneId &&
      overlaps(rect) &&
      (backwards ? axisCenter(rect) < axisCenter(source) : axisCenter(rect) > axisCenter(source))
  );
  targets.sort(
    ([, a], [, b]) =>
      Math.hypot(axisCenter(a) - axisCenter(source), crossCenter(a) - crossCenter(source)) -
      Math.hypot(axisCenter(b) - axisCenter(source), crossCenter(b) - crossCenter(source))
  );
  if (targets[0]) placePane(props.tab.id, paneId, targets[0][0], placement);
  event.preventDefault();
  event.stopPropagation();
}

function resolvePaneDropPlacement(event: DragEvent): WorkspacePaneDropPlacement {
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
  if (!(draggedPaneId.value && draggedPaneId.value !== targetPaneId) && !isDraggingExternalTab.value) {
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

  if (!canMergeTabs(sourceTabId, props.tab.id)) return;

  void mergeWorkspaceTabIntoCurrent(sourceTabId, props.tab.id, targetPaneId, placement);
}

function handlePaneDrop(event: DragEvent, targetPaneId: string) {
  const placement = resolvePaneDropPlacement(event);
  const sourcePaneId = draggedPaneId.value;
  const sourceTabId = draggedWorkspaceTabId.value;
  resetWorkspaceTabDrag();
  if (sourcePaneId) placePane(props.tab.id, sourcePaneId, targetPaneId, placement);
  else if (sourceTabId) mergeWorkspaceTab(sourceTabId, targetPaneId, placement);
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
        class="relative h-full min-h-0 bg-[var(--workspace-surface-border)]"
        :class="[
          isDraggingExternalTab ? 'relative z-20' : '',
          dragOverWorkspace ? 'ring-2 ring-inset ring-primary/40' : ''
        ]"
        @dragover.prevent="handleWorkspaceDragOver"
        @drop.prevent="handleWorkspaceDrop"
      >
        <section
          v-for="pane in tab.panes"
          :key="pane.id"
          :data-pane-id="pane.id"
          class="group absolute flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--workspace-surface-sub-panel)] transition-[box-shadow]"
          :style="paneGridItemStyle(pane.id)"
          :class="[
            showPaneDropHint(pane.id)
              ? 'ring-2 ring-inset ring-primary/50 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.18)]'
              : ''
          ]"
        >
          <UTooltip v-if="tab.panes.length > 1" :text="t('WorkspacePane.MovePaneHint')">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-grip-vertical"
              draggable="true"
              class="absolute right-1 top-1 z-[6] size-5 cursor-grab justify-center p-0 text-(--app-muted) bg-(--workspace-surface-sub-header) opacity-0 group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
              :class="
                isDraggingExternalTab || (draggedPaneId && draggedPaneId !== pane.id) ? 'pointer-events-none' : ''
              "
              :aria-label="`${t('WorkspacePane.MovePane')}: ${paneTitle(pane)}`"
              aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
              :ui="{ leadingIcon: 'size-3.5' }"
              @click.stop="focusPane(pane.id)"
              @focus="setActivePane(pane.id)"
              @mousedown.stop
              @dragstart.stop="handlePaneDragStart($event, pane.id)"
              @dragend="resetWorkspaceTabDrag"
              @keydown="movePaneWithKeyboard(pane.id, $event)"
            />
          </UTooltip>
          <div
            v-if="tab.panes.length > 1"
            data-slot="pane-title"
            class="pointer-events-none absolute right-7 top-1 z-[4] max-w-[calc(100%-2rem)]"
            :role="paneBroadcastLabel(pane.id) ? 'status' : undefined"
          >
            <UBadge
              size="xs"
              :color="paneBroadcastLabel(pane.id) ? 'warning' : 'neutral'"
              variant="subtle"
              class="max-w-full"
              :class="paneBroadcastLabel(pane.id) ? 'opacity-80' : 'opacity-60'"
            >
              <span class="truncate">
                {{ paneTitle(pane) }}
                <template v-if="paneBroadcastLabel(pane.id)">· {{ paneBroadcastLabel(pane.id) }}</template>
              </span>
            </UBadge>
          </div>

          <div class="relative z-[1] min-h-0 flex-1" @mousedown="focusPane(pane.id)">
            <div
              v-if="pane.mode === 'empty'"
              class="grid h-full place-items-center p-6 text-center"
              @keydown="handleEmptyPaneKeydown($event, pane)"
            >
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
                <div v-if="showEmptyActions(pane)" class="flex flex-wrap items-center justify-center gap-2">
                  <UButton
                    size="sm"
                    color="primary"
                    variant="soft"
                    :data-connect-current="pane.id"
                    aria-keyshortcuts="Enter"
                    @click="void connectCurrentPane(tab, pane)"
                  >
                    {{ t("WorkspacePane.ConnectCurrent") }}
                    <UKbd value="enter" size="sm" />
                  </UButton>
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="soft"
                    aria-keyshortcuts="Shift+Enter"
                    @click="openConnectOtherModal(pane)"
                  >
                    {{ t("WorkspacePane.ConnectOther") }}
                    <span class="flex items-center gap-px">
                      <UKbd value="shift" size="sm" />
                      <UKbd value="enter" size="sm" />
                    </span>
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
            :data-pane-drop-target="pane.id"
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
          <Transition
            enter-from-class="opacity-0"
            enter-active-class="transition-opacity duration-500"
            leave-active-class="transition-opacity duration-500 ease-out"
            leave-to-class="opacity-0"
          >
            <WorkspaceConnectionProgressOverlay
              v-if="
                pane.connectionProgress &&
                pane.mode !== 'setup' &&
                shouldShowConnectionProgress(pane, hasScopeGroup(pane.id))
              "
              :pane-id="pane.id"
              :stage="pane.connectionProgress"
              :dismissible="pane.connectionFailureDismissible"
              :error="
                pane.status === 'connecting' || pane.status === 'connected' || pane.status === 'ready'
                  ? undefined
                  : pane.connectionFailure ||
                    (pane.status === 'disconnected' ? t('ConnectError.SessionClosed') : undefined)
              "
              @cancel="resumeConnectionSetup(pane.id)"
              @edit="resumeConnectionSetup(pane.id)"
              @reconnect="void reconnectSession(surfaceTabFor(pane))"
            />
          </Transition>
        </section>
      </div>

      <div
        v-for="divider in measurements.dividers"
        :key="divider.path"
        role="separator"
        tabindex="0"
        :aria-orientation="divider.node.direction === 'vertical' ? 'vertical' : 'horizontal'"
        :aria-label="
          t(divider.node.direction === 'vertical' ? 'WorkspacePane.ResizeColumns' : 'WorkspacePane.ResizeRows')
        "
        :aria-valuenow="Math.round(divider.node.ratio)"
        :aria-valuemin="5"
        :aria-valuemax="95"
        class="group absolute z-[5] touch-none outline-none"
        :class="
          divider.node.direction === 'vertical'
            ? 'w-2 -translate-x-1/2 cursor-col-resize'
            : 'h-2 -translate-y-1/2 cursor-row-resize'
        "
        :style="dividerStyle(divider)"
        @pointerdown="beginPaneResize(divider.path, $event)"
        @pointermove="resizePanes"
        @pointerup="endPaneResize"
        @pointercancel="endPaneResize"
        @keydown="resizePanesWithKeyboard(divider.path, $event)"
      >
        <span
          class="absolute transition-colors group-hover:bg-[var(--app-border)] group-focus-visible:bg-[var(--app-focus-ring)]"
          :class="[
            divider.node.direction === 'vertical'
              ? 'inset-y-0 left-1/2 w-px -translate-x-1/2'
              : 'inset-x-0 top-1/2 h-px -translate-y-1/2',
            resizingDivider === divider.path ? 'bg-[var(--app-focus-ring)]' : 'bg-[var(--workspace-surface-border)]'
          ]"
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
