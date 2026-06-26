<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

const {
  activeTabId,
  tabs,
  activateAdjacentSession,
  closeAllSessions,
  closeOtherSessions,
  closeSession,
  setActiveSession
} = useWorkspaceTabs();

const tabStripRef = ref<HTMLElement | null>(null);
const hasOverflow = ref(false);

const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeTabId.value) || null);
const canSwitchTabs = computed(() => tabs.value.length > 1);

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
    label: "关闭当前标签",
    icon: "i-lucide-x",
    disabled: !activeTab.value,
    onSelect: () => {
      if (activeTab.value) closeSession(activeTab.value.id);
    }
  },
  {
    label: "关闭其他标签",
    icon: "i-lucide-copy-x",
    disabled: !activeTab.value || tabs.value.length < 2,
    onSelect: () => {
      if (activeTab.value) closeOtherSessions(activeTab.value.id);
    }
  },
  {
    label: "关闭全部标签",
    icon: "i-lucide-trash-2",
    disabled: tabs.value.length === 0,
    onSelect: closeAllSessions
  }
]);

function updateOverflow() {
  const el = tabStripRef.value;
  if (!el) {
    hasOverflow.value = false;
    return;
  }

  hasOverflow.value = el.scrollWidth > el.clientWidth + 1;
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
  <div v-if="tabs.length" class="flex h-full min-w-0 items-center gap-1.5 px-3">
    <UTooltip text="上一个标签" :delay-duration="150">
      <button
        type="button"
        class="workspace-tab-overflow flex size-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.06] disabled:cursor-default disabled:opacity-40 dark:hover:bg-white/[0.1]"
        :disabled="!canSwitchTabs"
        aria-label="上一个标签"
        @click="switchTab('previous')"
      >
        <UIcon name="i-lucide-chevron-left" class="size-3.5 text-gray-500 dark:text-gray-400" />
      </button>
    </UTooltip>

    <div class="workspace-tab-capsule flex w-fit min-w-0 max-w-full items-center rounded-full p-0.5">
      <div
        ref="tabStripRef"
        class="workspace-tab-strip flex w-fit min-w-0 max-w-full items-center gap-0.5 overflow-x-auto"
      >
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :data-tab-id="tab.id"
          type="button"
          class="group relative flex h-6 max-w-44 min-w-0 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-left transition-colors"
          :class="
            activeTabId === tab.id
              ? 'bg-white text-gray-900 shadow-sm dark:bg-white/20 dark:text-gray-100'
              : 'text-gray-600 hover:bg-black/[0.05] dark:text-gray-300 dark:hover:bg-white/[0.08]'
          "
          @click.stop="selectTab(tab.id)"
        >
          <span
            class="size-1.5 shrink-0 rounded-full"
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
          <span class="min-w-0 truncate text-xs">{{ tab.assetName }}</span>
          <span
            class="flex size-4 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100 dark:hover:bg-white/10"
            :class="activeTabId === tab.id ? 'opacity-60' : ''"
            @click.stop="closeSession(tab.id)"
          >
            <UIcon name="i-lucide-x" class="size-2.5" />
          </span>
        </button>
      </div>
    </div>

    <UTooltip text="下一个标签" :delay-duration="150">
      <button
        type="button"
        class="workspace-tab-overflow flex size-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.06] disabled:cursor-default disabled:opacity-40 dark:hover:bg-white/[0.1]"
        :disabled="!canSwitchTabs"
        aria-label="下一个标签"
        @click="switchTab('next')"
      >
        <UIcon name="i-lucide-chevron-right" class="size-3.5 text-gray-500 dark:text-gray-400" />
      </button>
    </UTooltip>

    <UDropdownMenu
      :items="tabMenuItems"
      :content="{ align: 'end', side: 'bottom' }"
      :ui="{
        content: 'w-44 max-h-64 overflow-y-auto p-1',
        item: 'py-1.5 text-sm min-w-0',
        label: 'truncate'
      }"
    >
      <button
        type="button"
        class="workspace-tab-overflow flex size-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.1]"
        aria-label="切换终端标签"
      >
        <UIcon name="i-lucide-ellipsis" class="size-3.5 text-gray-500 dark:text-gray-400" />
      </button>
    </UDropdownMenu>
  </div>
</template>

<style scoped>
.workspace-tab-capsule {
  background-color: rgba(0, 0, 0, 0.08);
}

.dark .workspace-tab-capsule {
  background-color: rgba(255, 255, 255, 0.1);
}

.workspace-tab-overflow {
  background-color: rgba(0, 0, 0, 0.08);
}

.dark .workspace-tab-overflow {
  background-color: rgba(255, 255, 255, 0.1);
}

.workspace-tab-strip {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.workspace-tab-strip::-webkit-scrollbar {
  display: none;
}
</style>
