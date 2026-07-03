<script setup lang="ts">
import { useUserInfoStore } from "~/store/modules/userInfo";

const { t } = useI18n();
const { activeWorkspaceMode } = useWorkspaceMode();
const { tabs, activeTab } = useWorkspaceTabs();
const userInfoStore = useUserInfoStore();
const { loggedIn, currentUser } = storeToRefs(userInfoStore);

const connectedCount = computed(() => tabs.value.filter((tab) => tab.status === "connected").length);
const connectingCount = computed(
  () => tabs.value.filter((tab) => tab.status === "connecting" || tab.status === "ready").length
);
const failedCount = computed(() => tabs.value.filter((tab) => tab.status === "failed").length);
const siteName = computed(() => currentUser.value?.site || "");
const activeProtocol = computed(() => activeTab.value?.protocol?.toUpperCase() || "");
const activeText = computed(() => {
  if (activeWorkspaceMode.value !== "assets") return t("Menu.Tool");
  if (!activeTab.value) return "未连接";
  return activeTab.value.assetName;
});
</script>

<template>
  <footer
    class="flex h-7 min-w-0 items-center justify-between border-t border-[color:var(--sidebar-divider-light)] px-3 text-[11px] backdrop-saturate-150"
    :style="{ backgroundColor: 'var(--app-footer-bg)', color: 'var(--app-muted)' }"
  >
    <div class="flex min-w-0 items-center gap-3">
      <span class="flex items-center gap-1.5">
        <span class="size-1.5 rounded-full" :class="loggedIn ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-gray-500'" />
        <span class="truncate">{{ loggedIn ? "已登录" : "未登录" }}</span>
      </span>

      <span v-if="siteName" class="hidden min-w-0 truncate sm:inline">
        {{ siteName }}
      </span>
    </div>

    <div class="flex min-w-0 items-center gap-3">
      <span class="hidden min-w-0 items-center gap-2 truncate md:flex">
        <span class="truncate font-ui-mono">{{ activeText }}</span>
        <span
          v-if="activeProtocol"
          class="rounded bg-black/[0.045] px-1.5 py-0.5 font-ui-mono text-[10px] tracking-[0.08em] text-gray-600 dark:bg-white/[0.07] dark:text-gray-300"
        >
          {{ activeProtocol }}
        </span>
      </span>
      <span class="font-ui-mono">{{ tabs.length }} tabs</span>
      <span v-if="connectedCount" class="font-ui-mono">{{ connectedCount }} connected</span>
      <span v-if="connectingCount" class="font-ui-mono">{{ connectingCount }} pending</span>
      <span v-if="failedCount" class="font-ui-mono text-red-500">{{ failedCount }} failed</span>
    </div>
  </footer>
</template>
