import type { Terminal } from "@xterm/xterm";
import type { Ref } from "vue";

import { connectorSessionKey } from "@jumpserver/connectors-core";
import { useKokoHostAdapter } from "@jumpserver/koko/host";
import {
  getTerminalCommandSuggestions,
  isSafeTerminalCommandHistory,
  resolveTerminalCommandProfile,
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
  const historyScope = computed(() => adapter?.scope() || "");
  let suppressSuggestions = false;
  let stopHistorySubscription = () => {};
  let loadSequence = 0;

  const open = computed(() => enabled.value && suggestions.value.length > 0 && !options.disabled());

  function visibleEchoMatches() {
    const terminal = options.terminal.value;
    if (!terminal || terminal.buffer.active.type === "alternate" || !tracker.valid || !tracker.line) return false;
    const line = terminal.buffer.active.getLine(terminal.buffer.active.cursorY);
    const beforeCursor = line?.translateToString(false, 0, terminal.buffer.active.cursorX) || "";
    return beforeCursor.endsWith(tracker.line);
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
    const left = screenBounds.left - containerBounds.left + terminal.buffer.active.cursorX * cellWidth;
    const top = screenBounds.top - containerBounds.top + terminal.buffer.active.cursorY * cellHeight;
    const maxWidth = Math.max(80, Math.min(360, containerBounds.width - 16));
    const clampedLeft = Math.min(Math.max(8, left), Math.max(8, containerBounds.width - maxWidth - 8));
    if (top > containerBounds.height / 2) {
      position.value = {
        left: clampedLeft,
        top: 0,
        bottom: `${Math.max(8, containerBounds.height - top + 6)}px`,
        maxWidth
      };
    } else {
      position.value = { left: clampedLeft, top: top + cellHeight + 6, bottom: "auto", maxWidth };
    }
  }

  function refresh() {
    if (!enabled.value || options.disabled() || suppressSuggestions || !tracker.prefix || !visibleEchoMatches()) {
      suggestions.value = [];
      return;
    }
    suggestions.value = getTerminalCommandSuggestions(profile.value, tracker.prefix, history.value);
    selectedIndex.value = Math.min(selectedIndex.value, Math.max(0, suggestions.value.length - 1));
    if (suggestions.value.length) updatePosition();
  }

  async function loadHistory() {
    const sequence = ++loadSequence;
    const scope = historyScope.value;
    history.value = adapter && scope ? await adapter.loadHistory(scope, profile.value).catch(() => []) : [];
    if (sequence === loadSequence) refresh();
  }

  async function recordHistory(command: string) {
    const scope = historyScope.value;
    if (!adapter || !scope || !isSafeTerminalCommandHistory(command)) return;
    history.value = [command, ...history.value.filter((item) => item !== command)].slice(0, 200);
    await adapter.recordHistory(scope, profile.value, command).catch(() => {});
  }

  function handleData(data: string) {
    const echoMatchedBeforeEnter = (data === "\r" || data === "\n") && visibleEchoMatches();
    const result = tracker.handleData(data);
    suppressSuggestions = false;
    selectedIndex.value = 0;
    if (enabled.value && result.submitted && echoMatchedBeforeEnter) void recordHistory(result.submitted);
    if (data === "\r" || data === "\n" || !tracker.prefix) suggestions.value = [];
    else nextTick(refresh);
  }

  function accept(index = selectedIndex.value) {
    const suggestion = suggestions.value[index];
    if (!suggestion) return;
    const suffix = tracker.accept(suggestion.command);
    suggestions.value = [];
    suppressSuggestions = true;
    if (suffix) options.send(suffix);
    options.terminal.value?.focus();
  }

  function handleKeyEvent(event: KeyboardEvent) {
    const action = terminalCommandSuggestionKeyAction(event.key, open.value);
    if (!action) return undefined;
    if (action === "next" || action === "previous") {
      const direction = action === "next" ? 1 : -1;
      selectedIndex.value = (selectedIndex.value + direction + suggestions.value.length) % suggestions.value.length;
    } else if (action === "accept") {
      accept();
    } else {
      suggestions.value = [];
      suppressSuggestions = true;
    }
    return false;
  }

  function select(index: number) {
    selectedIndex.value = index;
  }

  let renderDisposable: { dispose: () => void } | null = null;
  let cursorDisposable: { dispose: () => void } | null = null;
  watch(
    options.terminal,
    (terminal) => {
      renderDisposable?.dispose();
      cursorDisposable?.dispose();
      renderDisposable = terminal?.onRender(refresh) || null;
      cursorDisposable = terminal?.onCursorMove(updatePosition) || null;
    },
    { immediate: true }
  );

  function subscribeHistory() {
    stopHistorySubscription();
    stopHistorySubscription =
      adapter?.subscribeHistory?.(historyScope.value, profile.value, (nextHistory) => {
        history.value = nextHistory;
        refresh();
      }) || (() => {});
  }

  watch([profile, enabled, historyScope], () => {
    tracker.reset();
    suggestions.value = [];
    subscribeHistory();
    void loadHistory();
  });

  onMounted(() => {
    subscribeHistory();
    void loadHistory();
  });
  onBeforeUnmount(() => {
    renderDisposable?.dispose();
    cursorDisposable?.dispose();
    stopHistorySubscription();
  });

  return {
    accept,
    handleData,
    handleKeyEvent,
    open,
    position,
    profile,
    refresh,
    select,
    selectedIndex,
    suggestions
  };
}
