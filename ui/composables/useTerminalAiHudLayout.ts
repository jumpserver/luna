import type { TerminalCursorAnchor } from "#koko";
import type { AiPanelResizeEdge } from "~/components/RightPanel/aiPanelResizeHandles";
import { useEventListener } from "@vueuse/core";
import {
  getKokoTerminalCursorAnchor,
  getKokoTerminalElement,
  subscribeKokoTerminalCursorAnchor,
  subscribeKokoTerminalUserInput
} from "#koko";
import { contrastingTextColor } from "~/shared/theme/color";
import { shouldShowTerminalAiCaretHint, TERMINAL_AI_HINT_IDLE_MS } from "~/utils/terminalAiCommand";

// A user-resized HUD should only be bounded by the viewport; auto-fit content should not.
const AI_HUD_MIN_WIDTH = 280;
const AI_HUD_MAX_WIDTH = 640;
const AI_HUD_MIN_HEIGHT = 160;
const AI_HUD_DEFAULT_MAX_HEIGHT = 420;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

interface HudRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function resizeRect(
  start: HudRect,
  edge: AiPanelResizeEdge,
  dx: number,
  dy: number,
  bounds: { left: number; top: number; right: number; bottom: number }
): HudRect {
  const next = { ...start };
  const right = start.left + start.width;
  const bottom = start.top + start.height;
  if (edge.includes("w")) {
    next.width = clamp(start.width - dx, AI_HUD_MIN_WIDTH, Math.min(AI_HUD_MAX_WIDTH, right - bounds.left));
    next.left = right - next.width;
  }
  if (edge.includes("e")) {
    next.width = clamp(start.width + dx, AI_HUD_MIN_WIDTH, Math.min(AI_HUD_MAX_WIDTH, bounds.right - start.left));
  }
  if (edge.includes("n")) {
    next.height = clamp(start.height - dy, AI_HUD_MIN_HEIGHT, bottom - bounds.top);
    next.top = bottom - next.height;
  }
  if (edge.includes("s")) {
    next.height = clamp(start.height + dy, AI_HUD_MIN_HEIGHT, bounds.bottom - start.top);
  }
  return next;
}

export function useTerminalAiHudLayout(options: {
  paneId: () => string;
  open: Ref<boolean>;
  sessionInfoReady: () => boolean;
}) {
  const hostRef = shallowRef<HTMLElement | null>(null);
  const panelRef = shallowRef<HTMLElement | null>(null);
  const dragHandleRef = shallowRef<HTMLElement | null>(null);
  const manualPosition = shallowRef<{ left: number; top: number } | null>(null);
  const manualSize = shallowRef<{ width: number; height: number } | null>(null);
  const drag = shallowRef<{
    pointerId: number;
    target: HTMLElement;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const resize = shallowRef<{
    pointerId: number;
    target: HTMLElement;
    edge: AiPanelResizeEdge;
    x: number;
    y: number;
    rect: HudRect;
  } | null>(null);
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
  let lastLiveScrollTop = 0;

  const panelStyle = computed(() => ({
    position: "fixed" as const,
    left: `${panelPosition.value.left}px`,
    top: `${panelPosition.value.top}px`,
    width: `${panelPosition.value.width}px`,
    maxHeight: `${panelPosition.value.maxHeight}px`,
    "--terminal-ai-input-max-height": `${Math.max(56, panelPosition.value.maxHeight - 100)}px`,
    ...(panelPosition.value.height ? { height: `${panelPosition.value.height}px` } : {}),
    zIndex: 80
  }));

  function movementBounds() {
    const host = hostRef.value?.getBoundingClientRect();
    return {
      left: Math.max(0, host?.left || 0) + 8,
      top: Math.max(0, host?.top || 0) + 8,
      right: Math.min(window.innerWidth, host?.right ?? window.innerWidth) - 8,
      bottom: Math.min(window.innerHeight, host?.bottom ?? window.innerHeight) - 8
    };
  }

  function movePanel(left: number, top: number) {
    manualPosition.value = { left, top };
    void positionPanel();
  }

  function stopDragging() {
    const current = drag.value;
    drag.value = null;
    if (current?.target.hasPointerCapture(current.pointerId)) current.target.releasePointerCapture(current.pointerId);
  }

  function stopResizing() {
    const current = resize.value;
    resize.value = null;
    if (current?.target.hasPointerCapture(current.pointerId)) current.target.releasePointerCapture(current.pointerId);
  }

  function resetPosition() {
    stopDragging();
    stopResizing();
    manualPosition.value = null;
    manualSize.value = null;
    void positionPanel();
  }

  useEventListener(dragHandleRef, "pointerdown", (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || drag.value) return;
    if ((event.target as Element).closest("button, a, input, select, textarea, [role=button]")) return;
    const target = event.currentTarget as HTMLElement;
    target.focus({ preventScroll: true });
    target.setPointerCapture(event.pointerId);
    drag.value = {
      pointerId: event.pointerId,
      target,
      x: event.clientX,
      y: event.clientY,
      left: panelPosition.value.left,
      top: panelPosition.value.top
    };
    event.preventDefault();
  });
  useEventListener(dragHandleRef, "pointermove", (event: PointerEvent) => {
    const current = drag.value;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (dx || dy || manualPosition.value) movePanel(current.left + dx, current.top + dy);
  });
  useEventListener(dragHandleRef, ["pointerup", "pointercancel", "lostpointercapture"], (event: PointerEvent) => {
    if (event.pointerId === drag.value?.pointerId) stopDragging();
  });
  useEventListener(dragHandleRef, "keydown", (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Home") resetPosition();
    else {
      const step = event.shiftKey ? 32 : 8;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      if (!dx && !dy) return;
      movePanel(panelPosition.value.left + dx, panelPosition.value.top + dy);
    }
    event.preventDefault();
    event.stopPropagation();
  });
  useEventListener(dragHandleRef, "dblclick", (event: MouseEvent) => {
    if (!(event.target as Element).closest("button, a")) resetPosition();
  });
  useEventListener(panelRef, "pointerdown", (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || resize.value) return;
    const handle = (event.target as HTMLElement).closest<HTMLElement>("[data-terminal-ai-resize]");
    if (!handle) return;
    const current = panelPosition.value;
    handle.setPointerCapture(event.pointerId);
    resize.value = {
      pointerId: event.pointerId,
      target: handle,
      edge: handle.dataset.terminalAiResize as AiPanelResizeEdge,
      x: event.clientX,
      y: event.clientY,
      rect: {
        left: current.left,
        top: current.top,
        width: current.width,
        height: current.height || panelRef.value?.getBoundingClientRect().height || current.maxHeight
      }
    };
    event.preventDefault();
    event.stopPropagation();
  });
  useEventListener(panelRef, "pointermove", (event: PointerEvent) => {
    const current = resize.value;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    const rect = resizeRect(current.rect, current.edge, dx, dy, movementBounds());
    manualSize.value = { width: rect.width, height: rect.height };
    manualPosition.value = { left: rect.left, top: rect.top };
    void positionPanel();
  });
  useEventListener(panelRef, ["pointerup", "pointercancel", "lostpointercapture"], (event: PointerEvent) => {
    if (event.pointerId === resize.value?.pointerId) stopResizing();
  });
  useEventListener(panelRef, "dblclick", (event: MouseEvent) => {
    if ((event.target as Element).closest("[data-terminal-ai-resize]")) resetPosition();
  });
  useEventListener("blur", stopDragging);
  useEventListener("blur", stopResizing);
  watch(options.open, stopDragging);
  watch(options.open, stopResizing);
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
    const bounds = movementBounds();
    const gap = 8;
    const edge = 8;
    const cursorBottom = Math.min(terminal.bottom, anchor.top + Math.max(anchor.height, 18));
    const spaceBelow = terminal.bottom - edge - (cursorBottom + gap);
    const spaceAbove = anchor.top - gap - (terminal.top + edge);
    const boundsHeight = bounds.bottom - bounds.top;
    const autoHeightLimit = manualPosition.value
      ? boundsHeight
      : Math.max(120, Math.floor(Math.max(spaceBelow, spaceAbove)));
    const maxHeight = manualSize.value
      ? clamp(manualSize.value.height, AI_HUD_MIN_HEIGHT, boundsHeight)
      : Math.max(0, Math.min(boundsHeight, AI_HUD_DEFAULT_MAX_HEIGHT, autoHeightLimit));
    const width = manualSize.value
      ? clamp(manualSize.value.width, AI_HUD_MIN_WIDTH, bounds.right - bounds.left)
      : Math.max(0, Math.min(520, Math.max(280, terminal.width - 16), bounds.right - bounds.left));
    const liveEl = liveRef.value;
    const panelBox = panel.getBoundingClientRect();
    const liveBox = liveEl?.getBoundingClientRect();
    const chrome = Math.max(0, panelBox.height - (liveBox?.height || 0));
    const needed = liveEl ? chrome + liveEl.scrollHeight : panel.scrollHeight;
    const height = manualSize.value ? maxHeight : needed > maxHeight ? maxHeight : 0;
    const placedHeight = height || Math.min(panelBox.height, maxHeight);
    const placeBelow = spaceBelow >= placedHeight || (spaceBelow >= spaceAbove && spaceBelow >= 120);
    const maxLeft = Math.max(terminal.left + edge, Math.min(terminal.right, window.innerWidth) - width - edge);
    const anchoredLeft = Math.min(Math.max(anchor.left, terminal.left + edge, edge), maxLeft);
    const unclampedTop = placeBelow ? cursorBottom + gap : anchor.top - placedHeight - gap;
    const anchoredTop = Math.min(Math.max(unclampedTop, terminal.top + edge), terminal.bottom - edge - placedHeight);
    const left = Math.max(bounds.left, Math.min(manualPosition.value?.left ?? anchoredLeft, bounds.right - width));
    const top = Math.max(bounds.top, Math.min(manualPosition.value?.top ?? anchoredTop, bounds.bottom - placedHeight));
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
    const top = el.scrollTop;
    if (top === lastLiveScrollTop) return;
    // A queued smooth auto-scroll fires intermediate scroll events while still climbing toward
    // the bottom; only an actual upward move (or landing at rest) reflects user intent to unpin.
    const atBottom = el.scrollHeight - el.clientHeight - top <= 48;
    if (top < lastLiveScrollTop || atBottom) livePinned = atBottom;
    lastLiveScrollTop = top;
  }

  async function pinLive() {
    if (!livePinned) return;
    await nextTick();
    const el = liveRef.value;
    if (!el) return;
    const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
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
    lastLiveScrollTop = 0;
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
    stopDragging();
    stopResizing();
    manualPosition.value = null;
    manualSize.value = null;
    livePinned = true;
    lastLiveScrollTop = 0;
    clearHintIdleTimer();
    options.open.value = false;
    hintVisible.value = false;
    hintIdle.value = true;
    activeXterm.value = null;
    stopUserInputSubscription();
    nextTick(startCursorTracking);
  }

  function dispose() {
    stopDragging();
    stopResizing();
    layoutObserver?.disconnect();
    clearHintIdleTimer();
    stopUserInputSubscription();
    stopCursorSubscription();
  }

  return {
    hostRef,
    panelRef,
    dragHandleRef,
    dragging: computed(() => drag.value !== null),
    interacting: computed(() => drag.value !== null || resize.value !== null),
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
