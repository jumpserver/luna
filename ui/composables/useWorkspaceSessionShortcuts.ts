import { isWorkspaceTourActive } from "~/composables/useWorkspaceTour";
import { desktopInvoke, desktopListen } from "~/shared/desktop/bridge";
import type { WorkspaceSplitDirection } from "~/composables/useWorkspaceTabs";

export function useWorkspaceSessionShortcuts(
  enabled: () => boolean = () => true,
  openNewSession: () => void = () => {
    if (isDesktopRuntime()) void desktopInvoke("open_new_session");
  }
) {
  const shortcuts = useAppShortcuts();
  const { cloneSession } = useWorkspaceTabMenu();
  const { isMacOS } = usePlatform();
  const { open: settingsOpen } = useSettingsWindow();
  const {
    activeTabId,
    tabs,
    closeSession,
    focusMode,
    enterFocusMode,
    exitFocusMode,
    activateAdjacentSession,
    setActiveSession,
    canSplitWorkspace,
    splitWorkspace
  } = useWorkspaceTabs();
  const toggleFocus = () => {
    if (focusMode.value) void exitFocusMode();
    else if (activeTabId.value) enterFocusMode(activeTabId.value);
  };
  const split = (direction: WorkspaceSplitDirection) => {
    if (!canSplitWorkspace(activeTabId.value, direction)) return;
    splitWorkspace(activeTabId.value, direction);
    setActiveSession(activeTabId.value);
  };

  useEventListener(
    window,
    "keydown",
    (event: KeyboardEvent) => {
      if (shortcuts.blocked(event)) return;
      if (shortcuts.matches("newSession", event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) openNewSession();
        return;
      }
      if (!enabled() || !activeTabId.value) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const editable =
        target &&
        !target.closest(".xterm") &&
        (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"], .cm-editor'));
      let action: (() => void) | undefined;
      if (shortcuts.matches("closeTab", event)) {
        if (target?.closest(".cm-editor") && event.code === "KeyW" && (event.metaKey || event.ctrlKey)) return;
        action = () => {
          void closeSession(activeTabId.value);
        };
      } else if (shortcuts.matches("focus", event)) {
        action = toggleFocus;
      } else if (!editable && shortcuts.matches("cloneTab", event)) {
        action = () => {
          const tab = tabs.value.find((tab) => tab.id === activeTabId.value);
          if (tab && (tab.payload?.id || tab.payload?.token?.id)) void cloneSession(tab);
        };
      } else if (!editable && shortcuts.matches("splitVertical", event)) {
        action = () => split("vertical");
      } else if (!editable && shortcuts.matches("splitHorizontal", event)) {
        action = () => split("horizontal");
      } else if (tabs.value.length >= 2 && !editable) {
        if (shortcuts.matches("previousTab", event)) action = () => activateAdjacentSession("previous");
        else if (shortcuts.matches("nextTab", event)) action = () => activateAdjacentSession("next");
        else if (shortcuts.sessionDigitShortcuts.value) {
          const primary = isMacOS.value ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
          const digit =
            primary && !event.altKey && !event.shiftKey && event.code.match(/^(?:Digit|Numpad)([1-9])$/)?.[1];
          if (digit) {
            const index =
              Number(digit) === 9 ? tabs.value.length - 1 : Math.min(Number(digit) - 1, tabs.value.length - 1);
            action = () => setActiveSession(tabs.value[index]!.id);
          }
        }
      }
      if (!action) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) action();
    },
    { capture: true }
  );

  let unlisten: (() => void) | undefined;
  let disposed = false;
  onMounted(async () => {
    if (!isDesktopRuntime()) return;
    const off = await desktopListen<string>("desktop-menu-command", ({ payload }) => {
      if (!enabled() || settingsOpen.value || isWorkspaceTourActive()) return;
      if (payload === "close-current-tab" && activeTabId.value) void closeSession(activeTabId.value);
      if (payload === "toggle-focus-mode") toggleFocus();
    });
    if (disposed) off();
    else unlisten = off;
  });
  onBeforeUnmount(() => {
    disposed = true;
    unlisten?.();
  });
}
