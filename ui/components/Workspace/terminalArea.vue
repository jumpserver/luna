<script setup lang="ts">
const { activeTab, activeTabId, tabs } = useWorkspaceTabs();
</script>

<template>
  <section class="h-full min-h-0 w-full flex flex-col bg-white/20 dark:bg-zinc-950/40">
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
