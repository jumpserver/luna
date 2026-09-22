<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { WorkspaceSessionTab, WorkspaceTabGroup } from "~/composables/useWorkspaceTabs";
import { useResizeObserver } from "@vueuse/core";
import { sessionGroupSaveError } from "~/composables/useSavedSessionGroups";

import { desktopInvoke } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { resolveAssetIconFromFields } from "~/utils/assetIcon";

const props = withDefaults(defineProps<{ standalone?: boolean }>(), { standalone: false });

const { t } = useI18n();
const toast = useToast();
watch(sessionGroupSaveError, (error) => {
  if (error) toast.add({ title: t(error), color: "error" });
});
const appBaseURL = useRuntimeConfig().app.baseURL;
const { isMacOS } = usePlatform();
const { open: settingsOpen } = useSettingsWindow();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);
const showAddSession = computed(() => !props.standalone && (loggedIn.value || isDesktopRuntime()));
const {
  activeTabId,
  tabs,
  tabGroups,
  createTabGroup,
  groupTabs,
  moveTabToGroup,
  renameTabGroup,
  toggleTabGroup,
  ungroupTabs,
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
const contextMenuGroupId = ref("");
const dragOverGroupId = ref("");
const groupEditorOpen = ref(false);
const groupEditorId = ref("");
const groupEditorTabId = ref("");
const groupName = ref("");
const dragOverTabId = ref("");
const dragOverTabPlacement = ref<"before" | "after" | "group">("before");
const renameModalOpen = ref(false);
const renameTabId = ref("");
const renameValue = ref("");
const showShortcutHints = ref(false);

const TAB_MAX_WIDTH = 176;
const TAB_GAP = 4;
const groupElements = ref<HTMLElement[]>([]);
const groupLabelsWidth = ref(0);
function updateGroupLabelsWidth() {
  groupLabelsWidth.value = groupElements.value.reduce((sum, element) => sum + element.getBoundingClientRect().width, 0);
}
watchPostEffect(updateGroupLabelsWidth);
useResizeObserver(groupElements, () => requestAnimationFrame(updateGroupLabelsWidth));
type TabStripEntry =
  | { kind: "group"; group: WorkspaceTabGroup; count: number; active: boolean }
  | { kind: "tab"; tab: WorkspaceSessionTab; index: number };
const tabStripEntries = computed<TabStripEntry[]>(() => {
  const entries: TabStripEntry[] = [];
  tabs.value.forEach((tab, index) => {
    const group = props.standalone ? undefined : tab.group;
    if (group && tabs.value[index - 1]?.group?.id !== group.id) {
      const members = tabs.value.filter((item) => item.group?.id === group.id);
      entries.push({
        kind: "group",
        group,
        count: members.length,
        active: members.some((item) => item.id === activeTabId.value)
      });
    }
    if (!group?.collapsed) entries.push({ kind: "tab", tab, index });
  });
  return entries;
});
const tabStripIdealWidth = computed(() => {
  const entries = tabStripEntries.value;
  const width = groupLabelsWidth.value + entries.filter((entry) => entry.kind === "tab").length * TAB_MAX_WIDTH;
  return `${width + Math.max(0, entries.length - 1) * TAB_GAP}px`;
});

const { activeTab } = useWorkspaceTabs();
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

function tabDisplayTitle(tab: WorkspaceSessionTab) {
  return tab.title || tab.assetName || t("Common.Untitled");
}

function groupDisplayTitle(group: WorkspaceTabGroup) {
  return group.title || t("TabMenu.TemporaryGroup");
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
  contextMenuGroupId.value = "";
}

function openGroupEditor(tabId = "", group?: WorkspaceTabGroup) {
  hideContextMenu();
  groupEditorTabId.value = tabId;
  groupEditorId.value = group?.id || "";
  groupName.value = group?.title || "";
  groupEditorOpen.value = true;
}

function submitGroup() {
  if (!groupName.value.trim()) return;
  if (groupEditorId.value) renameTabGroup(groupEditorId.value, groupName.value);
  else createTabGroup(groupEditorTabId.value, groupName.value);
  groupEditorOpen.value = false;
}

function openGroupContextMenu(group: WorkspaceTabGroup, event: MouseEvent) {
  hideContextMenu();
  contextMenuGroupId.value = group.id;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  contextMenuPosition.value =
    event.type === "contextmenu" ? { x: event.clientX, y: event.clientY } : { x: rect.left, y: rect.bottom };
  contextMenuVisible.value = true;
}

const closeTab = async (tab: WorkspaceSessionTab) => {
  await closeSession(tab.id).catch(() => undefined);
  if (!props.standalone) return;

  if (isDesktopRuntime()) {
    await desktopInvoke("close_window");
  } else {
    window.close();
  }
};

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
  dragOverGroupId.value = "";
}

function handleTabDragOver(event: DragEvent, targetTabId: string) {
  if (!draggedTabId.value || draggedTabId.value === targetTabId) return;
  dragOverGroupId.value = "";
  const currentTarget = event.currentTarget as HTMLElement | null;
  if (!currentTarget) return;

  const rect = currentTarget.getBoundingClientRect();
  const centerOffset = event.clientX - (rect.left + rect.width / 2);
  dragOverTabId.value = targetTabId;
  // Reserve only the central 24 px for grouping so most of the tab still reorders.
  dragOverTabPlacement.value = Math.abs(centerOffset) <= 12 ? "group" : centerOffset < 0 ? "before" : "after";
}

function handleTabDrop(targetTabId: string) {
  if (!draggedTabId.value || draggedTabId.value === targetTabId) {
    dragOverTabId.value = "";
    return;
  }
  if (dragOverTabPlacement.value === "group") groupTabs(draggedTabId.value, targetTabId);
  else reorderTabs(draggedTabId.value, targetTabId, dragOverTabPlacement.value);
  handleTabDragEnd();
}

function handleGroupDragOver(event: DragEvent, groupId: string) {
  if (!draggedTabId.value) return;
  event.preventDefault();
  dragOverTabId.value = "";
  dragOverGroupId.value = groupId;
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function handleGroupDrop(groupId: string) {
  if (draggedTabId.value) moveTabToGroup(draggedTabId.value, groupId);
  handleTabDragEnd();
}

function openContextMenu(tab: WorkspaceSessionTab, index: number, event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();

  contextMenuGroupId.value = "";
  contextMenuTab.value = tab;
  contextMenuTabIndex.value = index;
  contextMenuPosition.value = { x: event.clientX, y: event.clientY };
  contextMenuVisible.value = true;
}

const contextMenuItems = computed<DropdownMenuItem[]>(() => {
  const group = tabGroups.value.find((item) => item.id === contextMenuGroupId.value);
  if (group)
    return [
      tabMenuItem(
        {
          label: t(group.collapsed ? "TabMenu.ExpandGroup" : "TabMenu.CollapseGroup"),
          onSelect: () => {
            toggleTabGroup(group.id);
            hideContextMenu();
          }
        },
        "i-lucide-fold-vertical"
      ),
      tabMenuItem(
        {
          label: t(group.saved ? "TabMenu.RenameGroup" : "TabMenu.NameAndSaveGroup"),
          onSelect: () => openGroupEditor("", group)
        },
        "i-lucide-pencil"
      ),
      tabMenuItem(
        {
          label: t("TabMenu.Ungroup"),
          onSelect: () => {
            ungroupTabs(group.id);
            hideContextMenu();
          }
        },
        "i-lucide-ungroup"
      )
    ];
  const tab = contextMenuTab.value;
  const index = contextMenuTabIndex.value;
  if (!tab || index < 0) return [];

  const hasToken = Boolean(tab.payload?.id || tab.payload?.token?.id);
  const canSplitVertically = canSplitWorkspace(tab.id, "vertical");
  const canSplitHorizontally = canSplitWorkspace(tab.id, "horizontal");

  if (props.standalone) {
    return [
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
          onSelect: () => openRenameModal(tab)
        },
        "i-lucide-pencil"
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
      ...(canSplitVertically
        ? [
            tabMenuItem(
              {
                label: t("TabMenu.SplitVertically"),
                onSelect: () => {
                  hideContextMenu();
                  splitSession(tab, "vertical");
                }
              },
              "i-lucide-columns-2"
            )
          ]
        : []),
      ...(canSplitHorizontally
        ? [
            tabMenuItem(
              {
                label: t("TabMenu.SplitHorizontally"),
                onSelect: () => {
                  hideContextMenu();
                  splitSession(tab, "horizontal");
                }
              },
              "i-lucide-rows-2"
            )
          ]
        : []),
      { type: "separator" as const },
      tabMenuItem(
        {
          label: t("TabMenu.CloseCurrent"),
          kbds: ["alt", "shift", "W"],
          onSelect: () => {
            hideContextMenu();
            void closeTab(tab);
          }
        },
        "i-lucide-x"
      )
    ];
  }

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
        label: t("TabMenu.AddToGroup"),
        children: [
          { label: t("TabMenu.NewGroup"), icon: "i-lucide-plus", onSelect: () => openGroupEditor(tab.id) },
          ...tabGroups.value.map((group) => ({
            label: groupDisplayTitle(group),
            icon: "i-lucide-group",
            disabled: tab.group?.id === group.id,
            onSelect: () => {
              moveTabToGroup(tab.id, group.id);
              hideContextMenu();
            }
          }))
        ]
      },
      "i-lucide-group"
    ),
    ...(tab.group
      ? [
          tabMenuItem(
            {
              label: t("TabMenu.RemoveFromGroup"),
              onSelect: () => {
                moveTabToGroup(tab.id);
                hideContextMenu();
              }
            },
            "i-lucide-ungroup"
          )
        ]
      : []),
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
          void closeTab(tab);
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

const tabMenuItems = computed(
  () =>
    [
      ...tabs.value.map((tab) => ({
        label: tab.group ? `${groupDisplayTitle(tab.group)} · ${tabDisplayTitle(tab)}` : tabDisplayTitle(tab),
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
        onSelect: () => {
          void closeAllSessions();
        }
      }
    ] as DropdownMenuItem[]
);

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

  const activeButton = [...el.querySelectorAll<HTMLElement>("[data-tab-id], [data-group-active='true']")].find(
    (button) => button.dataset.tabId === activeTabId.value || button.dataset.groupActive === "true"
  );
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

watch(
  tabStripRef,
  (el, previous) => {
    previous?.removeEventListener("scroll", updateOverflow);
    resizeObserver?.disconnect();
    updateOverflow();
    scrollActiveTabIntoView("auto");

    if (!el) return;

    resizeObserver = new ResizeObserver(() => {
      updateOverflow();
    });
    resizeObserver.observe(el);
    el.addEventListener("scroll", updateOverflow, {
      passive: true
    });
  },
  { flush: "post" }
);

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
    void closeTab(closeCurrentTab);
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
    <UTooltip v-if="!props.standalone && hasLeftHidden" :text="t('TabMenu.ScrollLeft')" :delay-duration="150">
      <button
        type="button"
        class="workspace-tab-overflow flex size-5 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-default disabled:opacity-40"
        :disabled="!hasLeftHidden"
        :aria-label="t('TabMenu.ScrollLeft')"
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
        <template v-for="entry in tabStripEntries" :key="entry.kind === 'group' ? entry.group.id : entry.tab.id">
          <div
            v-if="entry.kind === 'group'"
            ref="groupElements"
            :data-group-id="entry.group.id"
            :data-group-active="entry.active && entry.group.collapsed"
            class="workspace-tab-group relative flex h-7 w-max min-w-0 max-w-44 shrink-0 items-center rounded-md"
            :class="{
              'workspace-tab-group-drop': dragOverGroupId === entry.group.id
            }"
            @contextmenu.prevent.stop="openGroupContextMenu(entry.group, $event)"
            @dragenter="handleGroupDragOver($event, entry.group.id)"
            @dragover="handleGroupDragOver($event, entry.group.id)"
            @dragleave="dragOverGroupId = ''"
            @drop.prevent.stop="handleGroupDrop(entry.group.id)"
          >
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              class="workspace-tab-group-label h-6 min-w-0 flex-1 gap-1 px-2 text-[11px]"
              :aria-expanded="!entry.group.collapsed"
              :aria-label="`${t(entry.group.collapsed ? 'TabMenu.ExpandGroup' : 'TabMenu.CollapseGroup')}: ${groupDisplayTitle(entry.group)}`"
              :title="groupDisplayTitle(entry.group)"
              @click.stop="toggleTabGroup(entry.group.id)"
            >
              <span class="min-w-0 flex-1 truncate">{{ groupDisplayTitle(entry.group) }}</span>
              <span class="shrink-0 tabular-nums">{{ entry.count }}</span>
            </UButton>
          </div>
          <button
            v-else
            :data-tab-id="entry.tab.id"
            :title="tabTooltip(entry.tab)"
            :data-group-end="entry.tab.group?.id !== tabs[entry.index + 1]?.group?.id"
            type="button"
            :draggable="!props.standalone"
            class="workspace-session-tab group relative flex h-7 min-w-24 max-w-44 basis-44 grow shrink items-center gap-1.5 rounded-md px-2 text-left leading-none transition-colors"
            :class="[
              activeTabId === entry.tab.id ? 'workspace-session-tab-active' : 'text-[var(--app-muted)]',
              draggedTabId === entry.tab.id ? 'opacity-60' : '',
              entry.tab.group && !props.standalone ? 'workspace-session-tab-grouped' : '',
              dragOverTabId === entry.tab.id && dragOverTabPlacement === 'group' ? 'workspace-tab-group-drop' : ''
            ]"
            @click.stop="selectTab(entry.tab.id)"
            @contextmenu.prevent="openContextMenu(entry.tab, entry.index, $event)"
            @dragstart="handleTabDragStart($event, entry.tab.id)"
            @dragend="handleTabDragEnd"
            @dragenter.prevent="handleTabDragOver($event, entry.tab.id)"
            @dragover.prevent="handleTabDragOver($event, entry.tab.id)"
            @dragleave.prevent="dragOverTabId = dragOverTabId === entry.tab.id ? '' : dragOverTabId"
            @drop.prevent="handleTabDrop(entry.tab.id)"
          >
            <span
              v-if="dragOverTabId === entry.tab.id && dragOverTabPlacement !== 'group'"
              class="pointer-events-none absolute inset-y-1 z-10 w-0.5 rounded-full bg-primary"
              :class="dragOverTabPlacement === 'after' ? '-right-[3px]' : '-left-[3px]'"
            />
            <span class="relative grid size-3.5 shrink-0 place-items-center">
              <span
                v-if="shouldShowShortcutHint(entry.index)"
                class="workspace-session-tab-shortcut pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded px-1 py-0.5 font-ui-mono text-[9px] font-medium leading-none"
              >
                {{ shortcutHintLabel(entry.index) }}
              </span>
              <AppAssetIcon
                :src="tabIcon(entry.tab).src"
                :fallback="tabIcon(entry.tab).fallback"
                :class="entry.tab.status === 'failed' ? 'opacity-40' : ''"
              />
              <span
                class="workspace-session-tab-status absolute -bottom-px -right-px size-1.5 rounded-full"
                :class="
                  entry.tab.status === 'connected'
                    ? 'bg-blue-500'
                    : entry.tab.status === 'ready'
                      ? 'bg-blue-400'
                      : entry.tab.status === 'failed'
                        ? 'bg-red-500'
                        : 'bg-gray-400 dark:bg-gray-500'
                "
              />
            </span>
            <span
              class="min-w-0 flex-1 truncate font-ui-mono text-[11px] tracking-[0.01em]"
              :class="activeTabId === entry.tab.id ? 'font-medium' : ''"
            >
              {{ tabDisplayTitle(entry.tab) }}
            </span>
            <span
              class="workspace-session-tab-close flex size-3.5 shrink-0 items-center justify-center rounded-md opacity-70 transition-colors hover:bg-elevated hover:text-foreground hover:opacity-100"
              @click.stop="void closeTab(entry.tab)"
            >
              <UIcon name="i-lucide-x" class="size-2.5" />
            </span>
            <span
              v-if="
                activeTabId !== entry.tab.id &&
                entry.index < tabs.length - 1 &&
                tabs[entry.index + 1]?.id !== activeTabId
              "
              class="workspace-session-tab-divider pointer-events-none absolute top-1/2 -right-[5px] hidden h-4 -translate-y-1/2 border-r"
            />
          </button>
        </template>
      </div>
    </div>

    <WorkspaceAddSessionPopover v-if="showAddSession" />

    <UTooltip v-if="!props.standalone && hasRightHidden" :text="t('TabMenu.ScrollRight')" :delay-duration="150">
      <button
        type="button"
        class="workspace-tab-overflow flex size-5 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-default disabled:opacity-40"
        :disabled="!hasRightHidden"
        :aria-label="t('TabMenu.ScrollRight')"
        @click="scrollTabStrip('right')"
      >
        <UIcon name="i-lucide-chevron-right" class="size-3.5 text-[var(--app-muted)]" />
      </button>
    </UTooltip>

    <UDropdownMenu
      v-if="!props.standalone && hasOverflow"
      :items="tabMenuItems"
      :content="{ align: 'end', side: 'bottom' }"
      :ui="{
        ...tabDropdownUi,
        content: 'min-w-64 w-max max-w-80 max-h-64 overflow-y-auto p-1',
        item: 'py-1.5 text-sm min-w-0 gap-2 items-center',
        label: 'truncate'
      }"
    >
      <button
        type="button"
        class="workspace-tab-overflow flex size-5 shrink-0 items-center justify-center rounded-lg transition-colors"
        :aria-label="t('TabMenu.SwitchTab')"
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

    <UModal v-model:open="groupEditorOpen" :title="t(groupEditorId ? 'TabMenu.RenameGroup' : 'TabMenu.NewGroup')">
      <template #body>
        <p class="mb-3 text-sm text-muted">{{ t("SavedGroups.NameHint") }}</p>
        <UInput
          v-model="groupName"
          :aria-label="t('TabMenu.GroupName')"
          :placeholder="t('TabMenu.GroupName')"
          :maxlength="80"
          autofocus
          @keydown.enter.prevent="submitGroup"
        />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="groupEditorOpen = false">
            {{ t("Transcode.Cancel") }}
          </UButton>
          <UButton :disabled="!groupName.trim()" @click="submitGroup">{{ t("Transcode.Confirm") }}</UButton>
        </div>
      </template>
    </UModal>

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
  background: var(--app-header-bg);
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

.workspace-tab-group-label {
  color: var(--workspace-tab-group-foreground);
  background: var(--workspace-tab-group-accent);
}

.workspace-tab-group-drop {
  background: var(--app-hover-strong);
  outline: 2px solid var(--workspace-tab-group-accent);
  outline-offset: -2px;
}

.workspace-tab-group::after,
.workspace-session-tab-grouped::after {
  content: "";
  position: absolute;
  bottom: -4px;
  left: 0;
  right: 0;
  border-bottom: 1px solid var(--workspace-tab-group-accent);
  pointer-events: none;
}

.workspace-session-tab-grouped::after {
  left: -4px;
}

.workspace-session-tab-grouped[data-group-end="true"]::after {
  border-bottom-right-radius: 1px;
}

.workspace-tab-strip {
  padding-block: 4px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.workspace-tab-strip::-webkit-scrollbar {
  display: none;
}
</style>
