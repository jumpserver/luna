<script setup lang="ts">
import type { TerminalCursorAnchor } from "#koko";
import type { WorkspacePane } from "~/composables/useWorkspaceTabs";

import {
  getKokoTerminalCursorAnchor,
  getKokoTerminalElement,
  subscribeKokoTerminalCursorAnchor,
  subscribeKokoTerminalUserInput
} from "#koko";
import {
  getKokoTerminalAiSession,
  isKokoTerminalAiAvailable,
  isKokoTerminalAiBusy,
  submitKokoTerminalAiPrompt
} from "#koko/composables/terminal/useTerminalAiSessions";
import {
  isTerminalAiCommandShortcut,
  shouldShowTerminalAiCaretHint,
  TERMINAL_AI_HINT_IDLE_MS,
  terminalAiCommandShortcutAction
} from "~/utils/terminalAiCommand";

const props = defineProps<{ pane: WorkspacePane }>();
const { t } = useI18n();
const { isMacOS } = usePlatform();
const { openWorkspaceAi: openAi } = useAiPanel();
const open = ref(false);
const submitting = ref(false);
const error = ref("");
const inputRef = ref<{ textareaRef?: HTMLTextAreaElement } | null>(null);
const hostRef = shallowRef<HTMLElement | null>(null);
const panelRef = shallowRef<HTMLElement | null>(null);
const activeXterm = shallowRef<HTMLElement | null>(null);
const anchorRect = shallowRef<TerminalCursorAnchor | null>(null);
const hintAnchor = shallowRef<TerminalCursorAnchor | null>(null);
const hintVisible = ref(false);
const hintIdle = ref(true);
const panelPosition = ref({ left: 8, top: 8, width: 520, maxHeight: 260 });
const hintPosition = ref({ left: 0, top: 0, maxWidth: 0 });
let stopCursorSubscription = () => {};
let stopUserInputSubscription = () => {};

const session = computed(() => getKokoTerminalAiSession(props.pane.id));
const available = computed(() => isKokoTerminalAiAvailable(props.pane.id));
const sessionInfoReady = computed(() => Boolean(session.value?.sessionInfoReady));
const draft = computed({
  get: () => session.value?.draft || "",
  set: (value: string) => {
    if (session.value) session.value.draft = value;
  }
});
const shortcutLabel = computed(() => (isMacOS.value ? "⌘K" : "Ctrl K"));
const shortcutHint = computed(() => t("TerminalAi.ShortcutHint", { shortcut: shortcutLabel.value }));
const sendLabel = computed(() => (submitting.value ? t("TerminalAi.Sending") : t("TerminalAi.Send")));
const panelStyle = computed(() => ({
  left: `${panelPosition.value.left}px`,
  top: `${panelPosition.value.top}px`,
  width: `${panelPosition.value.width}px`,
  maxHeight: `${panelPosition.value.maxHeight}px`
}));
const hintStyle = computed(() => ({
  left: `${hintPosition.value.left}px`,
  top: `${hintPosition.value.top}px`,
  maxWidth: `${hintPosition.value.maxWidth}px`
}));

function focusInput() {
  nextTick(() => inputRef.value?.textareaRef?.focus());
}

function getFallbackCursorRect(xterm: HTMLElement): TerminalCursorAnchor {
  const terminalBounds = xterm.getBoundingClientRect();
  const cursorTextarea = xterm.querySelector<HTMLElement>(".xterm-helper-textarea");
  const cursorBounds = cursorTextarea?.getBoundingClientRect();
  if (
    cursorBounds &&
    cursorBounds.left >= terminalBounds.left &&
    cursorBounds.left <= terminalBounds.right &&
    cursorBounds.top >= terminalBounds.top &&
    cursorBounds.top <= terminalBounds.bottom
  ) {
    return cursorBounds;
  }
  return {
    left: terminalBounds.left + 12,
    top: terminalBounds.top + 8,
    width: 8,
    height: 18
  };
}

function findXtermForAnchor(anchor: TerminalCursorAnchor) {
  const scope = hostRef.value?.parentElement;
  if (!scope) return null;
  return (
    Array.from(scope.querySelectorAll<HTMLElement>(".xterm")).find((xterm) => {
      const bounds = xterm.getBoundingClientRect();
      return (
        bounds.width > 0 &&
        bounds.height > 0 &&
        anchor.left >= bounds.left &&
        anchor.left <= bounds.right &&
        anchor.top >= bounds.top &&
        anchor.top <= bounds.bottom
      );
    }) || null
  );
}

function hideHint() {
  if (hintVisible.value) hintVisible.value = false;
}

async function positionHint(anchor = hintAnchor.value) {
  if (open.value || !hintIdle.value) {
    hideHint();
    return;
  }

  await nextTick();
  if (open.value || !hintIdle.value) {
    hideHint();
    return;
  }
  const host = hostRef.value;
  if (!host || !anchor) {
    hideHint();
    return;
  }
  const xterm = getKokoTerminalElement(props.pane.id) || findXtermForAnchor(anchor) || activeXterm.value;
  if (!xterm) {
    hideHint();
    return;
  }

  activeXterm.value = xterm;
  const hostBounds = host.getBoundingClientRect();
  const terminalBounds = xterm.getBoundingClientRect();
  const left = anchor.left - hostBounds.left + anchor.width + 6;
  const top = anchor.top - hostBounds.top + Math.max(0, (anchor.height - 18) / 2);
  const maxWidth = terminalBounds.right - hostBounds.left - left - 8;
  const next = { left, top, maxWidth: Math.max(0, maxWidth) };
  const visible = shouldShowTerminalAiCaretHint(sessionInfoReady.value, next.maxWidth, hintIdle.value);
  const current = hintPosition.value;
  if (current.left !== next.left || current.top !== next.top || current.maxWidth !== next.maxWidth) {
    hintPosition.value = next;
  }
  if (hintVisible.value !== visible) hintVisible.value = visible;
}

async function positionPanel() {
  await nextTick();
  const host = hostRef.value;
  const panel = panelRef.value;
  const xterm = activeXterm.value;
  const anchor = anchorRect.value;
  if (!host || !panel || !xterm || !anchor) return;

  const hostBounds = host.getBoundingClientRect();
  const terminalBounds = xterm.getBoundingClientRect();
  const terminalLeft = terminalBounds.left - hostBounds.left;
  const terminalTop = terminalBounds.top - hostBounds.top;
  const terminalRight = terminalBounds.right - hostBounds.left;
  const terminalBottom = terminalBounds.bottom - hostBounds.top;
  const width = Math.min(520, Math.max(280, terminalBounds.width - 16));
  const maxHeight = Math.max(160, terminalBounds.height - 16);

  panelPosition.value = { ...panelPosition.value, width, maxHeight };
  await nextTick();

  const panelBounds = panel.getBoundingClientRect();
  const cursorLeft = anchor.left - hostBounds.left;
  const cursorTop = anchor.top - hostBounds.top;
  const cursorBottom = Math.min(terminalBottom, cursorTop + Math.max(anchor.height, 18));
  const gap = 8;
  const edge = 8;
  const maxLeft = Math.max(terminalLeft + edge, terminalRight - panelBounds.width - edge);
  const left = Math.min(Math.max(cursorLeft, terminalLeft + edge), maxLeft);
  const below = cursorBottom + gap;
  const above = cursorTop - panelBounds.height - gap;
  const top = below + panelBounds.height <= terminalBottom - edge ? below : Math.max(terminalTop + edge, above);

  panelPosition.value = { left, top, width, maxHeight };
}

let hintIdleTimer = 0;

function clearHintIdleTimer() {
  if (!hintIdleTimer) return;
  window.clearTimeout(hintIdleTimer);
  hintIdleTimer = 0;
}

function noteTypingActivity() {
  if (hintIdle.value) {
    hintIdle.value = false;
    hideHint();
  }
  clearHintIdleTimer();
  hintIdleTimer = window.setTimeout(() => {
    hintIdleTimer = 0;
    hintIdle.value = true;
    const latest = getKokoTerminalCursorAnchor(props.pane.id);
    if (latest) hintAnchor.value = latest;
    void positionHint();
  }, TERMINAL_AI_HINT_IDLE_MS);
}

function startCursorTracking() {
  stopCursorSubscription();
  stopUserInputSubscription();
  clearHintIdleTimer();
  hintIdle.value = true;
  stopCursorSubscription = subscribeKokoTerminalCursorAnchor(props.pane.id, (anchor) => {
    hintAnchor.value = anchor;
    if (hintIdle.value && !open.value && sessionInfoReady.value) {
      void positionHint(anchor);
    }
  });
  stopUserInputSubscription = subscribeKokoTerminalUserInput(props.pane.id, noteTypingActivity);
  const initialAnchor = getKokoTerminalCursorAnchor(props.pane.id);
  if (initialAnchor) hintAnchor.value = initialAnchor;
  void positionHint();
}

async function show(xterm: HTMLElement) {
  if (!available.value) return;
  if (isKokoTerminalAiBusy(props.pane.id)) {
    openAi();
    return;
  }

  activeXterm.value = xterm;
  anchorRect.value = getKokoTerminalCursorAnchor(props.pane.id) || getFallbackCursorRect(xterm);
  error.value = "";
  open.value = true;
  await positionPanel();
  focusInput();
}

function close(restoreTerminalFocus = true) {
  const wasOpen = open.value;
  open.value = false;
  error.value = "";
  if (restoreTerminalFocus) {
    nextTick(() => activeXterm.value?.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea")?.focus());
  }
  if (wasOpen && hintIdle.value) void positionHint();
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (open.value && event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }

  if (open.value || !isTerminalAiCommandShortcut(event, isMacOS.value)) return;

  const target = event.target instanceof Element ? event.target : null;
  const xterm = target?.closest<HTMLElement>(".xterm");
  if (!xterm || !available.value) return;
  event.preventDefault();
  event.stopPropagation();

  const action = terminalAiCommandShortcutAction(available.value, isKokoTerminalAiBusy(props.pane.id));
  if (action === "panel") {
    openAi();
    return;
  }
  if (action === "popover") void show(xterm);
}

function handleWindowPointerdown(event: PointerEvent) {
  if (!open.value || panelRef.value?.contains(event.target as Node)) return;
  close(false);
}

function handleWindowResize() {
  void positionHint();
  if (open.value) void positionPanel();
}

async function submit() {
  const current = session.value;
  const paneId = props.pane.id;
  const text = draft.value.trim();
  if (!current || !text || submitting.value) return;

  if (isKokoTerminalAiBusy(paneId)) {
    close(false);
    openAi();
    return;
  }

  submitting.value = true;
  error.value = "";
  try {
    await submitKokoTerminalAiPrompt(paneId, text);
    if (current.draft.trim() === text) current.draft = "";
    if (props.pane.id !== paneId) return;
    close(false);
    openAi();
  } catch (cause) {
    if (props.pane.id !== paneId) return;
    const code = cause instanceof Error && "code" in cause ? String(cause.code) : "";
    if (code === "response_active") {
      close(false);
      openAi();
    } else if (code === "unavailable") {
      error.value = t("RightPanel.AIUnavailableForTerminal");
    } else {
      error.value = t("RightPanel.AISendFailed");
    }
  } finally {
    submitting.value = false;
  }
}

function handleInputKeydown(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    void submit();
  }
}

watch(
  () => props.pane.id,
  () => {
    clearHintIdleTimer();
    open.value = false;
    error.value = "";
    hintVisible.value = false;
    hintIdle.value = true;
    activeXterm.value = null;
    stopUserInputSubscription();
    nextTick(startCursorTracking);
  }
);
watch(sessionInfoReady, () => {
  void positionHint();
});

onMounted(() => {
  window.addEventListener("keydown", handleWindowKeydown, true);
  window.addEventListener("pointerdown", handleWindowPointerdown, true);
  window.addEventListener("resize", handleWindowResize);
  nextTick(startCursorTracking);
});
onBeforeUnmount(() => {
  clearHintIdleTimer();
  stopUserInputSubscription();
  stopCursorSubscription();
  window.removeEventListener("keydown", handleWindowKeydown, true);
  window.removeEventListener("pointerdown", handleWindowPointerdown, true);
  window.removeEventListener("resize", handleWindowResize);
});
</script>

<template>
  <div ref="hostRef" class="pointer-events-none absolute inset-0 z-50 overflow-hidden">
    <div
      v-if="!open && hintVisible"
      :style="hintStyle"
      aria-hidden="true"
      class="terminal-ai-caret-hint absolute truncate font-ui-mono text-[13px] leading-4.5"
    >
      {{ shortcutHint }}
    </div>

    <Transition
      enter-active-class="transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none"
      enter-from-class="opacity-0 -translate-y-1 scale-[0.985]"
      leave-active-class="transition-[opacity,transform] duration-100 ease-in motion-reduce:transition-none"
      leave-to-class="opacity-0 -translate-y-1 scale-[0.985]"
    >
      <section
        v-if="open"
        ref="panelRef"
        :style="panelStyle"
        class="terminal-ai-panel pointer-events-auto absolute flex origin-top-left flex-col overflow-hidden bg-(--app-surface-overlay) text-(--app-fg)"
        role="dialog"
        :aria-label="t('TerminalAi.Title')"
      >
        <header class="terminal-ai-head flex shrink-0 items-center justify-between gap-2 px-2.5 pt-2">
          <div class="flex min-w-0 items-center gap-1.5 text-[11px] tracking-[0.02em] text-muted">
            <span class="size-1.5 shrink-0 rounded-full bg-primary" />
            <span class="truncate">{{ t("TerminalAi.Title") }}</span>
          </div>
          <span class="shrink-0 text-[11px] tracking-[0.01em] text-muted">{{ shortcutLabel }} · Esc</span>
        </header>

        <div class="terminal-ai-input-row grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 px-2.5 pb-2.5 pt-2">
          <UTextarea
            ref="inputRef"
            v-model="draft"
            :aria-label="t('TerminalAi.PromptLabel')"
            :placeholder="t('TerminalAi.Placeholder')"
            name="terminal-ai-instruction"
            autocomplete="off"
            :spellcheck="false"
            :rows="2"
            :disabled="submitting"
            variant="none"
            class="terminal-ai-prompt min-w-0"
            :ui="{
              base: 'min-h-14 max-h-30 resize-none rounded-none px-0 pb-0 pt-1 text-sm leading-[21px] ring-0 focus-visible:ring-0'
            }"
            @keydown="handleInputKeydown"
          />
          <UButton
            :label="sendLabel"
            size="sm"
            class="terminal-ai-button h-8 min-w-18 justify-center rounded-md px-3"
            :loading="submitting"
            :disabled="!draft.trim()"
            @click="submit"
          />
        </div>

        <p v-if="error" aria-live="polite" class="terminal-ai-error px-2.5 pb-2 text-xs leading-5">
          {{ error }}
        </p>

        <footer
          class="terminal-ai-foot flex items-center justify-between gap-3 border-t border-(--app-border) px-2.5 py-1.5 text-[11px] text-muted"
        >
          <span class="min-w-0 truncate">{{ t("TerminalAi.ContinueHint") }}</span>
          <span class="shrink-0">
            <kbd class="terminal-ai-shortcut-tag font-ui-mono">
              {{ isMacOS ? "⌘↵" : "Ctrl ↵" }}
            </kbd>
            <span class="ml-1">{{ t("TerminalAi.Send") }}</span>
          </span>
        </footer>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.terminal-ai-panel {
  border-radius: 8px;
  box-shadow:
    0 8px 24px color-mix(in srgb, var(--app-fg) 18%, transparent),
    0 0 0 1px var(--app-border);
}

.terminal-ai-head {
  min-height: 24px;
}

.terminal-ai-caret-hint {
  color: color-mix(in srgb, var(--terminal-foreground) 42%, transparent);
  letter-spacing: 0.02em;
  user-select: none;
}

.terminal-ai-shortcut-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding-inline: 4px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  color: var(--app-muted);
  background: transparent;
  font-size: 10px;
  font-weight: 400;
  line-height: 1.5;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.terminal-ai-prompt :deep(textarea) {
  min-height: 56px;
  max-height: 120px;
  padding: 4px 0 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--app-fg);
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
}

.terminal-ai-prompt :deep(textarea::placeholder) {
  color: var(--app-muted);
}

.terminal-ai-button {
  min-height: 32px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 550;
  letter-spacing: 0.02em;
}

.terminal-ai-error {
  color: color-mix(in srgb, var(--ui-color-error-500) 82%, var(--app-fg));
}
</style>
