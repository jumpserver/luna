<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';
import { useUserSettingStore } from '~/store/modules/userSetting';

const { t } = useI18n();
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

const items = ref<NavigationMenuItem[][]>([
  [
    {
      label: '命令行终端',
      active: true,
      defaultOpen: true,
      icon: 'proicons:terminal',
      children: [
        {
          label: 'SSH',
          to: '/setting/ssh',
        },
        {
          label: 'Telnet',
          to: '/setting/telnet',
        },
      ],
    },
    {
      label: '文件传输',
      defaultOpen: true,
      icon: 'proicons:document',
      children: [
        {
          label: 'SFTP',
        },
      ],
    },
    {
      label: '远程桌面',
      defaultOpen: true,
      icon: 'proicons:laptop',
      children: [
        {
          label: 'RDP',
        },
        {
          label: 'VNC',
        },
      ],
    },
    {
      label: '数据库',
      defaultOpen: true,
      icon: 'proicons:database',
      children: [
        {
          label: 'MySQL',
        },
        {
          label: 'MongoDB',
        },
        {
          label: 'Redis',
        },
        {
          label: 'PostgreSQL',
        },
        {
          label: 'Oracle',
        },
        {
          label: 'SQL Server',
        },
        {
          label: 'DB2',
        },
      ],
    },
  ],
]);
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
        class="flex items-center justify-center h-10"
        @mousedown="handleWindowDrag"
      >
        <span class="text-sm font-bold">
          {{ t('Common.ConnectionSettings') }}
        </span>
      </div>
    </template>

    <template #default>
      <div class="flex gap-1 w-full">
        <UNavigationMenu
          :items="items"
          :highlight="false"
          color="primary"
          variant="link"
          orientation="vertical"
          class="w-48"
        />

        <UCard class="flex-1" variant="soft">
          <slot />
        </UCard>
      </div>
    </template>
  </UCard>
</template>
