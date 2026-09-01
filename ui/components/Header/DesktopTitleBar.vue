<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import { desktopInvoke, desktopWindow } from "~/shared/desktop/bridge";

const props = withDefaults(
  defineProps<{
    showMenus?: boolean;
  }>(),
  {
    showMenus: true
  }
);

const { t } = useI18n();
const { isLoading, isMacOS } = usePlatform();
const { openSettings } = useSettingsWindow();
const {
  collapse: sidebarCollapsed,
  setCollapse: setSidebarCollapsed,
  setStatusBarVisible,
  statusBarVisible
} = useSettingManager();
const { open: rightPanelOpen, toggle: toggleRightPanel } = useRightPanel();
const { batchPanelOpen, toggle: toggleBatchPanel } = useBatchCommandPanel();
const { activeTabId, enterFocusMode, enterFullscreenMode, exitFocusMode, focusMode, workspaceFullscreen } =
  useWorkspaceTabs();

const visible = computed(() => isDesktopRuntime() && !isLoading.value && !isMacOS.value);
const maximized = ref(false);
let unlistenResize: (() => void) | null = null;

const syncMaximized = async () => {
  if (!isDesktopRuntime()) return;
  maximized.value = await desktopWindow.isMaximized().catch(() => false);
};

onMounted(async () => {
  if (!isDesktopRuntime()) return;
  await syncMaximized();
  unlistenResize = await desktopWindow.onResized(syncMaximized);
});

onBeforeUnmount(() => {
  unlistenResize?.();
});
const runEditCommand = (command: "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll") => {
  document.execCommand(command);
};

const toggleFocusMode = () => {
  if (focusMode.value) {
    void exitFocusMode();
    return;
  }

  if (activeTabId.value) enterFocusMode(activeTabId.value);
};

const toggleFullscreenMode = () => {
  if (workspaceFullscreen.value) {
    void exitFocusMode();
    return;
  }
  if (activeTabId.value) void enterFullscreenMode(activeTabId.value);
};

const shortcutLabel = (kbds: DropdownMenuItem["kbds"]) =>
  kbds
    ?.map((kbd) => {
      if (!kbd) return "";
      if (typeof kbd !== "string") return kbd.value;
      if (kbd.length === 1) return kbd.toUpperCase();
      return `${kbd.charAt(0).toUpperCase()}${kbd.slice(1)}`;
    })
    .join("+");

const menuGroups = computed<Array<{ label: string; items: DropdownMenuItem[] }>>(() => [
  {
    label: t("DesktopMenu.File"),
    items: [
      {
        label: t("Common.Settings"),
        kbds: ["ctrl", ","],
        onSelect: () => void openSettings()
      },
      {
        label: t("Menu.MyTools"),
        kbds: ["ctrl", "shift", ","],
        onSelect: () => void navigateTo("/tools")
      },
      { type: "separator" },
      {
        label: t("ToolTips.Close"),
        kbds: ["alt", "f4"],
        onSelect: () => void desktopInvoke("close_window")
      }
    ]
  },
  {
    label: t("DesktopMenu.Edit"),
    items: [
      { label: t("DesktopMenu.Undo"), kbds: ["ctrl", "z"], onSelect: () => runEditCommand("undo") },
      { label: t("DesktopMenu.Redo"), kbds: ["ctrl", "shift", "z"], onSelect: () => runEditCommand("redo") },
      { type: "separator" },
      { label: t("DesktopMenu.Cut"), kbds: ["ctrl", "x"], onSelect: () => runEditCommand("cut") },
      { label: t("DesktopMenu.Copy"), kbds: ["ctrl", "c"], onSelect: () => runEditCommand("copy") },
      { label: t("DesktopMenu.Paste"), kbds: ["ctrl", "v"], onSelect: () => runEditCommand("paste") },
      { label: t("DesktopMenu.SelectAll"), kbds: ["ctrl", "a"], onSelect: () => runEditCommand("selectAll") }
    ]
  },
  {
    label: t("DesktopMenu.View"),
    items: [
      {
        label: t("TabMenu.FocusCurrent"),
        type: "checkbox",
        kbds: ["ctrl", "shift", "p"],
        checked: focusMode.value,
        disabled: !activeTabId.value,
        onSelect: toggleFocusMode
      },
      {
        label: t("DesktopMenu.LeftPanel"),
        type: "checkbox",
        checked: !sidebarCollapsed.value,
        onSelect: () => setSidebarCollapsed(!sidebarCollapsed.value)
      },
      {
        label: t("DesktopMenu.RightPanel"),
        type: "checkbox",
        checked: rightPanelOpen.value,
        onSelect: toggleRightPanel
      },
      {
        label: t("RightPanel.BatchCommand"),
        type: "checkbox",
        checked: batchPanelOpen.value,
        onSelect: toggleBatchPanel
      },
      {
        label: t("DesktopMenu.StatusBar"),
        type: "checkbox",
        checked: statusBarVisible.value,
        onSelect: () => setStatusBarVisible(!statusBarVisible.value)
      },
      { type: "separator" },
      {
        label: t("DesktopMenu.Fullscreen"),
        type: "checkbox",
        kbds: ["ctrl", "shift", "f"],
        checked: workspaceFullscreen.value,
        disabled: !activeTabId.value,
        onSelect: toggleFullscreenMode
      }
    ]
  },
  {
    label: t("DesktopMenu.Window"),
    items: [
      {
        label: t("ToolTips.Minimize"),
        onSelect: () => void desktopInvoke("minimize_window")
      },
      {
        label: maximized.value ? t("DesktopMenu.Restore") : t("ToolTips.Maximize"),
        onSelect: () => void desktopInvoke("toggle_maximize_window")
      },
      { type: "separator" },
      {
        label: t("ToolTips.Close"),
        onSelect: () => void desktopInvoke("close_window")
      }
    ]
  },
  {
    label: t("DesktopMenu.Help"),
    items: [
      {
        label: t("DesktopMenu.About"),
        onSelect: () => void openSettings("/setting/about")
      }
    ]
  }
]);

const windowControls = computed(() => [
  {
    key: "minimize",
    label: t("ToolTips.Minimize"),
    action: async () => {
      await desktopInvoke("minimize_window");
    }
  },
  {
    key: "maximize",
    label: maximized.value ? t("DesktopMenu.Restore") : t("ToolTips.Maximize"),
    action: async () => {
      await desktopInvoke("toggle_maximize_window");
    }
  },
  {
    key: "close",
    label: t("ToolTips.Close"),
    action: async () => {
      await desktopInvoke("close_window");
    }
  }
]);
</script>

<template>
  <div
    v-if="visible"
    data-desktop-drag-region
    class="flex h-[34px] min-h-[34px] items-stretch border-b border-[var(--app-border)] bg-[color:color-mix(in_srgb,var(--app-surface-frame)_94%,transparent)] text-[var(--app-fg)] backdrop-blur-md"
  >
    <div class="flex min-w-0 flex-1 items-center" data-desktop-drag-region>
      <div class="flex h-full items-center px-2">
        <img src="~/assets/logo.svg" alt="JumpServer" class="ml-0.5 mr-1.5 size-[18px] shrink-0" />

        <template v-if="props.showMenus">
          <UDropdownMenu
            v-for="menu in menuGroups"
            :key="menu.label"
            :items="menu.items"
            :content="{ align: 'start', side: 'bottom', sideOffset: 0 }"
            :ui="{
              content: 'min-w-52 p-1',
              item: 'px-2 py-1.5 leading-5',
              itemLabel: 'text-xs'
            }"
          >
            <template #item-trailing="{ item }">
              <span
                v-if="item.kbds?.length"
                class="ml-auto text-[11px] leading-4 tracking-widest text-[var(--app-muted)]"
              >
                {{ shortcutLabel(item.kbds) }}
              </span>
            </template>

            <UButton
              :label="menu.label"
              color="neutral"
              variant="ghost"
              size="xs"
              class="h-[26px] rounded px-2.5 text-xs font-normal hover:bg-[color:color-mix(in_srgb,var(--app-fg)_10%,transparent)] data-[state=open]:bg-[color:color-mix(in_srgb,var(--app-fg)_12%,transparent)]"
            />
          </UDropdownMenu>
        </template>

        <span v-else class="text-xs font-medium">JumpServer</span>
      </div>
    </div>

    <div class="flex h-full shrink-0 items-stretch">
      <UButton
        v-for="button in windowControls"
        :key="button.key"
        :aria-label="button.label"
        :title="button.label"
        color="neutral"
        variant="ghost"
        class="h-[34px] w-[46px] justify-center rounded-none p-0 text-[color:color-mix(in_srgb,var(--app-fg)_70%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--app-fg)_10%,transparent)] hover:text-[var(--app-fg)]"
        :class="
          button.key === 'close'
            ? 'hover:bg-red-600 hover:text-white active:bg-red-700 dark:hover:bg-red-600 dark:hover:text-white'
            : ''
        "
        @click="button.action"
      >
        <svg
          v-if="button.key === 'minimize'"
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
        >
          <line x1="2.5" y1="6" x2="9.5" y2="6" />
        </svg>
        <svg
          v-else-if="button.key === 'maximize' && maximized"
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
        >
          <rect x="2.5" y="3.8" width="6" height="6" rx="0.5" />
          <path d="M4 3.8 V 2.5 H 9.5 V 8" />
        </svg>
        <svg
          v-else-if="button.key === 'maximize'"
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
        >
          <rect x="2.5" y="2.5" width="7" height="7" rx="0.5" />
        </svg>
        <svg
          v-else
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
        >
          <line x1="3" y1="3" x2="9" y2="9" />
          <line x1="9" y1="3" x2="3" y2="9" />
        </svg>
      </UButton>
    </div>
  </div>
</template>

<style scoped>
[data-desktop-drag-region] {
  -webkit-app-region: drag;
}

button,
[role="button"] {
  -webkit-app-region: no-drag;
}
</style>
