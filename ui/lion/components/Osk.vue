<script lang="ts" setup>
import * as Guacamole from 'guacamole-common-js-jumpserver/dist/guacamole-common';

import dedeqwertz from '@/lion/assets/layouts/de-de-qwertz.json';
import enusqwerty from '@/lion/assets/layouts/en-us-qwerty.json';
import esesqwerty from '@/lion/assets/layouts/es-es-qwerty.json';
import frfrazerty from '@/lion/assets/layouts/fr-fr-azerty.json';
import ititqwertz from '@/lion/assets/layouts/it-it-qwerty.json';
import ruruqwertz from '@/lion/assets/layouts/ru-ru-qwerty.json';
import nlnlqwertz from '@/lion/assets/layouts/nl-nl-qwerty.json';
import { onMounted, ref, watch } from 'vue';

const keyboardLayouts: any = {
  'de-de-qwertz': dedeqwertz,
  'en-us-qwerty': enusqwerty,
  'es-es-qwerty': esesqwerty,
  'fr-fr-azerty': frfrazerty,
  'it-it-qwerty': ititqwertz,
  'nl-nl-qwerty': nlnlqwertz,
  'ru-ru-qwerty': ruruqwertz,
};
// 拖动相关的状态
const isDragging = ref(false);
const dragStartX = ref(0);
const dragStartY = ref(0);
const keyboardPosition = ref({ x: 0, y: 0 });

const props = defineProps<{
  keyboard?: string;
}>();

// 拖动事件处理
const handleMouseDown = (e: MouseEvent) => {
  isDragging.value = true;
  dragStartX.value = e.clientX - keyboardPosition.value.x;
  dragStartY.value = e.clientY - keyboardPosition.value.y;

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return;

  keyboardPosition.value.x = e.clientX - dragStartX.value;
  keyboardPosition.value.y = e.clientY - dragStartY.value;

  // 限制拖动范围，确保不会拖到屏幕外
  keyboardPosition.value.x = Math.max(
    0,
    Math.min(window.innerWidth - 400, keyboardPosition.value.x),
  );
  keyboardPosition.value.y = Math.max(
    0,
    Math.min(window.innerHeight - 200, keyboardPosition.value.y),
  );
};

const handleMouseUp = () => {
  isDragging.value = false;
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
};

const keyboardLayout = props.keyboard || 'en-us-qwerty';

import { useWindowSize } from '@vueuse/core';

const { width } = useWindowSize();
const screenKeyboard = ref<any>(null);

// 监听窗口大小变化
watch(width, (newWidth) => {
  screenKeyboard.value?.resize(newWidth / 2); // 调整键盘大小
});

watch(
  () => props.keyboard,
  (newLayout: any) => {
    console.log('Keyboard layout changed:', newLayout);
    setLayout(newLayout);
  },
);

onMounted(() => {
  keyboardPosition.value = {
    x: 0, // 初始位置居中
    y: window.innerHeight - 300, // 初始位置在底部
  };
  setLayout(keyboardLayout);
});

const emit = defineEmits(['keyboardChange']);
const setLayout = (layoutName: string) => {
  const keyboardRef: any = document.getElementById('keyboardref');
  if (screenKeyboard.value) {
    keyboardRef.removeChild(screenKeyboard.value.getElement());
  }
  const layout = keyboardLayouts[layoutName] || enusqwerty;
  const keyboard = new Guacamole.OnScreenKeyboard(layout);

  keyboardRef.prepend(keyboard.getElement());
  keyboard.resize(window.innerWidth / 2); // 设置键盘大小
  screenKeyboard.value = keyboard;
  keyboard.onkeydown = (key: string) => {
    emit('keyboardChange', 'keydown', key);
  };
  keyboard.onkeyup = (key: string) => {
    emit('keyboardChange', 'keyup', key);
  };
};

// 触摸事件
const handleTouchStart = (e: TouchEvent) => {
  if (e.touches.length !== 1) return;
  isDragging.value = true;
  const touch = e.touches[0];
  if (!touch) return;
  dragStartX.value = touch.clientX - keyboardPosition.value.x;
  dragStartY.value = touch.clientY - keyboardPosition.value.y;
};

const handleTouchMove = (e: TouchEvent) => {
  if (!isDragging.value || e.touches.length !== 1) return;
  const touch = e.touches[0];
  if (!touch) return;
  keyboardPosition.value.x = touch.clientX - dragStartX.value;
  keyboardPosition.value.y = touch.clientY - dragStartY.value;

  // 限制拖动范围，确保不会拖到屏幕外
  keyboardPosition.value.x = Math.max(
    0,
    Math.min(window.innerWidth - 400, keyboardPosition.value.x),
  );
  keyboardPosition.value.y = Math.max(
    0,
    Math.min(window.innerHeight - 200, keyboardPosition.value.y),
  );
};

const handleTouchEnd = () => {
  isDragging.value = false;
};
</script>

<template>
  <div
    id="keyboardref"
    class="draggable-keyboard"
    :style="{
      transform: `translate(${keyboardPosition.x}px, ${keyboardPosition.y}px)`,
      cursor: isDragging ? 'grabbing' : 'grab',
    }"
    @mousedown="handleMouseDown"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <!-- 拖动手柄 -->
    <div class="drag-handle">
      <span>⋮⋮</span>
    </div>
  </div>
</template>

<style scoped>
#keyboardref {
  z-index: 1000;
  background-color: rgb(173, 173, 157);
}
.draggable-keyboard {
  position: fixed;
  top: 0;
  transform: translateX(-50%);
  background-color: rgb(173, 173, 157);
  padding: 2px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 9999;
  user-select: none;
  border: 2px solid #666;
  touch-action: none;
}

.draggable-keyboard:hover {
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
}

.drag-handle {
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  background-color: #666;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: grab;
  user-select: none;
}

.drag-handle:hover {
  background-color: #555;
}

.drag-handle:active {
  cursor: grabbing;
}
</style>
