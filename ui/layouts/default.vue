<script lang="ts" setup>
import WorkspaceBatchCommandBottomPanel from "~/components/Workspace/batchCommandBottomPanel.vue";
import WorkspaceShell from "~/components/Workspace/shell.vue";
import WorkspaceStatusFooter from "~/components/Workspace/statusFooter.vue";
import { getPublicSettings } from "~/composables/useApiRequest";
import SettingsAboutPage from "~/pages/setting/about.vue";
import SettingsAppearancePage from "~/pages/setting/appearance.vue";
import SettingsApplicationPage from "~/pages/setting/application.vue";
import SettingsGeneralPage from "~/pages/setting/general.vue";
import { useUserInfoStore } from "~/store/modules/userInfo";

const { initialTheme, listenOSThemeChange } = useThemeAdapter();
const { isMacOS, isWindows } = usePlatform();
const { activeWorkspaceMode, uiWorkspaceMode } = useWorkspaceMode();
const {
  activeTabId,
  enterFocusMode,
  enterFullscreenMode,
  exitFocusMode,
  focusMode,
  registerSessionDisposer,
  workspaceFullscreen
} = useWorkspaceTabs();
const { registerKokoTicketProvider } = useWorkspaceConnectors();
const userInfoStore = useUserInfoStore();
const { loggedIn, currentUser } = storeToRefs(userInfoStore);
const { batchPanelOpen, setOpen: setBatchPanelOpen } = useBatchCommandPanel();
const { open: settingsOpen, activeSection: activeSettingsSection } = useSettingsWindow();
const commandExecutionEnabled = computed(() => currentUser.value?.commandExecutionEnabled === true);

const refreshCommandExecutionSetting = async () => {
  if (!loggedIn.value) return;

  try {
    const settings = await getPublicSettings();
    userInfoStore.setCommandExecutionEnabled(settings.SECURITY_COMMAND_EXECUTION === true);
  } catch (error) {
    userInfoStore.setCommandExecutionEnabled(false);
    console.debug("refresh command execution setting failed", error);
  }
};

watch(
  commandExecutionEnabled,
  (enabled) => {
    if (!enabled) setBatchPanelOpen(false);
  },
  { immediate: true }
);

const showWorkspaceSidebar = computed(
  () =>
    uiWorkspaceMode.value !== "files" &&
    uiWorkspaceMode.value !== "tools" &&
    (uiWorkspaceMode.value !== "assets" || loggedIn.value)
);

const cardUi = computed(() => {
  const base = ["rounded-none", "overflow-visible"];

  if (isWindows.value) {
    base.push("border-0", "ring-0", "shadow-none", "bg-transparent");
  }

  return {
    header: "p-0 sm:px-0",
    body: "p-0 sm:p-0",
    footer: "p-0 sm:p-0",
    root: base.join(" ")
  };
});

let escapeHoldTimer: ReturnType<typeof setTimeout> | null = null;

const clearEscapeHold = () => {
  if (!escapeHoldTimer) return;
  clearTimeout(escapeHoldTimer);
  escapeHoldTimer = null;
};

const startEscapeHold = (event: KeyboardEvent) => {
  if (!focusMode.value || event.key !== "Escape" || event.repeat || escapeHoldTimer) return;

  escapeHoldTimer = setTimeout(() => {
    escapeHoldTimer = null;
    void exitFocusMode();
  }, 800);
};

const stopEscapeHold = (event: KeyboardEvent) => {
  if (event.key === "Escape") clearEscapeHold();
};

const handleWorkspaceModeShortcut = (event: KeyboardEvent) => {
  const usesPrimaryModifier = isMacOS.value ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (event.repeat || event.altKey || !event.shiftKey || !usesPrimaryModifier || !activeTabId.value) return;

  if (event.code !== "KeyP" && event.code !== "KeyF") return;

  event.preventDefault();
  event.stopPropagation();

  if (event.code === "KeyP") {
    if (focusMode.value) void exitFocusMode();
    else enterFocusMode(activeTabId.value);
    return;
  }

  if (workspaceFullscreen.value) void exitFocusMode();
  else void enterFullscreenMode(activeTabId.value);
};

useEventListener(window, "keydown", startEscapeHold);
useEventListener(window, "keydown", handleWorkspaceModeShortcut, { capture: true });
useEventListener(window, "keyup", stopEscapeHold);
useEventListener(window, "blur", clearEscapeHold);
useEventListener(window, "focus", refreshCommandExecutionSetting);

watch(focusMode, (active) => {
  if (!active) clearEscapeHold();
});

onMounted(() => {
  void refreshCommandExecutionSetting();
  initialTheme();
  listenOSThemeChange();
  warmupWebSettings();
  // ponytail: koko WS sessions close on component unmount; no Rust builtin bridge
  registerSessionDisposer(() => {});
  registerKokoTicketProvider(async (request) => {
    if (isTauriRuntime()) {
      return useTauriCoreInvoke("create_koko_connect_ticket", {
        baseUrl: request.baseUrl,
        tokenId: request.tokenId
      });
    }

    const url = `${request.baseUrl.replace(/\/+$/, "")}/koko/api/connect-ticket/`;
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...getWebApiMutationHeaders() },
      body: JSON.stringify({ token_id: request.tokenId })
    });

    if (!response.ok) {
      throw new Error(`create koko connect ticket failed: ${response.status}`);
    }

    return response.json() as Promise<{ ticket?: string }>;
  });
});

onBeforeUnmount(() => {
  clearEscapeHold();
  registerSessionDisposer(null);
  registerKokoTicketProvider(null);
});
</script>

<template>
  <UCard variant="outline" :ui="cardUi" style="background-color: transparent">
    <WorkspaceShell v-show="!settingsOpen" :sidebar-visible="showWorkspaceSidebar" :focus-mode="focusMode">
      <template #header>
        <Header />
      </template>

      <template #sidebar>
        <SideBar />
      </template>

      <Main class="relative h-full min-h-0">
        <button
          v-if="focusMode"
          type="button"
          :aria-label="$t('TabMenu.ExitFocusMode')"
          :title="$t('TabMenu.ExitFocusModeHint')"
          class="group absolute right-0 top-1/2 z-50 flex h-12 w-1.5 -translate-y-1/2 items-center justify-end overflow-hidden rounded-l-lg border border-r-0 border-[var(--app-border)] bg-[var(--app-surface-panel)] text-[var(--app-muted)] opacity-45 shadow-sm transition-[width,opacity] hover:w-32 hover:opacity-100 focus-visible:w-32 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          @click.stop="exitFocusMode"
        >
          <span
            class="flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2 text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            <UIcon name="i-lucide-minimize-2" class="size-3.5" />
            {{ $t("TabMenu.ExitFocusMode") }}
          </span>
        </button>
        <WorkspaceTerminalArea v-show="activeWorkspaceMode === 'assets'" class="h-full min-h-0" />
        <div v-show="activeWorkspaceMode !== 'assets'" class="h-full min-h-0">
          <slot />
        </div>
      </Main>

      <template #rightPanel>
        <RightPanel />
      </template>

      <template #bottomPanel>
        <div v-show="activeWorkspaceMode === 'assets' && commandExecutionEnabled && batchPanelOpen" class="min-h-0">
          <WorkspaceBatchCommandBottomPanel />
        </div>
      </template>

      <template #footer>
        <div v-show="activeWorkspaceMode === 'assets'">
          <WorkspaceStatusFooter />
        </div>
      </template>
    </WorkspaceShell>

    <SettingsShell
      v-if="settingsOpen"
      mode="inline"
      :active-section="activeSettingsSection"
      class="fixed inset-0 z-100"
    >
      <KeepAlive>
        <SettingsGeneralPage v-if="activeSettingsSection === 'general'" />
        <SettingsAppearancePage v-else-if="activeSettingsSection === 'appearance'" />
        <SettingsApplicationPage v-else-if="activeSettingsSection === 'application'" embedded />
        <SettingsAboutPage v-else />
      </KeepAlive>
    </SettingsShell>
  </UCard>
</template>
