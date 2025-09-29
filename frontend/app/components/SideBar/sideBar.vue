<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';
import { useUserSettingStore } from '~/store/modules/userSetting';

const { t } = useI18n();
const useSettingStore = useUserSettingStore();

const { setCollapse } = useSettingStore;
const { collapse, theme } = storeToRefs(useSettingStore);

const sideBarItems = computed<NavigationMenuItem[]>(() => {
  return [
    {
      label: t('Menu.Resource'),
      type: 'label',
    },
    {
      label: t('Menu.Linux'),
      icon: 'si:terminal-alt-line',
      to: '/linux',
    },
    {
      label: t('Menu.Windows'),
      icon: 'gravity-ui:logo-windows',
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
    // {
    //   label: t('Menu.OfflinePlayer'),
    //   type: 'label',
    // },
    // {
    //   label: t('Menu.Player'),
    //   icon: 'i-lucide-video',
    // },
  ];
});

const handleCollapse = () => {
  setCollapse(!collapse.value);
};
</script>

<template>
  <div
    class="flex flex-col"
    :style="{
      width: collapse ? '72px' : '256px',
    }"
  >
    <section class="flex items-center justify-end w-full px-4 h-12">
      <UIcon
        :name="collapse ? '' : 'i-lucide-panel-left-close'"
        class="size-5 cursor-pointer hover:text-[#55B787]"
        @click="handleCollapse"
      />
    </section>

    <div class="px-4 py-0">
      <UNavigationMenu
        color="primary"
        orientation="vertical"
        :items="sideBarItems"
        :highlight="false"
        :collapsed="collapse"
        :ui="
          collapse
            ? {
                link: 'justify-center px-0 w-10 h-10 rounded-lg',
                linkLabel: 'sr-only',
                linkTrailing: 'hidden',
                linkLeadingIcon: 'size-5',
              }
            : {
                link: 'px-2',
                linkLabel: theme === 'dark' ? 'text-white' : 'text-black',
                linkLeadingIcon: theme === 'dark' ? 'text-white' : 'text-black',
              }
        "
      />
    </div>
  </div>
</template>
