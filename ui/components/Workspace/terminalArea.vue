<script setup lang="ts">
import { useUserInfoStore } from "~/store/modules/userInfo";

const { activeTab, activeTabId, tabs } = useWorkspaceTabs();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);
const { isMacOS } = usePlatform();
const { t } = useI18n();
const tabArrowSwitchModifier = computed(() => (isMacOS.value ? "Option" : "Alt"));
const tabNumberSwitchShortcut = computed(() => (isMacOS.value ? "⌘ + 1-9" : "Ctrl + 1-9"));
const panes = computed(() => tabs.value.flatMap((tab) => tab.panes));

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
      <template v-if="!loggedIn && activeTab?.protocol !== 'local-shell'">
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
            <div class="font-medium" :style="{ color: 'var(--app-fg)' }">登录后查看资产并发起连接</div>
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
        <WorkspacePaneSurfaceHost v-for="pane in panes" :key="pane.id" :pane="pane" />
      </template>

      <div v-else class="h-full min-h-0 grid place-items-center text-sm" :style="{ color: 'var(--app-muted)' }">
        <div class="flex max-w-md flex-col items-center px-6 py-5 text-center">
          <div class="grid w-full gap-3 text-left text-sm">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-mouse-pointer-click" class="size-4.5 shrink-0" />
              <span>
                <strong :style="{ color: 'var(--app-fg)' }">右击资产 → 连接</strong>
                ，可重新选择连接方式
              </span>
            </div>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-folder-tree" class="size-4.5 shrink-0" />
              <span>
                <strong :style="{ color: 'var(--app-fg)' }">右击节点 → 展开全部</strong>
                ，展开节点下的所有资产
              </span>
            </div>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-maximize-2" class="size-4.5 shrink-0" />
              <span>
                <strong :style="{ color: 'var(--app-fg)' }">右击会话标签 → 纯净模式</strong>
                ，长按 Esc 退出纯净模式
              </span>
            </div>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-panels-top-left" class="size-4.5 shrink-0" />
              <span>
                <strong :style="{ color: 'var(--app-fg)' }">切换会话</strong>
                <kbd
                  class="ml-1 rounded px-1.5 py-0.5 font-ui-mono text-xs"
                  :style="{ border: '1px solid var(--app-border)', backgroundColor: 'var(--app-card-bg-soft)' }"
                >
                  {{ tabArrowSwitchModifier }} + Shift + ← / →
                </kbd>
                <span class="mx-1">或</span>
                <kbd
                  class="rounded px-1.5 py-0.5 font-ui-mono text-xs"
                  :style="{ border: '1px solid var(--app-border)', backgroundColor: 'var(--app-card-bg-soft)' }"
                >
                  {{ tabNumberSwitchShortcut }}
                </kbd>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
