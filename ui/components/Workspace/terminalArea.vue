<script setup lang="ts">
import { isKokoTerminalAiAvailable } from "#koko/composables/terminal/useTerminalAiSessions";
import { useUserInfoStore } from "~/store/modules/userInfo";

const { activeTab, activePaneId, activeTabId, tabs } = useWorkspaceTabs();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);
const { authReady } = useAuthSession();
const showLoginPrompt = computed(
  () => authReady.value && !loggedIn.value && activeTab.value?.protocol !== "local-shell"
);
const { t } = useI18n();
const shortcutRows = computed(() => [
  {
    id: "focus",
    name: t("TabMenu.FocusCurrent"),
    keys: ["meta", "shift", "P"]
  },
  {
    id: "fullscreen",
    name: t("TabMenu.FullscreenCurrent"),
    keys: ["meta", "shift", "F"]
  },
  {
    id: "switch",
    name: t("WorkspaceEmpty.SwitchSession"),
    keys: ["alt", "shift", "arrowleft", "arrowright", "or", "meta", "1-9"]
  }
]);
const panes = computed(() => tabs.value.flatMap((tab) => tab.panes));
const activePane = computed(() => activeTab.value?.panes.find((pane) => pane.id === activePaneId.value) || null);
const supportsTerminalAiCommand = computed(() => {
  const pane = activePane.value;
  if (!pane) return false;
  return isKokoTerminalAiAvailable(pane.id);
});

const openLogin = () => {
  useEventBus().emit("login", undefined);
};
</script>

<template>
  <section
    class="relative h-full min-h-0 w-full flex flex-col"
    :style="{ backgroundColor: 'color-mix(in srgb, var(--app-main-bg) 88%, transparent)' }"
  >
    <div class="flex-1 min-h-0">
      <template v-if="showLoginPrompt">
        <div class="h-full min-h-0 grid place-items-center text-sm" :style="{ color: 'var(--app-muted)' }">
          <UCard
            variant="outline"
            :ui="{
              root: 'rounded-2xl shadow-sm ring-[var(--app-border)] bg-[var(--app-card-bg-soft)]',
              body: 'flex flex-col items-center gap-4 px-8 py-7 sm:p-7'
            }"
          >
            <UIcon name="i-lucide-log-in" class="size-10" :style="{ color: 'var(--app-muted)' }" />
            <div class="font-medium" :style="{ color: 'var(--app-fg)' }">{{ t("WorkspaceEmpty.LoginHint") }}</div>
            <UButton color="primary" variant="soft" class="rounded-xl px-4" @click="openLogin">
              {{ t("Common.Login") }}
            </UButton>
          </UCard>
        </div>
      </template>

      <template v-else-if="activeTab">
        <template v-for="tab in tabs" :key="tab.id">
          <WorkspaceSessionPane v-show="activeTabId === tab.id" :tab="tab" class="h-full min-h-0" />
        </template>
        <WorkspacePaneSurfaceHost v-for="pane in panes" :key="pane.id" :pane="pane" />
      </template>

      <div v-else class="h-full min-h-0 grid place-items-center text-sm" :style="{ color: 'var(--app-muted)' }">
        <div class="grid w-max grid-cols-[auto_auto] items-center gap-x-3 gap-y-1.5 text-left">
          <div class="col-span-2 text-[11px] font-semibold tracking-[0.08em]">
            {{ t("WorkspaceEmpty.Shortcuts") }}
          </div>
          <template v-for="row in shortcutRows" :key="row.id">
            <span class="font-medium text-(--app-fg)">{{ row.name }}</span>
            <span class="flex items-center gap-1">
              <template v-for="(key, index) in row.keys" :key="`${row.id}-${index}`">
                <span v-if="key === 'or'" class="px-0.5 text-xs">{{ t("WorkspaceEmpty.Or") }}</span>
                <UKbd v-else :value="key" />
              </template>
            </span>
          </template>
        </div>
      </div>
    </div>

    <WorkspaceTerminalAiCommandPopover v-if="supportsTerminalAiCommand && activePane" :pane="activePane" />
  </section>
</template>
