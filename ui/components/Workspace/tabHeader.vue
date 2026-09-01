<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

import { useUserInfoStore } from "~/store/modules/userInfo";
import { resolveAssetIconFromFields } from "~/utils/assetIcon";

const { t } = useI18n();
const appBaseURL = useRuntimeConfig().app.baseURL;
const { isMacOS } = usePlatform();
const { open: settingsOpen } = useSettingsWindow();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);
const showAddSession = computed(() => loggedIn.value || isDesktopRuntime());
const {
  activeTabId,
  tabs,
  activateAdjacentSession,
  canSplitWorkspace,
  draggedTabId,
  enterFocusMode,
  enterFullscreenMode,
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

const tabStripRef = shallowRef<HTMLElement | null>(null);
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
const showShortcutHints = ref(false);

const TAB_MAX_WIDTH = 176;
const TAB_GAP = 4;
const tabStripIdealWidth = computed(() => {
  const count = tabs.value.length;
  return `${count * TAB_MAX_WIDTH + Math.max(0, count - 1) * TAB_GAP}px`;
});

const { activeTab } = useWorkspaceTabs();
const brokenTabIcons = ref(new Set<string>());
const renameDisabled = computed(() => {
  const target = tabs.value.find((tab) => tab.id === renameTabId.value);
  const current = (target?.title || target?.assetName || "").trim();
  const next = renameValue.value.trim();
  return !target || !next || next === current;
});

function tabIcon(tab: WorkspaceSessionTab) {
  return resolveAssetIconFromFields(
    {
      type: tab.assetType,
      platform: tab.assetPlatform,
      category: tab.assetCategory
    },
    appBaseURL
  );
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

function tabTooltip(tab: WorkspaceSessionTab) {
  const title = tabDisplayTitle(tab);
  return tab.address && tab.address !== "-" ? `${title} · ${tab.address}` : title;
}

function usesPrimaryTabModifier(event: KeyboardEvent) {
  return isMacOS.value
    ? event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
    : event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
}

function shouldShowShortcutHint(index: number) {
  if (!showShortcutHints.value) return false;
  if (tabs.value.length <= 9) return index < tabs.value.length;
  return index < 8 || index === tabs.value.length - 1;
}

function shortcutHintLabel(index: number) {
  const modifier = isMacOS.value ? "⌘" : "Ctrl";
  const digit = tabs.value.length > 9 && index === tabs.value.length - 1 ? 9 : index + 1;
  return `${modifier}${digit}`;
}

const tabDropdownUi = {
  content: "p-1",
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
        label: t("TabMenu.FocusCurrent"),
        kbds: ["meta", "shift", "P"],
        onSelect: () => {
          hideContextMenu();
          enterFocusMode(tab.id);
        }
      },
      "i-lucide-maximize-2"
    ),
    tabMenuItem(
      {
        label: t("TabMenu.FullscreenCurrent"),
        kbds: ["meta", "shift", "F"],
        onSelect: () => {
          hideContextMenu();
          void enterFullscreenMode(tab.id);
        }
      },
      "i-lucide-fullscreen"
    ),
    { type: "separator" as const },
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
        kbds: ["alt", "shift", "W"],
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
    kbds: ["alt", "shift", "W"],
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

function isTypingIntoEditable(event: KeyboardEvent) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(".xterm")) return false;
  if (target.isContentEditable) return true;

  const tagName = target.tagName;
  return (
    tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || target.getAttribute("role") === "textbox"
  );
}

function getTabIndexFromDigitShortcut(event: KeyboardEvent) {
  const match = event.code.match(/^(?:Digit|Numpad)([1-9])$/);
  if (!match) return -1;

  if (!usesPrimaryTabModifier(event)) return -1;

  const digit = Number(match[1]);
  if (!digit) return -1;

  return digit === 9 ? tabs.value.length - 1 : digit - 1;
}

function syncShortcutHintsVisibility(event: KeyboardEvent) {
  showShortcutHints.value = tabs.value.length >= 2 && !isTypingIntoEditable(event) && usesPrimaryTabModifier(event);
}

function clearShortcutHints() {
  showShortcutHints.value = false;
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
  tabStripRef.value.addEventListener("scroll", updateOverflow, {
    passive: true
  });
});

useEventListener(window, "keydown", (event: KeyboardEvent) => {
  syncShortcutHintsVisibility(event);

  const closeCurrentTab =
    !event.repeat &&
    event.altKey &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    event.code === "KeyW" &&
    !settingsOpen.value &&
    activeTab.value;
  if (closeCurrentTab) {
    event.preventDefault();
    event.stopPropagation();
    void closeSession(closeCurrentTab.id);
    return;
  }

  if (event.defaultPrevented || tabs.value.length < 2 || isTypingIntoEditable(event)) return;

  const targetIndex = getTabIndexFromDigitShortcut(event);
  if (targetIndex >= 0) {
    const targetTab = tabs.value[Math.min(targetIndex, tabs.value.length - 1)];
    if (!targetTab) return;
    event.preventDefault();
    selectTab(targetTab.id);
    return;
  }

  if (!event.altKey || !event.shiftKey) return;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    switchTab("previous");
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    switchTab("next");
  }
});

useEventListener(window, "keyup", (event: KeyboardEvent) => {
  syncShortcutHintsVisibility(event);
});

useEventListener(window, "blur", clearShortcutHints);
useEventListener(document, "visibilitychange", () => {
  if (document.visibilityState !== "visible") clearShortcutHints();
});

onBeforeUnmount(() => {
  tabStripRef.value?.removeEventListener("scroll", updateOverflow);
  resizeObserver?.disconnect();
  resizeObserver = null;
  clearShortcutHints();
});

watch(
  tabs,
  () =>
    nextTick(() => {
      if (!tabs.value.length || tabs.value.length < 2) clearShortcutHints();
      updateOverflow();
      scrollActiveTabIntoView();
    }),
  { deep: true }
);

watch(activeTabId, () => nextTick(scrollActiveTabIntoView));
</script>

<template>
  <div data-ai-context="workspace" class="workspace-tab-header flex h-full min-w-0 items-center gap-2 px-1">
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

    <div
      v-if="tabs.length"
      class="workspace-tab-capsule flex min-w-0 max-w-full shrink items-center rounded-lg"
      :style="{ width: tabStripIdealWidth }"
    >
      <div ref="tabStripRef" class="workspace-tab-strip flex w-full min-w-0 items-center gap-1 overflow-x-auto">
        <button
          v-for="(tab, index) in tabs"
          :key="tab.id"
          :data-tab-id="tab.id"
          :title="tabTooltip(tab)"
          type="button"
          draggable="true"
          class="workspace-session-tab group relative flex h-7 min-w-24 max-w-44 basis-44 grow shrink items-center gap-1.5 rounded-md px-2 text-left leading-none transition-colors"
          :class="[
            activeTabId === tab.id ? 'workspace-session-tab-active' : 'text-[var(--app-muted)]',
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
            <span
              v-if="shouldShowShortcutHint(index)"
              class="workspace-session-tab-shortcut pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded px-1 py-0.5 font-ui-mono text-[9px] font-medium leading-none"
            >
              {{ shortcutHintLabel(index) }}
            </span>
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
              class="size-3.5"
              :class="[
                activeTabId === tab.id ? 'text-highlighted' : 'text-[var(--app-muted)]',
                tab.status === 'failed' ? 'opacity-40' : ''
              ]"
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
            class="min-w-0 flex-1 truncate font-ui-mono text-[11px] tracking-[0.01em]"
            :class="activeTabId === tab.id ? 'font-medium' : ''"
          >
            {{ tabDisplayTitle(tab) }}
          </span>
          <span
            class="workspace-session-tab-close flex size-3.5 shrink-0 items-center justify-center rounded-md opacity-70 transition-colors hover:bg-elevated hover:text-foreground hover:opacity-100"
            @click.stop="closeSession(tab.id)"
          >
            <UIcon name="i-lucide-x" class="size-2.5" />
          </span>
          <span
            v-if="activeTabId !== tab.id && index < tabs.length - 1 && tabs[index + 1]?.id !== activeTabId"
            class="workspace-session-tab-divider pointer-events-none absolute top-1/2 -right-[5px] hidden h-4 -translate-y-1/2 border-r"
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

.workspace-session-tab-shortcut {
  color: color-mix(in srgb, var(--app-fg) 82%, transparent);
  background: color-mix(in srgb, var(--color-bg-kbd) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  box-shadow: 0 6px 18px color-mix(in srgb, black 10%, transparent);
  white-space: nowrap;
}

.workspace-session-tab-active {
  background-color: color-mix(in srgb, var(--app-fg) 8%, transparent);
  border: 0;
  box-shadow: none;
  color: var(--ui-text-highlighted);
  outline: none;
}

.workspace-session-tab:hover {
  background-color: var(--app-hover-soft);
}

.workspace-session-tab-status {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--app-surface-panel-strong) 88%, white 12%);
}

.workspace-session-tab-divider {
  border-color: color-mix(in srgb, var(--app-border) 75%, var(--app-fg) 25%);
}

.workspace-tab-strip {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.workspace-tab-strip::-webkit-scrollbar {
  display: none;
}
</style>
