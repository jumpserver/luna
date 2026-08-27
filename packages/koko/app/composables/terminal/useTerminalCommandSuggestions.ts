import type { Terminal } from "@xterm/xterm";
import type { Ref } from "vue";

import { connectorSessionKey } from "@jumpserver/connectors-core";
import { isSafeTerminalCommandHistory, useKokoHostAdapter } from "@jumpserver/koko/host";
import {
  getTerminalCommandSuggestions,
  resolveTerminalCommandProfile,
  terminalCommandEchoContainsPrefix,
  terminalCommandSuggestionKeyAction,
  TerminalCommandInputTracker
} from "./terminalCommandSuggestions";

export function useKokoTerminalCommandSuggestions(options: {
  terminal: Ref<Terminal | null>;
  container: Ref<HTMLElement | undefined>;
  send: (data: string) => boolean;
  disabled: () => boolean;
}) {
  const host = useKokoHostAdapter();
  const sessionContext = inject(connectorSessionKey, null);
  const tracker = new TerminalCommandInputTracker();
  const suggestions = ref<ReturnType<typeof getTerminalCommandSuggestions>>([]);
  const selectedIndex = ref(0);
  const history = ref<string[]>([]);
  const position = ref({ left: 8, top: 8, bottom: "auto", maxWidth: 320 });
  const profile = computed(() => resolveTerminalCommandProfile(unref(sessionContext)?.terminalProfile));
  const adapter = host.terminalCommandSuggestions;
  const enabled = computed(() => adapter?.enabled() ?? true);
  const historyScope = computed(() => unref(sessionContext)?.terminalCommandHistoryScope || "");
  let suppressSuggestions = false;
  let pendingSubmission = "";
  let pendingSubmissionLine = -1;
  let activeBufferType: "normal" | "alternate" | undefined;
  let stopHistorySubscription = () => {};
  let loadSequence = 0;
  let refreshing = false;
  let refreshQueued = false;
  const echoTimers: number[] = [];

  const open = computed(() => enabled.value && suggestions.value.length > 0 && !options.disabled());

  function sanitizedHistory(value: unknown) {
    return Array.isArray(value) ? value.filter(isSafeTerminalCommandHistory).slice(0, 200) : [];
  }

  function setSuggestions(next: ReturnType<typeof getTerminalCommandSuggestions>) {
    const current = suggestions.value;
    if (
      current.length === next.length &&
      current.every((item, index) => item.command === next[index]?.command && item.source === next[index]?.source)
    ) {
      return;
    }
    suggestions.value = next;
  }

  function invalidate() {
    tracker.reset();
    pendingSubmission = "";
    pendingSubmissionLine = -1;
    setSuggestions([]);
    selectedIndex.value = 0;
    suppressSuggestions = false;
  }

  function visibleEchoMatches() {
    const terminal = options.terminal.value;
    if (!terminal || terminal.buffer.active.type === "alternate" || !tracker.valid || !tracker.line) return false;
    const buffer = terminal.buffer.active;
    return terminalCommandEchoContainsPrefix(
      {
        baseY: buffer.baseY,
        cursorY: buffer.cursorY,
        cursorX: buffer.cursorX,
        cols: terminal.cols,
        getLine: (index) => buffer.getLine(index)
      },
      tracker.line
    );
  }

  function validatePendingSubmission() {
    if (!pendingSubmission) return;
    const terminal = options.terminal.value;
    if (!terminal || terminal.buffer.active.type === "alternate") {
      pendingSubmission = "";
      pendingSubmissionLine = -1;
      return;
    }

    const buffer = terminal.buffer.active;
    const cursorLine = buffer.baseY + buffer.cursorY;
    const candidateLines = new Set([pendingSubmissionLine, cursorLine, cursorLine - 1, cursorLine - 2]);
    for (const index of candidateLines) {
      if (index < 0) continue;
      const renderedLine = buffer.getLine(index)?.translateToString(true) || "";
      if (!renderedLine.endsWith(pendingSubmission)) continue;
      const command = pendingSubmission;
      pendingSubmission = "";
      pendingSubmissionLine = -1;
      if (enabled.value) void recordHistory(command);
      return;
    }
  }

  function updatePosition() {
    const terminal = options.terminal.value;
    const container = options.container.value;
    const screen = terminal?.element?.querySelector<HTMLElement>(".xterm-screen");
    if (!terminal || !container || !screen || terminal.cols <= 0 || terminal.rows <= 0) return;
    const containerBounds = container.getBoundingClientRect();
    const screenBounds = screen.getBoundingClientRect();
    const cellWidth = screenBounds.width / terminal.cols;
    const cellHeight = screenBounds.height / terminal.rows;
    const left = Math.round(screenBounds.left - containerBounds.left + terminal.buffer.active.cursorX * cellWidth);
    const top = Math.round(screenBounds.top - containerBounds.top + terminal.buffer.active.cursorY * cellHeight);
    const maxWidth = Math.max(80, Math.min(360, containerBounds.width - 16));
    const clampedLeft = Math.round(Math.min(Math.max(8, left), Math.max(8, containerBounds.width - maxWidth - 8)));
    const next =
      top > containerBounds.height / 2
        ? {
            left: clampedLeft,
            top: 0,
            bottom: `${Math.max(8, containerBounds.height - top + 6)}px`,
            maxWidth
          }
        : { left: clampedLeft, top: top + cellHeight + 6, bottom: "auto" as const, maxWidth };
    const current = position.value;
    if (
      current.left === next.left &&
      current.top === next.top &&
      current.bottom === next.bottom &&
      current.maxWidth === next.maxWidth
    ) {
      return;
    }
    position.value = next;
  }

  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      refresh();
    });
  }

  function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      refreshSuggestions();
    } finally {
      refreshing = false;
    }
  }

  function refreshSuggestions() {
    const bufferType = options.terminal.value?.buffer.active.type;
    if (bufferType !== activeBufferType) {
      if (activeBufferType || bufferType === "alternate") invalidate();
      activeBufferType = bufferType;
    }
    if (bufferType === "alternate") {
      invalidate();
      return;
    }
    if (options.disabled()) {
      setSuggestions([]);
      return;
    }

    validatePendingSubmission();
    if (!enabled.value || suppressSuggestions || !tracker.prefix || !visibleEchoMatches()) {
      setSuggestions([]);
      return;
    }
    setSuggestions(getTerminalCommandSuggestions(profile.value, tracker.prefix, history.value));
    selectedIndex.value = Math.min(selectedIndex.value, Math.max(0, suggestions.value.length - 1));
    if (suggestions.value.length) updatePosition();
  }

  async function loadHistory() {
    const sequence = ++loadSequence;
    const scope = historyScope.value;
    const loadedProfile = profile.value;
    const loaded = adapter && scope ? await adapter.loadHistory(scope, loadedProfile).catch(() => []) : [];
    if (
      sequence !== loadSequence ||
      scope !== historyScope.value ||
      loadedProfile !== profile.value ||
      !enabled.value
    ) {
      return;
    }
    history.value = sanitizedHistory(loaded);
    refresh();
  }

  async function recordHistory(command: string) {
    const scope = historyScope.value;
    const recordedProfile = profile.value;
    if (!adapter || !scope || !isSafeTerminalCommandHistory(command)) return;
    history.value = [command, ...history.value.filter((item) => item !== command)].slice(0, 200);
    await adapter.recordHistory(scope, recordedProfile, command).catch(() => {});
  }

  function handleData(data: string) {
    if (pendingSubmission && data !== "\r" && data !== "\n") {
      pendingSubmission = "";
      pendingSubmissionLine = -1;
    }
    const submissionLine =
      data === "\r" || data === "\n"
        ? (options.terminal.value?.buffer.active.baseY || 0) + (options.terminal.value?.buffer.active.cursorY || 0)
        : -1;
    const result = tracker.handleData(data);
    suppressSuggestions = false;
    selectedIndex.value = 0;
    if (result.submitted && isSafeTerminalCommandHistory(result.submitted)) {
      pendingSubmission = result.submitted;
      pendingSubmissionLine = submissionLine;
    }
    if (data === "\r" || data === "\n" || data === "\x03" || !tracker.prefix) {
      clearEchoTimers();
      setSuggestions([]);
      if (pendingSubmission) queueEchoRefresh();
      return;
    }
    queueEchoRefresh();
  }

  function clearEchoTimers() {
    while (echoTimers.length) window.clearTimeout(echoTimers.pop());
  }

  function queueEchoRefresh() {
    clearEchoTimers();
    scheduleRefresh();
    for (const delay of [32, 80, 160, 320]) {
      echoTimers.push(
        window.setTimeout(() => {
          if (tracker.prefix || pendingSubmission) refresh();
        }, delay)
      );
    }
  }

  function accept(index = selectedIndex.value) {
    const suggestion = suggestions.value[index];
    if (!suggestion || !isSafeTerminalCommandHistory(suggestion.command)) {
      invalidate();
      return;
    }
    const suffix = tracker.accept(suggestion.command);
    setSuggestions([]);
    suppressSuggestions = true;
    if (suffix && !options.send(suffix)) invalidate();
    options.terminal.value?.focus();
  }

  function handleKeyEvent(event: KeyboardEvent) {
    const action = terminalCommandSuggestionKeyAction(event.key, open.value, event.type);
    if (!action) return undefined;
    event.preventDefault();
    if (action === "next" || action === "previous") {
      const direction = action === "next" ? 1 : -1;
      selectedIndex.value = (selectedIndex.value + direction + suggestions.value.length) % suggestions.value.length;
    } else if (action === "accept") {
      accept();
    } else {
      setSuggestions([]);
      suppressSuggestions = true;
    }
    return false;
  }

  function select(index: number) {
    selectedIndex.value = index;
  }

  watch(
    options.terminal,
    (terminal) => {
      activeBufferType = terminal?.buffer.active.type;
    },
    { immediate: true }
  );

  function subscribeHistory() {
    stopHistorySubscription();
    const scope = historyScope.value;
    const subscribedProfile = profile.value;
    stopHistorySubscription =
      adapter?.subscribeHistory?.(scope, subscribedProfile, (nextHistory) => {
        if (scope !== historyScope.value || subscribedProfile !== profile.value) return;
        history.value = sanitizedHistory(nextHistory);
        scheduleRefresh();
      }) || (() => {});
  }

  watch(
    [profile, enabled, historyScope],
    () => {
      loadSequence += 1;
      history.value = [];
      setSuggestions([]);
      subscribeHistory();
      if (enabled.value) void loadHistory();
    },
    { flush: "post" }
  );

  onMounted(() => {
    subscribeHistory();
    if (enabled.value) void loadHistory();
  });
  onBeforeUnmount(() => {
    loadSequence += 1;
    clearEchoTimers();
    stopHistorySubscription();
  });

  return {
    accept,
    handleData,
    handleKeyEvent,
    invalidate,
    open,
    position,
    profile,
    refresh,
    select,
    selectedIndex,
    suggestions
  };
}
