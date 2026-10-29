<script setup lang="ts">
import { isKokoTerminalAiAvailable } from "#koko/composables/terminal/useTerminalAiSessions";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { clientLoginReasonMessageKey } from "~/utils/clientLoginPolicy";

const { activeTab, activePaneId, activeTabId, tabs } = useWorkspaceTabs();
const userInfoStore = useUserInfoStore();
const { loggedIn, userMap } = storeToRefs(userInfoStore);
const currentUser = computed(() => userMap.value[userInfoStore.currentAccountId]);
const { authReady } = useAuthSession();
const showLoginPrompt = computed(
  () =>
    isDesktopRuntime() &&
    authReady.value &&
    !loggedIn.value &&
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
        <div class="flex h-full min-h-0 items-center justify-center p-4 text-sm" :style="{ color: 'var(--app-muted)' }">
          <UCard
            variant="outline"
            :ui="{
              root: 'rounded-2xl shadow-sm ring-[var(--app-border)] bg-[var(--app-card-bg-soft)]',
              body: 'flex min-h-0 flex-col items-center gap-5 overflow-hidden px-6 py-8 sm:p-8'
            }"
            class="flex max-h-full w-full max-w-lg flex-col"
          >
            <UIcon name="i-lucide-log-in" class="size-10 shrink-0" :style="{ color: 'var(--app-muted)' }" />
            <div class="shrink-0 font-medium" :style="{ color: 'var(--app-fg)' }">
              {{ t("WorkspaceEmpty.LoginHint") }}
            </div>
            <p v-if="currentUser?.sessionExpired" class="shrink-0 text-center text-warning" role="status">
              {{ t(clientLoginReasonMessageKey(currentUser.sessionExpiredReason)) }}
            </p>
            <UButton color="primary" variant="soft" class="shrink-0 rounded-xl px-4" @click="openLogin">
              {{ t(currentUser?.sessionExpired ? "Login.SignInAgain" : "Common.Login") }}
            </UButton>
            <div
              v-if="Object.keys(userMap).length"
              class="flex min-h-0 w-full flex-col gap-1 rounded-[length:var(--app-radius)] border border-(--app-border) p-1"
            >
              <p class="shrink-0 px-1 py-1 text-[11px] text-muted">{{ t("Login.SavedSites") }}</p>
              <SiteAccounts />
            </div>
          </UCard>
        </div>
      </template>

      <!-- Login expiry must not tear down transports owned by these surfaces. -->
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
