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
  <section
    class="h-full min-h-0 w-full flex flex-col"
    :style="{ backgroundColor: 'color-mix(in srgb, var(--app-main-bg) 88%, transparent)' }"
  >
    <div class="flex-1 min-h-0">
      <template v-if="!loggedIn">
        <div class="h-full min-h-0 grid place-items-center text-sm" :style="{ color: 'var(--app-muted)' }">
          <div
            class="flex flex-col items-center gap-4 rounded-2xl px-8 py-7 shadow-sm"
            :style="{
              border: '1px solid var(--app-border)',
              backgroundColor: 'var(--app-card-bg-soft)',
              boxShadow: 'var(--theme-shadow-soft)'
            }"
          >
            <UIcon name="i-lucide-log-in" class="size-10" :style="{ color: 'var(--app-muted)' }" />
            <div class="font-medium" :style="{ color: 'var(--app-fg)' }">
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
          <WorkspaceSessionPane v-show="activeTabId === tab.id" :tab="tab" class="h-full min-h-0" />
        </template>
      </template>

      <div v-else class="h-full min-h-0 grid place-items-center text-sm" :style="{ color: 'var(--app-muted)' }">
        <div
          class="flex flex-col items-center gap-3 rounded-2xl px-6 py-5 shadow-sm"
          :style="{
            border: '1px solid var(--app-border)',
            backgroundColor: 'var(--app-card-bg-soft)',
            boxShadow: 'var(--theme-shadow-soft)'
          }"
        >
          <UIcon name="i-lucide-terminal-square" class="size-10" />
          <div class="font-medium" :style="{ color: 'var(--app-fg)' }">
            从左侧选择 SSH 资产开始连接
          </div>
          <div class="font-ui-mono text-[11px]" :style="{ color: 'var(--app-muted)' }">
            builtin_client://ssh
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
