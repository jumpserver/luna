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
    <div
      class="shrink-0 px-3 py-2"
      :style="{ borderBottom: '1px solid var(--app-border)' }"
    >
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
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 0.375rem;
  padding: 0.25rem;
  border: 1px solid var(--workspace-surface-sub-border);
  border-radius: 0.875rem;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--app-panel-bg) 88%, white 12%) 0%, var(--workspace-surface-sub-panel) 100%);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 40%, transparent),
    inset 0 -1px 0 color-mix(in srgb, var(--app-border) 35%, transparent);
}

.right-panel-tab-button {
  position: relative;
  display: inline-flex;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  border-radius: 0.75rem;
  padding: 0.5rem 0.625rem;
  font-size: 0.75rem;
  line-height: 1;
  font-weight: 600;
  color: color-mix(in srgb, var(--app-fg) 52%, transparent);
  transition:
    background-color 140ms ease,
    color 140ms ease,
    box-shadow 140ms ease,
    transform 140ms ease;
}

.right-panel-tab-button:hover {
  color: color-mix(in srgb, var(--app-fg) 76%, transparent);
  background: color-mix(in srgb, var(--app-hover-soft) 80%, transparent);
}

.right-panel-tab-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--app-focus-ring);
}

.right-panel-tab-button-active {
  color: var(--app-fg);
  background: color-mix(in srgb, var(--workspace-surface-sub-tab-active) 92%, white 8%);
  box-shadow:
    0 1px 2px color-mix(in srgb, black 10%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 55%, transparent);
}

.right-panel-tab-button-active::after {
  content: "";
  position: absolute;
  inset-inline: 0.75rem;
  bottom: 0.25rem;
  height: 2px;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ui-color-primary-500) 78%, white 22%);
}

.right-panel-tab-icon {
  flex-shrink: 0;
  width: 0.875rem;
  height: 0.875rem;
  opacity: 0.88;
}
</style>
