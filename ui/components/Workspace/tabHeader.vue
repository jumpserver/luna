<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

import { resolveAssetIconFromFields } from "~/utils/assetIcon";

const { t } = useI18n();
const {
  activeTabId,
  tabs,
  activateAdjacentSession,
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

const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeTabId.value) || null);
const canSwitchTabs = computed(() => tabs.value.length > 1);
const brokenTabIcons = ref(new Set<string>());

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

const tabDropdownUi = {
  content: "w-48 p-1",
  item: "gap-2 items-center",
  itemLeadingIcon: "size-4 w-4 shrink-0 text-[var(--app-muted)]",
  itemWrapper: "min-w-0 flex-1",
  itemLabel: "min-w-0"
};

const TAB_MENU_ICON_PLACEHOLDER = "i-lucide-circle";

function tabMenuItem(
  item: DropdownMenuItem,
  icon?: string
): DropdownMenuItem {
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

function openContextMenu(tab: WorkspaceSessionTab, index: number, event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();

  contextMenuTab.value = tab;
  contextMenuTabIndex.value = index;
  contextMenuPosition.value = { x: event.clientX, y: event.clientY };
  contextMenuVisible.value = true;
  setActiveSession(tab.id);
}

const contextMenuItems = computed<DropdownMenuItem[]>(() => {
  const tab = contextMenuTab.value;
  const index = contextMenuTabIndex.value;
  if (!tab || index < 0) return [];

  const hasToken = Boolean(tab.payload?.id || tab.payload?.token?.id);

  return [
    tabMenuItem({
      label: t("TabMenu.CloneConnect"),
      disabled: !hasToken,
      onSelect: () => {
        hideContextMenu();
        void cloneSession(tab);
      }
    }, "i-lucide-copy"),
    tabMenuItem({
      label: t("TabMenu.Reconnect"),
      disabled: !hasToken,
      onSelect: () => {
        hideContextMenu();
        void reconnectSession(tab);
      }
    }, "i-lucide-refresh-cw"),
    tabMenuItem({
      label: t("TabMenu.SplitVertically"),
      disabled: !hasToken || Boolean(tab.splitSessions?.length),
      onSelect: () => {
        hideContextMenu();
        void splitSession(tab);
      }
    }, "i-lucide-columns-2"),
    { type: "separator" as const },
    tabMenuItem({
      label: t("TabMenu.CloseCurrent"),
      onSelect: () => {
        hideContextMenu();
        closeSession(tab.id);
      }
    }, "i-lucide-x"),
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
    label: tab.assetName,
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
  hasRightHidden.value = hasOverflow.value && (el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
}

function scrollActiveTabIntoView() {
  const el = tabStripRef.value;
  if (!el || !activeTabId.value) return;

  const activeButton = el.querySelector<HTMLElement>(`[data-tab-id="${activeTabId.value}"]`);
  activeButton?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function selectTab(id: string) {
  setActiveSession(id);
  nextTick(scrollActiveTabIntoView);
}

function switchTab(direction: "previous" | "next") {
  activateAdjacentSession(direction);
  nextTick(scrollActiveTabIntoView);
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  updateOverflow();
  scrollActiveTabIntoView();

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
  () => nextTick(() => {
    updateOverflow();
    scrollActiveTabIntoView();
  }),
  { deep: true }
);

watch(activeTabId, () => nextTick(scrollActiveTabIntoView));
</script>

<template>
  <div class="flex h-full min-w-0 items-center gap-2 px-3">
    <UTooltip v-if="hasLeftHidden" text="上一个标签" :delay-duration="150">
      <button
        type="button"
        class="workspace-tab-overflow flex size-5 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-black/[0.06] disabled:cursor-default disabled:opacity-40 dark:hover:bg-white/[0.1]"
        :disabled="!canSwitchTabs || !hasLeftHidden"
        aria-label="上一个标签"
        @click="switchTab('previous')"
      >
        <UIcon name="i-lucide-chevron-left" class="size-3.5 text-gray-500 dark:text-gray-400" />
      </button>
    </UTooltip>

    <div v-if="tabs.length" class="workspace-tab-capsule flex w-fit min-w-0 max-w-full items-center rounded-lg p-px">
      <div
        ref="tabStripRef"
        class="workspace-tab-strip flex w-fit min-w-0 max-w-full items-center gap-0.5 overflow-x-auto"
      >
        <button
          v-for="(tab, index) in tabs"
          :key="tab.id"
          :data-tab-id="tab.id"
          type="button"
          class="group relative flex h-6 min-w-0 shrink-0 items-center gap-1 rounded-lg px-2 text-left transition-all duration-150"
          :class="[
            activeTabId === tab.id ? 'max-w-80 px-2.5' : 'max-w-40',
            activeTabId === tab.id
              ? 'bg-white/38 text-gray-900 shadow-[0_4px_14px_rgba(255,255,255,0.12)] ring-1 ring-white/42 backdrop-blur-md supports-[backdrop-filter]:bg-white/28 dark:bg-white/[0.09] dark:text-white dark:shadow-[0_8px_20px_rgba(0,0,0,0.18)] dark:ring-white/10 dark:supports-[backdrop-filter]:bg-white/[0.07]'
              : 'text-gray-500/92 hover:bg-white/18 hover:text-gray-700 dark:text-white/45 dark:hover:bg-white/[0.05] dark:hover:text-white/72'
          ]"
          @click.stop="selectTab(tab.id)"
          @contextmenu.prevent="openContextMenu(tab, index, $event)"
        >
          <span class="relative grid size-3.5 shrink-0 place-items-center">
            <img
              v-if="showTabIconImage(tab)"
              :src="tabIcon(tab).src"
              alt=""
              class="size-3.5 object-contain"
              :class="tab.status === 'failed' ? 'opacity-40' : ''"
              @error="markTabIconBroken(tab.id)"
            >
            <UIcon
              v-else
              :name="tabIcon(tab).fallback"
              class="size-3.5 text-gray-500 dark:text-gray-400"
              :class="tab.status === 'failed' ? 'opacity-40' : ''"
            />
            <span
              class="absolute -bottom-px -right-px size-1.5 rounded-full ring-1 ring-white/80 dark:ring-black/40"
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
            <span class="shrink-0 truncate font-medium">{{ tab.assetName }}</span>
            <span
              v-if="tab.address && tab.address !== '-'"
              class="min-w-0 truncate text-[10px] text-gray-500 dark:text-white/55"
            >
              {{ tab.address }}
            </span>
          </span>
          <span v-else class="min-w-0 truncate font-ui-mono text-[11px] tracking-[0.01em]">{{ tab.assetName }}</span>
          <span
            class="flex size-3.5 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100 dark:hover:bg-white/10"
            :class="activeTabId === tab.id ? 'opacity-60' : ''"
            @click.stop="closeSession(tab.id)"
          >
            <UIcon name="i-lucide-x" class="size-2.5" />
          </span>
          <span
            v-if="activeTabId !== tab.id && index < tabs.length - 1"
            class="pointer-events-none absolute top-1/2 -right-[3px] h-3 -translate-y-1/2 border-r border-black/8 dark:border-white/10"
          />
        </button>
      </div>
    </div>

    <WorkspaceAddSessionPopover />

    <UTooltip v-if="hasRightHidden" text="下一个标签" :delay-duration="150">
      <button
        type="button"
        class="workspace-tab-overflow flex size-5 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-black/[0.06] disabled:cursor-default disabled:opacity-40 dark:hover:bg-white/[0.1]"
        :disabled="!canSwitchTabs || !hasRightHidden"
        aria-label="下一个标签"
        @click="switchTab('next')"
      >
        <UIcon name="i-lucide-chevron-right" class="size-3.5 text-gray-500 dark:text-gray-400" />
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
        class="workspace-tab-overflow flex size-5 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.1]"
        aria-label="切换终端标签"
      >
        <UIcon name="i-lucide-ellipsis" class="size-3.5 text-gray-500 dark:text-gray-400" />
      </button>
    </UDropdownMenu>

    <UDropdownMenu
      :open="contextMenuVisible"
      :items="contextMenuItems"
      size="sm"
      :content="{ align: 'start', side: 'bottom' }"
      :ui="tabDropdownUi"
      @update:open="(open) => { if (!open) hideContextMenu(); else contextMenuVisible = open; }"
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
  </div>
</template>

<style scoped>
.workspace-tab-capsule {
  background-color: rgba(15, 23, 42, 0.07);
  border: 1px solid rgba(15, 23, 42, 0.06);
}

.dark .workspace-tab-capsule {
  background-color: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.08);
}

.workspace-tab-overflow {
  background-color: rgba(15, 23, 42, 0.07);
  border: 1px solid rgba(15, 23, 42, 0.06);
}

.dark .workspace-tab-overflow {
  background-color: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.08);
}

.workspace-tab-strip {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.workspace-tab-strip::-webkit-scrollbar {
  display: none;
}
</style>
