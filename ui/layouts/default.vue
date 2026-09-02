<script lang="ts" setup>
import type { AssetItem } from "~/types";
import AiOverlayPanel from "~/components/RightPanel/AiOverlayPanel.vue";
import WorkspaceShell from "~/components/Workspace/shell.vue";
import WorkspaceStatusFooter from "~/components/Workspace/statusFooter.vue";
import {
  SettingsAboutPage,
  SettingsAppearancePage,
  SettingsApplicationPage,
  SettingsGeneralPage,
  SettingsUserPage
} from "~/composables/loadSettingsSection";
import { getPublicSettings } from "~/composables/useApiRequest";
import { desktopInvoke, desktopListen, desktopWindow } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";

const { initialTheme, listenOSThemeChange } = useThemeAdapter();
const { isMacOS, isWindows } = usePlatform();
const { activeWorkspaceMode, uiWorkspaceMode } = useWorkspaceMode();
const {
  activeTabId,
  closeSession,
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
const {
  collapse: sidebarCollapsed,
  setCollapse: setSidebarCollapsed,
  setStatusBarVisible,
  statusBarVisible
} = useSettingManager();
const { open: rightPanelOpen, toggle: toggleRightPanel } = useRightPanel();
const { open: aiPanelOpen, setOpen: setAiPanelOpen } = useAiPanel();
const localePath = useLocalePath();
const { open: settingsOpen, activeSection: activeSettingsSection, openSettings, closeSettings } = useSettingsWindow();
const { recentConnections } = useRecentConnections();
const settingsSectionPages = {
  user: SettingsUserPage,
  general: SettingsGeneralPage,
  appearance: SettingsAppearancePage,
  application: SettingsApplicationPage,
  about: SettingsAboutPage
} as const;
const activeSettingsPage = computed(() => settingsSectionPages[activeSettingsSection.value] || SettingsAboutPage);
const commandExecutionEnabled = computed(() => currentUser.value?.commandExecutionEnabled === true);
const standaloneAssetWindow = ref(false);
const { authReady } = useAuthSession();
const workspaceTour = useWorkspaceTour();
const canStartWorkspaceTour = computed(
  () =>
    authReady.value &&
    loggedIn.value &&
    !standaloneAssetWindow.value &&
    !settingsOpen.value &&
    !focusMode.value &&
    !sidebarCollapsed.value &&
    activeWorkspaceMode.value === "assets"
);
const { start: scheduleWorkspaceTour, stop: stopScheduledWorkspaceTour } = useTimeoutFn(
  () => {
    void workspaceTour.startOnce();
  },
  650,
  { immediate: false }
);

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
  if (isWorkspaceTourActive() || !focusMode.value || event.key !== "Escape" || event.repeat || escapeHoldTimer) return;

  escapeHoldTimer = setTimeout(() => {
    escapeHoldTimer = null;
    void exitFocusMode();
  }, 800);
};

const stopEscapeHold = (event: KeyboardEvent) => {
  if (event.key === "Escape") clearEscapeHold();
};

const handleChromeShortcut = (event: KeyboardEvent) => {
  if (isWorkspaceTourActive() || event.defaultPrevented || event.repeat) return;

  const usesPrimaryModifier = isMacOS.value ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!usesPrimaryModifier) return;

  if (!event.altKey && !event.shiftKey && event.code === "Comma") {
    event.preventDefault();
    void openSettings();
    return;
  }

  if (!event.altKey && event.shiftKey && event.code === "Comma") {
    if (!isDesktopRuntime()) return;
    event.preventDefault();
    void navigateTo(localePath({ path: "/tools" }));
    return;
  }

  if (event.altKey && !event.shiftKey && event.code === "Digit2") {
    event.preventDefault();
    toggleRightPanel();
  }
};

const handleWorkspaceModeShortcut = (event: KeyboardEvent) => {
  if (isWorkspaceTourActive()) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }

  if (
    !event.defaultPrevented &&
    !event.repeat &&
    event.altKey &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    event.code === "KeyW" &&
    !isDesktopRuntime() &&
    activeWorkspaceMode.value === "assets" &&
    !settingsOpen.value &&
    activeTabId.value
  ) {
    event.preventDefault();
    event.stopPropagation();
    void closeSession(activeTabId.value);
    return;
  }

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

const toggleDesktopFullscreen = async () => {
  if (workspaceFullscreen.value) {
    await exitFocusMode();
    return;
  }
  if (activeTabId.value) {
    await enterFullscreenMode(activeTabId.value);
    return;
  }

  await desktopWindow.toggleFullscreen();
};

const handleDesktopMenuCommand = (command: string) => {
  if (command === "close-current-tab") {
    if (activeWorkspaceMode.value === "assets" && !settingsOpen.value && activeTabId.value) {
      void closeSession(activeTabId.value);
    }
    return;
  }

  if (command === "toggle-focus-mode") {
    if (focusMode.value) void exitFocusMode();
    else if (activeTabId.value) enterFocusMode(activeTabId.value);
    return;
  }

  if (command === "toggle-left-panel") {
    setSidebarCollapsed(!sidebarCollapsed.value);
    return;
  }

  if (command === "toggle-right-panel") {
    toggleRightPanel();
    return;
  }

  if (command === "toggle-batch-command") {
    setBatchPanelOpen(!batchPanelOpen.value);
    return;
  }

  if (command === "toggle-status-bar") {
    setStatusBarVisible(!statusBarVisible.value);
    return;
  }

  if (command === "toggle-fullscreen-mode") {
    void toggleDesktopFullscreen();
    return;
  }

  if (command === "search-connect") {
    void openAssetWorkspace(() => useEventBus().emit("workspaceQuickSearch", undefined));
    return;
  }

  if (command === "open-tools") {
    if (!isDesktopRuntime()) return;
    void navigateTo(localePath({ path: "/tools" }));
  }
};

let unlistenDesktopMenuCommand: (() => void) | null = null;
let unlistenDesktopTrayConnect: (() => void) | null = null;

async function openAssetWorkspace(ready: () => void) {
  await closeSettings();
  if (activeWorkspaceMode.value !== "assets") await navigateTo("/");
  setSidebarCollapsed(false);
  await nextTick();
  ready();
}

const syncTrayRecentConnections = () => {
  if (!isDesktopRuntime() || desktopWindow.label() !== "main") return;
  void desktopInvoke("set_tray_recent_connections", {
    enabled: loggedIn.value,
    items: loggedIn.value
      ? recentConnections.value.map(({ id, name, address, org_id, platform, category, type }) => ({
          id,
          name,
          address,
          org_id,
          platform,
          category,
          type
        }))
      : []
  }).catch((error) => console.debug("sync tray recent connections failed", error));
};

useEventListener(window, "keydown", startEscapeHold);
useEventListener(window, "keydown", handleChromeShortcut);
useEventListener(window, "keydown", handleWorkspaceModeShortcut, { capture: true });
useEventListener(window, "keyup", stopEscapeHold);
useEventListener(window, "blur", clearEscapeHold);
useEventListener(window, "focus", refreshCommandExecutionSetting);

watch(focusMode, (active) => {
  if (!active) clearEscapeHold();
});

watch([loggedIn, recentConnections], syncTrayRecentConnections, { immediate: true });

watch(
  canStartWorkspaceTour,
  (canStart) => {
    stopScheduledWorkspaceTour();
    if (!canStart) {
      workspaceTour.destroy();
      return;
    }
    workspaceTour.arm();
    scheduleWorkspaceTour();
  },
  { immediate: true }
);

onMounted(() => {
  if (isDesktopRuntime()) {
    standaloneAssetWindow.value = desktopWindow.label().startsWith("asset-");
  }
  void refreshCommandExecutionSetting();
  initialTheme();
  listenOSThemeChange();
  // ponytail: koko WS sessions close on component unmount; no desktop builtin bridge
  registerSessionDisposer(() => {});
  registerKokoTicketProvider(async (request) => {
    if (isDesktopRuntime()) {
      return desktopInvoke("create_koko_connect_ticket", {
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

  if (isDesktopRuntime()) {
    void desktopListen<string>("desktop-menu-command", ({ payload }) => {
      handleDesktopMenuCommand(payload);
    }).then((unlisten) => {
      unlistenDesktopMenuCommand = unlisten;
    });
    void desktopListen<AssetItem>("desktop-tray-connect-asset", ({ payload }) => {
      void openAssetWorkspace(() => useEventBus().emit("workspaceQuickConnectAsset", payload));
    }).then((unlisten) => {
      unlistenDesktopTrayConnect = unlisten;
    });
  }
});

onBeforeUnmount(() => {
  stopScheduledWorkspaceTour();
  workspaceTour.destroy();
  unlistenDesktopMenuCommand?.();
  unlistenDesktopTrayConnect?.();
  clearEscapeHold();
  registerSessionDisposer(null);
  registerKokoTicketProvider(null);
});
</script>

<template>
  <UCard variant="outline" :ui="cardUi" style="background-color: transparent">
    <WorkspaceShell
      :sidebar-visible="showWorkspaceSidebar"
      :focus-mode="focusMode"
      :inert="settingsOpen"
      :class="settingsOpen ? 'pointer-events-none' : undefined"
    >
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
          class="group absolute right-0 top-1/2 z-50 flex h-12 w-1.5 -translate-y-1/2 items-center justify-end overflow-hidden rounded-l-lg border border-r-0 border-(--app-border) bg-[var(--app-surface-panel)] text-[var(--app-muted)] opacity-45 shadow-sm transition-[width,opacity] hover:w-32 hover:opacity-100 focus-visible:w-32 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
        <RightPanel v-if="rightPanelOpen" />
      </template>

      <template #overlayPanel>
        <AiOverlayPanel v-if="aiPanelOpen && !focusMode" @close="setAiPanelOpen(false)" />
      </template>

      <template #bottomPanel>
        <div v-if="activeWorkspaceMode === 'assets' && commandExecutionEnabled && batchPanelOpen" class="min-h-0">
          <WorkspaceBatchCommandBottomPanel />
        </div>
      </template>

      <template #footer>
        <div v-if="!standaloneAssetWindow" v-show="loggedIn && activeWorkspaceMode === 'assets' && statusBarVisible">
          <WorkspaceStatusFooter />
        </div>
      </template>
    </WorkspaceShell>

    <Transition name="settings-overlay">
      <div v-if="settingsOpen" class="fixed inset-0 z-[200]">
        <SettingsShell mode="inline" :active-section="activeSettingsSection" class="h-full">
          <Transition name="settings-section" mode="out-in">
            <KeepAlive>
              <component
                :is="activeSettingsPage"
                :key="activeSettingsSection"
                v-bind="activeSettingsSection === 'application' ? { embedded: true } : {}"
              />
            </KeepAlive>
          </Transition>
        </SettingsShell>
      </div>
    </Transition>
  </UCard>
</template>
