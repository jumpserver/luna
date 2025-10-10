<script setup lang="ts">
import { useUserSettingStore } from "~/store/modules/userSetting";

const appConfig = useAppConfig();
const userSettingStore = useUserSettingStore();

const darkColor = appConfig.componentsConfig.header.darkColor;
const lightColor = appConfig.componentsConfig.header.lightColor;

const { setCollapse } = userSettingStore;
const { theme, collapse } = storeToRefs(userSettingStore);

/**
 * @description 切换折叠状态
 */
const handleCollapse = () => {
  setCollapse(!collapse.value);
};

/**
 * @description 窗口拖拽
 * @param event 鼠标事件
 */
const handleWindowDrag = async (event: MouseEvent) => {
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
    :style="{
      backgroundColor: theme === 'dark' ? darkColor : lightColor
    }"
    class="flex items-center justify-between px-4 h-14"
    @mousedown="handleWindowDrag"
  >
    <section class="flex items-center h-full">
      <UIcon
        v-show="collapse"
        name="i-lucide-panel-left-open"
        class="size-5 cursor-pointer hover:text-[#55B787]"
        @click="handleCollapse"
      />

      <div :style="{ marginLeft: collapse ? '0.625rem' : '' }">
        <HeaderOrganizationSelector />
      </div>
    </section>

    <HeaderActionButtons />
  </div>
</template>
