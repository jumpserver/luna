<script setup lang="ts">
import { useUserSettingStore } from '~/store/modules/userSetting';

const userSettingStore = useUserSettingStore();

const { theme } = storeToRefs(userSettingStore);

const handleWindowDrag = async (event: MouseEvent) => {
  if (event.button !== 0) return;

  try {
    const windows = await useTauriWindowGetAllWindows();

    windows.forEach((window) => {
      if (window.label === 'secondary') {
        window.startDragging();
      }
    });
  } catch (error) {
    console.error(error);
  }
};
</script>

<template>
  <UCard
    variant="soft"
    class="w-screen h-screen"
    :style="{
      borderTopRightRadius: '0px',
      borderTopLeftRadius: '0px',
      backgroundColor: theme === 'dark' ? '#201F22' : '#F5F5F5',
    }"
    :ui="{
      header: 'p-0',
      body: 'p-0 sm:p-2 ',
    }"
  >
    <template #header>
      <div
        class="flex items-center justify-center h-12"
        @mousedown="handleWindowDrag"
      >
        <span class="text-base font-bold"> 连接设置 </span>
      </div>
    </template>

    <slot />
  </UCard>
</template>
