<script setup lang="ts">
import { useEventListener, useMediaQuery } from "@vueuse/core";
import { sendKokoTerminalData } from "#koko";
import { getLionWorkspaceSession } from "~/lion/workspaces/useLionWorkspaceSessionRegistry";

type Modifier = "ctrl" | "alt" | "shift" | "win" | "caps";

interface VirtualKey {
  label: string;
  value: string;
  width?: number;
  modifier?: Modifier;
}

interface ShortcutKey {
  label: string;
  terminalData?: string;
  windowsKeys?: string[];
}

const { t } = useI18n();
const toast = useToast();
const { activeTab, activePaneId } = useWorkspaceTabs();
const open = ref(false);
const compactLandscape = useMediaQuery("(max-height: 600px) and (orientation: landscape)");
const narrowPortrait = useMediaQuery("(max-width: 639px) and (orientation: portrait)");
const selectedPanel = ref("shortcuts");
const panelItems = computed(() => [
  { label: t("koko.drawer.shortcutKeys"), value: "shortcuts", slot: "shortcuts", icon: "i-lucide-command" },
  { label: t("koko.terminal.keyboard"), value: "keyboard", slot: "keyboard", icon: "i-lucide-keyboard" }
]);
const modifiers = reactive<Record<Modifier, boolean>>({
  ctrl: false,
  alt: false,
  shift: false,
  win: false,
  caps: false
});
const modifierReleases = new Map<Modifier, () => void>();
const pressedKeys = reactive(new Map<number, { value: string; release: () => void }>());

const activePane = computed(() => activeTab.value?.panes.find((pane) => pane.id === activePaneId.value));
const terminalProtocols = new Set(["ssh", "telnet", "kubernetes", "k8s", "local-shell"]);
const windowsProtocols = new Set(["rdp", "vnc"]);
const isWindowsSession = computed(() => windowsProtocols.has(activePane.value?.protocol.toLowerCase() || ""));
const available = computed(() => {
  const pane = activePane.value;
  const protocol = pane?.protocol.toLowerCase() || "";
  return Boolean(pane?.status === "connected" && (terminalProtocols.has(protocol) || windowsProtocols.has(protocol)));
});

const terminalShortcuts: ShortcutKey[] = [
  { label: "Ctrl+C", terminalData: "\x03" },
  { label: "Ctrl+V", terminalData: "\x16" },
  { label: "Ctrl+X", terminalData: "\x18" },
  { label: "Ctrl+S", terminalData: "\x13" },
  { label: "Ctrl+D", terminalData: "\x04" },
  { label: "Ctrl+Z", terminalData: "\x1a" },
  { label: "Ctrl+L", terminalData: "\x0c" },
  { label: "Ctrl+R", terminalData: "\x12" },
  { label: "Ctrl+W", terminalData: "\x17" },
  { label: "Ctrl+A", terminalData: "\x01" },
  { label: "Ctrl+E", terminalData: "\x05" }
];
const windowsShortcuts: ShortcutKey[] = [
  { label: "Ctrl+Alt+Delete", windowsKeys: ["65507", "65513", "65535"] },
  { label: "Ctrl+Alt+Backspace", windowsKeys: ["65507", "65513", "65288"] },
  { label: "Alt+Tab", windowsKeys: ["65513", "65289"] },
  { label: "Ctrl+Shift+Esc", windowsKeys: ["65507", "65505", "65307"] },
  { label: "Ctrl+V", windowsKeys: ["65507", "118"] },
  { label: "Ctrl+X", windowsKeys: ["65507", "120"] },
  { label: "Ctrl+S", windowsKeys: ["65507", "115"] },
  { label: "F11", windowsKeys: ["65480"] },
  { label: "Win", windowsKeys: ["65515"] },
  { label: "Win+Tab", windowsKeys: ["65515", "65289"] },
  { label: "Win+R", windowsKeys: ["65515", "114"] },
  { label: "Win+E", windowsKeys: ["65515", "101"] },
  { label: "Win+D", windowsKeys: ["65515", "100"] },
  { label: "Win+X", windowsKeys: ["65515", "120"] }
];
const commonShortcuts = computed(() => {
  if (!isWindowsSession.value) return terminalShortcuts;
  const controller = getLionWorkspaceSession(activePane.value?.id || "");
  return controller?.isRemoteApp.value ? windowsShortcuts.filter((item) => item.label === "Alt+Tab") : windowsShortcuts;
});

function characterKeys(row: string): VirtualKey[] {
  return [...row].map((value) => ({ label: value.toUpperCase(), value }));
}

const keyboardRows = computed<VirtualKey[][]>(() => [
  [{ label: "Esc", value: "\x1b" }, ...characterKeys("`1234567890-="), { label: "⌫", value: "\x7f", width: 8 }],
  [{ label: "Tab", value: "\t", width: 6 }, ...characterKeys("qwertyuiop[]"), { label: "\\", value: "\\", width: 10 }],
  [
    { label: "CapsLock", value: "caps", modifier: "caps", width: 7 },
    ...characterKeys("asdfghjkl;'"),
    { label: t("koko.terminal.enter"), value: "\r", width: 13 }
  ],
  [
    { label: "Shift", value: "shift", modifier: "shift", width: 9 },
    ...characterKeys("zxcvbnm,./"),
    { label: "Shift", value: "shift-right", modifier: "shift", width: 7 },
    { label: "↑", value: "\x1b[A" }
  ],
  [
    { label: "Ctrl", value: "ctrl", modifier: "ctrl", width: 6 },
    ...(isWindowsSession.value ? [{ label: "Win", value: "win", modifier: "win" as const, width: 6 }] : []),
    { label: "Alt", value: "alt", modifier: "alt", width: 6 },
    { label: t("koko.terminal.space"), value: " ", width: isWindowsSession.value ? 28 : 34 },
    { label: "Alt", value: "alt-right", modifier: "alt", width: 6 },
    { label: "←", value: "\x1b[D" },
    { label: "↓", value: "\x1b[B" },
    { label: "→", value: "\x1b[C" }
  ]
]);

const shiftedCharacters: Record<string, string> = {
  "`": "~",
  "1": "!",
  "2": "@",
  "3": "#",
  "4": "$",
  "5": "%",
  "6": "^",
  "7": "&",
  "8": "*",
  "9": "(",
  "0": ")",
  "-": "_",
  "=": "+",
  "[": "{",
  "]": "}",
  "\\": "|",
  ";": ":",
  "'": '"',
  ",": "<",
  ".": ">",
  "/": "?"
};

function characterValue(value: string) {
  if (/^[a-z]$/i.test(value)) return modifiers.caps !== modifiers.shift ? value.toUpperCase() : value.toLowerCase();
  return modifiers.shift ? shiftedCharacters[value] || value : value;
}

function keyLabel(key: VirtualKey) {
  if (/^[a-z]$/i.test(key.value)) return characterValue(key.value);
  return modifiers.shift ? shiftedCharacters[key.value] || key.label : key.label;
}

function resetKeyboard() {
  for (const release of new Set([...pressedKeys.values()].reverse().map((key) => key.release))) release();
  pressedKeys.clear();
  for (const release of [...modifierReleases.values()].reverse()) release();
  modifierReleases.clear();
  for (const modifier of Object.keys(modifiers) as Modifier[]) modifiers[modifier] = false;
}

const modifierKeysyms = { ctrl: 65507, alt: 65513, shift: 65505, win: 65515 };

function toggleModifier(modifier: Modifier) {
  if (!available.value) return;
  if (modifiers[modifier]) {
    modifierReleases.get(modifier)?.();
    modifierReleases.delete(modifier);
  } else if (modifier !== "caps" && isWindowsSession.value) {
    const controller = getLionWorkspaceSession(activePane.value?.id || "");
    if (!controller) return;
    const keysym = modifierKeysyms[modifier];
    controller.sendKeyEvent(1, keysym);
    modifierReleases.set(modifier, () => controller.sendKeyEvent(0, keysym));
  }
  modifiers[modifier] = !modifiers[modifier];
}

function encodedKey(value: string) {
  const modifierCode = Number(modifiers.shift) + Number(modifiers.alt) * 2 + Number(modifiers.ctrl) * 4;
  if (["\x1b[A", "\x1b[B", "\x1b[C", "\x1b[D"].includes(value) && modifierCode) {
    return `\x1b[1;${modifierCode + 1}${value.at(-1)}`;
  }
  let data = value;
  if (value === "\t" && modifiers.shift) data = "\x1b[Z";
  else if (value === "\x7f" && modifiers.ctrl) data = "\x08";
  else if (value.length === 1) {
    data = characterValue(value);
    if (modifiers.ctrl) {
      if (data === " " || data === "@") data = "\x00";
      else if (data === "?") data = "\x7f";
      else if (/^[a-z[\]\\^_]$/i.test(data)) data = String.fromCharCode(data.toUpperCase().charCodeAt(0) & 31);
    }
  }
  if (modifiers.alt) data = `\x1b${data}`;
  return data;
}

const windowsSpecialKeys: Record<string, string> = {
  "\x1b": "65307",
  "\t": "65289",
  "\x1b[A": "65362",
  "\x1b[B": "65364",
  "\x1b[D": "65361",
  "\x1b[C": "65363",
  "\x7f": "65288",
  "\r": "65293",
  " ": "32"
};

function sendWindowsKeys(keys: string[]) {
  const paneId = activePane.value?.id || "";
  const controller = getLionWorkspaceSession(paneId);
  if (!controller) return false;
  controller.sendCombinationKeys(keys);
  return true;
}

function press(value: string): (() => void) | undefined {
  const paneId = activePane.value?.id;
  if (available.value && paneId) {
    if (isWindowsSession.value) {
      const controller = getLionWorkspaceSession(paneId);
      if (controller) {
        const keysym = Number(windowsSpecialKeys[value]) || characterValue(value).charCodeAt(0);
        controller.sendKeyEvent(1, keysym);
        return () => controller.sendKeyEvent(0, keysym);
      }
    } else if (sendKokoTerminalData(paneId, encodedKey(value))) {
      // Terminal protocols carry keypress bytes, not separate key-down/key-up events.
      return () => {};
    }
  }
  toast.add({ title: t("koko.terminal.noActiveTerminal"), color: "warning" });
}

function send(value: string) {
  press(value)?.();
}

function pressPointer(event: PointerEvent, key: VirtualKey) {
  if (event.button !== 0 || pressedKeys.has(event.pointerId)) return;
  if (key.modifier) {
    toggleModifier(key.modifier);
    return;
  }
  const release = [...pressedKeys.values()].find((pressed) => pressed.value === key.value)?.release || press(key.value);
  if (!release) return;
  pressedKeys.set(event.pointerId, { value: key.value, release });
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function releasePointer(event: PointerEvent) {
  const key = pressedKeys.get(event.pointerId);
  pressedKeys.delete(event.pointerId);
  if (key && ![...pressedKeys.values()].some((pressed) => pressed.release === key.release)) key.release();
}

function activateKey(event: MouseEvent, key: VirtualKey) {
  // Pointer input is handled above; preserve keyboard and assistive-technology activation.
  if (event.detail === 0) key.modifier ? toggleModifier(key.modifier) : send(key.value);
}

function sendShortcut(shortcut: ShortcutKey) {
  resetKeyboard();
  if (!available.value) return;
  const paneId = activePane.value?.id;
  const sent = shortcut.windowsKeys
    ? sendWindowsKeys(shortcut.windowsKeys)
    : Boolean(paneId && shortcut.terminalData && sendKokoTerminalData(paneId, shortcut.terminalData));
  if (!sent) toast.add({ title: t("koko.terminal.noActiveTerminal"), color: "warning" });
}

watch(
  available,
  (value) => {
    if (!value) {
      resetKeyboard();
      open.value = false;
    }
  },
  { flush: "sync" }
);

watch([open, selectedPanel, activePaneId, compactLandscape, narrowPortrait], resetKeyboard, { flush: "sync" });
useEventListener("blur", resetKeyboard);
useEventListener(
  () => globalThis.document,
  "visibilitychange",
  () => {
    if (globalThis.document?.hidden) resetKeyboard();
  }
);
onScopeDispose(resetKeyboard);
</script>

<template>
  <UPopover
    :open="open"
    :dismissible="false"
    :content="{ align: 'end', side: 'top', sideOffset: 8 }"
    :ui="{
      content: compactLandscape ? 'w-[calc(100vw-1rem)] max-w-[60rem] p-2' : 'w-[42rem] max-w-[calc(100vw-1rem)] p-2'
    }"
  >
    <UTooltip :text="t('koko.terminal.virtualKeyboard')">
      <button
        type="button"
        class="virtual-keyboard-trigger grid size-5 place-items-center rounded text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover-soft)] hover:text-[var(--app-fg)] disabled:cursor-not-allowed disabled:opacity-35"
        :disabled="!available"
        :aria-label="t('koko.terminal.virtualKeyboard')"
        :aria-expanded="open"
        @click.stop="open = !open"
      >
        <UIcon name="i-lucide-keyboard" class="size-3.5" />
      </button>
    </UTooltip>

    <template v-if="compactLandscape" #anchor>
      <span class="fixed right-[max(0.5rem,env(safe-area-inset-right))] bottom-[env(safe-area-inset-bottom)]" />
    </template>

    <template #content>
      <UTabs
        v-model="selectedPanel"
        :items="panelItems"
        color="neutral"
        variant="pill"
        size="sm"
        class="virtual-keyboard-panel gap-2 select-none"
        :ui="{
          list: 'bg-[var(--app-surface-canvas)]',
          indicator: 'bg-[var(--app-surface-panel)] shadow-none',
          trigger: 'flex-1 text-[var(--app-muted)] data-[state=active]:text-[var(--app-fg)]'
        }"
      >
        <template #list-trailing>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            class="virtual-keyboard-close shrink-0 justify-center"
            :aria-label="t('Common.Close')"
            @click="open = false"
          />
        </template>

        <template #shortcuts>
          <div class="virtual-shortcuts">
            <UButton
              v-for="shortcut in commonShortcuts"
              :key="shortcut.label"
              color="neutral"
              variant="outline"
              size="xs"
              class="virtual-key justify-center font-ui-mono"
              @pointerdown.prevent
              @click="sendShortcut(shortcut)"
            >
              {{ shortcut.label }}
            </UButton>
          </div>
        </template>

        <template #keyboard>
          <div v-if="narrowPortrait" class="virtual-keyboard-rotate">
            <UIcon name="i-lucide-rotate-cw" class="size-7" />
            <p>{{ t("koko.terminal.keyboardLandscapeHint") }}</p>
          </div>
          <div v-else class="virtual-keyboard-layout">
            <p class="virtual-keyboard-hint text-[11px] text-[var(--app-muted)]">
              {{ t("koko.terminal.keyboardModifiersHint") }}
            </p>
            <div class="virtual-keyboard-rows">
              <div v-for="(row, index) in keyboardRows" :key="index" class="virtual-keyboard-row">
                <UButton
                  v-for="key in row"
                  :key="key.value"
                  color="neutral"
                  variant="outline"
                  size="xs"
                  class="virtual-key min-w-0 justify-center px-0 text-[11px]"
                  :class="{ 'is-pressed': [...pressedKeys.values()].some((pressed) => pressed.value === key.value) }"
                  :style="{ gridColumn: `span ${key.width || 4}` }"
                  :aria-label="key.value === '\x7f' ? 'Backspace' : keyLabel(key)"
                  :aria-pressed="key.modifier ? modifiers[key.modifier] : undefined"
                  @pointerdown.prevent="pressPointer($event, key)"
                  @pointerup="releasePointer"
                  @pointercancel="releasePointer"
                  @lostpointercapture="releasePointer"
                  @click="activateKey($event, key)"
                >
                  {{ keyLabel(key) }}
                </UButton>
              </div>
            </div>
          </div>
        </template>
      </UTabs>
    </template>
  </UPopover>
</template>

<style scoped>
.virtual-keyboard-panel {
  --keyboard-key-height: 36px;
  --keyboard-control-height: 32px;
  --keyboard-hint-height: 32px;
  --keyboard-content-height: min(
    calc(5 * var(--keyboard-key-height) + 16px + var(--keyboard-hint-height)),
    max(0px, calc(var(--reka-popover-content-available-height, 100dvh) - var(--keyboard-control-height) - 32px))
  );
}

.virtual-keyboard-panel :deep([data-slot="trigger"]),
.virtual-keyboard-close {
  height: var(--keyboard-control-height);
}

.virtual-keyboard-close {
  width: var(--keyboard-control-height);
}

.virtual-keyboard-panel :deep([role="tabpanel"]) {
  height: var(--keyboard-content-height);
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.virtual-shortcuts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.virtual-shortcuts .virtual-key {
  min-height: var(--keyboard-key-height);
  white-space: normal;
  touch-action: manipulation;
}

.virtual-keyboard-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.virtual-keyboard-hint {
  height: var(--keyboard-hint-height);
  flex-shrink: 0;
  overflow: hidden;
}

.virtual-keyboard-rows {
  display: grid;
  grid-template-rows: repeat(5, minmax(0, 1fr));
  gap: 4px;
  flex: 1;
  min-height: 0;
}

.virtual-keyboard-rotate {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  padding: 16px;
  color: var(--app-muted);
  text-align: center;
  font-size: 13px;
}

@media (pointer: coarse), (max-width: 767px) {
  .virtual-keyboard-trigger {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    touch-action: manipulation;
  }

  .virtual-keyboard-panel {
    --keyboard-key-height: 44px;
    --keyboard-control-height: 44px;
  }
}

@media (max-width: 639px) and (orientation: portrait) {
  .virtual-shortcuts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-height: 600px) and (orientation: landscape) {
  .virtual-keyboard-panel {
    --keyboard-key-height: clamp(28px, 8dvh, 40px);
    --keyboard-control-height: 36px;
    --keyboard-hint-height: 0px;
  }

  .virtual-shortcuts {
    gap: 4px;
  }
}

.virtual-keyboard-row {
  display: grid;
  grid-template-columns: repeat(64, minmax(0, 1fr));
  column-gap: 1px;
  touch-action: none;
}

.virtual-key {
  margin-inline: 1px;
  background: var(--app-surface-card);
  color: var(--app-fg);
}

.virtual-key:hover {
  background: var(--app-hover-soft);
}

.virtual-key[aria-pressed="true"],
.virtual-key.is-pressed {
  background: var(--app-state-selected);
  box-shadow: inset 0 0 0 1px var(--app-focus-ring);
}
</style>
