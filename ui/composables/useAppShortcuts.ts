import { isWorkspaceTourActive } from "~/composables/useWorkspaceTour";
import type { ShortcutId } from "~/shared/shortcuts";
import { matchesShortcut, shortcutBindings, shortcutKeyLabels, shortcutLabel } from "~/shared/shortcuts";

export function useAppShortcuts() {
  const { shortcutOverrides, sessionDigitShortcuts } = useSettingManager();
  const { isMacOS } = usePlatform();
  const { open: settingsOpen } = useSettingsWindow();
  const environment = computed(() => ({ mac: isMacOS.value, desktop: isDesktopRuntime() }));
  const bindings = (id: ShortcutId) => shortcutBindings(id, shortcutOverrides.value, environment.value);
  const matches = (id: ShortcutId, event: KeyboardEvent) =>
    bindings(id).some((binding) => matchesShortcut(event, binding, isMacOS.value, true));
  const kbds = (id: ShortcutId) => (bindings(id)[0] ? shortcutKeyLabels(bindings(id)[0]!, isMacOS.value) : []);
  const label = (id: ShortcutId) =>
    bindings(id)
      .map((binding) => shortcutLabel(binding, isMacOS.value))
      .join(" / ");
  const blocked = (event: KeyboardEvent, allowedDialog?: Element | null) =>
    event.defaultPrevented ||
    event.isComposing ||
    settingsOpen.value ||
    isWorkspaceTourActive() ||
    (event.target instanceof Element &&
      Boolean(event.target.closest('[role="dialog"], [role="alertdialog"], [data-shortcut-recorder]')) &&
      event.target.closest('[role="dialog"], [role="alertdialog"], [data-shortcut-recorder]') !== allowedDialog);
  return { bindings, matches, kbds, label, blocked, environment, sessionDigitShortcuts };
}
