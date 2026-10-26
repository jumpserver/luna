import { isWorkspaceTourActive } from "~/composables/useWorkspaceTour";
import { desktopListen } from "~/shared/desktop/bridge";

export function useWorkspaceSessionShortcuts(enabled: () => boolean = () => true) {
  const shortcuts = useAppShortcuts();
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
    setActiveSession
  } = useWorkspaceTabs();
  const toggleFocus = () => {
    if (focusMode.value) void exitFocusMode();
    else if (activeTabId.value) enterFocusMode(activeTabId.value);
  };

  useEventListener(
    window,
    "keydown",
    (event: KeyboardEvent) => {
      if (shortcuts.blocked(event) || !enabled() || !activeTabId.value) return;
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
