<script lang="ts" setup>
import { useWindowSize } from "@vueuse/core";
import * as Guacamole from "guacamole-common-js-jumpserver/dist/guacamole-common";
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import dedeqwertz from "@/lion/assets/layouts/de-de-qwertz.json";
import enusqwerty from "@/lion/assets/layouts/en-us-qwerty.json";
import esesqwerty from "@/lion/assets/layouts/es-es-qwerty.json";
import frfrazerty from "@/lion/assets/layouts/fr-fr-azerty.json";
import ititqwertz from "@/lion/assets/layouts/it-it-qwerty.json";
import nlnlqwertz from "@/lion/assets/layouts/nl-nl-qwerty.json";
import ruruqwertz from "@/lion/assets/layouts/ru-ru-qwerty.json";

const props = defineProps<{
  keyboard?: string;
}>();

const emit = defineEmits<{
  (event: "keyboardChange", action: "keydown" | "keyup", keysym: string): void;
}>();

const keyboardLayouts: Record<string, any> = {
  "de-de-qwertz": dedeqwertz,
  "en-us-qwerty": enusqwerty,
  "es-es-qwerty": esesqwerty,
  "fr-fr-azerty": frfrazerty,
  "it-it-qwerty": ititqwertz,
  "nl-nl-qwerty": nlnlqwertz,
  "ru-ru-qwerty": ruruqwertz
};

const keyboardRef = ref<HTMLElement | null>(null);
const screenKeyboard = ref<any>(null);
const isDragging = ref(false);
const dragStartX = ref(0);
const dragStartY = ref(0);
const keyboardPosition = ref({ x: 12, y: 12 });
const { width, height } = useWindowSize();

const keyboardWidth = () => Math.min(Math.max(width.value / 2, 320), Math.max(width.value - 24, 200));

const clampPosition = (x: number, y: number) => {
  const rect = keyboardRef.value?.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(width.value - (rect?.width || keyboardWidth()), x)),
    y: Math.max(0, Math.min(height.value - (rect?.height || 200), y))
  };
};

const moveKeyboard = (clientX: number, clientY: number) => {
  keyboardPosition.value = clampPosition(clientX - dragStartX.value, clientY - dragStartY.value);
};

const handleMouseMove = (event: MouseEvent) => {
  if (isDragging.value) moveKeyboard(event.clientX, event.clientY);
};

const stopDragging = () => {
  isDragging.value = false;
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", stopDragging);
};

const handleMouseDown = (event: MouseEvent) => {
  isDragging.value = true;
  dragStartX.value = event.clientX - keyboardPosition.value.x;
  dragStartY.value = event.clientY - keyboardPosition.value.y;
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", stopDragging);
};

const handleTouchStart = (event: TouchEvent) => {
  const touch = event.touches[0];
  if (!touch || event.touches.length !== 1) return;
  isDragging.value = true;
  dragStartX.value = touch.clientX - keyboardPosition.value.x;
  dragStartY.value = touch.clientY - keyboardPosition.value.y;
};

const handleTouchMove = (event: TouchEvent) => {
  const touch = event.touches[0];
  if (!touch || !isDragging.value || event.touches.length !== 1) return;
  moveKeyboard(touch.clientX, touch.clientY);
};

const removeKeyboardElement = () => {
  const keyboard = screenKeyboard.value;
  if (!keyboard) return;
  keyboard.onkeydown = null;
  keyboard.onkeyup = null;
  keyboard.getElement()?.remove();
  screenKeyboard.value = null;
};

const setLayout = (layoutName?: string) => {
  const container = keyboardRef.value;
  if (!container) return;
  removeKeyboardElement();

  const keyboard = new Guacamole.OnScreenKeyboard(keyboardLayouts[layoutName || ""] || enusqwerty);
  container.prepend(keyboard.getElement());
  keyboard.resize(keyboardWidth());
  keyboard.onkeydown = (keysym: string) => emit("keyboardChange", "keydown", keysym);
  keyboard.onkeyup = (keysym: string) => emit("keyboardChange", "keyup", keysym);
  screenKeyboard.value = keyboard;
};

watch(
  () => props.keyboard,
  (layout) => setLayout(layout)
);

watch([width, height], () => {
  screenKeyboard.value?.resize(keyboardWidth());
  keyboardPosition.value = clampPosition(keyboardPosition.value.x, keyboardPosition.value.y);
});

onMounted(async () => {
  setLayout(props.keyboard || "en-us-qwerty");
  await nextTick();
  const rect = keyboardRef.value?.getBoundingClientRect();
  keyboardPosition.value = clampPosition(
    Math.max(12, (width.value - (rect?.width || keyboardWidth())) / 2),
    Math.max(12, height.value - (rect?.height || 200) - 24)
  );
});

onUnmounted(() => {
  stopDragging();
  removeKeyboardElement();
});
</script>

<template>
  <div
    ref="keyboardRef"
    class="draggable-keyboard"
    :style="{ transform: `translate(${keyboardPosition.x}px, ${keyboardPosition.y}px)` }"
  >
    <button
      type="button"
      class="drag-handle"
      :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
      aria-label="Move virtual keyboard"
      @mousedown.prevent="handleMouseDown"
      @touchstart.prevent="handleTouchStart"
      @touchmove.prevent="handleTouchMove"
      @touchend="stopDragging"
      @touchcancel="stopDragging"
    >
      <UIcon name="i-lucide-grip-horizontal" class="size-4" />
    </button>
  </div>
</template>

<style scoped>
.draggable-keyboard {
  position: fixed;
  inset: 0 auto auto 0;
  z-index: 9999;
  padding: 12px 2px 2px;
  overflow: hidden;
  user-select: none;
  touch-action: none;
  color: var(--app-text-primary);
  background: var(--app-surface-panel);
  border: 1px solid var(--app-border-strong);
  border-radius: 8px;
  box-shadow: var(--app-modal-shadow);
}

.drag-handle {
  position: absolute;
  top: 0;
  left: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 14px;
  color: var(--app-text-secondary);
  background: var(--app-surface-header);
  border-radius: 0 0 6px 6px;
  transform: translateX(-50%);
}

.drag-handle:hover {
  color: var(--app-text-primary);
  background: var(--app-state-hover-strong);
}
</style>
