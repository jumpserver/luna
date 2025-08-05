<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import type { ActionItem } from '~/types/index';
import { useUserSettingStore } from '~/store/modules/userSetting';

type LocaleCode = (typeof locales.value)[number]['code'];

const { t, setLocale, locales } = useI18n();
const colorMode = useColorMode();
const appConfig = useAppConfig();
const userSettingStore = useUserSettingStore();

const darkColor = appConfig.componentsConfig.header.darkColor;
const lightColor = appConfig.componentsConfig.header.lightColor;

const { setTheme, setLang, setCollapse } = userSettingStore;
const { theme, language, collapse } = storeToRefs(userSettingStore);

const isDarkMode = computed(() => theme.value === 'dark');

const supportLanguages = computed(() => {
  return locales.value.map((locale) => ({
    label: locale.name,
    value: locale.code,
    type: 'checkbox' as const,
    checked: locale.code === language.value,
    onUpdateChecked: (checked: boolean) => {
      if (checked) {
        changeLocale(locale.code);

        nextTick(() => {
          setLang(locale.code);
        });
      }
    },
  })) as DropdownMenuItem[];
});

const computedSwitchMode = computed<ActionItem>(() => {
  return {
    key: 'switchMode',
    iconName: isDarkMode.value ? 'i-lucide-sun' : 'i-lucide-moon',
    tooltipLabel: isDarkMode.value
      ? t('ToolTips.LightMode')
      : t('ToolTips.DarkMode'),
    onClick: toggleDarkMode,
    type: 'action',
  };
});

/**
 * @description 切换颜色 mode
 */
function toggleDarkMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';

  nextTick(() => {
    setTheme(colorMode.value === 'dark' ? 'dark' : 'light');
  });
}

/**
 * @description 切换语言
 * @param payload 语言代码
 */
function changeLocale(payload: LocaleCode) {
  setLocale(payload);

  nextTick(() => {
    setLang(payload);
  });
}

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

const items = ref(['Backlog', 'Todo', 'In Progress', 'Done']);
const value = ref('Backlog');

const dropItems = ref<DropdownMenuItem[][]>([
  [
    {
      label: 'Profile',
      icon: 'i-lucide-user',
    },
    {
      label: 'Billing',
      icon: 'i-lucide-credit-card',
    },
    {
      label: 'Settings',
      icon: 'i-lucide-cog',
      kbds: [','],
    },
    {
      label: 'Keyboard shortcuts',
      icon: 'i-lucide-monitor',
    },
  ],
  [
    {
      label: 'Team',
      icon: 'i-lucide-users',
    },
    {
      label: 'Invite users',
      icon: 'i-lucide-user-plus',
      children: [
        [
          {
            label: 'Email',
            icon: 'i-lucide-mail',
          },
          {
            label: 'Message',
            icon: 'i-lucide-message-square',
          },
        ],
        [
          {
            label: 'More',
            icon: 'i-lucide-circle-plus',
          },
        ],
      ],
    },
    {
      label: 'New team',
      icon: 'i-lucide-plus',
      kbds: ['meta', 'n'],
    },
  ],
  [
    {
      label: 'GitHub',
      icon: 'i-simple-icons-github',
      to: 'https://github.com/nuxt/ui',
      target: '_blank',
    },
    {
      label: 'Support',
      icon: 'i-lucide-life-buoy',
      to: '/components/dropdown-menu',
    },
    {
      label: 'API',
      icon: 'i-lucide-cloud',
      disabled: true,
    },
  ],
  [
    {
      label: 'Logout',
      icon: 'i-lucide-log-out',
      kbds: ['shift', 'meta', 'q'],
    },
  ],
]);

onMounted(() => {
  setLocale(language.value as LocaleCode);
});
</script>

<template>
  <div
    :style="{
      backgroundColor: colorMode.value === 'dark' ? darkColor : lightColor,
    }"
    class="flex items-center justify-between h-12 px-4 cursor-pointer"
    @mousedown="handleWindowDrag"
  >
    <section
      :style="{
        marginLeft: collapse ? '0.625rem' : '5rem',
      }"
      class="flex items-center h-full"
    >
      <UIcon
        :name="
          collapse ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'
        "
        class="size-5 ml-16 cursor-pointer"
        @click="handleCollapse"
      />

      <USelect
        v-model="value"
        :items="items"
        size="sm"
        placeholder="Default"
        class="w-36 ml-6"
      />
    </section>

    <section class="flex items-center h-full gap-3 mr-2">
      <UDropdownMenu arrow size="sm" :items="supportLanguages">
        <UButton
          icon="i-lucide-globe"
          size="sm"
          color="neutral"
          variant="outline"
          class="rounded-lg"
        />
      </UDropdownMenu>

      <UButton
        :icon="computedSwitchMode.iconName"
        size="sm"
        color="neutral"
        variant="outline"
        class="rounded-lg"
        @click.prevent="computedSwitchMode.onClick"
      />

      <UDropdownMenu
        :items="dropItems"
        :ui="{
          content: 'w-48',
        }"
      >
        <UAvatar size="sm" src="https://github.com/benjamincanac.png" />
      </UDropdownMenu>
    </section>
  </div>
</template>
