<script setup lang="ts">
import { useUserInfoStore } from "~/store/modules/userInfo";

const { t } = useI18n();
const { activeWorkspaceMode } = useWorkspaceMode();
const { tabs, activeTab } = useWorkspaceTabs();
const userInfoStore = useUserInfoStore();
const { loggedIn, currentUser } = storeToRefs(userInfoStore);

const connectedCount = computed(() => tabs.value.filter((tab) => tab.status === "connected").length);
const connectingCount = computed(() => tabs.value.filter((tab) => tab.status === "connecting" || tab.status === "ready").length);
const failedCount = computed(() => tabs.value.filter((tab) => tab.status === "failed").length);
const siteName = computed(() => currentUser.value?.site || "");
const activeText = computed(() => {
  if (activeWorkspaceMode.value !== "assets") return t("Menu.Tool");
  if (!activeTab.value) return "未连接";
  return `${activeTab.value.assetName} · ${activeTab.value.protocol.toUpperCase()}`;
});
</script>

<template>
  <footer
    class="flex h-7 min-w-0 items-center justify-between border-t border-gray-200 bg-white/55 px-3 text-[11px] text-gray-500 backdrop-saturate-150 dark:border-white/10 dark:bg-zinc-950/40 dark:text-gray-400"
  >
    <div class="flex min-w-0 items-center gap-3">
      <span class="flex items-center gap-1.5">
        <span
          class="size-1.5 rounded-full"
          :class="loggedIn ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-gray-500'"
        />
        <span class="truncate">{{ loggedIn ? "已登录" : "未登录" }}</span>
      </span>

      <span v-if="siteName" class="hidden min-w-0 truncate sm:inline">
        {{ siteName }}
      </span>
    </div>

    <div class="flex min-w-0 items-center gap-3">
      <span class="hidden min-w-0 truncate md:inline">{{ activeText }}</span>
      <span>{{ tabs.length }} tabs</span>
      <span v-if="connectedCount">{{ connectedCount }} connected</span>
      <span v-if="connectingCount">{{ connectingCount }} pending</span>
      <span v-if="failedCount" class="text-red-500">{{ failedCount }} failed</span>
    </div>
  </footer>
</template>
