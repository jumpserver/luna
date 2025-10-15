<script setup lang="ts">
import { useUserSettingStore } from "~/store/modules/userSetting";
import SidebarFlipIcon from "~/icons/SidebarFlipIcon.vue";

const userSettingStore = useUserSettingStore();
const { setCollapse } = userSettingStore;
const { collapse } = storeToRefs(userSettingStore);

/**
 * @description 切换折叠状态
 */
const handleCollapse = () => {
  console.log('Header collapse button clicked, current state:', collapse.value);
  setCollapse(!collapse.value);
  console.log('Header collapse state after toggle:', !collapse.value);
};

/**
 * @description 窗口拖拽
 * @param event 鼠标事件
 */
const handleWindowDrag = async (event: MouseEvent) => {
  // 如果点击的是按钮或其他交互元素，不触发拖拽
  const target = event.target as HTMLElement;
  if (target.closest('button') || target.closest('[role="button"]') || target.closest('input') || target.closest('select')) {
    return;
  }
  
  if (event.button !== 0) return;

  try {
    const windows = await useTauriWindowGetAllWindows();
    windows.forEach((window) => {
      window.startDragging();
    });
  } catch (error) {
    console.error(error);
  }
};
</script>

<template>
  <div
    class="header-bg flex items-center justify-between px-4 h-13"
    @mousedown="handleWindowDrag"
  >
    <section class="flex items-center h-full">
      <UButton
        v-if="collapse"
        color="neutral"
        variant="ghost"
        size="md"
        class="p-1"
        :icon="SidebarFlipIcon"
        @click="handleCollapse"
      />

      <div :style="{ marginLeft: collapse ? '0.625rem' : '' }">
        <HeaderOrganizationSelector />
      </div>
    </section>

    <HeaderActionButtons />
  </div>
</template>
