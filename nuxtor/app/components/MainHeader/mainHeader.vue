<script setup lang="ts">
import type { ActionItem } from '~/types';

type LocaleCode = (typeof locales.value)[number]['code'];

const colorMode = useColorMode();
const { t, setLocale, locales, locale } = useI18n();

// TODO 应该从保存的配置中获取
const isDarkMode = computed(() => colorMode.value === 'dark');
const currentLocale = ref(locale.value);

const supportLanguages = computed(() => {
  return locales.value.map((locale) => ({
    label: locale.name,
    value: locale.code,
  }));
});

const computedSwitchMode = computed<ActionItem>(() => {
  return {
    iconName: isDarkMode.value ? 'i-lucide-sun' : 'i-lucide-moon',
    tooltipLabel: isDarkMode.value
      ? t('ToolTips.LightMode')
      : t('ToolTips.DarkMode'),
    onClick: toggleDarkMode,
  };
});

function toggleDarkMode() {
  // 直接切换 colorMode，isDarkMode 会自动响应
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';
}

const changeLocale = (payload: LocaleCode) => {
  setLocale(payload);
};

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
    class="flex items-center justify-end w-full cursor-pointer"
    @mousedown="handleWindowDrag"
  >
    <section class="flex items-center gap-3 mr-6">
      <USelect
        v-model="currentLocale"
        :items="supportLanguages"
        icon="i-lucide-globe"
        placeholder="Default"
        class="w-36 ml-42 m-0"
        @update:model-value="changeLocale"
      />

      <UPopover mode="hover" arrow>
        <UButton
          :icon="computedSwitchMode.iconName"
          size="sm"
          color="neutral"
          variant="soft"
          class="rounded-lg"
          @click.prevent="computedSwitchMode.onClick"
        />

        <template #content>
          <span class="m-4 inline-flex text-sm">
            {{ computedSwitchMode.tooltipLabel }}
          </span>
        </template>
      </UPopover>

      <!-- <UAvatar size="sm" src="https://github.com/benjamincanac.png" /> -->
    </section>
  </div>
</template>
