<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import type { ConfigItem } from '~/types';

defineProps<{
  open: boolean;
}>();

const emits = defineEmits<{
  (e: 'update:open', value: boolean): void;
}>();

const { t } = useI18n();
const route = useRoute();

const tabItems = ref<TabsItem[]>();

const updateOpen = () => {
  emits('update:open', false);
};

const dispatchTab = () => {
  switch (route.fullPath) {
    case '/linux': {
      tabItems.value = [
        {
          label: 'SSH',
        },
        {
          label: 'SFTP',
        },
        {
          label: 'Telnet',
        },
      ];
      break;
    }
    case '/windows': {
      tabItems.value = [
        {
          label: 'SSH',
        },
        {
          label: 'RDP',
        },
        {
          label: 'VNC',
        },
        {
          label: 'WinRM'
        }
      ];
      break;
    }
  }
};

/**
 * 获取应用配置列表
 */
const getConfigList = async () => {
  const currentDir = await useTauriPathResolve('.');
  const parentDir = await useTauriPathDirname(currentDir);
  const configPath = await useTauriPathJoin(parentDir, 'config.json');

  const exists = await useTauriFsExists(configPath);

  if (exists) {
    const configContent = await useTauriFsReadFile(configPath);
    const configText = new TextDecoder().decode(configContent);

    const configJson = JSON.parse(configText);

    return configJson;
  }

  return [];
};

// TODO 对于一种协议需要有它一一对应的一个应用
onMounted(async () => {
  try {
    const configObject = await getConfigList();
    const plateform = useTauriOsPlatform();

    const configList = configObject[plateform];

    dispatchTab();

    console.log(configList);
  } catch (e) {
    console.log(e);
  }
});
</script>

<template>
  <UModal
    :open="open"
    :ui="{ footer: 'justify-end', description: 'text-xs-plus' }"
    :description="t('SettingModal.Description')"
    title="Modal with description"
    @update:open="updateOpen"
  >
    <template #body>
      <UTabs
        orientation="vertical"
        variant="link"
        :items="tabItems"
        class="w-full"
      >
        <template #content="{ item }">
          <p>This is the {{ item.label }} tab.</p>
        </template>
      </UTabs>
    </template>

    <template #footer="{ close }">
      <UButton
        :label="t('Common.Cancel')"
        color="neutral"
        variant="outline"
        @click="close"
      />
      <UButton :label="t('Common.Confirm')" color="neutral" />
    </template>
  </UModal>
</template>
