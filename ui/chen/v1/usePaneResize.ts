import type { MaybeRefOrGetter, Ref } from "vue";
import { computed, onScopeDispose, shallowRef, toValue, watch } from "vue";

interface PaneResizeOptions {
  axis: "x" | "y";
  value: Ref<number>;
  min: MaybeRefOrGetter<number>;
  max: MaybeRefOrGetter<number>;
  defaultValue: number;
  step: number;
  pixelsPerUnit: () => number;
  enabled?: MaybeRefOrGetter<boolean>;
}

export function usePaneResize(options: PaneResizeOptions) {
  const enabled = computed(() => options.enabled === undefined || toValue(options.enabled));
  const drag = shallowRef<{
    pointerId: number;
    handle: HTMLElement;
    coordinate: number;
    value: number;
    body: HTMLElement | null;
    cursor: string;
    userSelect: string;
    window: Window | null;
  } | null>(null);

  function bounds() {
    const min = toValue(options.min);
    const max = toValue(options.max);
    return Number.isFinite(min) && Number.isFinite(max) && min <= max ? { min, max } : null;
  }

  function clamp(value: number) {
    const range = bounds();
    if (!range) return null;
    const fallback = Number.isFinite(options.defaultValue) ? options.defaultValue : range.min;
    return Math.min(range.max, Math.max(range.min, Number.isFinite(value) ? value : fallback));
  }

  function set(value: number) {
    const next = clamp(value);
    if (next !== null) options.value.value = next;
  }

  function stop() {
    const current = drag.value;
    if (!current) return;
    drag.value = null;
    current.window?.removeEventListener("blur", stop);
    if (current.handle.hasPointerCapture(current.pointerId)) {
      current.handle.releasePointerCapture(current.pointerId);
    }
    if (current.body) {
      current.body.style.cursor = current.cursor;
      current.body.style.userSelect = current.userSelect;
    }
  }

  function begin(event: PointerEvent) {
    if (!enabled.value || event.button !== 0 || !event.isPrimary || drag.value) return;
    const handle = event.currentTarget as HTMLElement | null;
    const coordinate = options.axis === "x" ? event.clientX : event.clientY;
    const unit = options.pixelsPerUnit();
    const value = clamp(options.value.value);
    if (!handle || !Number.isFinite(coordinate) || !Number.isFinite(unit) || unit <= 0 || value === null) return;
    const body = handle.ownerDocument?.body ?? null;
    const window = handle.ownerDocument?.defaultView ?? null;
    handle.focus({ preventScroll: true });
    handle.setPointerCapture(event.pointerId);
    drag.value = {
      pointerId: event.pointerId,
      handle,
      coordinate,
      value,
      body,
      cursor: body?.style.cursor ?? "",
      userSelect: body?.style.userSelect ?? "",
      window
    };
    if (body) {
      body.style.cursor = options.axis === "x" ? "col-resize" : "row-resize";
      body.style.userSelect = "none";
    }
    window?.addEventListener("blur", stop);
    event.preventDefault();
    event.stopPropagation();
  }

  function move(event: PointerEvent) {
    const current = drag.value;
    if (!current || event.pointerId !== current.pointerId) return;
    const coordinate = options.axis === "x" ? event.clientX : event.clientY;
    const unit = options.pixelsPerUnit();
    if (!Number.isFinite(coordinate) || !Number.isFinite(unit) || unit <= 0) return;
    set(current.value + (coordinate - current.coordinate) / unit);
    event.preventDefault();
  }

  function end(event?: PointerEvent) {
    if (!event || event.pointerId === drag.value?.pointerId) stop();
  }

  function reset() {
    if (!enabled.value) return;
    stop();
    set(options.defaultValue);
  }

  function keydown(event: KeyboardEvent) {
    if (!enabled.value || event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey)
      return;
    const range = bounds();
    const current = clamp(options.value.value);
    if (!range || current === null) return;
    const step = Number.isFinite(options.step) && options.step > 0 ? options.step : 1;
    const previous = options.axis === "x" ? "ArrowLeft" : "ArrowUp";
    const next = options.axis === "x" ? "ArrowRight" : "ArrowDown";
    let value: number;
    if (event.key === previous) value = current - step * (event.shiftKey ? 4 : 1);
    else if (event.key === next) value = current + step * (event.shiftKey ? 4 : 1);
    else if (event.key === "Home") value = range.min;
    else if (event.key === "End") value = range.max;
    else if (event.key === "Enter") value = options.defaultValue;
    else return;
    stop();
    set(value);
    event.preventDefault();
    event.stopPropagation();
  }

  watch(enabled, (value) => !value && stop(), { flush: "sync" });
  onScopeDispose(stop);

  return { dragging: computed(() => drag.value !== null), begin, move, end, keydown, reset, stop };
}
