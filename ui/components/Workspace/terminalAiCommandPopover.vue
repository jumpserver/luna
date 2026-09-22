<script setup lang="ts">
import type { AiTimelineAction } from "~/components/RightPanel/ai/types";
import type { WorkspacePane } from "~/composables/useWorkspaceTabs";
import { getKokoTerminalElement } from "#koko";
import { AgentHttpError } from "#koko/composables/agent/agentClient";
import { getKokoTerminalAiSession, isKokoTerminalAiAvailable } from "#koko/composables/terminal/useTerminalAiSessions";
import { terminalAiPanelDomain } from "~/components/RightPanel/ai/domains/terminal/adapter";
import { renderAiMarkdown } from "~/components/RightPanel/ai/presentation";
import { AI_PANEL_RESIZE_HANDLES } from "~/components/RightPanel/aiPanelResizeHandles";
import WorkspaceTerminalTaskCard from "~/components/RightPanel/workspace/WorkspaceTerminalTask.vue";
import { useTerminalAiHudLayout } from "~/composables/useTerminalAiHudLayout";
import { useTerminalAiTour } from "~/composables/useTerminalAiTour";
import { useWorkspaceAssistantPanelSession } from "~/composables/useWorkspaceAssistantPanelSession";
import {
  assertWorkspaceTerminalTaskCurrent,
  interruptWorkspaceAssistant,
  isWorkspaceAssistantBusy,
  resolveWorkspaceAssistantApproval,
  submitWorkspaceAssistantPrompt,
  useWorkspaceAssistantRuntime,
  workspaceAssistantMessages,
  workspaceAssistantTerminalTargets
} from "~/composables/useWorkspaceAssistantSession";
import { resolveWorkspaceTerminalTarget } from "~/composables/useWorkspaceTerminalTasks";
import {
  isTerminalAiApprovalShortcut,
  isTerminalAiCommandShortcut,
  terminalAiLiveTurn
} from "~/utils/terminalAiCommand";

const props = defineProps<{ pane: WorkspacePane }>();
const { t } = useI18n();
const { isMacOS } = usePlatform();
const { openAi } = useAiPanel();
const assistantRuntime = useWorkspaceAssistantRuntime();
const { session: assistantSession, scopeId } = useWorkspaceAssistantPanelSession(assistantRuntime);
const open = ref(false);
const submitting = ref(false);
const error = ref("");
const approving = ref(false);
const inputRef = ref<{ textareaRef?: HTMLTextAreaElement } | null>(null);

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
const historyShortcutLabel = computed(() => (isMacOS.value ? "⌘ ⇧ K" : "Ctrl ⇧ K"));
const approvalShortcutLabel = computed(() => (isMacOS.value ? "⌘ ↵" : "Ctrl ↵"));
const shortcutHint = computed(() => t("TerminalAi.ShortcutHint", { shortcut: shortcutLabel.value }));
const sendLabel = computed(() => (submitting.value ? t("TerminalAi.Sending") : t("TerminalAi.Send")));
const assistantBusy = computed(() => Boolean(scopeId.value && isWorkspaceAssistantBusy(scopeId.value)));
const liveTurn = computed(() =>
  terminalAiLiveTurn(workspaceAssistantMessages(assistantSession.value), assistantSession.value?.terminalTasks || [])
);
const submittedPrompt = ref("");
const decidedApprovals = reactive(new Set<string>());
const livePrompt = computed(() => liveTurn.value.lastUser || submittedPrompt.value);
const visibleApprovals = computed(() =>
  liveTurn.value.pendingApprovals.filter((item) => !decidedApprovals.has(item.id))
);
const quickApproval = computed(() => (visibleApprovals.value.length === 1 ? visibleApprovals.value[0] : null));
const activeTerminalTasks = computed(() => assistantSession.value?.terminalTasks.filter((task) => task.active) || []);
const live = computed(
  () =>
    assistantBusy.value ||
    liveTurn.value.live ||
    submitting.value ||
    activeTerminalTasks.value.length > 0 ||
    visibleApprovals.value.length > 0
);
const composerLocked = computed(
  () => assistantBusy.value || submitting.value || liveTurn.value.waitingApproval || visibleApprovals.value.length > 0
);
const approvalColor = computed(() => (liveTurn.value.failed ? "error" : "warning"));
const typedPlaceholder = ref("");
let placeholderTimer = 0;

const {
  hostRef,
  panelRef,
  dragHandleRef,
  dragging,
  interacting,
  liveRef,
  activeXterm,
  hintVisible,
  panelStyle,
  hintStyle,
  positionHint,
  positionPanel,
  startCursorTracking,
  onLiveScroll,
  pinLive,
  syncLayoutObserver,
  reveal,
  hideHintOnClose,
  handleWindowResize,
  resetForPaneChange,
  dispose
} = useTerminalAiHudLayout({
  paneId: () => props.pane.id,
  open,
  sessionInfoReady: () => sessionInfoReady.value
});

function stopPlaceholderType() {
  if (!placeholderTimer) return;
  window.clearTimeout(placeholderTimer);
  placeholderTimer = 0;
}

function startPlaceholderType() {
  stopPlaceholderType();
  const source = t("TerminalAi.Placeholder");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    typedPlaceholder.value = source;
    return;
  }
  typedPlaceholder.value = "";
  let index = 0;
  const tick = () => {
    index += 1;
    typedPlaceholder.value = source.slice(0, index);
    if (index < source.length) placeholderTimer = window.setTimeout(tick, 36);
  };
  placeholderTimer = window.setTimeout(tick, 160);
}

function focusInput() {
  nextTick(() => inputRef.value?.textareaRef?.focus());
}

async function show(xterm: HTMLElement) {
  if (!available.value) return;
  error.value = "";
  await reveal(xterm);
  if (!composerLocked.value) {
    startPlaceholderType();
    focusInput();
  }
}

const tour = useTerminalAiTour({
  paneId: () => props.pane.id,
  protocol: () => props.pane.protocol,
  available: () => available.value,
  sessionInfoReady: () => sessionInfoReady.value,
  shortcut: () => shortcutLabel.value,
  isOpen: () => open.value,
  panelEl: () => panelRef.value,
  openHud: show,
  connectionBusy: () => Boolean(props.pane.connectionProgress),
  root: () => getKokoTerminalElement(props.pane.id)
});

function close(restoreTerminalFocus = true) {
  tour.stop();
  if (!open.value) return;
  open.value = false;
  error.value = "";
  stopPlaceholderType();
  if (restoreTerminalFocus) {
    activeXterm.value?.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea")?.focus();
  }
  hideHintOnClose();
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || !hostRef.value?.getClientRects().length) return;
  if (open.value && event.key === "Escape") {
    if (tour.tourActive.value) return;
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  if (
    open.value &&
    quickApproval.value &&
    !approving.value &&
    !tour.tourActive.value &&
    isTerminalAiApprovalShortcut(event, isMacOS.value)
  ) {
    event.preventDefault();
    event.stopPropagation();
    void decideApproval(quickApproval.value.id, "approve");
    return;
  }
  if (tour.tourActive.value || !isTerminalAiCommandShortcut(event, isMacOS.value) || !available.value) return;
  const target = event.target instanceof Element ? event.target : null;
  const xterm = getKokoTerminalElement(props.pane.id);
  if (!xterm?.getClientRects().length) return;
  if (
    !panelRef.value?.contains(target) &&
    !xterm.contains(target) &&
    target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  if (open.value) focusInput();
  else void show(xterm);
}

function handleWindowPointerdown(event: PointerEvent) {
  if (tour.tourActive.value || !open.value || live.value || panelRef.value?.contains(event.target as Node)) return;
  close(false);
}

async function submit() {
  const current = session.value;
  const paneId = props.pane.id;
  const submittedScope = scopeId.value;
  const isCurrent = () => session.value === current && scopeId.value === submittedScope;
  const text = draft.value.trim();
  if (!current || !assistantSession.value || !text || submitting.value) return;
  submitting.value = true;
  error.value = "";
  try {
    const target = resolveWorkspaceTerminalTarget(workspaceAssistantTerminalTargets(submittedScope), paneId);
    if (!target?.available) {
      error.value = t("RightPanel.LunaAiTargetChanged");
      return;
    }
    assistantSession.value.target = target.target_id;
    submittedPrompt.value = text;
    decidedApprovals.clear();
    await submitWorkspaceAssistantPrompt(text, submittedScope);
    if (current.draft.trim() === text) current.draft = "";
    if (!isCurrent()) return;
    await positionPanel();
  } catch (cause) {
    if (!isCurrent()) return;
    const code = cause instanceof Error && "code" in cause ? String(cause.code) : "";
    if (code === "response_active") open.value = true;
    else if (code === "unavailable" || code === "terminal_changed") {
      error.value = t(
        code === "unavailable" ? "RightPanel.AIUnavailableForTerminal" : "RightPanel.LunaAiTargetChanged"
      );
    } else {
      error.value = t("RightPanel.AISendFailed");
    }
  } finally {
    if (isCurrent()) submitting.value = false;
  }
}

async function decideApproval(approvalId: string, decision: "approve" | "reject") {
  if (!approvalId || approving.value) return;
  const approvalScope = scopeId.value;
  approving.value = true;
  decidedApprovals.add(approvalId);
  try {
    await resolveWorkspaceAssistantApproval(approvalId, decision, approvalScope);
  } catch (cause) {
    if (scopeId.value !== approvalScope) return;
    const terminal =
      (cause instanceof AgentHttpError && cause.status === 409) ||
      (cause instanceof Error && /status=409|approval_terminal/.test(cause.message));
    if (!terminal) {
      decidedApprovals.delete(approvalId);
      error.value = t("RightPanel.AIApprovalFailed");
    }
  } finally {
    if (scopeId.value === approvalScope) approving.value = false;
  }
}

function terminalAction(taskId: string, action: AiTimelineAction) {
  const task = assistantSession.value?.terminalTasks.find((item) => item.id === taskId);
  if (!task) return;
  try {
    if (!["set-step-expanded", "set-execution-override"].includes(action.type))
      assertWorkspaceTerminalTaskCurrent(scopeId.value, taskId);
    terminalAiPanelDomain.handleTimelineAction(task.session, action, {
      paneId: task.session.paneId,
      surface: null,
      now: Date.now(),
      t
    });
  } catch {
    if (assistantSession.value) assistantSession.value.errorText = t("RightPanel.LunaAiTargetChanged");
  }
}

function handleInputKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229 || event.key !== "Enter" || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (event.metaKey || event.ctrlKey) {
    const textarea = inputRef.value?.textareaRef;
    if (!textarea) return;
    textarea.setRangeText("\n", textarea.selectionStart, textarea.selectionEnd, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  void submit();
}

watch([() => props.pane.id, session, scopeId], () => {
  close(false);
  error.value = "";
  submitting.value = false;
  approving.value = false;
  submittedPrompt.value = "";
  decidedApprovals.clear();
  resetForPaneChange();
});
watch(sessionInfoReady, () => {
  void positionHint();
});
watch(
  () => [props.pane.protocol, available.value, sessionInfoReady.value, props.pane.connectionProgress] as const,
  ([protocol, isAvailable, ready, connectionProgress]) => {
    if (protocol === "ssh" && isAvailable && ready && !connectionProgress) tour.scheduleOnce();
    else tour.cancelScheduled();
  },
  { immediate: true }
);
watch(live, async () => {
  if (!open.value) return;
  await nextTick();
  syncLayoutObserver();
  void positionPanel();
  void pinLive();
});
watch(
  () =>
    [
      liveTurn.value.lastAssistant,
      live.value,
      open.value,
      activeTerminalTasks.value.map((task) => `${task.status}:${task.messages.length}`).join()
    ] as const,
  () => {
    void pinLive();
  }
);
watch(
  () => [open.value, composerLocked.value] as const,
  ([isOpen, locked], [wasOpen, wasLocked]) => {
    if (isOpen && !locked) {
      startPlaceholderType();
      if (wasOpen && wasLocked) focusInput();
    } else {
      stopPlaceholderType();
    }
  }
);
watch(open, async (isOpen) => {
  if (!isOpen) {
    syncLayoutObserver();
    return;
  }
  await nextTick();
  syncLayoutObserver();
});

onMounted(() => {
  window.addEventListener("keydown", handleWindowKeydown, true);
  window.addEventListener("pointerdown", handleWindowPointerdown, true);
  window.addEventListener("resize", handleWindowResize);
  nextTick(() => {
    startCursorTracking();
    syncLayoutObserver();
  });
});
onBeforeUnmount(() => {
  tour.destroy();
  dispose();
  stopPlaceholderType();
  window.removeEventListener("keydown", handleWindowKeydown, true);
  window.removeEventListener("pointerdown", handleWindowPointerdown, true);
  window.removeEventListener("resize", handleWindowResize);
});
</script>

<template>
  <div ref="hostRef" class="pointer-events-none absolute inset-0 z-50 overflow-visible">
    <div
      v-if="!open && hintVisible"
      :style="hintStyle"
      aria-hidden="true"
      class="terminal-ai-caret-hint absolute truncate font-ui-mono text-[13px] leading-4.5"
    >
      {{ shortcutHint }}
    </div>

    <Transition
      enter-active-class="transition-opacity duration-100 ease-out motion-reduce:transition-none"
      enter-from-class="opacity-0"
      leave-active-class="duration-0"
      leave-to-class="opacity-0"
    >
      <section
        v-if="open"
        ref="panelRef"
        data-terminal-ai-tour="panel"
        :style="panelStyle"
        class="terminal-ai-panel pointer-events-auto"
        :class="{ 'select-none': interacting }"
        role="dialog"
        :aria-label="t('TerminalAi.Title')"
      >
        <UButton
          v-for="handle in AI_PANEL_RESIZE_HANDLES"
          :key="handle.edge"
          :data-terminal-ai-resize="handle.edge"
          :aria-label="t('RightPanel.AIResizePanel')"
          :title="t('RightPanel.AIResizePanel')"
          color="neutral"
          variant="ghost"
          class="group/terminal-ai-resize absolute z-20 touch-none justify-center rounded-none bg-transparent p-0 hover:bg-transparent active:bg-transparent focus-visible:ring-(--app-focus-ring)"
          :class="handle.class"
        >
          <UIcon
            v-if="handle.edge === 'se'"
            name="i-lucide-grip"
            class="pointer-events-none size-3 text-(--app-muted) opacity-0 group-hover/terminal-ai-resize:opacity-100 group-focus-visible/terminal-ai-resize:opacity-100"
          />
        </UButton>
        <div
          class="flex h-full min-h-0 flex-col overflow-hidden rounded-[8px] bg-(--app-surface-overlay) text-(--app-fg)"
        >
          <header
            ref="dragHandleRef"
            role="group"
            tabindex="0"
            :title="t('RightPanel.AIMovePanel')"
            :aria-label="t('RightPanel.AIMovePanel')"
            class="terminal-ai-head grid shrink-0 touch-none select-none grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2 outline-none focus-visible:ring-2 focus-visible:ring-(--app-focus-ring)"
            :class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
          >
            <div class="flex min-w-0 items-center gap-1.5 text-[11px] tracking-[0.02em] text-muted">
              <span class="size-1.5 shrink-0 rounded-full bg-primary" />
              <span class="truncate">{{ t("TerminalAi.Title") }}</span>
            </div>
            <div class="flex items-center gap-1">
              <UTooltip :text="t('koko.fileManagement.featureTour')">
                <UButton
                  icon="i-lucide-circle-help"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  class="size-6"
                  :aria-label="t('koko.fileManagement.featureTour')"
                  @click="void tour.start()"
                />
              </UTooltip>
              <UButton
                data-terminal-ai-tour="history"
                size="xs"
                color="neutral"
                variant="soft"
                class="h-6 min-w-0 gap-1 px-1.5 text-[11px] font-normal"
                @click="openAi()"
              >
                {{ t("TerminalAi.History") }}
                <span class="text-[10px] text-muted">{{ historyShortcutLabel }}</span>
              </UButton>
              <UButton
                data-terminal-ai-tour="close"
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                class="size-6"
                :aria-label="t('Common.Close')"
                @click="close()"
              />
            </div>
          </header>

          <div
            v-if="live"
            ref="liveRef"
            class="terminal-ai-live space-y-2 px-2.5 pb-2.5 pt-2"
            @scroll.passive="onLiveScroll"
          >
            <p v-if="livePrompt" class="rounded-lg bg-(--app-selected-soft) px-2.5 py-1.5 text-xs leading-5">
              {{ livePrompt }}
            </p>
            <div
              v-if="liveTurn.lastAssistant"
              class="terminal-ai-markdown text-xs leading-5"
              v-html="renderAiMarkdown(liveTurn.lastAssistant)"
            />
            <WorkspaceTerminalTaskCard
              v-for="task in activeTerminalTasks"
              :key="task.id"
              :task="task"
              @action="terminalAction(task.id, $event)"
            />
            <UAlert
              v-for="approval in visibleApprovals"
              :key="approval.id"
              :color="approvalColor"
              variant="subtle"
              icon="i-lucide-shield-alert"
              :title="t('RightPanel.WorkspaceAssistantApprovalTitle')"
            >
              <template #description>
                <div class="mt-2 space-y-2 text-xs">
                  <p class="font-medium">{{ approval.command || approval.toolName }}</p>
                  <div class="flex justify-end gap-2">
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      :disabled="approving"
                      :label="t('RightPanel.AIReject')"
                      @click="decideApproval(approval.id, 'reject')"
                    />
                    <UButton
                      size="xs"
                      :color="approvalColor"
                      :loading="approving"
                      @click="decideApproval(approval.id, 'approve')"
                    >
                      {{ t("RightPanel.AIApprove") }}
                      <span v-if="quickApproval?.id === approval.id" class="text-[11px] font-normal opacity-80">
                        {{ approvalShortcutLabel }}
                      </span>
                    </UButton>
                  </div>
                </div>
              </template>
            </UAlert>
            <UAlert
              v-if="assistantSession?.errorText || assistantSession?.errorCode"
              color="error"
              variant="subtle"
              icon="i-lucide-circle-alert"
              :title="assistantSession.errorText || assistantSession.errorCode"
            />
            <div v-if="assistantBusy && !liveTurn.waitingApproval" class="flex items-center gap-2 text-xs text-muted">
              <!-- An active task card already shows its own "running" spinner; avoid duplicating it here. -->
              <template v-if="!activeTerminalTasks.length">
                <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
                {{ t("RightPanel.AIResponding") }}
              </template>
              <UButton
                size="xs"
                color="error"
                variant="soft"
                class="ml-auto"
                :label="t('RightPanel.AIInterrupt')"
                @click="interruptWorkspaceAssistant(scopeId)"
              />
            </div>
          </div>

          <div
            v-if="!composerLocked"
            class="terminal-ai-composer mx-2.5 mb-2.5 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2 px-2.5 py-2"
            :class="live ? 'mt-1' : 'mt-2'"
          >
            <UTextarea
              ref="inputRef"
              v-model="draft"
              :aria-label="t('TerminalAi.PromptLabel')"
              :placeholder="typedPlaceholder"
              name="terminal-ai-instruction"
              autocomplete="off"
              :spellcheck="false"
              :rows="2"
              :disabled="submitting"
              variant="none"
              class="terminal-ai-prompt min-w-0"
              :ui="{
                base: 'min-h-14 resize-y overflow-y-auto rounded-none px-0 pb-0 pt-1 text-xs leading-5 ring-0 focus-visible:ring-0'
              }"
              @keydown="handleInputKeydown"
            />
            <UButton
              size="xs"
              class="terminal-ai-button inline-flex h-6 min-w-0 items-center gap-1 px-2"
              :loading="submitting"
              :disabled="!draft.trim()"
              @click="submit"
            >
              <span class="mt-0.5">
                {{ sendLabel }}
              </span>
              <span class="text-[10px] font-normal mt-0.75 opacity-80">↵</span>
            </UButton>
          </div>

          <div v-if="error" class="flex items-center justify-between gap-2 px-2.5 pb-2">
            <p aria-live="polite" class="terminal-ai-error min-w-0 text-xs leading-5">{{ error }}</p>
            <UButton size="xs" color="neutral" variant="ghost" :label="t('TerminalAi.ViewDetails')" @click="openAi()" />
          </div>
        </div>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.terminal-ai-panel {
  border-radius: 8px;
}

.terminal-ai-live {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.terminal-ai-live:hover,
.terminal-ai-live:focus-within {
  scrollbar-color: var(--app-scrollbar-thumb) transparent;
}

.terminal-ai-live::-webkit-scrollbar {
  width: 6px;
}

.terminal-ai-live::-webkit-scrollbar-thumb {
  background: transparent;
}

.terminal-ai-live:hover::-webkit-scrollbar-thumb,
.terminal-ai-live:focus-within::-webkit-scrollbar-thumb {
  background: var(--app-scrollbar-thumb);
}

.terminal-ai-composer {
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--app-surface-input);
}

.terminal-ai-markdown {
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.65;
  color: var(--app-fg);
}

.terminal-ai-markdown :deep(> :first-child) {
  margin-top: 0;
}

.terminal-ai-markdown :deep(> :last-child) {
  margin-bottom: 0;
}

.terminal-ai-markdown :deep(p) {
  margin: 0 0 0.4rem;
}

.terminal-ai-markdown :deep(ul),
.terminal-ai-markdown :deep(ol) {
  margin: 0 0 0.4rem;
  padding-left: 1.1rem;
  list-style: revert;
}

.terminal-ai-markdown :deep(h1),
.terminal-ai-markdown :deep(h2),
.terminal-ai-markdown :deep(h3),
.terminal-ai-markdown :deep(h4) {
  margin: 0.7rem 0 0.35rem;
  font-size: 1em;
  font-weight: 650;
}

.terminal-ai-markdown :deep(hr) {
  margin: 0.6rem 0;
  border-color: var(--app-border);
}

.terminal-ai-markdown :deep(code) {
  padding: 0.05rem 0.25rem;
  border-radius: 0.25rem;
  color: var(--ui-color-primary-500);
  background: var(--app-card-bg-soft);
  font-family: var(--font-mono);
  font-size: 0.92em;
}

.terminal-ai-markdown :deep(pre) {
  overflow: auto;
  max-height: 16rem;
  margin: 0.5rem 0;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--app-border);
  border-radius: 0.375rem;
  background: var(--app-card-bg-soft);
  white-space: pre;
  overflow-wrap: normal;
}

.terminal-ai-markdown :deep(pre code) {
  padding: 0;
  color: inherit;
  background: transparent;
}

.terminal-ai-markdown :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  margin: 0.5rem 0;
  border-collapse: collapse;
  font-size: 0.75rem;
}

.terminal-ai-markdown :deep(th) {
  background: var(--app-card-bg-soft);
  font-weight: 600;
}

.terminal-ai-markdown :deep(th),
.terminal-ai-markdown :deep(td) {
  min-width: 4.5rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--app-border);
  text-align: left;
}

.terminal-ai-markdown :deep(strong) {
  font-weight: 600;
}

.terminal-ai-head {
  min-height: 24px;
}

.terminal-ai-caret-hint {
  color: color-mix(in srgb, var(--terminal-ai-hint-fg, var(--terminal-foreground)) 52%, transparent);
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
  max-height: min(20rem, 40vh, var(--terminal-ai-input-max-height));
  padding: 4px 0 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--app-fg);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
}

.terminal-ai-prompt :deep(textarea::placeholder) {
  font-size: 12px;
  color: var(--app-muted);
}

.terminal-ai-button {
  min-height: 24px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 550;
  letter-spacing: 0.02em;
}

.terminal-ai-error {
  color: color-mix(in srgb, var(--ui-color-error-500) 82%, var(--app-fg));
}
</style>
