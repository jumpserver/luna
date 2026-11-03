<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { WorkspaceClipboardPasteTarget } from "~/composables/useWorkspaceClipboardPaste";
import type { DesktopClipboardHistoryItem } from "~/shared/desktop/bridge";
import { useWorkspaceClipboardPaste } from "~/composables/useWorkspaceClipboardPaste";
import { desktopClipboard } from "~/shared/desktop/bridge";

const { t, locale } = useI18n();
const { isMacOS } = usePlatform();
const shortcuts = useAppShortcuts();
const { captureTarget } = useWorkspaceClipboardPaste();
const route = useRoute();
const toast = useToast();
const open = ref(false);
const loading = ref(false);
const busy = ref(false);
const enabled = ref(true);
const query = ref("");
const entries = shallowRef<DesktopClipboardHistoryItem[]>([]);
const selectedId = ref("");
const error = ref("");
const confirmation = ref<"paste" | "clear" | null>(null);
const menuOpen = ref(false);
const searchInput = useTemplateRef<{ inputRef?: HTMLInputElement }>("searchInput");
const list = useTemplateRef<HTMLElement>("list");
const cancelButton = useTemplateRef<{ $el?: HTMLButtonElement }>("cancelButton");
const listId = useId();
const target = shallowRef<WorkspaceClipboardPasteTarget | null>(null);
let previousFocus: HTMLElement | null = null;
let request = 0;
const consumedKeys = new Set<string>();

const results = computed(() => {
  const term = query.value.toLocaleLowerCase();
  return term ? entries.value.filter((item) => item.text.toLocaleLowerCase().includes(term)) : entries.value;
});
const selected = computed(() => results.value.find((item) => item.id === selectedId.value) || results.value[0]);
const selectedIndex = computed(() => results.value.findIndex((item) => item.id === selected.value?.id));
const lines = computed(() => (selected.value?.text.match(/\r\n|\r|\n/g)?.length || 0) + 1);
const copiedAt = computed(() =>
  selected.value ? new Date(selected.value.copiedAt).toLocaleString(locale.value.replace("_", "-")) : ""
);
const primaryModifier = computed(() => (isMacOS.value ? "⌘" : "Ctrl"));
const digitModifier = computed(() => (isMacOS.value ? "⌥" : "Alt+"));
const pasteLabel = computed(() =>
  t(target.value?.mode === "remote-clipboard" ? "ClipboardHistory.SendRemote" : "ClipboardHistory.Paste")
);
const actions = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: t(enabled.value ? "ClipboardHistory.Pause" : "ClipboardHistory.Resume"),
      icon: enabled.value ? "i-lucide-pause" : "i-lucide-play",
      onSelect: () => void toggleRecording()
    }
  ],
  [
    {
      label: t("ClipboardHistory.Delete"),
      icon: "i-lucide-trash-2",
      disabled: !selected.value,
      onSelect: () => void removeSelected()
    },
    {
      label: t("ClipboardHistory.Clear"),
      icon: "i-lucide-list-x",
      disabled: !entries.value.length,
      onSelect: () => askConfirmation("clear")
    }
  ]
]);

watch(query, () => {
  selectedId.value = results.value[0]?.id || "";
});
watch(
  () => selected.value?.id,
  () => {
    confirmation.value = null;
    error.value = "";
    void nextTick(() => list.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }));
  }
);
watch(
  () => route.fullPath,
  () => close()
);

async function show() {
  if (open.value || busy.value) return;
  // Capture before the modal takes focus; never look up a new destination after choosing a clip.
  target.value = captureTarget();
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  query.value = "";
  selectedId.value = "";
  entries.value = [];
  error.value = "";
  confirmation.value = null;
  loading.value = true;
  open.value = true;
  const currentRequest = ++request;
  try {
    const [history, status] = await Promise.all([desktopClipboard.history(), desktopClipboard.historyStatus()]);
    if (currentRequest !== request || !open.value) return;
    // A snapshot keeps incoming system copies from moving the keyboard selection.
    entries.value = history;
    selectedId.value = history[0]?.id || "";
    enabled.value = status.enabled;
  } catch {
    if (currentRequest === request) error.value = t("ClipboardHistory.ReadFailed");
  } finally {
    if (currentRequest === request) loading.value = false;
  }
}

function close() {
  if (busy.value) return;
  open.value = false;
  ++request;
}

function restoreFocus(event: Event) {
  event.preventDefault();
  if (target.value) target.value.focus();
  else if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  target.value = null;
  previousFocus = null;
  entries.value = [];
}

function focusSearch(event: Event) {
  event.preventDefault();
  void nextTick(() => searchInput.value?.inputRef?.focus());
}

function askConfirmation(kind: "paste" | "clear") {
  confirmation.value = kind;
  void nextTick(() => cancelButton.value?.$el?.focus());
}

async function paste(confirmed = false) {
  const item = selected.value;
  if (!item || busy.value || loading.value) return;
  if (!target.value) {
    error.value = t("ClipboardHistory.Unavailable");
    return;
  }
  // Terminal newlines and control characters can execute commands even without an added Enter.
  if (
    !confirmed &&
    target.value.terminal &&
    Array.from(item.text).some((char) => {
      const code = char.charCodeAt(0);
      return (code < 32 && code !== 9) || code === 127;
    })
  ) {
    askConfirmation("paste");
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const result = await target.value.paste(item.text);
    if (result === "pasted" || result === "clipboard-sent") {
      if (result === "clipboard-sent") toast.add({ title: t("ClipboardHistory.RemoteClipboardSent") });
      busy.value = false;
      close();
    } else {
      error.value = t(result === "denied" ? "ClipboardHistory.Denied" : "ClipboardHistory.Unavailable");
      confirmation.value = null;
    }
  } catch {
    error.value = t("ClipboardHistory.ActionFailed");
  } finally {
    busy.value = false;
  }
}

async function copy() {
  if (!selected.value || busy.value) return;
  busy.value = true;
  try {
    await desktopClipboard.writeText(selected.value.text);
    busy.value = false;
    close();
  } catch {
    error.value = t("ClipboardHistory.ActionFailed");
  } finally {
    busy.value = false;
  }
}

async function toggleRecording() {
  busy.value = true;
  try {
    await desktopClipboard.setHistoryEnabled(!enabled.value);
    enabled.value = !enabled.value;
  } catch {
    error.value = t("ClipboardHistory.ActionFailed");
  } finally {
    busy.value = false;
  }
}

async function removeSelected() {
  const item = selected.value;
  if (!item || busy.value) return;
  busy.value = true;
  try {
    await desktopClipboard.removeHistory(item.id);
    const index = selectedIndex.value;
    entries.value = entries.value.filter((entry) => entry.id !== item.id);
    selectedId.value = results.value[Math.min(index, results.value.length - 1)]?.id || "";
  } catch {
    error.value = t("ClipboardHistory.ActionFailed");
  } finally {
    busy.value = false;
  }
}

async function clearHistory() {
  busy.value = true;
  try {
    await desktopClipboard.clearHistory();
    entries.value = [];
    confirmation.value = null;
  } catch {
    error.value = t("ClipboardHistory.ActionFailed");
  } finally {
    busy.value = false;
  }
}

function handleKeydown(event: KeyboardEvent) {
  // A fresh press also recovers when focus changes caused us to miss the previous keyup.
  if (!event.repeat) consumedKeys.delete(event.code);
  // Keep a held confirmation key from reaching the terminal after the picker closes.
  if (consumedKeys.has(event.code)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (!open.value) {
    if (!shortcuts.blocked(event) && shortcuts.matches("clipboardHistory", event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      consumedKeys.add(event.code);
      if (!event.repeat) void show();
    }
    return;
  }
  if (event.isComposing || event.keyCode === 229 || menuOpen.value) return;
  const primary = isMacOS.value ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
  const digit =
    event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.code.match(/^Digit([1-9])$/)?.[1];
  let action: (() => void) | undefined;
  if (shortcuts.matches("clipboardHistory", event)) action = close;
  else if (plain && event.key === "Escape") action = () => (confirmation.value ? (confirmation.value = null) : close());
  else if (!confirmation.value && plain && ["ArrowUp", "ArrowDown"].includes(event.key)) {
    action = () => {
      const index = Math.max(
        0,
        Math.min(results.value.length - 1, selectedIndex.value + (event.key === "ArrowDown" ? 1 : -1))
      );
      selectedId.value = results.value[index]?.id || "";
    };
  } else if (!confirmation.value && digit) {
    action = () => {
      const item = results.value[Number(digit) - 1];
      if (!item) return;
      selectedId.value = item.id;
      void nextTick(() => paste());
    };
  } else if (!confirmation.value && event.key === "Enter" && !event.altKey && !event.shiftKey) {
    if (primary) action = () => void copy();
    else if (plain && !(event.target instanceof Element && event.target.closest('button:not([role="option"])')))
      action = () => void paste();
  }
  if (!action && plain && event.key === "Enter" && event.target instanceof Element) {
    const button = event.target.closest<HTMLButtonElement>('.clipboard-history button:not([role="option"])');
    if (button) action = () => button.click();
  }
  if (!action) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!["ArrowUp", "ArrowDown"].includes(event.key)) consumedKeys.add(event.code);
  if (busy.value || (event.repeat && !["ArrowUp", "ArrowDown"].includes(event.key))) return;
  action();
}

useEventListener(window, "keydown", handleKeydown, { capture: true });
useEventListener(
  window,
  "keyup",
  (event: KeyboardEvent) => {
    if (!consumedKeys.delete(event.code)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  },
  { capture: true }
);
useEventListener(window, "blur", () => consumedKeys.clear());
onBeforeUnmount(() => {
  ++request;
});
</script>

<template>
  <UModal
    :open="open"
    :title="t('ClipboardHistory.Title')"
    :description="t('ClipboardHistory.MemoryHint')"
    :dismissible="!busy"
    :transition="false"
    :content="{ onOpenAutoFocus: focusSearch, onCloseAutoFocus: restoreFocus }"
    :ui="{
      overlay: 'clipboard-history-overlay',
      content: 'clipboard-history-modal w-[calc(100vw-2rem)] max-w-[760px] overflow-hidden divide-y-0'
    }"
    @update:open="
      (value) => {
        if (!value) close();
      }
    "
  >
    <template #content>
      <div class="clipboard-history" @keydown.stop @keyup.stop>
        <div class="clipboard-history-search">
          <UInput
            ref="searchInput"
            v-model="query"
            icon="i-lucide-search"
            variant="none"
            class="w-full"
            :placeholder="t('ClipboardHistory.Search')"
            :aria-label="t('ClipboardHistory.Search')"
            role="combobox"
            :aria-expanded="open"
            :aria-controls="listId"
            :aria-activedescendant="selected ? `${listId}-${selected.id}` : undefined"
            autocomplete="off"
            :spellcheck="false"
            :disabled="busy"
          />
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('ClipboardHistory.Close')"
            :disabled="busy"
            @click="close"
          >
            <UKbd value="esc" />
          </UButton>
        </div>
        <div class="clipboard-history-body">
          <div class="clipboard-history-results">
            <div class="clipboard-history-caption">
              {{ t("ClipboardHistory.Recent") }}
              <span>{{ results.length }}</span>
            </div>
            <div
              :id="listId"
              ref="list"
              role="listbox"
              :aria-label="t('ClipboardHistory.Title')"
              class="clipboard-history-list"
              :aria-busy="loading"
            >
              <p v-if="loading || !results.length" class="clipboard-history-empty">
                {{
                  t(
                    loading
                      ? "ClipboardHistory.Loading"
                      : query
                        ? "ClipboardHistory.NoResults"
                        : "ClipboardHistory.Empty"
                  )
                }}
              </p>
              <button
                v-for="(item, index) in results"
                :id="`${listId}-${item.id}`"
                :key="item.id"
                type="button"
                role="option"
                :aria-selected="selected?.id === item.id"
                :aria-label="item.text"
                tabindex="-1"
                class="clipboard-history-item"
                :disabled="busy"
                @click="selectedId = item.id"
                @dblclick="paste()"
              >
                <UIcon name="i-lucide-file-text" class="size-4 shrink-0" />
                <span class="min-w-0 flex-1 truncate">{{ item.text.replace(/\s+/g, " ") }}</span>
                <span v-if="index < 9" class="clipboard-history-digit">{{ digitModifier }}{{ index + 1 }}</span>
              </button>
            </div>
          </div>
          <div class="clipboard-history-preview">
            <div class="clipboard-history-caption">
              <span>{{ t("ClipboardHistory.Preview") }}</span>
              <span v-if="selected">
                {{ t("ClipboardHistory.PlainText") }} · {{ t("ClipboardHistory.Lines", { count: lines }) }}
              </span>
            </div>
            <pre v-if="selected" tabindex="0">{{ selected.text }}</pre>
            <div v-if="selected" class="clipboard-history-date">{{ copiedAt }}</div>
          </div>
        </div>
        <div v-if="confirmation" class="clipboard-history-confirm" role="alert">
          <div class="min-w-0 flex-1">
            <p class="font-medium">
              {{ t(confirmation === "paste" ? "ClipboardHistory.RiskTitle" : "ClipboardHistory.ClearConfirm") }}
            </p>
            <p v-if="confirmation === 'paste'" class="mt-1 text-muted">{{ t("ClipboardHistory.RiskDescription") }}</p>
          </div>
          <UButton
            ref="cancelButton"
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="busy"
            @click="confirmation = null"
          >
            {{ t("ClipboardHistory.Cancel") }}
          </UButton>
          <UButton size="xs" :loading="busy" @click="confirmation === 'paste' ? paste(true) : clearHistory()">
            {{ t(confirmation === "paste" ? "ClipboardHistory.ConfirmPaste" : "ClipboardHistory.ConfirmClear") }}
          </UButton>
        </div>
        <p v-if="error" role="alert" class="clipboard-history-error">{{ error }}</p>
        <footer class="clipboard-history-footer">
          <span class="clipboard-history-count" :title="t('ClipboardHistory.MemoryHint')">
            <UIcon :name="enabled ? 'i-lucide-clipboard-list' : 'i-lucide-pause'" class="size-4 shrink-0" />
            {{ enabled ? t("ClipboardHistory.Items", { count: entries.length }) : t("ClipboardHistory.Paused") }}
          </span>
          <span class="clipboard-history-navigation">
            <UKbd value="↑" />
            <UKbd value="↓" />
            {{ t("ClipboardHistory.Select") }}
          </span>
          <UButton color="neutral" variant="ghost" size="xs" :disabled="!selected || busy" @click="copy">
            <UKbd :value="`${primaryModifier} ↵`" />
            {{ t("ClipboardHistory.CopyOnly") }}
          </UButton>
          <UButton color="neutral" variant="ghost" size="xs" :disabled="!selected || busy || !target" @click="paste()">
            <UKbd value="↵" />
            {{ pasteLabel }}
          </UButton>
          <UDropdownMenu v-model:open="menuOpen" :items="actions" :content="{ side: 'top', align: 'end' }">
            <UButton
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="t('ClipboardHistory.Actions')"
              :disabled="busy"
            />
          </UDropdownMenu>
        </footer>
      </div>
    </template>
  </UModal>
</template>

<style>
.clipboard-history-overlay {
  background: color-mix(in srgb, var(--app-surface-canvas) 12%, transparent);
  backdrop-filter: blur(1px);
}
</style>

<style scoped>
.clipboard-history {
  color: var(--app-fg);
  font-size: var(--app-ui-font-size);
}
.clipboard-history-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--app-border-subtle);
}
.clipboard-history-body {
  display: grid;
  grid-template-columns: 40% minmax(0, 1fr);
  height: min(356px, 54vh);
}
.clipboard-history-results {
  display: flex;
  min-height: 0;
  min-width: 0;
  flex-direction: column;
  padding: 8px;
  border-right: 1px solid var(--app-border-subtle);
}
.clipboard-history-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px 8px;
  color: var(--app-muted);
  font-size: 12px;
}
.clipboard-history-list {
  min-height: 0;
  overflow: auto;
}
.clipboard-history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 34px;
  padding: 0 8px;
  text-align: left;
  border-radius: var(--app-radius);
  border-left: 2px solid transparent;
}
.clipboard-history-item:hover {
  background: var(--app-state-hover);
}
.clipboard-history-item[aria-selected="true"] {
  background: var(--app-state-selected);
  border-left-color: var(--theme-accent);
}
.clipboard-history-digit {
  flex-shrink: 0;
  color: var(--app-muted);
  font-size: 11px;
}
.clipboard-history-empty {
  padding: 32px 12px;
  color: var(--app-muted);
  text-align: center;
}
.clipboard-history-preview {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  padding: 12px 16px;
}
.clipboard-history-preview .clipboard-history-caption {
  padding: 0 0 12px;
}
.clipboard-history-preview pre {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: inherit;
  line-height: 1.7;
  tab-size: 4;
}
.clipboard-history-date {
  padding-top: 12px;
  color: var(--app-muted);
  font-size: 11px;
}
.clipboard-history-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 4px 10px;
  border-top: 1px solid var(--app-border-subtle);
}
.clipboard-history-count {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: auto;
  color: var(--app-muted);
  font-size: 12px;
}
.clipboard-history-navigation {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-right: 8px;
  color: var(--app-muted);
  font-size: 12px;
}
.clipboard-history-confirm {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--app-border-subtle);
  font-size: 12px;
}
.clipboard-history-error {
  margin: 0;
  padding: 8px 14px;
  color: var(--ui-error);
  font-size: 12px;
}
@media (max-width: 580px) {
  .clipboard-history-body {
    grid-template-columns: 45% minmax(0, 1fr);
  }
  .clipboard-history-preview {
    padding: 12px;
  }
  .clipboard-history-navigation,
  .clipboard-history-caption > span + span {
    display: none;
  }
  .clipboard-history-count {
    font-size: 11px;
  }
}
</style>
