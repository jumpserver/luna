<script setup lang="ts">
const { activeTab, activeTabId, tabs, closeSession, setActiveSession } = useWorkspaceTabs();

const statusText = (status: string) => {
  if (status === "connected") return "已连接";
  if (status === "ready") return "准备中";
  if (status === "failed") return "连接失败";
  return "连接中";
};
</script>

<template>
  <section class="h-full min-h-0 w-full flex flex-col bg-white/20 dark:bg-zinc-950/40">
    <WorkspaceTopHeader>
      <div class="workspace-tab-strip h-full min-w-0 overflow-x-auto flex items-center">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="h-full min-w-40 max-w-64 px-3 flex items-center gap-2 border-r border-gray-200 dark:border-white/10 text-left"
          :class="activeTabId === tab.id ? 'bg-white dark:bg-white/10' : 'hover:bg-gray-50 dark:hover:bg-white/5'"
          @click.stop="setActiveSession(tab.id)"
        >
          <UIcon name="i-lucide-terminal" class="size-4 shrink-0 text-gray-500 dark:text-gray-400" />
          <span class="text-xs font-medium truncate">{{ tab.assetName }}</span>
          <span class="text-[11px] text-gray-500 dark:text-gray-400 uppercase shrink-0">{{ tab.protocol }}</span>
          <UButton
            icon="i-lucide-x"
            size="xs"
            color="neutral"
            variant="ghost"
            class="ml-auto shrink-0"
            @click.stop="closeSession(tab.id)"
          />
        </button>
      </div>
    </WorkspaceTopHeader>

    <div v-if="activeTab" class="h-9 shrink-0 px-3 flex items-center justify-between border-b border-gray-200 dark:border-white/10 text-xs text-gray-500 dark:text-gray-400">
      <div class="flex items-center gap-2 min-w-0">
        <span class="truncate">{{ activeTab.account || "-" }}@{{ activeTab.address }}</span>
        <UBadge size="sm" color="neutral" variant="soft" class="uppercase">
          {{ activeTab.protocol }}
        </UBadge>
      </div>
      <span>{{ statusText(activeTab.status) }}</span>
    </div>

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
.workspace-tab-strip {
  scrollbar-width: thin;
}

.workspace-tab-strip::-webkit-scrollbar {
  height: 3px;
}

.workspace-tab-strip::-webkit-scrollbar-thumb {
  background: rgba(113, 113, 122, 0.35);
  border-radius: 999px;
}
</style>
