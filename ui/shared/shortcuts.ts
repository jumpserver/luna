// Shared by the renderer and Electron menus. Bind physical keys consistently on every keyboard layout.
export const shortcutDefinitions = [
  { id: "previousTab", default: "Alt+Shift+ArrowLeft", scope: "workspace" },
  { id: "nextTab", default: "Alt+Shift+ArrowRight", scope: "workspace" },
  { id: "closeTab", default: "Alt+Shift+KeyW", desktopDefault: "Mod+KeyW", scope: "workspace" },
  { id: "focus", default: "Mod+Shift+KeyP", scope: "workspace" },
  { id: "fullscreen", default: "Mod+Shift+KeyF", scope: "workspace" },
  { id: "rightPanel", default: "Mod+Alt+Digit2", scope: "application" },
  { id: "clipboardHistory", default: "Mod+Shift+KeyH", scope: "application", desktopOnly: true },
  { id: "terminalAi", default: "Mod+KeyK", scope: "terminal" },
  { id: "localShell", default: "Mod+KeyT", scope: "application", desktopOnly: true }
] as const;

export type ShortcutId = (typeof shortcutDefinitions)[number]["id"];
export type ShortcutOverrides = Partial<Record<ShortcutId, string | null>>;
export interface ShortcutEnvironment {
  mac: boolean;
  desktop: boolean;
}
export interface ShortcutKeyEvent {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  getModifierState?: (key: string) => boolean;
}

const keyPattern =
  /^(?:Key[A-Z]|Digit[0-9]|Arrow(?:Left|Right|Up|Down)|F(?:[1-9]|1[0-2])|Enter|Space|Tab|Backspace|Delete|Home|End|PageUp|PageDown|Comma|Period|Slash|Backslash|Semicolon|Quote|BracketLeft|BracketRight|Minus|Equal|Backquote)$/;
const modifiers = ["Mod", "Ctrl", "Alt", "Shift"];

export function isShortcutBinding(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = value.split("+");
  const key = parts.pop() || "";
  return (
    keyPattern.test(key) &&
    parts.some((part) => part !== "Shift") &&
    new Set(parts).size === parts.length &&
    parts.every((part) => modifiers.includes(part)) &&
    !(parts.includes("Mod") && parts.includes("Ctrl")) &&
    parts.join("+") === modifiers.filter((part) => parts.includes(part)).join("+")
  );
}

export function normalizeShortcutOverrides(value: unknown): ShortcutOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: ShortcutOverrides = {};
  for (const { id } of shortcutDefinitions) {
    const binding = (value as Record<string, unknown>)[id];
    if (binding === null) result[id] = null;
    else if (isShortcutBinding(binding)) result[id] = binding;
  }
  return result;
}

export function shortcutFromEvent(event: ShortcutKeyEvent, mac: boolean, allowRepeat = false): string | null {
  if (event.isComposing || (event.repeat && !allowRepeat) || event.getModifierState?.("AltGraph")) return null;
  // A secondary OS modifier is not a portable binding.
  if (event.metaKey && (!mac || event.ctrlKey)) return null;
  const parts = [
    (mac ? event.metaKey : event.ctrlKey) ? "Mod" : "",
    mac && event.ctrlKey ? "Ctrl" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
    event.code
  ]
    .filter(Boolean)
    .join("+");
  return isShortcutBinding(parts) ? parts : null;
}

function resolvedBinding(binding: string, mac: boolean) {
  return binding.replace("Mod", mac ? "Meta" : "Ctrl");
}

export function matchesShortcut(event: ShortcutKeyEvent, binding: string, mac: boolean, allowRepeat = false): boolean {
  const pressed = shortcutFromEvent(event, mac, allowRepeat);
  return Boolean(pressed && resolvedBinding(pressed, mac) === resolvedBinding(binding, mac));
}

export function defaultShortcut(id: ShortcutId, environment: ShortcutEnvironment): string {
  const definition = shortcutDefinitions.find((item) => item.id === id)!;
  return environment.desktop && "desktopDefault" in definition ? definition.desktopDefault : definition.default;
}

export function shortcutBindings(
  id: ShortcutId,
  overrides: ShortcutOverrides,
  environment: ShortcutEnvironment
): string[] {
  const definition = shortcutDefinitions.find((item) => item.id === id)!;
  if ("desktopOnly" in definition && !environment.desktop) return [];
  const override = overrides[id];
  if (override === null) return [];
  if (isShortcutBinding(override) && !isReservedShortcut(override, id, environment)) return [override];
  const binding = defaultShortcut(id, environment);
  // Preserve the existing desktop close-tab alias until this action is customized.
  return id === "closeTab" && environment.desktop ? [binding, definition.default] : [binding];
}

export function isReservedShortcut(binding: string, id: ShortcutId, environment: ShortcutEnvironment): boolean {
  const key = resolvedBinding(binding, environment.mac);
  const primary = environment.mac ? "Meta" : "Ctrl";
  const reserved = [
    "Alt+Tab",
    "Alt+Shift+Tab",
    "Alt+F4",
    "Ctrl+Tab",
    "Ctrl+Shift+Tab",
    "Ctrl+KeyC",
    "Ctrl+Shift+KeyC",
    "Ctrl+KeyV",
    "Ctrl+Shift+KeyV",
    "Ctrl+KeyZ",
    `${primary}+KeyC`,
    `${primary}+KeyV`,
    `${primary}+KeyX`,
    `${primary}+KeyA`,
    `${primary}+KeyZ`,
    `${primary}+Shift+KeyZ`,
    `${primary}+KeyF`,
    `${primary}+KeyS`,
    `${primary}+Shift+KeyS`,
    `${primary}+KeyP`,
    `${primary}+Shift+KeyT`,
    `${primary}+Backslash`,
    `${primary}+Comma`,
    `${primary}+Shift+Comma`,
    `${primary}+KeyQ`,
    `${primary}+KeyH`,
    `${primary}+Alt+KeyH`,
    `${primary}+KeyM`,
    `${primary}+KeyR`,
    `${primary}+Shift+KeyR`,
    `${primary}+Shift+KeyW`,
    `${primary}+KeyL`,
    "Ctrl+KeyF",
    "Ctrl+Enter",
    "Ctrl+Shift+Enter",
    "Ctrl+KeyR",
    "Ctrl+KeyS",
    "Ctrl+Alt+Delete",
    "Ctrl+F4",
    `${primary}+KeyN`,
    `${primary}+Shift+KeyN`,
    `${primary}+Shift+KeyI`,
    `${primary}+Shift+KeyJ`,
    `${primary}+Enter`,
    `${primary}+Shift+Enter`,
    `${primary}+KeyB`,
    `${primary}+KeyD`
  ];
  if (reserved.includes(key)) return true;
  if (key === `${primary}+KeyW`) return !environment.desktop || id !== "closeTab";
  if (key === `${primary}+KeyT`) return !environment.desktop || id !== "localShell";
  // Digits remain a group; 1/2 also belong to the embedded editor's pane selector.
  return key.startsWith(`${primary}+`) && /^Digit[1-9]$/.test(key.slice(primary.length + 1));
}

export function conflictingShortcut(
  id: ShortcutId,
  binding: string,
  overrides: ShortcutOverrides,
  environment: ShortcutEnvironment
): ShortcutId | undefined {
  return shortcutDefinitions.find(
    (definition) =>
      definition.id !== id &&
      shortcutBindings(definition.id, overrides, environment).some(
        (other) => resolvedBinding(other, environment.mac) === resolvedBinding(binding, environment.mac)
      )
  )?.id;
}

export function shortcutKeyLabels(binding: string, mac: boolean): string[] {
  const labels: Record<string, string> = {
    Mod: mac ? "meta" : "ctrl",
    Ctrl: "ctrl",
    Alt: "alt",
    Shift: "shift",
    Enter: "enter",
    Space: "space",
    Tab: "tab",
    ArrowLeft: "arrowleft",
    ArrowRight: "arrowright",
    ArrowUp: "arrowup",
    ArrowDown: "arrowdown",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    BracketLeft: "[",
    BracketRight: "]",
    Minus: "-",
    Equal: "=",
    Backquote: "`"
  };
  return binding.split("+").map((part) => labels[part] || part.replace(/^(Key|Digit)/, ""));
}

export function shortcutLabel(binding: string, mac: boolean): string {
  return shortcutKeyLabels(binding, mac)
    .map(
      (key) =>
        ({
          meta: "⌘",
          ctrl: "Ctrl",
          alt: mac ? "⌥" : "Alt",
          shift: "Shift",
          arrowleft: "←",
          arrowright: "→",
          arrowup: "↑",
          arrowdown: "↓",
          enter: "Enter",
          space: "Space",
          tab: "Tab"
        })[key] || key
    )
    .join("+");
}

export function shortcutAccelerator(
  id: ShortcutId,
  overrides: ShortcutOverrides,
  environment: ShortcutEnvironment
): string | undefined {
  const binding = shortcutBindings(id, overrides, environment)[0];
  if (!binding) return undefined;
  return binding
    .split("+")
    .map(
      (part) =>
        ({
          Mod: "CmdOrCtrl",
          Ctrl: "Ctrl",
          ArrowLeft: "Left",
          ArrowRight: "Right",
          ArrowUp: "Up",
          ArrowDown: "Down",
          Comma: ",",
          Period: ".",
          Slash: "/",
          Backslash: "\\",
          Semicolon: ";",
          Quote: "'",
          BracketLeft: "[",
          BracketRight: "]",
          Minus: "-",
          Equal: "=",
          Backquote: "`"
        })[part] || part.replace(/^(Key|Digit)/, "")
    )
    .join("+");
}
