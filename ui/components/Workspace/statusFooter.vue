<script setup lang="ts">
import { useUserInfoStore } from "~/store/modules/userInfo";

const { t } = useI18n();
const { activeWorkspaceMode } = useWorkspaceMode();
const { tabs, activeTab } = useWorkspaceTabs();
const { batchPanelOpen, toggle: toggleBatchPanel } = useBatchCommandPanel();
const userInfoStore = useUserInfoStore();
const { loggedIn, currentUser } = storeToRefs(userInfoStore);
const commandExecutionEnabled = computed(() => currentUser.value?.commandExecutionEnabled === true);

const connectedCount = computed(() => tabs.value.filter((tab) => tab.status === "connected").length);
const connectingCount = computed(
  () => tabs.value.filter((tab) => tab.status === "connecting" || tab.status === "ready").length
);
const failedCount = computed(() => tabs.value.filter((tab) => tab.status === "failed").length);
const username = computed(() => currentUser.value?.name || "");
const siteName = computed(() => currentUser.value?.siteName || currentUser.value?.site || "");
const siteAddress = computed(() => currentUser.value?.site || "");
const loginStatusText = computed(() => {
  if (!loggedIn.value) return "未登录";

  const user = username.value;
  if (!user) return "已登录";
  if (!isTauriRuntime() || !siteName.value) return `已登录 ${user}`;

  return `已登录 ${user}(${siteName.value})`;
});
const activeProtocol = computed(() => activeTab.value?.protocol?.toUpperCase() || "");
const activeText = computed(() => {
  if (activeWorkspaceMode.value !== "assets") return t("Menu.Tool");
  if (!activeTab.value) return "未连接";
  return activeTab.value.assetName;
});
</script>

<template>
  <footer
    class="flex h-7 min-w-0 items-center justify-between px-3 text-[11px] backdrop-saturate-150"
    :style="{
      backgroundColor: 'var(--app-footer-bg)',
      color: 'var(--app-muted)',
      boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--app-border) 82%, transparent)'
    }"
  >
    <div class="flex min-w-0 items-center gap-3">
      <span class="flex items-center gap-1.5">
        <span class="size-1.5 rounded-full" :class="loggedIn ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-gray-500'" />
        <span class="truncate" :title="isTauriRuntime() ? siteAddress : undefined">{{ loginStatusText }}</span>
      </span>
    </div>

    <div class="ml-auto flex min-w-0 items-center gap-3">
      <span class="hidden min-w-0 items-center gap-2 truncate md:flex">
        <span class="truncate font-ui-mono">{{ activeText }}</span>
        <span
          v-if="activeProtocol"
          class="rounded px-1.5 py-0.5 font-ui-mono text-[10px] tracking-[0.08em]"
          :style="{ backgroundColor: 'var(--app-surface-panel)', color: 'var(--app-text-secondary)' }"
        >
          {{ activeProtocol }}
        </span>
      </span>
      <span class="font-ui-mono">{{ tabs.length }} tabs</span>
      <span v-if="connectedCount" class="font-ui-mono">{{ connectedCount }} connected</span>
      <span v-if="connectingCount" class="font-ui-mono">{{ connectingCount }} pending</span>
      <span v-if="failedCount" class="font-ui-mono text-red-500">{{ failedCount }} failed</span>
      <button
        v-if="activeWorkspaceMode === 'assets' && commandExecutionEnabled"
        type="button"
        class="grid size-5 place-items-center rounded transition-colors"
        :class="
          batchPanelOpen
            ? 'bg-primary-500/15 text-primary-600 dark:text-primary-400'
            : 'text-[var(--app-muted)] hover:bg-[var(--app-hover-soft)] hover:text-[var(--app-fg)]'
        "
        :aria-label="t('RightPanel.BatchCommand')"
        :aria-pressed="batchPanelOpen"
        @click="toggleBatchPanel"
      >
        <UIcon name="i-lucide-terminal" class="size-3.5" />
      </button>
    </div>
  </footer>
</template>
