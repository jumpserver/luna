<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';

defineProps<{
  collapsed: boolean;
}>();

const { t } = useI18n();
const colorMode = useColorMode();

// 能用 lucide 的就用 lucide，不能用 lucide 的就用 mingcute
const items = ref<NavigationMenuItem[][]>([
  [
    {
      label: t('Menu.Resource'),
      type: 'label',
    },
    {
      label: t('Menu.Linux'),
      icon: 'mingcute:linux-line',
      to: '/linux',
    },
    {
      label: t('Menu.Windows'),
      icon: 'mingcute:windows-line',
      to: '/windows',
    },
    {
      label: t('Menu.Database'),
      icon: 'i-lucide-database',
      to: '/database',
    },
    {
      label: t('Menu.Device'),
      icon: 'mingcute:device-line',
      to: '/device',
    },
    {
      label: t('Menu.Favorite'),
      icon: 'i-lucide-star',
      to: '/favorite',
    },
    {
      label: t('Menu.OfflinePlayer'),
      type: 'label',
    },
    {
      label: t('Menu.Player'),
      icon: 'i-lucide-video',
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
          <Icon v-if="item.icon" :name="item.icon as string" class="size-4" />

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
