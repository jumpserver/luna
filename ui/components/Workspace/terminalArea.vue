<script setup lang="ts">
import { useUserInfoStore } from "~/store/modules/userInfo";

const { activeTab, activeTabId, tabs } = useWorkspaceTabs();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);
const { t } = useI18n();

const openLogin = () => {
  useEventBus().emit("login");
};
</script>

<template>
  <section class="h-full min-h-0 w-full flex flex-col bg-white/20 dark:bg-zinc-950/40">
    <div class="flex-1 min-h-0">
      <template v-if="!loggedIn">
        <div class="h-full min-h-0 grid place-items-center text-sm text-gray-500 dark:text-gray-400">
          <div class="flex flex-col items-center gap-4 rounded-2xl border border-black/6 bg-white/40 px-8 py-7 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none">
            <UIcon name="i-lucide-log-in" class="size-10 text-gray-400 dark:text-gray-500" />
            <div class="font-medium text-gray-700 dark:text-gray-200">
              登录后查看资产并发起连接
            </div>
            <UButton color="primary" variant="soft" class="rounded-xl px-4" @click="openLogin">
              {{ t("Common.Login") }}
            </UButton>
          </div>
        </div>
      </template>

      <template v-else-if="activeTab">
        <template v-for="tab in tabs" :key="tab.id">
          <WorkspaceTerminalPane v-show="activeTabId === tab.id" :tab="tab" class="h-full min-h-0" />
        </template>
      </template>

      <div v-else class="h-full min-h-0 grid place-items-center text-sm text-gray-500 dark:text-gray-400">
        <div class="flex flex-col items-center gap-3 rounded-2xl border border-black/6 bg-white/40 px-6 py-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none">
          <UIcon name="i-lucide-terminal-square" class="size-10" />
          <div class="font-medium text-gray-700 dark:text-gray-200">
            从左侧选择 SSH 资产开始连接
          </div>
          <div class="font-ui-mono text-[11px] text-gray-400 dark:text-gray-500">
            builtin_client://ssh
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
