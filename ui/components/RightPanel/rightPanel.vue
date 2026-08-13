<script setup lang="ts">
import type { RightPanelTab } from "~/composables/useRightPanel";
import RightPanelAiPanel from "~/components/RightPanel/aiPanel.vue";
import RightPanelSessionPanel from "~/components/RightPanel/sessionPanel.vue";
import RightPanelSftpPanel from "~/components/RightPanel/sftpPanel.vue";

const { t } = useI18n();
const { activeTab: workspaceTab } = useWorkspaceTabs();
const { activeTab, setActiveTab } = useRightPanel();

// SSH 会话始终提供轻量文件管理入口；真正的 SFTP 权限与令牌由面板在连接时校验，
// 避免因为资产平台或权限元数据不完整而把入口直接隐藏。
const showSftpTab = computed(() => workspaceTab.value?.protocol?.toLowerCase() === "ssh");

const tabs = computed(() => {
  const items: Array<{ value: RightPanelTab; label: string; icon: string }> = [
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
    <div class="shrink-0 px-3" :style="{ borderBottom: '1px solid var(--app-border)' }">
      <div class="right-panel-tab-strip">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          type="button"
          class="right-panel-tab-button"
          :class="{ 'right-panel-tab-button-active': activeTab === tab.value }"
          @click="setActiveTab(tab.value)"
        >
          <UIcon :name="tab.icon" class="right-panel-tab-icon" />
          <span class="truncate">{{ tab.label }}</span>
        </button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-hidden">
      <KeepAlive>
        <component :is="activePanelComponent" />
      </KeepAlive>
    </div>
  </aside>
</template>

<style scoped>
.right-panel-tab-strip {
  display: flex;
  gap: 0.5rem;
}

.right-panel-tab-button {
  position: relative;
  display: inline-flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-start;
  gap: 0.375rem;
  padding: 0.625rem 0.5rem;
  font-size: 0.75rem;
  line-height: 1;
  font-weight: 600;
  color: color-mix(in srgb, var(--app-fg) 52%, transparent);
  transition:
    background-color 140ms ease,
    color 140ms ease,
    border-color 140ms ease;
}

.right-panel-tab-button:hover {
  color: color-mix(in srgb, var(--app-fg) 76%, transparent);
}

.right-panel-tab-button:focus-visible {
  outline: none;
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}

.right-panel-tab-button-active {
  color: var(--app-fg);
}

.right-panel-tab-button-active::after {
  content: "";
  position: absolute;
  inset-inline: 0;
  bottom: -1px;
  height: 2px;
  background: var(--ui-color-primary-500);
}

.right-panel-tab-icon {
  flex-shrink: 0;
  width: 0.875rem;
  height: 0.875rem;
  opacity: 0.88;
}
</style>
