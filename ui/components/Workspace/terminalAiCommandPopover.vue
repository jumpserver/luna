<script setup lang="ts">
import type { TerminalCursorAnchor } from "@jumpserver/koko";
import type { WorkspacePane } from "~/composables/useWorkspaceTabs";

import { getKokoTerminalCursorAnchor, sendKokoTerminalData } from "@jumpserver/koko";
import { LOCAL_AI_PROVIDER_DEFINITIONS } from "~/composables/useLocalAiSettings";

interface AiCommandProposal {
  explanation: string;
  command: string;
  isHighRisk: boolean;
  riskLevel: "low" | "medium" | "high";
  riskReason: string;
}

const props = defineProps<{ pane: WorkspacePane }>();
const { t } = useI18n();
const { isMacOS } = usePlatform();
const { settings, load } = useLocalAiSettings();
const { openSettings } = useSettingsWindow();
const open = ref(false);
const instruction = ref("");
const proposal = ref<AiCommandProposal | null>(null);
const error = ref("");
const generating = ref(false);
const inputRef = ref<{ textareaRef?: HTMLTextAreaElement } | null>(null);
const hostRef = shallowRef<HTMLElement | null>(null);
const panelRef = shallowRef<HTMLElement | null>(null);
const activeXterm = shallowRef<HTMLElement | null>(null);
const anchorRect = shallowRef<TerminalCursorAnchor | null>(null);
const panelPosition = ref({ left: 8, top: 8, width: 520, maxHeight: 480 });
let requestVersion = 0;

const shortcutLabel = computed(() => (isMacOS.value ? "⌘ K" : "Ctrl K"));
const shortcutHint = computed(() => t("TerminalAi.ShortcutHint", { shortcut: isMacOS.value ? "⌘ K" : "Ctrl K" }));
const panelStyle = computed(() => ({
  left: `${panelPosition.value.left}px`,
  top: `${panelPosition.value.top}px`,
  width: `${panelPosition.value.width}px`,
  maxHeight: `${panelPosition.value.maxHeight}px`
}));
const activeSourceLabel = computed(() => {
  const source = settings.value.activeSource;
  if (!source) return t("TerminalAi.NoSource");
  if (source.type === "provider") {
    return LOCAL_AI_PROVIDER_DEFINITIONS.find((provider) => provider.id === source.id)?.name || source.id;
  }
  const names: Record<string, string> = {
    codex: "Codex CLI",
    claude: "Claude Code",
    grok: "Grok Build",
    kimi: "Kimi Code",
    deepseek: "DeepSeek CLI"
  };
  return names[source.id] || source.id;
});
const riskColor = computed<"success" | "warning" | "error">(() => {
  if (proposal.value?.isHighRisk || proposal.value?.riskLevel === "high") return "error";
  if (proposal.value?.riskLevel === "medium") return "warning";
  return "success";
});
const riskLabel = computed(() => {
  if (proposal.value?.isHighRisk || proposal.value?.riskLevel === "high") return t("TerminalAi.HighRisk");
  if (proposal.value?.riskLevel === "medium") return t("TerminalAi.MediumRisk");
  return t("TerminalAi.LowRisk");
});

function focusInput() {
  nextTick(() => inputRef.value?.textareaRef?.focus());
}

function getCursorRect(xterm: HTMLElement) {
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
  const width = Math.min(560, Math.max(240, terminalBounds.width - 16));
  const maxHeight = Math.max(180, terminalBounds.height - 16);

  panelPosition.value = { ...panelPosition.value, width, maxHeight };
  await nextTick();

  const panelBounds = panel.getBoundingClientRect();
  const measuredCell = xterm.querySelector<HTMLElement>(".xterm-char-measure-element")?.getBoundingClientRect();
  const cursorHeight = Math.max(anchor.height, measuredCell?.height || 0, 18);
  const cursorLeft = anchor.left - hostBounds.left;
  const cursorTop = anchor.top - hostBounds.top;
  const cursorBottom = Math.min(terminalBottom, cursorTop + cursorHeight);
  const gap = 8;
  const edge = 8;
  const maxLeft = Math.max(terminalLeft + edge, terminalRight - panelBounds.width - edge);
  const left = Math.min(Math.max(cursorLeft, terminalLeft + edge), maxLeft);
  const below = cursorBottom + gap;
  const above = cursorTop - panelBounds.height - gap;
  const top = below + panelBounds.height <= terminalBottom - edge ? below : Math.max(terminalTop + edge, above);

  panelPosition.value = { left, top, width, maxHeight };
}

async function show(xterm: HTMLElement) {
  if (!isTauriRuntime()) return;
  activeXterm.value = xterm;
  anchorRect.value = getKokoTerminalCursorAnchor(props.pane.id) || getCursorRect(xterm);
  await load();
  open.value = true;
  proposal.value = null;
  error.value = settings.value.activeSource ? "" : t("TerminalAi.NoSourceDescription");
  await positionPanel();
  focusInput();
}

function close() {
  requestVersion += 1;
  generating.value = false;
  open.value = false;
  proposal.value = null;
  error.value = "";
  instruction.value = "";
  nextTick(() => activeXterm.value?.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea")?.focus());
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (!isTauriRuntime()) return;

  if (open.value && event.key === "Escape") {
    event.preventDefault();
    close();
    return;
  }

  const primaryModifier = isMacOS.value ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (open.value || event.repeat || event.altKey || event.shiftKey || !primaryModifier || event.code !== "KeyK") {
    return;
  }

  const target = event.target instanceof Element ? event.target : null;
  const xterm = target?.closest<HTMLElement>(".xterm");
  if (!xterm) return;
  event.preventDefault();
  event.stopPropagation();
  void show(xterm);
}

function handleWindowPointerdown(event: PointerEvent) {
  if (!open.value || panelRef.value?.contains(event.target as Node)) return;
  close();
}

function handleWindowResize() {
  if (open.value) void positionPanel();
}

async function generate() {
  const source = settings.value.activeSource;
  if (!source) {
    error.value = t("TerminalAi.NoSourceDescription");
    return;
  }
  if (!instruction.value.trim() || generating.value) return;

  proposal.value = null;
  error.value = "";
  generating.value = true;
  const version = ++requestVersion;
  try {
    const provider = source.type === "provider" ? settings.value.providers[source.id] : null;
    const result = await useTauriCoreInvoke<AiCommandProposal>("generate_local_ai_command", {
      request: {
        sourceType: source.type,
        sourceId: source.id,
        endpoint: provider?.endpoint,
        model: provider?.model,
        instruction: instruction.value,
        context: {
          protocol: props.pane.protocol,
          assetName: props.pane.assetName,
          address: props.pane.address,
          account: props.pane.account,
          platform: props.pane.assetPlatform
        }
      }
    });
    if (version === requestVersion && open.value) proposal.value = result;
  } catch (cause) {
    if (version === requestVersion && open.value) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    }
  } finally {
    if (version === requestVersion) generating.value = false;
  }
}

function execute() {
  if (!proposal.value) return;
  const sent = sendKokoTerminalData(props.pane.id, `${proposal.value.command}\r`);
  if (!sent) {
    error.value = t("TerminalAi.SendFailed");
    return;
  }
  close();
}

function handleInputKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    void generate();
  }
}

watch([proposal, error], () => {
  if (open.value) void positionPanel();
});

onMounted(() => {
  window.addEventListener("keydown", handleWindowKeydown, true);
  window.addEventListener("pointerdown", handleWindowPointerdown, true);
  window.addEventListener("resize", handleWindowResize);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleWindowKeydown, true);
  window.removeEventListener("pointerdown", handleWindowPointerdown, true);
  window.removeEventListener("resize", handleWindowResize);
});
</script>

<template>
  <div ref="hostRef" class="pointer-events-none absolute inset-0 z-50 overflow-hidden">
    <div
      v-if="!open"
      aria-hidden="true"
      class="absolute bottom-3 right-3 flex items-center gap-2 rounded-full border border-[var(--app-border-subtle)] bg-[color-mix(in_srgb,var(--app-surface-overlay)_88%,transparent)] px-2.5 py-1 text-[11px] text-muted shadow-[var(--theme-shadow-soft)]"
    >
      <UIcon name="i-lucide-sparkles" class="size-3.5 text-primary" />
      <span>{{ shortcutHint }}</span>
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
        class="terminal-ai-panel pointer-events-auto absolute flex origin-top-left flex-col overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-overlay)]"
        :class="proposal?.isHighRisk ? 'ring-1 ring-error/55' : ''"
        role="dialog"
        :aria-label="t('TerminalAi.Title')"
      >
        <header
          class="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--app-border-subtle)] px-3.5 py-2.5"
        >
          <div class="flex min-w-0 items-center gap-2.5">
            <div class="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <UIcon name="i-lucide-terminal-square" class="size-4" />
            </div>
            <div class="flex min-w-0 items-baseline gap-2">
              <h2 class="shrink-0 text-sm font-semibold text-highlighted">{{ t("TerminalAi.Title") }}</h2>
              <span class="truncate text-xs text-muted">{{ activeSourceLabel }}</span>
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <kbd
              class="rounded-md border border-[var(--app-border-subtle)] bg-[var(--app-surface-card-soft)] px-1.5 py-0.5 font-ui-mono text-[10px] text-muted"
            >
              {{ shortcutLabel }}
            </kbd>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="t('Common.Cancel')"
              @click="close"
            />
          </div>
        </header>

        <div class="min-h-0 overflow-y-auto overscroll-contain">
          <div v-if="!proposal" class="p-3">
            <div
              class="overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-input)] transition-[border-color,box-shadow] focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/15"
            >
              <UTextarea
                ref="inputRef"
                v-model="instruction"
                :aria-label="t('TerminalAi.PromptLabel')"
                :placeholder="t('TerminalAi.Placeholder')"
                name="terminal-ai-instruction"
                autocomplete="off"
                :spellcheck="false"
                :rows="2"
                :disabled="generating"
                variant="none"
                class="w-full"
                :ui="{ base: 'resize-none px-3 py-2.5 text-sm leading-6' }"
                @keydown="handleInputKeydown"
              />

              <div
                class="flex items-center justify-between gap-3 border-t border-[var(--app-border-subtle)] px-2.5 py-2"
              >
                <p class="min-w-0 truncate text-[11px] text-muted">{{ t("TerminalAi.GenerateHint") }}</p>
                <UButton
                  :label="t('TerminalAi.Generate')"
                  icon="i-lucide-arrow-up"
                  size="sm"
                  :loading="generating"
                  :disabled="!instruction.trim() || !settings.activeSource"
                  @click="generate"
                />
              </div>
            </div>
          </div>

          <div v-else class="space-y-3 p-3" aria-live="polite">
            <div class="flex items-start justify-between gap-3">
              <p class="min-w-0 break-words text-sm leading-5 text-highlighted">{{ proposal.explanation }}</p>
              <UBadge :label="riskLabel" :color="riskColor" variant="soft" class="shrink-0" />
            </div>

            <div
              class="flex items-start gap-2.5 rounded-lg border px-3 py-2.5"
              :class="
                proposal.isHighRisk
                  ? 'border-error/50 bg-error/8'
                  : proposal.riskLevel === 'medium'
                    ? 'border-warning/45 bg-warning/8'
                    : 'border-[var(--app-border)] bg-[var(--app-card-bg-soft)]'
              "
            >
              <span class="select-none pt-0.5 font-ui-mono text-xs text-muted">$</span>
              <code class="min-w-0 break-all font-ui-mono text-sm leading-5 text-highlighted">
                {{ proposal.command }}
              </code>
            </div>

            <UAlert
              v-if="proposal.isHighRisk"
              color="error"
              variant="soft"
              icon="i-lucide-shield-alert"
              :title="t('TerminalAi.HighRiskTitle')"
              :description="proposal.riskReason || t('TerminalAi.HighRiskFallback')"
            />
            <UAlert
              v-else-if="proposal.riskLevel === 'medium' && proposal.riskReason"
              color="warning"
              variant="soft"
              icon="i-lucide-triangle-alert"
              :description="proposal.riskReason"
            />
          </div>

          <UAlert
            v-if="error"
            aria-live="polite"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            class="mx-3 mb-3"
            :description="error"
          >
            <template v-if="!settings.activeSource" #actions>
              <UButton
                :label="t('TerminalAi.OpenSettings')"
                color="error"
                variant="soft"
                size="xs"
                @click="void openSettings('/setting/ai')"
              />
            </template>
          </UAlert>
        </div>

        <footer
          v-if="proposal"
          class="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--app-border-subtle)] bg-[var(--app-surface-card-soft)] px-3 py-2.5"
        >
          <UButton :label="t('Common.Cancel')" color="neutral" variant="ghost" size="sm" @click="close" />
          <UButton
            :label="proposal.isHighRisk ? t('TerminalAi.ExecuteHighRisk') : t('TerminalAi.Execute')"
            :icon="proposal.isHighRisk ? 'i-lucide-shield-alert' : 'i-lucide-terminal'"
            :color="proposal.isHighRisk ? 'error' : 'primary'"
            size="sm"
            @click="execute"
          />
        </footer>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.terminal-ai-panel {
  box-shadow:
    var(--theme-shadow-soft),
    0 18px 48px color-mix(in srgb, var(--theme-bg) 48%, transparent);
}
</style>
