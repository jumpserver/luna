<script lang="ts" setup>
import type { AssetItem } from "~/types";
import KokoSftpTransferCenter from "#koko/components/FileManagement/SftpTransferCenter.vue";
import WorkspaceShell from "~/components/Workspace/shell.vue";
import WorkspaceStatusFooter from "~/components/Workspace/statusFooter.vue";
import {
  SettingsAboutPage,
  SettingsAppearancePage,
  SettingsApplicationPage,
  SettingsGeneralPage,
  SettingsShortcutsPage,
  SettingsUserPage
} from "~/composables/loadSettingsSection";
import { desktopInvoke, desktopListen, desktopWindow } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";

const AiOverlayPanel = defineAsyncComponent(() => import("~/components/RightPanel/AiOverlayPanel.vue"));

const { initialTheme, listenOSThemeChange } = useThemeAdapter();
const { isMacOS, isWindows } = usePlatform();
const shortcuts = useAppShortcuts();
const { activeWorkspaceMode, uiWorkspaceMode, isUtilityRoute, isVideoPlayerRoute } = useWorkspaceMode();
const { exitFocusMode, focusMode, openLocalShell, registerSessionDisposer } = useWorkspaceTabs();
useWorkspaceFullscreenShortcuts();
useWorkspaceSessionShortcuts(() => activeWorkspaceMode.value === "assets");
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
// Mount on first open, then keep mounted. Unmounting the panel tears down its
// KeepAlive cache, which drops the SFTP file manager's websocket and restarts
// any transfer running in it.
const rightPanelMounted = ref(false);
watch(
  rightPanelOpen,
  (open) => {
    if (open) rightPanelMounted.value = true;
  },
  { immediate: true }
);
const { open: aiPanelOpen, setOpen: setAiPanelOpen } = useAiPanel();
const localePath = useLocalePath();
const { open: settingsOpen, activeSection: activeSettingsSection, openSettings, closeSettings } = useSettingsWindow();
const { recentConnections } = useRecentConnections();
const settingsSectionPages = {
  user: SettingsUserPage,
  general: SettingsGeneralPage,
  shortcuts: SettingsShortcutsPage,
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

watch(
  commandExecutionEnabled,
  (enabled) => {
    if (!enabled) setBatchPanelOpen(false);
  },
  { immediate: true }
);

const showWorkspaceSidebar = computed(() => {
  if (uiWorkspaceMode.value === "files") return false;
  if (uiWorkspaceMode.value === "tools") return isDesktopRuntime();
  return loggedIn.value;
});

const cardUi = computed(() => {
  const base = ["relative", "rounded-none", "overflow-visible"];

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
  if (isWorkspaceTourActive() || event.key !== "Escape" || event.repeat) return;
  if (event.defaultPrevented || !focusMode.value || escapeHoldTimer) return;

  escapeHoldTimer = setTimeout(() => {
    escapeHoldTimer = null;
    void exitFocusMode();
  }, 800);
};

const stopEscapeHold = (event: KeyboardEvent) => {
  if (event.key === "Escape") clearEscapeHold();
};

const handleOpenLocalShellShortcut = (event: KeyboardEvent) => {
  if (shortcuts.blocked(event) || !shortcuts.matches("localShell", event)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!event.repeat) void openAssetWorkspace(openLocalShell);
};

const handleChromeShortcut = (event: KeyboardEvent) => {
  if (shortcuts.blocked(event)) return;
  if (shortcuts.matches("rightPanel", event)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) toggleRightPanel();
    return;
  }
  if (event.repeat) return;
  const usesPrimaryModifier = isMacOS.value ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!usesPrimaryModifier) return;
  if (!event.altKey && !event.shiftKey && event.code === "Comma") {
    event.preventDefault();
    void openSettings();
  } else if (!event.altKey && event.shiftKey && event.code === "Comma" && isDesktopRuntime()) {
    event.preventDefault();
    void navigateTo(localePath("videoplayer"));
  }
};

const handleDesktopMenuCommand = (command: string) => {
  if (command === "open-local-shell") {
    void openAssetWorkspace(openLocalShell);
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

  if (command === "search-connect") {
    void openAssetWorkspace(() => useEventBus().emit("workspaceQuickSearch", undefined));
    return;
  }

  if (command === "open-tools") {
    if (!isDesktopRuntime()) return;
    void navigateTo(localePath("videoplayer"));
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

useEventListener(window, "keydown", startEscapeHold, { capture: true });
useEventListener(window, "keydown", handleOpenLocalShellShortcut, { capture: true });
useEventListener(window, "keydown", handleChromeShortcut, { capture: true });
useEventListener(window, "keyup", stopEscapeHold, { capture: true });
useEventListener(window, "blur", clearEscapeHold);

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
  initialTheme();
  listenOSThemeChange();
  // ponytail: koko WS sessions close on component unmount; no desktop builtin bridge
  registerSessionDisposer(() => {});
  registerKokoTicketProvider(async (request) => {
    if (isDesktopRuntime()) {
      return desktopInvoke("create_koko_connect_ticket", { ...request });
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
  <UCard data-vaul-drawer-wrapper variant="outline" :ui="cardUi" style="background-color: transparent">
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
        <div class="relative flex h-full min-h-0 min-w-0">
          <div class="relative min-h-0 min-w-0 flex-1">
            <button
              v-if="focusMode"
              type="button"
              :aria-label="$t('TabMenu.ExitFocusMode')"
              :title="$t('TabMenu.ExitFocusModeHint')"
              class="group absolute right-3 top-1/2 z-50 flex h-12 w-1.5 -translate-y-1/2 items-center justify-end overflow-hidden rounded-l-lg border border-r-0 border-(--app-border) bg-(--app-surface-panel) text-(--app-muted) opacity-45 shadow-sm transition-[width,opacity] hover:w-32 hover:opacity-100 focus-visible:w-32 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
          </div>
          <KeepAlive>
            <AiOverlayPanel v-if="aiPanelOpen && !isUtilityRoute" @close="setAiPanelOpen(false)" />
          </KeepAlive>
        </div>
      </Main>

      <template #rightPanel>
        <div v-if="isVideoPlayerRoute" id="offline-playlist-host" class="h-full min-h-0" />
        <RightPanel v-else-if="rightPanelMounted" v-show="rightPanelOpen" />
      </template>

      <template #bottomPanel>
        <KokoSftpTransferCenter />
        <div v-if="activeWorkspaceMode === 'assets' && commandExecutionEnabled && batchPanelOpen" class="min-h-0">
          <WorkspaceBatchCommandBottomPanel />
        </div>
      </template>

      <template #footer>
        <div
          v-if="!standaloneAssetWindow"
          v-show="loggedIn && (activeWorkspaceMode === 'assets' || activeWorkspaceMode === 'files') && statusBarVisible"
        >
          <WorkspaceStatusFooter />
        </div>
      </template>
    </WorkspaceShell>

    <Transition name="settings-overlay">
      <div
        v-if="settingsOpen"
        role="dialog"
        aria-modal="true"
        :aria-label="$t('Common.Settings')"
        data-state="open"
        class="fixed inset-0 z-200"
      >
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
