<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

const { activeTab, activeTabId, tabs, closeSession, setActiveSession } = useWorkspaceTabs();

const tabStripRef = ref<HTMLElement | null>(null);
const hasOverflow = ref(false);

const statusText = (status: string) => {
  if (status === "connected") return "已连接";
  if (status === "ready") return "准备中";
  if (status === "failed") return "连接失败";
  return "连接中";
};

const statusDotClass = (status: string) => {
  if (status === "connected") return "bg-blue-500";
  if (status === "ready") return "bg-blue-400";
  if (status === "failed") return "bg-red-500";
  return "bg-gray-400 dark:bg-gray-500";
};

const tabMenuItems = computed<DropdownMenuItem[]>(() =>
  tabs.value.map((tab) => ({
    label: tab.assetName,
    type: "checkbox" as const,
    checked: activeTabId.value === tab.id,
    onSelect: () => selectTab(tab.id)
  }))
);

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
  <section class="h-full min-h-0 w-full flex flex-col bg-white/20 dark:bg-zinc-950/40">
    <WorkspaceTopHeader>
      <div v-if="tabs.length" class="flex h-full min-w-0 items-center gap-1.5 px-3">
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
                :class="statusDotClass(tab.status)"
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

        <UDropdownMenu
          v-if="hasOverflow"
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
    </WorkspaceTopHeader>

    <!-- <div v-if="activeTab" class="h-9 shrink-0 px-3 flex items-center justify-between border-b border-gray-200 dark:border-white/10 text-xs text-gray-500 dark:text-gray-400">
      <div class="flex items-center gap-2 min-w-0">
        <span class="truncate">{{ activeTab.account || "-" }}@{{ activeTab.address }}</span>
        <UBadge size="sm" color="neutral" variant="soft" class="uppercase">
          {{ activeTab.protocol }}
        </UBadge>
      </div>
      <span>{{ statusText(activeTab.status) }}</span>
    </div> -->

    <div class="flex-1 min-h-0">
      <template v-if="activeTab">
        <template v-for="tab in tabs" :key="tab.id">
          <WorkspaceTerminalPane v-show="activeTabId === tab.id" :tab="tab" class="h-full min-h-0" />
        </template>
      </template>

      <div v-else class="h-full min-h-0 grid place-items-center text-sm text-gray-500 dark:text-gray-400">
        <div class="flex flex-col items-center gap-3">
          <UIcon name="i-lucide-terminal-square" class="size-10" />
          <div>从左侧选择 SSH 资产开始连接</div>
        </div>
      </div>
    </div>
  </section>
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
