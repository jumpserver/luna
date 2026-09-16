import type { Ref } from "vue";
import { useEventListener, useResizeObserver } from "@vueuse/core";
import { computed, onScopeDispose, shallowRef } from "vue";

export function useConnectionSetupDrag(
  area: Ref<HTMLElement | null>,
  dialog: Ref<HTMLElement | null>,
  handle: Ref<HTMLElement | null>
) {
  const offset = shallowRef({ x: 0, y: 0 });
  const drag = shallowRef<{
    pointerId: number;
    handle: HTMLElement;
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);

  function move(x: number, y: number) {
    const container = area.value;
    const panel = dialog.value;
    if (!container?.clientWidth || !container.clientHeight || !panel?.offsetWidth) return;
    // Layout offsets ignore translate, so repeated pointer events cannot accumulate drift.
    const minX = -panel.offsetLeft;
    const minY = -panel.offsetTop;
    offset.value = {
      x: Math.max(minX, Math.min(x, container.clientWidth - panel.offsetWidth + minX)),
      y: Math.max(minY, Math.min(y, container.clientHeight - panel.offsetHeight + minY))
    };
  }

  function stop() {
    const current = drag.value;
    drag.value = null;
    if (current?.handle.hasPointerCapture(current.pointerId)) {
      current.handle.releasePointerCapture(current.pointerId);
    }
  }

  useEventListener(handle, "pointerdown", (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || drag.value) return;
    if ((event.target as Element).closest("button, a, input, select, textarea")) return;
    const target = event.currentTarget as HTMLElement;
    target.focus({ preventScroll: true });
    target.setPointerCapture(event.pointerId);
    drag.value = {
      pointerId: event.pointerId,
      handle: target,
      startX: event.clientX,
      startY: event.clientY,
      ...offset.value
    };
    event.preventDefault();
  });
  useEventListener(handle, "pointermove", (event: PointerEvent) => {
    const current = drag.value;
    if (!current || event.pointerId !== current.pointerId) return;
    move(current.x + event.clientX - current.startX, current.y + event.clientY - current.startY);
  });
  useEventListener(handle, ["pointerup", "pointercancel", "lostpointercapture"], (event: PointerEvent) => {
    if (event.pointerId === drag.value?.pointerId) stop();
  });
  useEventListener(handle, "keydown", (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
    const step = event.shiftKey ? 32 : 8;
    const { x, y } = offset.value;
    if (event.key === "ArrowLeft") move(x - step, y);
    else if (event.key === "ArrowRight") move(x + step, y);
    else if (event.key === "ArrowUp") move(x, y - step);
    else if (event.key === "ArrowDown") move(x, y + step);
    else if (event.key === "Home") move(0, 0);
    else return;
    event.preventDefault();
    event.stopPropagation();
  });
  useResizeObserver([area, dialog], () => move(offset.value.x, offset.value.y));
  onScopeDispose(stop);

  return {
    isDragging: computed(() => drag.value !== null),
    style: computed(() => ({ translate: `${offset.value.x}px ${offset.value.y}px` }))
  };
}
