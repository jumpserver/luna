<script setup lang="ts">
import { sendKokoTerminalData } from "#koko";
import { getLionWorkspaceSession } from "~/lion/workspaces/useLionWorkspaceSessionRegistry";

type Modifier = "ctrl" | "alt" | "shift";

interface VirtualKey {
  label: string;
  value: string;
  class?: string;
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
const modifiers = reactive<Record<Modifier, boolean>>({ ctrl: false, alt: false, shift: false });

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
  { label: "F11", windowsKeys: ["65480"] },
  { label: "Win", windowsKeys: ["65515"] },
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

const numberRow: VirtualKey[] = "1234567890".split("").map((value) => ({ label: value, value }));
const letterRows: VirtualKey[][] = ["qwertyuiop", "asdfghjkl", "zxcvbnm"].map((row) =>
  row.split("").map((value) => ({ label: value.toUpperCase(), value }))
);
const symbolRow: VirtualKey[] = ["-", "_", "/", "\\", ".", ",", ":", ";", "[", "]"].map((value) => ({
  label: value,
  value
}));
const navigationKeys: VirtualKey[] = [
  { label: "Esc", value: "\x1b" },
  { label: "Tab", value: "\t" },
  { label: "↑", value: "\x1b[A" },
  { label: "↓", value: "\x1b[B" },
  { label: "←", value: "\x1b[D" },
  { label: "→", value: "\x1b[C" }
];

const shiftedNumbers: Record<string, string> = {
  "1": "!",
  "2": "@",
  "3": "#",
  "4": "$",
  "5": "%",
  "6": "^",
  "7": "&",
  "8": "*",
  "9": "(",
  "0": ")"
};

function resetModifiers() {
  modifiers.ctrl = false;
  modifiers.alt = false;
  modifiers.shift = false;
}

function toggleModifier(modifier: Modifier) {
  modifiers[modifier] = !modifiers[modifier];
}

function encodedKey(value: string) {
  let data = value;
  if (value.length === 1) {
    data = modifiers.shift ? shiftedNumbers[value] || value.toUpperCase() : value;
    if (modifiers.ctrl && /^[a-z]$/i.test(data)) {
      data = String.fromCharCode(data.toUpperCase().charCodeAt(0) & 31);
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

function windowsKeysyms(value: string) {
  const keys: string[] = [];
  if (modifiers.ctrl) keys.push("65507");
  if (modifiers.alt) keys.push("65513");
  if (modifiers.shift) keys.push("65505");
  const special = windowsSpecialKeys[value];
  keys.push(special || String(value.charCodeAt(0)));
  return keys;
}

function sendWindowsKeys(keys: string[]) {
  const paneId = activePane.value?.id || "";
  const controller = getLionWorkspaceSession(paneId);
  if (!controller) return false;
  controller.sendCombinationKeys(keys);
  return true;
}

function send(value: string) {
  const paneId = activePane.value?.id;
  const sent =
    paneId &&
    (isWindowsSession.value ? sendWindowsKeys(windowsKeysyms(value)) : sendKokoTerminalData(paneId, encodedKey(value)));
  if (!sent) {
    toast.add({ title: t("koko.terminal.noActiveTerminal"), color: "warning" });
  }
  resetModifiers();
}

function sendShortcut(shortcut: ShortcutKey) {
  const paneId = activePane.value?.id;
  const sent = shortcut.windowsKeys
    ? sendWindowsKeys(shortcut.windowsKeys)
    : Boolean(paneId && shortcut.terminalData && sendKokoTerminalData(paneId, shortcut.terminalData));
  if (!sent) toast.add({ title: t("koko.terminal.noActiveTerminal"), color: "warning" });
  resetModifiers();
}

watch(available, (value) => {
  if (!value) open.value = false;
});
</script>

<template>
  <UPopover
    :open="open"
    :dismissible="false"
    :content="{ align: 'end', side: 'top', sideOffset: 8 }"
    :ui="{ content: 'w-[min(26rem,calc(100vw-1rem))] p-2' }"
  >
    <UTooltip :text="t('koko.terminal.virtualKeyboard')">
      <button
        type="button"
        class="grid size-5 place-items-center rounded text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover-soft)] hover:text-[var(--app-fg)] disabled:cursor-not-allowed disabled:opacity-35"
        :disabled="!available"
        :aria-label="t('koko.terminal.virtualKeyboard')"
        :aria-expanded="open"
        @click.stop="open = !open"
      >
        <UIcon name="i-lucide-keyboard" class="size-3.5" />
      </button>
    </UTooltip>

    <template #content>
      <div role="application" :aria-label="t('koko.terminal.virtualKeyboard')" class="space-y-1.5 select-none">
        <div class="flex flex-wrap gap-1 pb-0.5">
          <button
            v-for="shortcut in commonShortcuts"
            :key="shortcut.label"
            type="button"
            class="h-8 shrink-0 rounded-md border border-default bg-elevated px-2.5 text-[11px] font-medium hover:bg-accented"
            @pointerdown.prevent
            @click="sendShortcut(shortcut)"
          >
            {{ shortcut.label }}
          </button>
        </div>

        <div class="flex items-center gap-1">
          <button
            v-for="modifier in ['ctrl', 'alt', 'shift'] as Modifier[]"
            :key="modifier"
            type="button"
            class="h-8 flex-1 rounded-md border border-default text-xs font-medium uppercase transition-colors"
            :class="modifiers[modifier] ? 'border-primary bg-primary/15 text-primary' : 'bg-elevated hover:bg-accented'"
            :aria-pressed="modifiers[modifier]"
            @pointerdown.prevent
            @click="toggleModifier(modifier)"
          >
            {{ modifier }}
          </button>
          <button
            v-for="key in navigationKeys"
            :key="key.label"
            type="button"
            class="h-8 min-w-8 rounded-md border border-default bg-elevated px-2 text-xs font-medium hover:bg-accented"
            @pointerdown.prevent
            @click="send(key.value)"
          >
            {{ key.label }}
          </button>
        </div>

        <div class="flex justify-center gap-1">
          <button
            v-for="key in numberRow"
            :key="key.value"
            type="button"
            class="h-8 min-w-0 flex-1 rounded-md border border-default bg-elevated text-xs hover:bg-accented"
            @pointerdown.prevent
            @click="send(key.value)"
          >
            {{ modifiers.shift ? shiftedNumbers[key.value] : key.label }}
          </button>
        </div>

        <div
          v-for="(row, index) in letterRows"
          :key="index"
          class="flex justify-center gap-1"
          :class="index === 1 ? 'px-3' : index === 2 ? 'px-7' : ''"
        >
          <button
            v-for="key in row"
            :key="key.value"
            type="button"
            class="h-8 min-w-0 flex-1 rounded-md border border-default bg-elevated text-xs font-medium hover:bg-accented"
            @pointerdown.prevent
            @click="send(key.value)"
          >
            {{ key.label }}
          </button>
        </div>

        <div class="flex justify-center gap-1">
          <button
            v-for="key in symbolRow"
            :key="key.value"
            type="button"
            class="h-8 min-w-0 flex-1 rounded-md border border-default bg-elevated text-xs hover:bg-accented"
            @pointerdown.prevent
            @click="send(key.value)"
          >
            {{ key.label }}
          </button>
        </div>

        <div class="flex gap-1">
          <button
            class="h-8 w-14 rounded-md border border-default bg-elevated text-xs hover:bg-accented"
            @pointerdown.prevent
            @click="send('\x7f')"
          >
            ⌫
          </button>
          <button
            class="h-8 flex-1 rounded-md border border-default bg-elevated text-xs hover:bg-accented"
            @pointerdown.prevent
            @click="send(' ')"
          >
            Space
          </button>
          <button
            class="h-8 w-20 rounded-md border border-default bg-elevated text-xs hover:bg-accented"
            @pointerdown.prevent
            @click="send('\r')"
          >
            Enter
          </button>
        </div>
      </div>
    </template>
  </UPopover>
</template>
