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
const { isMacOS } = usePlatform();
const { t } = useI18n();
const tabArrowSwitchModifier = computed(() => (isMacOS.value ? "Option" : "Alt"));
const tabNumberSwitchShortcut = computed(() => (isMacOS.value ? "⌘ + 1-9" : "Ctrl + 1-9"));
const cleanModeShortcut = computed(() => (isMacOS.value ? "⌘ + Shift + P" : "Ctrl + Shift + P"));
const fullscreenModeShortcut = computed(() => (isMacOS.value ? "⌘ + Shift + F" : "Ctrl + Shift + F"));
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
    data-ai-context="workspace"
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
        <div class="flex max-w-md flex-col items-center px-6 py-5 text-center">
          <div class="grid w-full gap-3 text-left text-sm">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-mouse-pointer-click" class="size-4.5 shrink-0" />
              <span>
                <strong :style="{ color: 'var(--app-fg)' }">{{ t("WorkspaceEmpty.ConnectAsset") }}</strong>
                {{ t("WorkspaceEmpty.ConnectAssetHint") }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-folder-tree" class="size-4.5 shrink-0" />
              <span>
                <strong :style="{ color: 'var(--app-fg)' }">{{ t("WorkspaceEmpty.ExpandNode") }}</strong>
                {{ t("WorkspaceEmpty.ExpandNodeHint") }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-maximize-2" class="size-4.5 shrink-0" />
              <span class="flex flex-wrap items-center gap-1">
                <strong :style="{ color: 'var(--app-fg)' }">
                  {{ t("TabMenu.FocusCurrent") }} / {{ t("TabMenu.FullscreenCurrent") }}
                </strong>
                <UKbd size="sm">{{ cleanModeShortcut }}</UKbd>
                <span>/</span>
                <UKbd size="sm">{{ fullscreenModeShortcut }}</UKbd>
              </span>
            </div>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-panels-top-left" class="size-4.5 shrink-0" />
              <span class="flex flex-wrap items-center gap-1">
                <strong :style="{ color: 'var(--app-fg)' }">{{ t("WorkspaceEmpty.SwitchSession") }}</strong>
                <UKbd size="sm">{{ tabArrowSwitchModifier }} + Shift + ← / →</UKbd>
                <span>{{ t("WorkspaceEmpty.Or") }}</span>
                <UKbd size="sm">{{ tabNumberSwitchShortcut }}</UKbd>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <WorkspaceTerminalAiCommandPopover v-if="supportsTerminalAiCommand && activePane" :pane="activePane" />
  </section>
</template>
