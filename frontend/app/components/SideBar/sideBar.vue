<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';

import IconDatabase from '~/assets/icon-database.svg';
import IconDevices from '~/assets/icon-devices.svg';
import IconFavorite from '~/assets/icon-favorite.svg';
import IconLinux from '~/assets/icon-linux.svg';
import IconVideo from '~/assets/icon-video.svg';
import IconWindows from '~/assets/icon-windows.svg';

defineProps<{
  collapsed: boolean;
}>();

const { t } = useI18n();
const colorMode = useColorMode();

const iconMap: Record<string, any> = {
  'icon-linux': IconLinux,
  'icon-windows': IconWindows,
  'icon-database': IconDatabase,
  'icon-devices': IconDevices,
  'icon-favorite': IconFavorite,
  'icon-video': IconVideo,
};

const getIconComponent = (iconName: string) => {
  return iconMap[iconName] || null;
};

const items = ref<NavigationMenuItem[][]>([
  [
    {
      label: t('Menu.Resource'),
      type: 'label',
    },
    {
      label: t('Menu.Linux'),
      icon: 'icon-linux',
      to: '/linux',
    },
    {
      label: t('Menu.Windows'),
      icon: 'icon-windows',
      to: '/windows',
    },
    {
      label: t('Menu.Database'),
      icon: 'icon-database',
      to: '/database',
    },
    {
      label: t('Menu.Device'),
      icon: 'icon-devices',
      to: '/device',
    },
    {
      label: t('Menu.Favorite'),
      icon: 'icon-favorite',
      to: '/favorite',
    },
    {
      label: t('Menu.OfflinePlayer'),
      type: 'label',
    },
    {
      label: t('Menu.Player'),
      icon: 'icon-video',
    },
  ],
]);
</script>

<template>
  <div
    class="flex flex-col justify-between"
    :style="{
      width: collapsed ? '64px' : '185px',
    }"
  >
    <UNavigationMenu
      :items="items"
      :collapsed="collapsed"
      :ui="{
        label: 'text-gray-500 font-medium px-0 ',
      }"
      class="px-4 py-2"
      orientation="vertical"
    >
      <template #item="{ item }">
        <div
          class="flex items-center py-1/2"
          :style="{
            color: colorMode.value === 'light' ? '#000' : '#fff',
            gap: collapsed ? '0px' : '0.5rem',
            marginLeft: collapsed ? '0.2rem' : '0px',
          }"
        >
          <component
            :is="getIconComponent(item.icon as string)"
            :font-controlled="false"
            class="size-4"
          />

          <span
            v-if="!collapsed"
            class="font-light"
            :class="item.type === 'label' ? 'text-xs' : 'text-xs-plus'"
            >{{ item.label }}</span
          >
        </div>
      </template>
    </UNavigationMenu>
  </div>
</template>
