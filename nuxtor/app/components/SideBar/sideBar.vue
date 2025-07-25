<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';
import { ref } from 'vue';

const { t } = useI18n();

const items = ref<NavigationMenuItem[][]>([
  [
    {
      label: t('Menu.Resource'),
      icon: 'i-lucide-layers',
      open: true,
      children: [
        {
          label: t('Menu.Linux'),
          icon: 'fa-brands:linux',
          to: '/linux',
        },
        {
          label: t('Menu.Windows'),
          icon: 'fa-brands:windows',
          to: '/windows',
        },
        {
          label: t('Menu.Database'),
          icon: 'fa-solid:database',
          to: '/database',
        },
        {
          label: t('Menu.Device'),
          icon: 'fa-solid:laptop',
          to: '/device',
        },
      ],
    },
    {
      label: t('Menu.Other'),
      icon: 'i-lucide-ellipsis',
      open: true,
      children: [
        {
          label: t('Menu.Favorite'),
          icon: 'fa-solid:star',
          to: '/favorite',
        },
      ],
    },
    {
      label: t('Menu.Player'),
      icon: 'i-lucide-video',
    },
  ],
]);

// 由于并未设置三栏布局，因此需要将左侧部分也设置为可拖拽
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
    class="flex flex-col justify-between h-full py-2 pl-2 cursor-pointer"
    @mousedown="handleWindowDrag"
  >
    <div>
      <!-- 折叠 icon -->
      <section class="flex items-center h-8">
        <UIcon
          name="i-lucide-panel-left-close"
          class="size-5 ml-20 cursor-pointer"
        />
      </section>

      <!-- 菜单 -->
      <section class="w-88 mt-2 px-2 h-[calc(100vh-80px)]">
        <UCard variant="subtle" class="h-full">
          <UNavigationMenu
            :items="items"
            :collapsed="false"
            orientation="vertical"
            class="w-full"
          />
        </UCard>
      </section>
    </div>
  </div>
</template>
