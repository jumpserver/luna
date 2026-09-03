<script setup lang="ts">
import { useSftpTransferUi } from "#koko/composables/sftp/useSftpTransferUi";
import { useUserInfoStore } from "~/store/modules/userInfo";

const { t } = useI18n();
const { activeWorkspaceMode } = useWorkspaceMode();
const { tabs, activeTab } = useWorkspaceTabs();
const { batchPanelOpen, toggle: toggleBatchPanel } = useBatchCommandPanel();
const userInfoStore = useUserInfoStore();
const { loggedIn, currentUser } = storeToRefs(userInfoStore);
const { authReady } = useAuthSession();
const commandExecutionEnabled = computed(() => currentUser.value?.commandExecutionEnabled === true);
const workspaceTabs = computed(() => tabs.value ?? []);

const tabCount = computed(() => workspaceTabs.value.length);
const connectedCount = computed(() => workspaceTabs.value.filter((tab) => tab.status === "connected").length);
const connectingCount = computed(
  () => workspaceTabs.value.filter((tab) => tab.status === "connecting" || tab.status === "ready").length
);
const failedCount = computed(() => workspaceTabs.value.filter((tab) => tab.status === "failed").length);
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
const { open: transferOpen, hasActiveTasks, transferTone, taskCount, attentionSequence, toggle } = useSftpTransferUi();
const transferAttracting = ref(false);
let transferAttentionTimer: ReturnType<typeof setTimeout> | undefined;
const transferLabel = computed(() =>
  hasActiveTasks.value ? t("StatusFooter.TransferCount", { count: taskCount.value }) : t("StatusFooter.Transfer")
);

watch(attentionSequence, () => {
  transferAttracting.value = false;
  if (transferAttentionTimer) clearTimeout(transferAttentionTimer);
  void nextTick(() => {
    transferAttracting.value = true;
    transferAttentionTimer = setTimeout(() => {
      transferAttracting.value = false;
      transferAttentionTimer = undefined;
    }, 900);
  });
});

onBeforeUnmount(() => {
  if (transferAttentionTimer) clearTimeout(transferAttentionTimer);
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
      <UBadge
        v-if="loginStatusText"
        color="neutral"
        variant="soft"
        size="xs"
        :ui="{ base: 'max-w-full h-5 px-1.5 text-[11px]' }"
      >
        <template #leading>
          <span class="size-1.5 rounded-full" :class="loggedIn ? 'bg-emerald-500' : 'bg-(--app-muted)'" />
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
        :label="t('StatusFooter.Tabs', { count: tabCount })"
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
      <UBadge
        as="button"
        type="button"
        data-sftp-transfer-trigger
        data-sftp-tour="transfer-center"
        size="xs"
        class="sftp-transfer-trigger-anchor cursor-pointer font-ui-mono"
        :class="{
          'is-idle': transferTone === 'idle',
          'is-busy': transferTone === 'moving',
          'is-paused': transferTone === 'paused',
          'is-failed': transferTone === 'failed',
          'is-attracting': transferAttracting
        }"
        color="neutral"
        variant="soft"
        :ui="compactBadgeUi"
        :trailing-icon="transferOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
        :label="transferLabel"
        :title="t('koko.sftpTransferCenter.queueTitle')"
        :aria-label="transferLabel"
        :aria-expanded="transferOpen"
        aria-controls="sftp-transfer-center"
        @click="toggle"
      >
        <template v-if="transferTone !== 'idle'" #leading>
          <span class="sftp-transfer-trigger-dot" />
        </template>
      </UBadge>
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
