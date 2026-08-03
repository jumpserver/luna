<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

import { useUserInfoStore } from "~/store/modules/userInfo";
import { resolveAssetIconFromFields } from "~/utils/assetIcon";

const { t } = useI18n();
const colorMode = useColorMode();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);
const showAddSession = computed(() => loggedIn.value || isTauriRuntime());
const {
  activeTabId,
  tabs,
  activateAdjacentSession,
  canSplitWorkspace,
  draggedTabId,
  reorderTabs,
  renameTabTitle,
  closeAllSessions,
  closeLeftSessions,
  closeOtherSessions,
  closeRightSessions,
  closeSession,
  setActiveSession
} = useWorkspaceTabs();
const { cloneSession, reconnectSession, splitSession } = useWorkspaceTabMenu();

const tabStripRef = ref<HTMLElement | null>(null);
const hasOverflow = ref(false);
const hasLeftHidden = ref(false);
const hasRightHidden = ref(false);
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextMenuTab = ref<WorkspaceSessionTab | null>(null);
const contextMenuTabIndex = ref(-1);
const dragOverTabId = ref("");
const dragOverTabPlacement = ref<"before" | "after">("before");
const renameModalOpen = ref(false);
const renameTabId = ref("");
const renameValue = ref("");

const { activeTab } = useWorkspaceTabs();
const isDarkTabTheme = computed(() => colorMode.value === "dark");
const brokenTabIcons = ref(new Set<string>());
const renameDisabled = computed(() => {
  const target = tabs.value.find((tab) => tab.id === renameTabId.value);
  const current = (target?.title || target?.assetName || "").trim();
  const next = renameValue.value.trim();
  return !target || !next || next === current;
});

function tabIcon(tab: WorkspaceSessionTab) {
  return resolveAssetIconFromFields({
    type: tab.assetType,
    platform: tab.assetPlatform,
    category: tab.assetCategory
  });
}

function showTabIconImage(tab: WorkspaceSessionTab) {
  return Boolean(tabIcon(tab).src) && !brokenTabIcons.value.has(tab.id);
}

function markTabIconBroken(tabId: string) {
  brokenTabIcons.value.add(tabId);
}

function tabDisplayTitle(tab: WorkspaceSessionTab) {
  return tab.title || tab.assetName || "Untitled";
}

const tabDropdownUi = {
  content: "w-48 p-1",
  item: "gap-2 items-center",
  itemLeadingIcon: "size-4 w-4 shrink-0 text-[var(--app-muted)]",
  itemWrapper: "min-w-0 flex-1",
  itemLabel: "min-w-0"
};

const TAB_MENU_ICON_PLACEHOLDER = "i-lucide-circle";

function tabMenuItem(item: DropdownMenuItem, icon?: string): DropdownMenuItem {
  if (!icon) {
    return {
      ...item,
      icon: TAB_MENU_ICON_PLACEHOLDER,
      ui: {
        itemLeadingIcon: "size-4 w-4 shrink-0 opacity-0 pointer-events-none"
      }
    };
  }

  return {
    ...item,
    icon,
    ui: {
      itemLeadingIcon: "size-4 w-4 shrink-0 text-[var(--app-muted)]"
    }
  };
}

function hideContextMenu() {
  contextMenuVisible.value = false;
  contextMenuTab.value = null;
  contextMenuTabIndex.value = -1;
}

function openRenameModal(tab: WorkspaceSessionTab) {
  hideContextMenu();
  renameTabId.value = tab.id;
  renameValue.value = tab.title || tab.assetName || "";
  renameModalOpen.value = true;
}

function submitRename() {
  if (renameDisabled.value) return;
  renameTabTitle(renameTabId.value, renameValue.value);
  renameModalOpen.value = false;
}

function updateRenameModal(open: boolean) {
  renameModalOpen.value = open;
  if (!open) {
    renameTabId.value = "";
    renameValue.value = "";
  }
}

function handleTabDragStart(event: DragEvent, tabId: string) {
  draggedTabId.value = tabId;
  event.dataTransfer?.setData("application/x-workspace-tab", tabId);
  event.dataTransfer?.setData("text/plain", tabId);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function handleTabDragEnd() {
  draggedTabId.value = "";
  dragOverTabId.value = "";
  dragOverTabPlacement.value = "before";
}

function handleTabDragOver(event: DragEvent, targetTabId: string) {
  const currentTarget = event.currentTarget as HTMLElement | null;
  if (!currentTarget) return;

  const rect = currentTarget.getBoundingClientRect();
  const midpoint = rect.left + rect.width / 2;
  dragOverTabId.value = targetTabId;
  dragOverTabPlacement.value = event.clientX >= midpoint ? "after" : "before";
}

function handleTabDrop(targetTabId: string) {
  if (!draggedTabId.value || draggedTabId.value === targetTabId) {
    dragOverTabId.value = "";
    return;
  }
  reorderTabs(draggedTabId.value, targetTabId, dragOverTabPlacement.value);
  dragOverTabId.value = "";
  dragOverTabPlacement.value = "before";
}

function openContextMenu(tab: WorkspaceSessionTab, index: number, event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();

  contextMenuTab.value = tab;
  contextMenuTabIndex.value = index;
  contextMenuPosition.value = { x: event.clientX, y: event.clientY };
  contextMenuVisible.value = true;
}

const contextMenuItems = computed<DropdownMenuItem[]>(() => {
  const tab = contextMenuTab.value;
  const index = contextMenuTabIndex.value;
  if (!tab || index < 0) return [];

  const hasToken = Boolean(tab.payload?.id || tab.payload?.token?.id);
  const canSplitVertically = canSplitWorkspace(tab.id, "vertical");
  const canSplitHorizontally = canSplitWorkspace(tab.id, "horizontal");

  return [
    tabMenuItem(
      {
        label: t("TabMenu.CloneConnect"),
        disabled: !hasToken,
        onSelect: () => {
          hideContextMenu();
          void cloneSession(tab);
        }
      },
      "i-lucide-copy"
    ),
    tabMenuItem(
      {
        label: t("TabMenu.Reconnect"),
        disabled: !hasToken,
        onSelect: () => {
          hideContextMenu();
          void reconnectSession(tab);
        }
      },
      "i-lucide-refresh-cw"
    ),
    tabMenuItem(
      {
        label: t("TabMenu.RenameTitle"),
        onSelect: () => {
          openRenameModal(tab);
        }
      },
      "i-lucide-pencil"
    ),
    tabMenuItem(
      {
        label: t("TabMenu.SplitVertically"),
        disabled: !canSplitVertically,
        onSelect: () => {
          hideContextMenu();
          splitSession(tab, "vertical");
        }
      },
      "i-lucide-columns-2"
    ),
    tabMenuItem(
      {
        label: t("TabMenu.SplitHorizontally"),
        disabled: !canSplitHorizontally,
        onSelect: () => {
          hideContextMenu();
          splitSession(tab, "horizontal");
        }
      },
      "i-lucide-rows-2"
    ),
    { type: "separator" as const },
    tabMenuItem(
      {
        label: t("TabMenu.CloseCurrent"),
        onSelect: () => {
          hideContextMenu();
          closeSession(tab.id);
        }
      },
      "i-lucide-x"
    ),
    tabMenuItem({
      label: t("TabMenu.CloseAll"),
      disabled: tabs.value.length === 0,
      onSelect: () => {
        hideContextMenu();
        closeAllSessions();
      }
    }),
    tabMenuItem({
      label: t("TabMenu.CloseOther"),
      disabled: tabs.value.length <= 1,
      onSelect: () => {
        hideContextMenu();
        closeOtherSessions(tab.id);
      }
    }),
    tabMenuItem({
      label: t("TabMenu.CloseLeft"),
      disabled: index === 0,
      onSelect: () => {
        hideContextMenu();
        closeLeftSessions(tab.id);
      }
    }),
    tabMenuItem({
      label: t("TabMenu.CloseRight"),
      disabled: index === tabs.value.length - 1,
      onSelect: () => {
        hideContextMenu();
        closeRightSessions(tab.id);
      }
    })
  ];
});

const tabMenuItems = computed<DropdownMenuItem[]>(() => [
  ...tabs.value.map((tab) => ({
    label: tabDisplayTitle(tab),
    type: "checkbox" as const,
    checked: activeTabId.value === tab.id,
    onSelect: () => selectTab(tab.id)
  })),
  {
    type: "separator" as const
  },
  {
    label: t("TabMenu.CloseCurrent"),
    icon: "i-lucide-x",
    ui: { itemLeadingIcon: "size-4 w-4 shrink-0 text-[var(--app-muted)]" },
    disabled: !activeTab.value,
    onSelect: () => {
      if (activeTab.value) closeSession(activeTab.value.id);
    }
  },
  {
    label: t("TabMenu.CloseOther"),
    icon: "i-lucide-copy-x",
    ui: { itemLeadingIcon: "size-4 w-4 shrink-0 text-[var(--app-muted)]" },
    disabled: !activeTab.value || tabs.value.length < 2,
    onSelect: () => {
      if (activeTab.value) closeOtherSessions(activeTab.value.id);
    }
  },
  {
    label: t("TabMenu.CloseAll"),
    icon: "i-lucide-trash-2",
    ui: { itemLeadingIcon: "size-4 w-4 shrink-0 text-[var(--app-muted)]" },
    disabled: tabs.value.length === 0,
    onSelect: closeAllSessions
  }
]);

function updateOverflow() {
  const el = tabStripRef.value;
  if (!el) {
    hasOverflow.value = false;
    hasLeftHidden.value = false;
    hasRightHidden.value = false;
    return;
  }

  hasOverflow.value = el.scrollWidth > el.clientWidth + 1;
  hasLeftHidden.value = hasOverflow.value && el.scrollLeft > 1;
  hasRightHidden.value = hasOverflow.value && el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
}

function scrollActiveTabIntoView(behavior: ScrollBehavior = "smooth") {
  const el = tabStripRef.value;
  if (!el || !activeTabId.value) return;

  const activeButton = el.querySelector<HTMLElement>(`[data-tab-id="${activeTabId.value}"]`);
  if (!activeButton) return;

  const viewportRect = el.getBoundingClientRect();
  const activeRect = activeButton.getBoundingClientRect();
  const edgeZone = el.clientWidth * 0.3;
  const activeCenter = activeRect.left + activeRect.width / 2;
  const viewportCenter = viewportRect.left + viewportRect.width / 2;
  const isOutsideViewport = activeRect.left < viewportRect.left || activeRect.right > viewportRect.right;
  const isNearHiddenLeft = el.scrollLeft > 1 && activeCenter < viewportRect.left + edgeZone;
  const isNearHiddenRight =
    el.scrollLeft + el.clientWidth < el.scrollWidth - 1 && activeCenter > viewportRect.right - edgeZone;

  if (!isOutsideViewport && !isNearHiddenLeft && !isNearHiddenRight) return;

  el.scrollTo({
    left: el.scrollLeft + activeCenter - viewportCenter,
    behavior
  });
}

function selectTab(id: string) {
  setActiveSession(id);
  nextTick(scrollActiveTabIntoView);
}

function switchTab(direction: "previous" | "next") {
  activateAdjacentSession(direction);
  nextTick(scrollActiveTabIntoView);
}

function scrollTabStrip(direction: "left" | "right") {
  const el = tabStripRef.value;
  if (!el) return;

  const distance = Math.max(120, Math.round(el.clientWidth * 0.6));
  el.scrollBy({
    left: direction === "left" ? -distance : distance,
    behavior: "smooth"
  });
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  updateOverflow();
  scrollActiveTabIntoView("auto");

  if (!tabStripRef.value) return;

  resizeObserver = new ResizeObserver(() => {
    updateOverflow();
  });
  resizeObserver.observe(tabStripRef.value);
  tabStripRef.value.addEventListener("scroll", updateOverflow, { passive: true });
});

useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if (!event.altKey || !event.shiftKey || tabs.value.length < 2) return;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    switchTab("previous");
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    switchTab("next");
  }
});

onBeforeUnmount(() => {
  tabStripRef.value?.removeEventListener("scroll", updateOverflow);
  resizeObserver?.disconnect();
  resizeObserver = null;
});

watch(
  tabs,
  () =>
    nextTick(() => {
      updateOverflow();
      scrollActiveTabIntoView();
    }),
  { deep: true }
);

watch(activeTabId, () => nextTick(scrollActiveTabIntoView));
</script>

<template>
  <div
    class="workspace-tab-header flex h-full min-w-0 items-center gap-2 px-3"
    :class="{ 'workspace-tab-header-dark': isDarkTabTheme }"
  >
    <UTooltip v-if="hasLeftHidden" text="向左滚动标签" :delay-duration="150">
      <button
        type="button"
        class="workspace-tab-overflow flex size-5 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-default disabled:opacity-40"
        :disabled="!hasLeftHidden"
        aria-label="向左滚动标签"
        @click="scrollTabStrip('left')"
      >
        <UIcon name="i-lucide-chevron-left" class="size-3.5 text-[var(--app-muted)]" />
      </button>
    </UTooltip>

    <div v-if="tabs.length" class="workspace-tab-capsule flex w-fit min-w-0 max-w-full items-center rounded-lg">
      <div
        ref="tabStripRef"
        class="workspace-tab-strip flex w-fit min-w-0 max-w-full items-center gap-1 overflow-x-auto"
      >
        <button
          v-for="(tab, index) in tabs"
          :key="tab.id"
          :data-tab-id="tab.id"
          type="button"
          draggable="true"
          class="workspace-session-tab group relative flex h-7 min-w-0 shrink-0 items-center gap-1.5 rounded-md px-2 text-left transition-all duration-150"
          :class="[
            activeTabId === tab.id ? 'max-w-84 pr-2' : 'max-w-44',
            activeTabId === tab.id
              ? 'workspace-session-tab-active text-[var(--app-fg)]'
              : 'workspace-session-tab-idle text-[var(--app-muted)]',
            draggedTabId === tab.id ? 'opacity-60' : ''
          ]"
          @click.stop="selectTab(tab.id)"
          @contextmenu.prevent="openContextMenu(tab, index, $event)"
          @dragstart="handleTabDragStart($event, tab.id)"
          @dragend="handleTabDragEnd"
          @dragenter.prevent="handleTabDragOver($event, tab.id)"
          @dragover.prevent="handleTabDragOver($event, tab.id)"
          @dragleave.prevent="dragOverTabId = dragOverTabId === tab.id ? '' : dragOverTabId"
          @drop.prevent="handleTabDrop(tab.id)"
        >
          <span
            v-if="dragOverTabId === tab.id"
            class="pointer-events-none absolute inset-y-1 z-10 w-0.5 rounded-full bg-primary"
            :class="dragOverTabPlacement === 'after' ? '-right-[3px]' : '-left-[3px]'"
          />
          <span class="relative grid size-3.5 shrink-0 place-items-center">
            <img
              v-if="showTabIconImage(tab)"
              :src="tabIcon(tab).src"
              alt=""
              class="size-3.5 object-contain"
              :class="tab.status === 'failed' ? 'opacity-40' : ''"
              @error="markTabIconBroken(tab.id)"
            />
            <UIcon
              v-else
              :name="tabIcon(tab).fallback"
              class="size-3.5 text-[var(--app-muted)]"
              :class="tab.status === 'failed' ? 'opacity-40' : ''"
            />
            <span
              class="workspace-session-tab-status absolute -bottom-px -right-px size-1.5 rounded-full"
              :class="
                tab.status === 'connected'
                  ? 'bg-blue-500'
                  : tab.status === 'ready'
                    ? 'bg-blue-400'
                    : tab.status === 'failed'
                      ? 'bg-red-500'
                      : 'bg-gray-400 dark:bg-gray-500'
              "
            />
          </span>
          <span
            v-if="activeTabId === tab.id"
            class="flex min-w-0 items-center gap-1.5 truncate font-ui-mono text-[11px] tracking-[0.01em]"
          >
            <span class="shrink-0 truncate font-medium">{{ tabDisplayTitle(tab) }}</span>
            <span
              v-if="tab.address && tab.address !== '-'"
              class="workspace-session-tab-address min-w-0 truncate text-[10px]"
            >
              {{ tab.address }}
            </span>
          </span>
          <span v-else class="min-w-0 truncate font-ui-mono text-[11px] tracking-[0.01em]">
            {{ tabDisplayTitle(tab) }}
          </span>
          <span
            class="workspace-session-tab-close flex size-3.5 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100"
            :class="activeTabId === tab.id ? 'opacity-70' : ''"
            @click.stop="closeSession(tab.id)"
          >
            <UIcon name="i-lucide-x" class="size-2.5" />
          </span>
          <span
            v-if="activeTabId !== tab.id && index < tabs.length - 1"
            class="workspace-session-tab-divider pointer-events-none absolute top-1/2 -right-[5px] h-4 -translate-y-1/2 border-r"
          />
        </button>
      </div>
    </div>

    <WorkspaceAddSessionPopover v-if="showAddSession" />

    <UTooltip v-if="hasRightHidden" text="向右滚动标签" :delay-duration="150">
      <button
        type="button"
        class="workspace-tab-overflow flex size-5 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-default disabled:opacity-40"
        :disabled="!hasRightHidden"
        aria-label="向右滚动标签"
        @click="scrollTabStrip('right')"
      >
        <UIcon name="i-lucide-chevron-right" class="size-3.5 text-[var(--app-muted)]" />
      </button>
    </UTooltip>

    <UDropdownMenu
      v-if="hasOverflow"
      :items="tabMenuItems"
      :content="{ align: 'end', side: 'bottom' }"
      :ui="{
        ...tabDropdownUi,
        content: 'w-44 max-h-64 overflow-y-auto p-1',
        item: 'py-1.5 text-sm min-w-0 gap-2 items-center',
        label: 'truncate'
      }"
    >
      <button
        type="button"
        class="workspace-tab-overflow flex size-5 shrink-0 items-center justify-center rounded-lg transition-colors"
        aria-label="切换终端标签"
      >
        <UIcon name="i-lucide-ellipsis" class="size-3.5 text-[var(--app-muted)]" />
      </button>
    </UDropdownMenu>

    <UDropdownMenu
      :open="contextMenuVisible"
      :items="contextMenuItems"
      size="sm"
      :content="{ align: 'start', side: 'bottom' }"
      :ui="tabDropdownUi"
      @update:open="
        (open) => {
          if (!open) hideContextMenu();
          else contextMenuVisible = open;
        }
      "
    >
      <div
        class="fixed pointer-events-none"
        :style="{
          left: `${contextMenuPosition.x}px`,
          top: `${contextMenuPosition.y}px`,
          width: '1px',
          height: '1px'
        }"
      />
    </UDropdownMenu>

    <UModal :open="renameModalOpen" :title="t('TabMenu.RenameTitle')" @update:open="updateRenameModal">
      <template #body>
        <div class="space-y-3">
          <UInput v-model="renameValue" :placeholder="t('TabMenu.RenamePlaceholder')" autofocus />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="updateRenameModal(false)">
            {{ t("Transcode.Cancel") }}
          </UButton>
          <UButton :disabled="renameDisabled" @click="submitRename">
            {{ t("Transcode.Confirm") }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.workspace-tab-header {
  --workspace-tab-idle-bg: color-mix(in srgb, var(--app-surface-panel) 90%, black 1%);
  --workspace-tab-idle-hover-bg: color-mix(in srgb, var(--app-surface-panel) 76%, black 14%);
  --workspace-tab-active-bg: color-mix(in srgb, var(--workspace-surface-background) 82%, black 8%);
  --workspace-tab-active-border: color-mix(in srgb, var(--app-border) 74%, black 8%);
  background: var(--app-surface-header);
}

.workspace-tab-capsule {
  background: transparent;
}

.workspace-tab-overflow {
  background: color-mix(in srgb, var(--app-surface-panel) 86%, var(--app-surface-header) 14%);
  border: 1px solid color-mix(in srgb, var(--app-border) 86%, transparent);
  color: var(--app-muted);
}

.workspace-tab-overflow:hover:not(:disabled) {
  background-color: var(--app-hover-soft);
  color: var(--app-fg);
}

.workspace-session-tab {
  position: relative;
  border: 1px solid transparent;
  border-bottom-color: transparent;
}

.workspace-session-tab-idle {
  background: var(--workspace-tab-idle-bg);
}

.workspace-session-tab-idle:hover {
  background: var(--workspace-tab-idle-hover-bg);
  color: var(--app-fg);
}

.workspace-session-tab-active {
  background: var(--workspace-tab-active-bg);
  border-color: var(--workspace-tab-active-border);
  border-bottom-color: var(--workspace-tab-active-border);
  z-index: 2;
}

.workspace-session-tab-address {
  color: color-mix(in srgb, var(--app-fg) 46%, transparent);
}

.workspace-session-tab-status {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--app-surface-panel-strong) 88%, white 12%);
}

.workspace-session-tab-close:hover {
  background: color-mix(in srgb, var(--app-hover-strong) 88%, transparent);
}

.workspace-session-tab-divider {
  border-color: var(--app-border);
}

.workspace-tab-strip {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.workspace-tab-strip::-webkit-scrollbar {
  display: none;
}

.workspace-tab-header-dark {
  --workspace-tab-idle-bg: color-mix(in srgb, var(--theme-bg) 90%, white 1%);
  --workspace-tab-idle-hover-bg: color-mix(in srgb, var(--theme-bg) 90%, white 12%);
  --workspace-tab-active-bg: color-mix(in srgb, var(--theme-bg) 87%, white 12%);
  --workspace-tab-active-border: color-mix(in srgb, white 5%, transparent);
}
</style>
