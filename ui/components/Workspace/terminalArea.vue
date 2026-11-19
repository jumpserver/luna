<script setup lang="ts">
import { isKokoTerminalAiAvailable } from "#koko/composables/terminal/useTerminalAiSessions";
import { useUserInfoStore } from "~/store/modules/userInfo";

const { activeTab, activePaneId, activeTabId, tabs } = useWorkspaceTabs();
const { activeWorkspaceMode } = useWorkspaceMode();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);
const { authReady } = useAuthSession();
const showLoginPrompt = computed(
  () =>
    isDesktopRuntime() &&
    authReady.value &&
    !loggedIn.value &&
    activeWorkspaceMode.value === "assets" &&
    activeTab.value?.protocol !== "local-shell" &&
    !activeTab.value?.panes.some((pane) => pane.mode === "session")
);
const { t } = useI18n();
const shortcuts = useAppShortcuts();
const shortcutRows = computed(() => [
  {
    id: "connection",
    icon: "i-lucide-refresh-cw",
    name: t("WorkspaceEmpty.ResetConnectionConfig"),
    hint: t("WorkspaceEmpty.ReselectConnectionHint")
  },
  {
    id: "focus",
    icon: "i-lucide-maximize-2",
    name: t("TabMenu.FocusCurrent"),
    keys: shortcuts.kbds("focus")
  },
  {
    id: "fullscreen",
    icon: "i-lucide-fullscreen",
    name: t("TabMenu.FullscreenCurrent"),
    keys: shortcuts.kbds("fullscreen")
  },
  {
    id: "switch",
    icon: "i-lucide-arrow-left-right",
    name: t("WorkspaceEmpty.SwitchSession"),
    keys: shortcuts.kbds("previousTab").length
      ? [...shortcuts.kbds("previousTab"), "or", ...shortcuts.kbds("nextTab")]
      : shortcuts.kbds("nextTab")
  }
]);
const panes = computed(() => tabs.value.flatMap((tab) => tab.panes));
const activePane = computed(() => activeTab.value?.panes.find((pane) => pane.id === activePaneId.value) || null);
const supportsTerminalAiCommand = computed(() => {
  const pane = activePane.value;
  if (!pane || pane.connectionProgress) return false;
  return isKokoTerminalAiAvailable(pane.id);
});
</script>

<template>
  <section
    data-ai-context="workspace"
    class="relative h-full min-h-0 w-full flex flex-col"
    :style="{ backgroundColor: 'color-mix(in srgb, var(--app-main-bg) 88%, transparent)' }"
  >
    <div class="flex-1 min-h-0">
      <div v-if="showLoginPrompt" class="h-full min-h-0 overflow-y-auto">
        <div class="screen-lock-surface desktop-login-surface">
          <div class="screen-lock-brand">
            <BrandLogo class="screen-lock-brand-mark" />
            <span>JumpServer</span>
          </div>
          <DesktopLoginPanel inline :title="t('Common.Login')" />
        </div>
      </div>

      <div v-if="activeTab" v-show="!showLoginPrompt" class="h-full min-h-0">
        <template v-for="tab in tabs" :key="tab.id">
          <WorkspaceSessionPane v-show="activeTabId === tab.id" :tab="tab" class="h-full min-h-0" />
        </template>
        <WorkspacePaneSurfaceHost v-for="pane in panes" :key="pane.id" :pane="pane" />
      </div>

      <div
        v-else-if="!showLoginPrompt"
        class="h-full min-h-0 grid place-items-center text-sm"
        :style="{ color: 'var(--app-muted)' }"
      >
        <div class="grid w-max grid-cols-[14px_auto_auto] items-center gap-x-3 gap-y-1.5 text-left">
          <template v-for="row in shortcutRows" :key="row.id">
            <UIcon :name="row.icon" class="size-3.5" />
            <span class="font-medium text-(--app-fg)">{{ row.name }}</span>
            <span v-if="row.hint" class="flex items-center gap-1 whitespace-nowrap">
              {{ row.hint }}
            </span>
            <span v-else class="flex items-center gap-1">
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

<style scoped>
.desktop-login-surface {
  min-height: 100%;
}
</style>

<style src="~/assets/css/screen-lock.css" />
