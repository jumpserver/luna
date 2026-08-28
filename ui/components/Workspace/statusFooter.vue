<script setup lang="ts">
import { useUserInfoStore } from "~/store/modules/userInfo";

const { t } = useI18n();
const { activeWorkspaceMode } = useWorkspaceMode();
const { tabs, activeTab } = useWorkspaceTabs();
const { batchPanelOpen, toggle: toggleBatchPanel } = useBatchCommandPanel();
const userInfoStore = useUserInfoStore();
const { loggedIn, currentUser } = storeToRefs(userInfoStore);
const { authReady } = useAuthSession();
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
  if (!authReady.value) return "";
  if (!loggedIn.value) return t("StatusFooter.LoggedOut");

  const user = username.value;
  if (!user) return t("StatusFooter.LoggedIn");
  if (!isDesktopRuntime() || !siteName.value) return t("StatusFooter.LoggedInUser", { user });

  return t("StatusFooter.LoggedInUserSite", { user, site: siteName.value });
});
const activeProtocol = computed(() => activeTab.value?.protocol?.toUpperCase() || "");
const activeText = computed(() => {
  if (activeWorkspaceMode.value !== "assets") return t("Menu.Tool");
  if (!activeTab.value) return t("StatusFooter.Disconnected");
  return activeTab.value.assetName;
});
const compactBadgeUi = {
  base: "h-5 rounded px-1.5 font-ui-mono text-[10px] leading-none"
};
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
      <UBadge
        v-if="loginStatusText"
        color="neutral"
        variant="soft"
        size="xs"
        :ui="{ base: 'max-w-full h-5 px-1.5 text-[11px]' }"
      >
        <template #leading>
          <span class="size-1.5 rounded-full" :class="loggedIn ? 'bg-emerald-500' : 'bg-[var(--app-muted)]'" />
        </template>
        <span class="truncate" :title="isDesktopRuntime() ? siteAddress : undefined">{{ loginStatusText }}</span>
      </UBadge>
    </div>

    <div class="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
      <span class="hidden min-w-0 items-center gap-1.5 truncate md:flex">
        <span class="truncate font-ui-mono">{{ activeText }}</span>
        <UBadge v-if="activeProtocol" color="neutral" variant="soft" size="xs" :ui="compactBadgeUi">
          {{ activeProtocol }}
        </UBadge>
      </span>
      <UBadge
        color="neutral"
        variant="soft"
        size="xs"
        class="hidden sm:inline-flex"
        :ui="compactBadgeUi"
        :label="t('StatusFooter.Tabs', { count: tabs.length })"
      />
      <UBadge
        v-if="connectedCount"
        color="success"
        variant="soft"
        size="xs"
        class="hidden md:inline-flex"
        :ui="compactBadgeUi"
        :label="t('StatusFooter.Connected', { count: connectedCount })"
      />
      <UBadge
        v-if="connectingCount"
        color="warning"
        variant="soft"
        size="xs"
        class="hidden md:inline-flex"
        :ui="compactBadgeUi"
        :label="t('StatusFooter.Pending', { count: connectingCount })"
      />
      <UBadge
        v-if="failedCount"
        color="error"
        variant="soft"
        size="xs"
        class="hidden md:inline-flex"
        :ui="compactBadgeUi"
        :label="t('StatusFooter.Failed', { count: failedCount })"
      />
      <WorkspaceVirtualKeyboardPopover v-if="activeWorkspaceMode === 'assets'" />
      <UButton
        v-if="activeWorkspaceMode === 'assets' && commandExecutionEnabled"
        icon="i-lucide-terminal"
        size="xs"
        square
        :variant="batchPanelOpen ? 'soft' : 'ghost'"
        :color="batchPanelOpen ? 'primary' : 'neutral'"
        :aria-label="t('RightPanel.BatchCommand')"
        :aria-expanded="batchPanelOpen"
        aria-controls="batch-command-panel"
        class="size-5"
        @click="toggleBatchPanel"
      />
    </div>
  </footer>
</template>
