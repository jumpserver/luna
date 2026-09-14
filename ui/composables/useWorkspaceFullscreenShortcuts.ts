import { isWorkspaceTourActive } from "~/composables/useWorkspaceTour";
import { desktopListen, desktopWindow } from "~/shared/desktop/bridge";

export function useWorkspaceFullscreenShortcuts() {
  const { isMacOS } = usePlatform();
  const { activeTabId, enterFullscreenMode, exitFocusMode, nativeFullscreen, workspaceFullscreen } = useWorkspaceTabs();

  const toggleDesktopFullscreen = async () => {
    if (workspaceFullscreen.value) {
      await exitFocusMode();
      return;
    }
    if (nativeFullscreen.value) {
      if (isDesktopRuntime()) await desktopWindow.setFullscreen(false);
      return;
    }
    if (activeTabId.value) {
      await enterFullscreenMode(activeTabId.value);
      return;
    }
    if (isDesktopRuntime()) await desktopWindow.toggleFullscreen();
  };

  const handleEscape = (event: KeyboardEvent) => {
    if (isWorkspaceTourActive() || event.key !== "Escape" || event.repeat) return;
    if (!workspaceFullscreen.value && !nativeFullscreen.value) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void toggleDesktopFullscreen();
  };

  const handleFullscreenShortcut = (event: KeyboardEvent) => {
    if (isWorkspaceTourActive() || event.repeat || event.altKey || !event.shiftKey || event.code !== "KeyF") return;
    const usesPrimaryModifier = isMacOS.value ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    if (!usesPrimaryModifier || (!workspaceFullscreen.value && !nativeFullscreen.value && !activeTabId.value)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void toggleDesktopFullscreen();
  };

  useEventListener(window, "keydown", handleEscape, { capture: true });
  useEventListener(window, "keydown", handleFullscreenShortcut, { capture: true });

  let unlistenMenu: (() => void) | null = null;
  onMounted(() => {
    if (!isDesktopRuntime()) return;
    void desktopListen<string>("desktop-menu-command", ({ payload }) => {
      if (payload === "toggle-fullscreen-mode") void toggleDesktopFullscreen();
    }).then((unlisten) => {
      unlistenMenu = unlisten;
    });
  });
  onBeforeUnmount(() => unlistenMenu?.());
}
