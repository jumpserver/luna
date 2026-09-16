import type { CSSProperties, Ref } from "vue";
import { useElementSize, useEventListener } from "@vueuse/core";
import { computed, onScopeDispose, shallowRef, watch } from "vue";
import { AI_PANEL_DEFAULT_WIDTH, AI_PANEL_MAX_WIDTH, AI_PANEL_MIN_WIDTH } from "~/composables/useAiPanel";

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type Interaction = "move" | ResizeEdge;
interface PanelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const GAP = 12;
const MIN_HEIGHT = 280;
const DEFAULT_HEIGHT = 640;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

export function useAiPanelLayout(options: {
  area: Ref<HTMLElement | null>;
  panel: Ref<HTMLElement | null>;
  narrow: Ref<boolean>;
  defaultFloating: Ref<boolean>;
  width: Ref<number>;
  setWidth: (width: number) => void;
}) {
  const size = useElementSize(options.area);
  const placement = shallowRef<PanelRect | null>(null);
  const gesture = shallowRef<{
    mode: Interaction;
    pointerId: number;
    target: HTMLElement;
    x: number;
    y: number;
    rect: PanelRect;
    moved: boolean;
  } | null>(null);
  const floating = computed(() => options.narrow.value || options.defaultFloating.value || placement.value !== null);
  const limits = computed(() => ({
    width: Math.max(0, size.width.value - GAP * 2),
    height: Math.max(0, size.height.value - GAP * 2)
  }));

  function constrain(rect: PanelRect): PanelRect {
    const width = clamp(
      rect.width,
      Math.min(AI_PANEL_MIN_WIDTH, limits.value.width),
      Math.min(AI_PANEL_MAX_WIDTH, limits.value.width)
    );
    const height = clamp(rect.height, Math.min(MIN_HEIGHT, limits.value.height), limits.value.height);
    return {
      left: clamp(rect.left, GAP, Math.max(GAP, size.width.value - GAP - width)),
      top: clamp(rect.top, GAP, Math.max(GAP, size.height.value - GAP - height)),
      width,
      height
    };
  }

  const rect = computed(() =>
    constrain(
      placement.value || {
        left: size.width.value - options.width.value - GAP,
        top: GAP,
        width: options.width.value,
        height: DEFAULT_HEIGHT
      }
    )
  );
  const style = computed<CSSProperties>(() => {
    if (!floating.value)
      return { width: `${Math.min(options.width.value, limits.value.width || options.width.value)}px` };
    if (options.narrow.value)
      return {
        top: `${GAP}px`,
        bottom: `${GAP}px`,
        right: `${GAP}px`,
        width: `min(${options.width.value}px, calc(100% - 3rem))`
      };
    return Object.fromEntries(Object.entries(rect.value).map(([key, value]) => [key, `${value}px`]));
  });

  function currentRect(): PanelRect | null {
    if (!size.width.value || !size.height.value) return null;
    if (floating.value) return { ...rect.value };
    const area = options.area.value?.getBoundingClientRect();
    const panel = options.panel.value?.getBoundingClientRect();
    if (!area || !panel) return null;
    return { left: panel.left - area.left, top: panel.top - area.top, width: panel.width, height: panel.height };
  }

  function update(mode: Interaction, start: PanelRect, dx: number, dy: number) {
    if (mode === "w" && !floating.value) {
      options.setWidth(
        clamp(
          start.width - dx,
          Math.min(AI_PANEL_MIN_WIDTH, limits.value.width),
          Math.min(AI_PANEL_MAX_WIDTH, limits.value.width)
        )
      );
      return;
    }
    const next = constrain(start);
    if (mode === "move") {
      next.left += dx;
      next.top += dy;
    } else {
      const right = next.left + next.width;
      const bottom = next.top + next.height;
      const minWidth = Math.min(AI_PANEL_MIN_WIDTH, limits.value.width);
      const minHeight = Math.min(MIN_HEIGHT, limits.value.height);
      if (mode.includes("w")) {
        next.width = clamp(next.width - dx, minWidth, Math.min(AI_PANEL_MAX_WIDTH, right - GAP));
        next.left = right - next.width;
      }
      if (mode.includes("e"))
        next.width = clamp(next.width + dx, minWidth, Math.min(AI_PANEL_MAX_WIDTH, size.width.value - GAP - next.left));
      if (mode.includes("n")) {
        next.height = clamp(next.height - dy, minHeight, bottom - GAP);
        next.top = bottom - next.height;
      }
      if (mode.includes("s")) next.height = clamp(next.height + dy, minHeight, size.height.value - GAP - next.top);
    }
    placement.value = constrain(next);
    options.setWidth(placement.value.width);
  }

  function findHandle(event: Event) {
    if (options.narrow.value) return null;
    const target = event.target as HTMLElement;
    const resize = target.closest<HTMLElement>("[data-ai-panel-resize]");
    if (resize) return { element: resize, mode: resize.dataset.aiPanelResize as ResizeEdge };
    if (target.closest("button, a, input, select, textarea, [role=button], [contenteditable=true]")) return null;
    const header = target.closest<HTMLElement>("[data-ai-panel-drag]");
    return header ? { element: header, mode: "move" as const } : null;
  }

  function stop() {
    const current = gesture.value;
    gesture.value = null;
    if (current?.target.hasPointerCapture(current.pointerId)) current.target.releasePointerCapture(current.pointerId);
  }

  function reset() {
    stop();
    placement.value = null;
    options.setWidth(AI_PANEL_DEFAULT_WIDTH);
  }

  useEventListener(options.panel, "pointerdown", (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || gesture.value) return;
    const handle = findHandle(event);
    const start = currentRect();
    const target = options.panel.value;
    if (!handle || !start || !target) return;
    if (handle.mode === "move" && !floating.value) start.height = Math.min(start.height, DEFAULT_HEIGHT);
    handle.element.focus({ preventScroll: true });
    target.setPointerCapture(event.pointerId);
    gesture.value = {
      mode: handle.mode,
      pointerId: event.pointerId,
      target,
      x: event.clientX,
      y: event.clientY,
      rect: start,
      moved: false
    };
    event.preventDefault();
    event.stopPropagation();
  });
  useEventListener(options.panel, "pointermove", (event: PointerEvent) => {
    const current = gesture.value;
    if (!current || event.pointerId !== current.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    current.moved ||= Boolean(dx || dy);
    if (current.moved) update(current.mode, current.rect, dx, dy);
  });
  useEventListener(options.panel, ["pointerup", "pointercancel", "lostpointercapture"], (event: PointerEvent) => {
    if (event.pointerId === gesture.value?.pointerId) stop();
  });
  useEventListener(options.panel, "keydown", (event: KeyboardEvent) => {
    const handle = findHandle(event);
    if (!handle || handle.element !== event.target || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Home") reset();
    else {
      const step = event.shiftKey ? 32 : 8;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      const start = currentRect();
      if ((!dx && !dy) || !start) return;
      if (handle.mode === "move" && !floating.value) start.height = Math.min(start.height, DEFAULT_HEIGHT);
      update(handle.mode, start, dx, dy);
    }
    event.preventDefault();
    event.stopPropagation();
  });
  useEventListener(options.panel, "dblclick", (event: MouseEvent) => {
    if (findHandle(event)?.mode === "move") reset();
  });
  useEventListener("blur", stop);
  watch([options.narrow, options.defaultFloating], stop);
  onScopeDispose(stop);

  return { floating, style, stop, interacting: computed(() => gesture.value !== null) };
}
