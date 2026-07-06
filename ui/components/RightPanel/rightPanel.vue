<script setup lang="ts">
import RightPanelAiPanel from "~/components/RightPanel/aiPanel.vue";
import RightPanelSessionPanel from "~/components/RightPanel/sessionPanel.vue";
import RightPanelSftpPanel from "~/components/RightPanel/sftpPanel.vue";

const { t } = useI18n();
const { activeTab: workspaceTab } = useWorkspaceTabs();
const { activeTab, setActiveTab } = useRightPanel();

const showSftpTab = computed(() => workspaceTab.value?.protocol === "ssh");

const tabs = computed(() => {
  const items = [
    { value: "session" as const, label: t("RightPanel.Session"), icon: "i-lucide-terminal" },
    { value: "ai" as const, label: t("RightPanel.AI"), icon: "i-lucide-sparkles" }
  ];

  if (showSftpTab.value) {
    items.push({ value: "sftp" as const, label: t("RightPanel.SFTP"), icon: "i-lucide-folder-symlink" });
  }

  return items;
});

const panelComponents = {
  session: RightPanelSessionPanel,
  ai: RightPanelAiPanel,
  sftp: RightPanelSftpPanel
} as const;

const activePanelComponent = computed(() => panelComponents[activeTab.value]);

watch(showSftpTab, (visible) => {
  if (!visible && activeTab.value === "sftp") setActiveTab("session");
});
</script>

<template>
  <aside
    class="flex h-full min-h-0 w-full flex-col"
    :style="{
      borderLeft: '1px solid var(--app-border)',
      backgroundColor: 'var(--app-panel-bg)',
      color: 'var(--app-fg)'
    }"
  >
    <div class="flex h-9 shrink-0 items-center gap-0.5 px-1" :style="{ borderBottom: '1px solid var(--app-border)' }">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        type="button"
        class="flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors"
        :class="
          activeTab === tab.value
            ? 'bg-black/6 text-gray-900 dark:bg-white/10 dark:text-white'
            : 'text-gray-500 hover:bg-black/4 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/6 dark:hover:text-gray-200'
        "
        @click="setActiveTab(tab.value)"
      >
        <UIcon :name="tab.icon" class="size-3.5 shrink-0" />
        <span class="truncate">{{ tab.label }}</span>
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-hidden">
      <KeepAlive>
        <component :is="activePanelComponent" />
      </KeepAlive>
    </div>
  </aside>
</template>
