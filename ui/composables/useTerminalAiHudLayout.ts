import type { TerminalCursorAnchor } from "#koko";
import {
  getKokoTerminalCursorAnchor,
  getKokoTerminalElement,
  subscribeKokoTerminalCursorAnchor,
  subscribeKokoTerminalUserInput
} from "#koko";
import { contrastingTextColor } from "~/shared/theme/color";
import { shouldShowTerminalAiCaretHint, TERMINAL_AI_HINT_IDLE_MS } from "~/utils/terminalAiCommand";

export function useTerminalAiHudLayout(options: {
  paneId: () => string;
  open: Ref<boolean>;
  sessionInfoReady: () => boolean;
}) {
  const hostRef = shallowRef<HTMLElement | null>(null);
  const panelRef = shallowRef<HTMLElement | null>(null);
  const liveRef = shallowRef<HTMLElement | null>(null);
  const activeXterm = shallowRef<HTMLElement | null>(null);
  const anchorRect = shallowRef<TerminalCursorAnchor | null>(null);
  const hintAnchor = shallowRef<TerminalCursorAnchor | null>(null);
  const hintVisible = ref(false);
  const hintIdle = ref(true);
  const panelPosition = ref({ left: 8, top: 8, width: 520, maxHeight: 260, height: 0 });
  const hintPosition = ref({ left: 0, top: 0, maxWidth: 0 });
  let stopCursorSubscription = () => {};
  let stopUserInputSubscription = () => {};
  let hintIdleTimer = 0;
  let layoutObserver: ResizeObserver | null = null;
  let livePinned = true;

  const panelStyle = computed(() => ({
    position: "fixed" as const,
    left: `${panelPosition.value.left}px`,
    top: `${panelPosition.value.top}px`,
    width: `${panelPosition.value.width}px`,
    maxHeight: `${panelPosition.value.maxHeight}px`,
    ...(panelPosition.value.height ? { height: `${panelPosition.value.height}px` } : {}),
    zIndex: 80
  }));
  const hintStyle = computed(() => ({
    left: `${hintPosition.value.left}px`,
    top: `${hintPosition.value.top}px`,
    maxWidth: `${hintPosition.value.maxWidth}px`
  }));

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
    if (options.open.value || !hintIdle.value) {
      hideHint();
      return;
    }
    await nextTick();
    if (options.open.value || !hintIdle.value) {
      hideHint();
      return;
    }
    const host = hostRef.value;
    if (!host || !anchor) {
      hideHint();
      return;
    }
    const xterm = getKokoTerminalElement(options.paneId()) || findXtermForAnchor(anchor) || activeXterm.value;
    if (!xterm) {
      hideHint();
      return;
    }
    activeXterm.value = xterm;
    host.style.setProperty("--terminal-ai-hint-fg", contrastingTextColor(getComputedStyle(xterm).backgroundColor));
    const hostBounds = host.getBoundingClientRect();
    const terminalBounds = xterm.getBoundingClientRect();
    const left = anchor.left - hostBounds.left + anchor.width + 6;
    const top = anchor.top - hostBounds.top + Math.max(0, (anchor.height - 18) / 2);
    const maxWidth = terminalBounds.right - hostBounds.left - left - 8;
    const next = { left, top, maxWidth: Math.max(0, maxWidth) };
    const visible = shouldShowTerminalAiCaretHint(options.sessionInfoReady(), next.maxWidth, hintIdle.value);
    const current = hintPosition.value;
    if (current.left !== next.left || current.top !== next.top || current.maxWidth !== next.maxWidth) {
      hintPosition.value = next;
    }
    if (hintVisible.value !== visible) hintVisible.value = visible;
  }

  async function positionPanel() {
    await nextTick();
    const panel = panelRef.value;
    const xterm = activeXterm.value || getKokoTerminalElement(options.paneId());
    if (!panel || !xterm) return;
    activeXterm.value = xterm;
    const anchor = getKokoTerminalCursorAnchor(options.paneId()) || getFallbackCursorRect(xterm);
    anchorRect.value = anchor;
    const terminal = xterm.getBoundingClientRect();
    const gap = 8;
    const edge = 8;
    const cursorBottom = Math.min(terminal.bottom, anchor.top + Math.max(anchor.height, 18));
    const spaceBelow = terminal.bottom - edge - (cursorBottom + gap);
    const spaceAbove = anchor.top - gap - (terminal.top + edge);
    const maxHeight = Math.max(120, Math.floor(Math.max(spaceBelow, spaceAbove)));
    const width = Math.min(520, Math.max(280, terminal.width - 16), Math.max(280, window.innerWidth - edge * 2));
    const liveEl = liveRef.value;
    const panelBox = panel.getBoundingClientRect();
    const liveBox = liveEl?.getBoundingClientRect();
    const chrome = Math.max(0, panelBox.height - (liveBox?.height || 0));
    const needed = chrome + (liveEl?.scrollHeight || panel.scrollHeight);
    const height = needed > maxHeight ? maxHeight : 0;
    const placedHeight = height || Math.min(panelBox.height, maxHeight);
    const placeBelow = spaceBelow >= placedHeight || (spaceBelow >= spaceAbove && spaceBelow >= 120);
    const maxLeft = Math.max(terminal.left + edge, Math.min(terminal.right, window.innerWidth) - width - edge);
    const left = Math.min(Math.max(anchor.left, terminal.left + edge, edge), maxLeft);
    const unclampedTop = placeBelow ? cursorBottom + gap : anchor.top - placedHeight - gap;
    const top = Math.min(Math.max(unclampedTop, terminal.top + edge), terminal.bottom - edge - placedHeight);
    const next = { left, top, width, maxHeight, height };
    const current = panelPosition.value;
    if (
      current.left === next.left &&
      current.top === next.top &&
      current.width === next.width &&
      current.maxHeight === next.maxHeight &&
      current.height === next.height
    ) {
      return;
    }
    panelPosition.value = next;
  }

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
      const latest = getKokoTerminalCursorAnchor(options.paneId());
      if (latest) hintAnchor.value = latest;
      void positionHint();
    }, TERMINAL_AI_HINT_IDLE_MS);
  }

  function startCursorTracking() {
    stopCursorSubscription();
    stopUserInputSubscription();
    clearHintIdleTimer();
    hintIdle.value = true;
    stopCursorSubscription = subscribeKokoTerminalCursorAnchor(options.paneId(), (anchor) => {
      hintAnchor.value = anchor;
      if (hintIdle.value && !options.open.value && options.sessionInfoReady()) void positionHint(anchor);
    });
    stopUserInputSubscription = subscribeKokoTerminalUserInput(options.paneId(), noteTypingActivity);
    const initialAnchor = getKokoTerminalCursorAnchor(options.paneId());
    if (initialAnchor) hintAnchor.value = initialAnchor;
    void positionHint();
  }

  function onLiveScroll(event: Event) {
    const el = event.currentTarget as HTMLElement;
    livePinned = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }

  async function pinLive() {
    if (!livePinned) return;
    await nextTick();
    const el = liveRef.value;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  function syncLayoutObserver() {
    layoutObserver?.disconnect();
    layoutObserver = new ResizeObserver(() => {
      if (options.open.value) {
        void positionPanel();
        void pinLive();
      } else void positionHint();
    });
    if (hostRef.value) layoutObserver.observe(hostRef.value);
    if (options.open.value && panelRef.value) layoutObserver.observe(panelRef.value);
    if (options.open.value && liveRef.value) layoutObserver.observe(liveRef.value);
  }

  async function reveal(xterm: HTMLElement) {
    livePinned = true;
    activeXterm.value = xterm;
    anchorRect.value = getKokoTerminalCursorAnchor(options.paneId()) || getFallbackCursorRect(xterm);
    options.open.value = true;
    await positionPanel();
  }

  function hideHintOnClose() {
    if (hintIdle.value) void positionHint();
  }

  function handleWindowResize() {
    void positionHint();
    if (options.open.value) void positionPanel();
  }

  function resetForPaneChange() {
    livePinned = true;
    clearHintIdleTimer();
    options.open.value = false;
    hintVisible.value = false;
    hintIdle.value = true;
    activeXterm.value = null;
    stopUserInputSubscription();
    nextTick(startCursorTracking);
  }

  function dispose() {
    layoutObserver?.disconnect();
    clearHintIdleTimer();
    stopUserInputSubscription();
    stopCursorSubscription();
  }

  return {
    hostRef,
    panelRef,
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
  };
}
